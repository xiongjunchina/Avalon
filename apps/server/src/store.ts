import { createHash, randomBytes, randomUUID, randomInt } from 'node:crypto';
import { createGame, transition, projectGame, isEnded, finish, RuleError, type GameState } from '@avalon/game-core';
import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import { defaultSettings, type Command, type RoomView, type Settings, type User, type ServerMessage } from '@avalon/contracts';

export class DomainError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const SESSION_MS = 30 * 86400_000;
export const GRACE_MS = 60_000;
export const ROOM_TTL_MS = 86400_000;
export const DEAL_MS = 5_000;
const LEASE_MS = 45_000;
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
type RoomRow = { id: string; code: string; invite: string; host_id: string; settings: RoomView['settings'];
  version: number; accepting_new_members: boolean; phase: RoomView['phase'] | 'closed'; offline_since: Date | null; current_game_id: string | null };
type MemberRow = { user_id: string; nickname: string; avatar: User['avatar']; avatar_url?: string | null; wechat_avatar_url?: string | null; player_code?: string | null; seat: number; ready: boolean;
  connection_id: string | null; last_seen_at: Date; disconnected_at: Date | null; joined_at: Date; join_order: string };
export class PostgresStore {
  private restartGraceUntil = 0;
  constructor(public pool: Pool, public now: () => number = Date.now) {}
  private date() { return new Date(this.now()); }
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect(); await client.query('BEGIN');
      const result = await fn(client); await client.query('COMMIT'); return result;
    } catch (err) {
      await client?.query('ROLLBACK').catch(() => {});
      if (err instanceof DomainError) throw err;
      if (err instanceof RuleError) throw new DomainError(err.message, 409);
      throw new DomainError('SERVICE_UNAVAILABLE', 503);
    } finally { client?.release(); }
  }
  private async lock(c: PoolClient, id: string) {
    const r = await c.query<RoomRow>('SELECT * FROM rooms WHERE id=$1 FOR UPDATE', [id]);
    if (!r.rows[0]) throw new DomainError('ROOM_NOT_FOUND', 404);
    return r.rows[0];
  }
  private async members(c: PoolClient, id: string) {
    return (await c.query<MemberRow>(`SELECT m.*,u.nickname,u.avatar,u.avatar_url,u.wechat_avatar_url,u.player_code FROM room_members m JOIN users u ON u.id=m.user_id
      WHERE room_id=$1 ORDER BY joined_at,join_order`, [id])).rows;
  }
  private async view(c: PoolClient, r: RoomRow, members: MemberRow[], userId?: string): Promise<RoomView> {
    const game = await this.game(c,r);
    return { id: r.id, code: r.code, hostId: r.host_id, version: r.version, settings: r.settings,
      serverTime: this.date().toISOString(),
      phase: r.phase === 'closed' ? 'waiting' : r.phase, acceptingNewMembers: r.accepting_new_members,
      ...(game ? { game: projectGame(game,userId) } : {}),
      members: members.map(m => ({
        id: m.user_id,
        nickname: m.nickname,
        avatar: m.avatar,
        ...(m.avatar_url ? { avatarUrl: m.avatar_url } : {}),
        ...(m.wechat_avatar_url ? { wechatAvatarUrl: m.wechat_avatar_url } : {}),
        ...(m.player_code ? { playerCode: m.player_code } : {}),
        seat: m.seat,
        ready: m.ready,
        online: m.connection_id !== null,
      })).sort((a,b) => a.seat-b.seat) };
  }
  private open(r: RoomRow) { if (r.phase === 'closed') throw new DomainError('ROOM_CLOSED', 410); }
  private async assertMember(c: PoolClient, r: RoomRow, userId: string) {
    this.open(r);
    const members = await this.members(c, r.id);
    if (!members.some(m => m.user_id === userId)) throw new DomainError('FORBIDDEN', 403);
    return members;
  }
  async health() { return this.tx(async c => { await c.query('SELECT 1'); }); }
  async createGuest(nickname: string) {
    let playerCode = String(randomInt(100000, 1000000));
    const user: User = { id: randomUUID(), nickname, avatar:'leaf', playerCode }, token = randomBytes(32).toString('base64url');
    return this.tx(async c => {
      while ((await c.query('SELECT 1 FROM users WHERE player_code=$1', [playerCode])).rowCount) {
        playerCode = String(randomInt(100000, 1000000));
        user.playerCode = playerCode;
      }
      await c.query('INSERT INTO users(id,nickname,created_at,player_code) VALUES($1,$2,$3,$4)', [user.id,nickname,this.date(),playerCode]);
      await c.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [digest(token),user.id,new Date(this.now()+SESSION_MS)]);
      return { user, token };
    });
  }
  async authenticate(token?: string, renew = false): Promise<User> {
    if (!token) throw new DomainError('UNAUTHENTICATED', 401);
    return this.tx(async c => {
      const result = renew
        ? await c.query(`UPDATE sessions SET expires_at=$2 WHERE token_hash=$1 AND expires_at>$3 RETURNING user_id`, [digest(token),new Date(this.now()+SESSION_MS),this.date()])
        : await c.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>$2', [digest(token),this.date()]);
      if (!result.rows[0]) throw new DomainError('UNAUTHENTICATED', 401);
      const u = (await c.query<{
        id: string;
        nickname: string;
        avatar: User['avatar'];
        avatar_url?: string | null;
        wechat_avatar_url?: string | null;
        player_code?: string | null;
        is_banned?: boolean | null;
        vip_until?: Date | null;
      }>(
        `SELECT u.id, u.nickname, u.avatar, u.avatar_url, u.wechat_avatar_url, u.player_code,
                m.is_banned, m.vip_until
         FROM users u
         LEFT JOIN user_memberships m ON m.user_id = u.id
         WHERE u.id=$1`,
        [result.rows[0].user_id]
      )).rows[0];
      if (u.is_banned) throw new DomainError('USER_BANNED', 403);
      const isVip = Boolean(u.vip_until && u.vip_until.getTime() > this.now());
      return {
        id: u.id,
        nickname: u.nickname,
        avatar: u.avatar,
        ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
        ...(u.wechat_avatar_url ? { wechatAvatarUrl: u.wechat_avatar_url } : {}),
        ...(u.player_code ? { playerCode: u.player_code } : {}),
        isVip,
        ...(u.vip_until ? { vipUntil: u.vip_until.toISOString() } : {}),
      };
    });
  }
  async currentRoom(userId: string) {
    return this.tx(async c => (await c.query('SELECT room_id FROM room_members WHERE user_id=$1', [userId])).rows[0]?.room_id ?? null);
  }
  async createRoom(user: User, initialSettings: Settings = defaultSettings) {
    return this.tx(async c => {
      await c.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user.id]);
      if ((await c.query('SELECT 1 FROM room_members WHERE user_id=$1', [user.id])).rowCount) throw new DomainError('ALREADY_IN_ROOM', 409);
      const id = randomUUID(), invite = randomBytes(24).toString('base64url');
      let code = String(randomInt(100000, 1000000));
      while ((await c.query('SELECT 1 FROM rooms WHERE code=$1', [code])).rowCount) {
        code = String(randomInt(100000, 1000000));
      }
      await c.query(`INSERT INTO rooms(id,code,invite,host_id,settings,offline_since,created_at) VALUES($1,$2,$3,$4,$5,$6,$6)`, [id,code,invite,user.id,initialSettings,this.date()]);
      await this.addMember(c,id,user.id,1);
      return this.view(c,await this.lock(c,id),await this.members(c,id),user.id);
    });
  }
  private async addMember(c: PoolClient, roomId: string, userId: string, seat: number) {
    await c.query(`INSERT INTO room_members(room_id,user_id,seat,joined_at,last_seen_at,disconnected_at) VALUES($1,$2,$3,$4,$4,$4)`, [roomId,userId,seat,this.date()]);
  }
  async join(user: User, key: string) {
    return this.tx(async c => {
      await c.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user.id]);
      const found = await c.query('SELECT id FROM rooms WHERE code=$1 OR invite=$2', [key.toUpperCase(),key]);
      if (!found.rows[0]) throw new DomainError('ROOM_NOT_FOUND',404);
      const r = await this.lock(c,found.rows[0].id); this.open(r);
      const current = (await c.query('SELECT room_id FROM room_members WHERE user_id=$1', [user.id])).rows[0];
      if (current && current.room_id !== r.id) throw new DomainError('ALREADY_IN_ROOM',409);
      const members = await this.members(c,r.id);
      if (current) return this.view(c,r,members,user.id);
      if (r.phase !== 'waiting') throw new DomainError('GAME_IN_PROGRESS',409);
      if (!r.accepting_new_members) throw new DomainError('JOIN_DISABLED',403);
      if (members.length >= r.settings.playerCount) throw new DomainError('ROOM_FULL',409);
      let seat=1; while (members.some(m => m.seat===seat)) seat++;
      await this.addMember(c,r.id,user.id,seat);
      await c.query('UPDATE rooms SET version=version+1 WHERE id=$1',[r.id]);
      r.version++; return this.view(c,r,await this.members(c,r.id),user.id);
    });
  }
  async roomFor(userId: string, id: string) {
    return this.tx(async c => { const r=await this.lock(c,id); const m=await this.assertMember(c,r,userId); return { room:await this.view(c,r,m,userId),invite:r.invite }; });
  }
  async snapshot(id: string, userId?: string) {
    return this.tx(async c => {
      const r=await this.lock(c,id), members=await this.members(c,id);
      return r.phase==='closed' || (userId && !members.some(m=>m.user_id===userId)) ? null : this.view(c,r,members,userId);
    });
  }
  private async game(c: PoolClient, r: RoomRow): Promise<GameState | null> {
    if (!r.current_game_id) return null;
    return (await c.query('SELECT state FROM games WHERE id=$1',[r.current_game_id])).rows[0].state;
  }
  private async saveGame(c: PoolClient, roomId: string, game: GameState) {
    await c.query('UPDATE games SET state=$2,ended_at=CASE WHEN $3::boolean THEN COALESCE(ended_at,$4) ELSE ended_at END WHERE id=$1',
      [game.id,game,isEnded(game),this.date()]);
    await c.query('UPDATE rooms SET phase=$2 WHERE id=$1',[roomId,isEnded(game)?'finished':'playing']);
  }
  async pendingDeals(): Promise<{roomId:string;deadline:string}[]> {
    return this.tx(async c => (await c.query(`SELECT r.id AS "roomId",g.state->>'dealEndsAt' AS deadline
      FROM rooms r JOIN games g ON g.id=r.current_game_id WHERE r.phase='playing' AND g.state->>'phase'='dealing'`)).rows);
  }
  async releaseDeal(roomId:string):Promise<{changed:boolean;deadline?:string}> {
    return this.tx(async c=>{
      const r=await this.lock(c,roomId),g=await this.game(c,r);
      if(r.phase!=='playing'||g?.phase!=='dealing')return {changed:false};
      if(!g.dealEndsAt||!Number.isFinite(Date.parse(g.dealEndsAt)))throw new DomainError('SERVICE_UNAVAILABLE',503);
      if(this.now()<Date.parse(g.dealEndsAt))return {changed:false,deadline:g.dealEndsAt};
      g.phase='role_reveal';delete g.dealEndsAt;
      await this.saveGame(c,roomId,g);
      await c.query('UPDATE rooms SET version=version+1 WHERE id=$1',[roomId]);
      return {changed:true};
    });
  }
  async execute(userId: string, roomId: string, command: Command, connectionId?: string) {
    return this.tx(async c => {
      const r=await this.lock(c,roomId);
      const prior=(await c.query('SELECT command_body,command_fingerprint,result FROM command_receipts WHERE room_id=$1 AND user_id=$2 AND command_id=$3',[roomId,userId,command.commandId])).rows[0];
      if (prior) {
        if (prior.command_fingerprint ? prior.command_fingerprint !== fingerprint(command) : !isDeepStrictEqual(prior.command_body,command)) throw new DomainError('COMMAND_ID_REUSED',409);
        return { result:prior.result as ServerMessage,left:command.type==='leaveRoom',kickedUserId:undefined,dealEndsAt:undefined };
      }
      const members=await this.assertMember(c,r,userId);
      const self=members.find(m=>m.user_id===userId)!;
      if (connectionId && self.connection_id!==connectionId) throw new DomainError('CONNECTION_REPLACED',409);
      if (r.version!==command.expectedVersion) throw new DomainError('VERSION_CONFLICT',409);
      if (['setReady','updateSettings','setAdmission','startGame'].includes(command.type) && r.phase!=='waiting') throw new DomainError('GAME_IN_PROGRESS',409);
      if (command.type==='setReady') {
        await c.query('UPDATE room_members SET ready=$3 WHERE room_id=$1 AND user_id=$2',[roomId,userId,command.payload.ready]);
      } else if (command.type==='updateSettings') {
        if (r.host_id!==userId) throw new DomainError('FORBIDDEN',403);
        if (members.length>command.payload.playerCount || members.some(m=>m.seat>command.payload.playerCount)) throw new DomainError('SEATS_OCCUPIED');
        await c.query('UPDATE rooms SET settings=$2 WHERE id=$1',[roomId,command.payload]);
        await c.query('UPDATE room_members SET ready=false WHERE room_id=$1',[roomId]);
      } else if (command.type==='setAdmission') {
        if (r.host_id!==userId) throw new DomainError('FORBIDDEN',403);
        await c.query('UPDATE rooms SET accepting_new_members=$2 WHERE id=$1',[roomId,command.payload.acceptingNewMembers]);
      } else if (command.type==='leaveRoom') {
        if(r.phase==='playing') throw new DomainError('GAME_IN_PROGRESS',409);
        await c.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[roomId,userId]);
        const remaining=members.filter(m=>m.user_id!==userId);
        if (!remaining.length) await this.closeRoom(c,roomId);
        else {
          if (r.host_id===userId) await c.query('UPDATE rooms SET host_id=$2 WHERE id=$1',[roomId,(remaining.find(m=>m.connection_id)??remaining[0]).user_id]);
          if (!remaining.some(m=>m.connection_id)) await c.query('UPDATE rooms SET offline_since=COALESCE(offline_since,$2) WHERE id=$1',[roomId,this.date()]);
        }
      } else if (command.type==='kickMember') {
        if (r.phase==='playing') throw new DomainError('GAME_IN_PROGRESS',409);
        if (r.host_id!==userId) throw new DomainError('FORBIDDEN',403);
        const targetUserId=command.payload.userId;
        if (targetUserId===userId || !members.some(m=>m.user_id===targetUserId)) throw new DomainError('INVALID_TARGET');
        await c.query('DELETE FROM room_members WHERE room_id=$1 AND user_id=$2',[roomId,targetUserId]);
        const remaining=members.filter(m=>m.user_id!==targetUserId);
        if (!remaining.some(m=>m.connection_id)) await c.query('UPDATE rooms SET offline_since=COALESCE(offline_since,$2) WHERE id=$1',[roomId,this.date()]);
      }
      let dealEndsAt:string|undefined;
      if (command.type==='startGame') {
        if(r.host_id!==userId) throw new DomainError('FORBIDDEN',403);
        if(members.length!==r.settings.playerCount || !members.every(m=>m.ready)) throw new DomainError('NOT_READY',409);
        const recentRoles=await c.query<{user_id:string;role:string}>(
          `SELECT user_id,role FROM (
             SELECT p.user_id,g.state->'roles'->>(p.user_id::text) AS role,
                    ROW_NUMBER() OVER (PARTITION BY p.user_id ORDER BY g.created_at DESC,g.id DESC) AS rn
             FROM game_participants p JOIN games g ON g.id=p.game_id
             WHERE p.user_id=ANY($1::uuid[])
           ) t WHERE rn<=2`,
          [members.map(m=>m.user_id)]
        );
        const protectedUserIds=members.map(m=>m.user_id).filter(uid=>{
          const hist=recentRoles.rows.filter(row=>row.user_id===uid);
          return hist.length===2&&hist.every(row=>row.role==='loyal');
        });
        const game=createGame(randomUUID(),members.map(m=>({id:m.user_id,nickname:m.nickname,seat:m.seat})),r.settings,secureShuffle,protectedUserIds);
        dealEndsAt=new Date(this.now()+DEAL_MS).toISOString();
        game.phase='dealing';game.dealEndsAt=dealEndsAt;
        await c.query('INSERT INTO games(id,room_id,ruleset_version,state,created_at) VALUES($1,$2,$3,$4,$5)',[game.id,roomId,game.rulesetVersion,game,this.date()]);
        await c.query('INSERT INTO game_participants(game_id,user_id) SELECT $1,unnest($2::uuid[])',[game.id,game.players.map(p=>p.id)]);
        await c.query("UPDATE rooms SET phase='playing',current_game_id=$2 WHERE id=$1",[roomId,game.id]);
      } else if(command.type==='returnToLobby') {
        if(r.host_id!==userId) throw new DomainError('FORBIDDEN',403);
        if(r.phase!=='finished') throw new DomainError('WRONG_PHASE',409);
        await c.query("UPDATE rooms SET phase='waiting',current_game_id=NULL WHERE id=$1",[roomId]);
        await c.query('UPDATE room_members SET ready=false WHERE room_id=$1',[roomId]);
      } else if(!['setReady','updateSettings','setAdmission','leaveRoom','kickMember'].includes(command.type)) {
        const game=await this.game(c,r);
        if(!game) throw new DomainError('WRONG_PHASE',409);
        const next = transition(game,userId,command,members.filter(m=>m.connection_id).map(m=>m.user_id), { hostId: r.host_id, now: this.now() });
        await this.saveGame(c,roomId,next);
        if (next.result?.reason === 'host_ended') await this.closeRoom(c,roomId);
      }
      await c.query('UPDATE rooms SET version=version+1 WHERE id=$1',[roomId]);
      const result: ServerMessage={type:'commandResult',commandId:command.commandId,ok:true};
      await c.query('INSERT INTO command_receipts(room_id,user_id,command_id,command_fingerprint,result,created_at) VALUES($1,$2,$3,$4,$5,$6)',[roomId,userId,command.commandId,fingerprint(command),result,this.date()]);
      return { result,left:command.type==='leaveRoom',kickedUserId:command.type==='kickMember'?command.payload.userId:undefined,dealEndsAt };
    });
  }
  private async closeRoom(c:PoolClient,id:string) {
    const r=await this.lock(c,id), game=await this.game(c,r);
    if(game && !isEnded(game)) { finish(game,{winner:null,reason:'offline_timeout'}); await this.saveGame(c,id,game); }
    await c.query("UPDATE rooms SET phase='closed',closed_at=$2,accepting_new_members=false WHERE id=$1",[id,this.date()]);
    await c.query('DELETE FROM room_members WHERE room_id=$1',[id]);
  }
  async forceCloseRoom(id: string) {
    return this.tx(async c => {
      await this.closeRoom(c, id);
    });
  }
  async connect(userId:string,roomId:string,connectionId:string) {
    return this.tx(async c=>{
      const r=await this.lock(c,roomId); await this.assertMember(c,r,userId);
      await c.query('UPDATE room_members SET connection_id=$3,last_seen_at=$4,disconnected_at=NULL WHERE room_id=$1 AND user_id=$2',[roomId,userId,connectionId,this.date()]);
      await c.query('UPDATE rooms SET offline_since=NULL WHERE id=$1',[roomId]);
      await this.handover(c,r,await this.members(c,roomId));
    });
  }
  async disconnect(userId:string,roomId:string,connectionId:string) {
    return this.tx(async c=>{
      const r=await this.lock(c,roomId); if(r.phase==='closed') return;
      const changed=await c.query('UPDATE room_members SET connection_id=NULL,disconnected_at=$4,last_seen_at=$4 WHERE room_id=$1 AND user_id=$2 AND connection_id=$3',[roomId,userId,connectionId,this.date()]);
      if(changed.rowCount && !(await this.members(c,roomId)).some(m=>m.connection_id)) {
        await c.query('UPDATE rooms SET offline_since=COALESCE(offline_since,$2) WHERE id=$1',[roomId,this.date()]);
      }
    });
  }
  async touch(connectionIds:string[]) {
    if(!connectionIds.length) return;
    await this.tx(async c=>{ await c.query('UPDATE room_members SET last_seen_at=$2 WHERE connection_id=ANY($1::uuid[])',[connectionIds,this.date()]); });
  }
  async recoverPresence() {
    this.restartGraceUntil=this.now()+GRACE_MS;
    await this.tx(async c=>{
      // Preserve the last durable online timestamp on a crash; do not reset a 24h expiry.
      await c.query(`UPDATE rooms r SET offline_since=COALESCE(offline_since,(SELECT max(last_seen_at) FROM room_members WHERE room_id=r.id),created_at) WHERE phase<>'closed'`);
      await c.query('UPDATE room_members SET disconnected_at=CASE WHEN connection_id IS NOT NULL THEN $1 ELSE COALESCE(disconnected_at,$1) END,connection_id=NULL',[this.date()]);
    });
  }
  private async handover(c:PoolClient,r:RoomRow,members:MemberRow[]) {
    if(this.now()<this.restartGraceUntil) return false;
    const host=members.find(m=>m.user_id===r.host_id);
    if(host?.connection_id || !host?.disconnected_at || this.now()-host.disconnected_at.getTime()<GRACE_MS) return false;
    const next=members.find(m=>m.connection_id);
    if(!next) return false;
    await c.query('UPDATE rooms SET host_id=$2,version=version+1 WHERE id=$1',[r.id,next.user_id]);
    return true;
  }
  async maintain():Promise<string[]> {
    const ids=await this.tx(async c=>(await c.query("SELECT id FROM rooms WHERE phase<>'closed'")).rows.map(r=>r.id as string));
    const changed:string[]=[];
    for(const id of ids) {
      const updated=await this.tx(async c=>{
        const r=await this.lock(c,id); if(r.phase==='closed') return false;
        const expired=await c.query('UPDATE room_members SET connection_id=NULL,disconnected_at=last_seen_at WHERE room_id=$1 AND connection_id IS NOT NULL AND last_seen_at<=$2',[id,new Date(this.now()-LEASE_MS)]);
        const members=await this.members(c,id);
        if(!members.some(m=>m.connection_id)) {
          if(!r.offline_since) {
            r.offline_since=new Date(Math.max(...members.map(m=>m.last_seen_at.getTime()),0));
            await c.query('UPDATE rooms SET offline_since=$2 WHERE id=$1',[id,r.offline_since]);
          }
          if(!members.length || this.now()-r.offline_since.getTime()>=ROOM_TTL_MS) { await this.closeRoom(c,id); return true; }
        }
        return (await this.handover(c,r,members)) || !!expired.rowCount;
      });
      if(updated) changed.push(id);
    }
    await this.tx(async c=>{
      await c.query("DELETE FROM command_receipts cr USING rooms r WHERE cr.room_id=r.id AND r.closed_at<=$1",[new Date(this.now()-SESSION_MS)]);
      await c.query('DELETE FROM sessions WHERE expires_at<=$1',[this.date()]);
    });
    return changed;
  }
}

// Fisher-Yates with crypto.randomInt (unbiased), never Math.random for identities.
function secureShuffle<T>(items: T[]): T[] {
  const copy=[...items];
  for(let i=copy.length-1;i>0;i--) { const j=randomInt(i+1); [copy[i],copy[j]]=[copy[j],copy[i]]; }
  return copy;
}
function canonical(value: unknown): unknown {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
  return value;
}
function fingerprint(command: Command) { return digest(JSON.stringify(canonical(command))); }
