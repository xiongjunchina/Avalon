import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { DomainError } from './store.js';
import type { ContentSafetyProvider, SafetyDecision } from './content-safety-provider.js';
import { parseAvatarInput } from './avatar-input.js';

export type SafetyKind = 'profile' | 'chat' | 'image';
export type SafetyActor = { userId?: string; openid?: string };
export type SafetyOptions = {
  enabled: boolean;
  origin: string;
  basePath: string;
  wechat?: ContentSafetyProvider;
  web?: ContentSafetyProvider;
};
const hash = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
const builtinAvatar = (value: string) => /^\/art\/avatars\/wx-(?:[1-9]|1[0-2])\.webp(?:\?v=[A-Za-z0-9._-]{1,30})?$/.test(value);
const systemNickname = (value: string) => /^微信仙友\d{4}$/.test(value);
const blocked = (decision: string) => new DomainError(decision === 'review' ? 'CONTENT_PENDING' : 'CONTENT_REJECTED', 422);

/** A shared pre-publication gate. Only approved immutable content is exposed. */
export class ContentSafety {
  private readonly decisions = new Map<string, string>();
  private readonly approvedImages = new Set<string>();
  private readonly imageAliases = new Map<string, string>();
  private readonly pending = new Map<string, Promise<void>>();
  readonly enabled: boolean;
  readonly publicBase: string;

  constructor(readonly pool: Pool, private readonly options: SafetyOptions) {
    this.enabled = options.enabled;
    const base = options.basePath || '/';
    if (!/^\/(?:[a-z0-9-]+\/)?$/.test(base)) throw new Error('Invalid content safety base path');
    this.publicBase = options.origin + (base === '/' ? '' : base.slice(0, -1));
  }

  async initialize() {
    if (!this.enabled) return;
    const rows = await this.pool.query<{kind: SafetyKind;content_hash:string;decision:string}>(
      `SELECT DISTINCT ON (kind,content_hash) kind,content_hash,decision FROM content_safety_checks
       WHERE decision<>'error' ORDER BY kind,content_hash,created_at DESC,id DESC`);
    for (const row of rows.rows) this.decisions.set(row.kind + ':' + row.content_hash, row.decision);
    for (const row of (await this.pool.query<{id:string}>('SELECT id FROM content_safety_images WHERE approved')).rows)
      this.approvedImages.add(row.id);
  }

  async actor(sessionToken?: string): Promise<SafetyActor> {
    if (!this.enabled || !sessionToken) return {};
    const row = (await this.pool.query<{user_id:string;wechat_actor_openid:string|null}>(
      `SELECT user_id,CASE WHEN wechat_actor_verified_at>now()-interval '2 hours' THEN wechat_actor_openid END AS wechat_actor_openid
       FROM sessions WHERE token_hash=$1 AND expires_at>now()`, [hash(sessionToken)])).rows[0];
    return row ? {userId:row.user_id,...(row.wechat_actor_openid ? {openid:row.wechat_actor_openid} : {})} : {};
  }

  private provider(actor: SafetyActor) {
    const provider = actor.openid ? this.options.wechat : this.options.web;
    if (!provider) throw new DomainError('CONTENT_CHECK_UNAVAILABLE', 503);
    return provider;
  }

  private async writeDecision(client: PoolClient, kind: SafetyKind, contentHash: string, result: SafetyDecision, actor: SafetyActor, content: string) {
    await client.query(`INSERT INTO content_safety_checks(id,kind,content_hash,decision,provider,trace_id,user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(),kind,contentHash,result.decision,result.provider,result.traceId??null,actor.userId??null]);
    if (result.decision === 'review') await client.query(`INSERT INTO content_safety_reviews(id,kind,content_hash,content,user_id)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(kind,content_hash) WHERE status='pending' DO NOTHING`,
      [randomUUID(),kind,contentHash,content,actor.userId??null]);
  }

  private async record(kind: SafetyKind, contentHash: string, result: SafetyDecision, actor: SafetyActor, content: string) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');await this.writeDecision(client,kind,contentHash,result,actor,content);
      await client.query('COMMIT');
      this.decisions.set(kind+':'+contentHash,result.decision);
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error;}
    finally {client.release();}
  }

  private async checked(kind: SafetyKind, content: string, actor: SafetyActor, operation: () => Promise<SafetyDecision>, force = false) {
    if (!this.enabled) return;
    const contentHash = hash(content), key = kind+':'+contentHash;
    const known = this.decisions.get(key);
    if (!force && known === 'pass') return;
    if (!force && known) throw blocked(known);
    // Identical concurrent submissions share the check, not the publication action.
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      let result: SafetyDecision;
      try { result = await operation(); }
      catch (error) {
        await this.pool.query(`INSERT INTO content_safety_checks(id,kind,content_hash,decision,provider,user_id)
          VALUES($1,$2,$3,'error','unavailable',$4)`,[randomUUID(),kind,contentHash,actor.userId??null]);
        throw error instanceof DomainError ? error : new DomainError('CONTENT_CHECK_UNAVAILABLE',503);
      }
      await this.record(kind,contentHash,result,actor,content);
      if (result.decision !== 'pass') throw blocked(result.decision);
    })();
    this.pending.set(key,task);
    try { await task; } finally { if (this.pending.get(key) === task) this.pending.delete(key); }
  }

  async text(content: string, kind: 'profile'|'chat', actor: SafetyActor = {}) {
    if (!this.enabled || (kind === 'profile' && systemNickname(content))) return;
    await this.checked(kind,content,actor,()=>this.provider(actor).checkText(content,kind==='chat'?5:1,actor.openid));
  }

  async avatar(value: string | null | undefined, actor: SafetyActor = {}, forceCheck = false): Promise<string | null | undefined> {
    if (!this.enabled || !value || builtinAvatar(value)) return value;
    const prefix = this.publicBase + '/api/avatars/';
    if (value.startsWith(prefix)) {
      const id=value.slice(prefix.length);
      if (/^[a-f0-9]{64}$/.test(id) && this.approvedImages.has(id)) return value;
      throw new DomainError('INVALID_AVATAR',400);
    }
    const image = await parseAvatarInput(value);
    const id = hash(image.data);
    const dataUrl = `data:${image.mime};base64,${image.data.toString('base64')}`;
    await this.pool.query(`INSERT INTO content_safety_images(id,mime,data) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`,[id,image.mime,image.data]);
    await this.checked('image',dataUrl,actor,async()=>{
      const token=randomBytes(32).toString('base64url');
      await this.pool.query(`INSERT INTO content_safety_media_tickets(token_hash,image_id,expires_at) VALUES($1,$2,now()+interval '2 minutes')`,[hash(token),id]);
      try { return await this.provider(actor).checkImage(this.publicBase+'/api/content-safety/media/'+token,actor.openid); }
      finally { await this.pool.query('DELETE FROM content_safety_media_tickets WHERE token_hash=$1',[hash(token)]); }
    },forceCheck);
    await this.pool.query('UPDATE content_safety_images SET approved=true WHERE id=$1',[id]);
    this.approvedImages.add(id);
    const url=prefix+id;
    this.imageAliases.set(value,url);
    return url;
  }

  async media(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    return (await this.pool.query<{data:Buffer;mime:string}>(`SELECT i.data,i.mime FROM content_safety_media_tickets t
      JOIN content_safety_images i ON i.id=t.image_id WHERE t.token_hash=$1 AND t.expires_at>now()`,[hash(token)])).rows[0];
  }

  async image(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) return undefined;
    return (await this.pool.query<{data:Buffer;mime:string}>('SELECT data,mime FROM content_safety_images WHERE id=$1 AND approved',[id])).rows[0];
  }

  /** Defensive legacy read gate: keeps stored records intact while audits run. */
  sanitize<T>(payload: T): T {
    if (!this.enabled) return payload;
    const walk=(value: unknown, key='', parent?:Record<string,unknown>):unknown=>{
      if (Array.isArray(value)) return value.map(item=>walk(item));
      if (value instanceof Date || Buffer.isBuffer(value)) return value;
      if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,k,value as Record<string,unknown>)]));
      if (typeof value!=='string' || !value) return value;
      if (['nickname','hostNickname','managerName'].includes(key) || (key==='name' && parent?.settings))
        return systemNickname(value)||this.decisions.get('profile:'+hash(value))==='pass'?value:'仙友（资料待审核）';
      const chatField=key==='message'&&typeof parent?.senderId==='string';
      const broadcastField=key==='text'&&(typeof parent?.enabled==='boolean'||['roomChat','directChat','systemAnnouncement'].includes(String(parent?.type)));
      if (chatField || broadcastField) return this.decisions.get('chat:'+hash(value))==='pass'?value:'[内容暂未通过审核]';
      if (key==='avatarUrl'||key==='wechatAvatarUrl') {
        if (builtinAvatar(value)) return value;
        const alias=this.imageAliases.get(value);
        if(alias)return alias;
        const prefix=this.publicBase+'/api/avatars/';
        if(value.startsWith(prefix)&&this.approvedImages.has(value.slice(prefix.length)))return value;
        if (value.startsWith('data:image/') && this.decisions.get('image:'+hash(value))==='pass') return value;
        return undefined;
      }
      return value;
    };
    return walk(payload) as T;
  }

  async reviews() {
    return (await this.pool.query(`SELECT id,kind,content,user_id AS "userId",created_at AS "createdAt" FROM content_safety_reviews
      WHERE status='pending' ORDER BY created_at LIMIT 100`)).rows;
  }

  async resolveReview(id: string, decision: 'pass'|'risky', note: string) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row=(await client.query<{kind:SafetyKind;content_hash:string;content:string;user_id:string|null}>(
        `SELECT * FROM content_safety_reviews WHERE id=$1 AND status='pending' FOR UPDATE`,[id])).rows[0];
      if(!row)throw new DomainError('REVIEW_NOT_FOUND',404);
      await this.writeDecision(client,row.kind,row.content_hash,{decision,provider:'manual'},{userId:row.user_id??undefined},row.content);
      await client.query(`UPDATE content_safety_reviews SET status=$2,resolved_at=now(),note=$3 WHERE id=$1`,[id,decision,note]);
      await client.query('COMMIT');
      this.decisions.set(row.kind+':'+row.content_hash,decision);
      return {ok:true};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
}
