import { pathToFileURL } from 'node:url';
import { createPool } from './db.js';
import { createContentSafety } from './content-safety-config.js';
import type { ContentSafety, SafetyActor } from './content-safety.js';
import { DomainError } from './store.js';

/** Audits legacy display content without deleting users, chat history or game records. */
export async function auditLegacy(safety: ContentSafety) {
  if(!safety.enabled)throw new Error('CONTENT_SAFETY_ENABLED must be true for the audit');
  const counts={passed:0,rejected:0,pending:0,errors:0,avatarsUpdated:0};
  const audit=async(operation:()=>Promise<unknown>)=>{
    try {await operation();counts.passed++;return true;}
    catch(error){
      if(error instanceof DomainError&&error.code==='CONTENT_REJECTED')counts.rejected++;
      else if(error instanceof DomainError&&error.code==='CONTENT_PENDING')counts.pending++;
      else counts.errors++;
      return false;
    }
  };
  const names=await safety.pool.query<{text:string}>(`SELECT nickname AS text FROM users UNION SELECT name FROM setting_presets
    UNION SELECT name FROM dedicated_rooms UNION SELECT player->>'nickname' FROM games,jsonb_array_elements(state->'players') player`);
  for(const row of names.rows)if(row.text)await audit(()=>safety.text(row.text,'profile'));
  const messages=await safety.pool.query<{text:string}>(`SELECT DISTINCT message AS text FROM direct_messages
    UNION SELECT value->>'text' FROM system_settings WHERE key='broadcast_announcement'`);
  for(const row of messages.rows)if(row.text?.trim())await audit(()=>safety.text(row.text,'chat'));
  const users=await safety.pool.query<{id:string;avatar_url:string|null;wechat_avatar_url:string|null}>('SELECT id,avatar_url,wechat_avatar_url FROM users');
  for(const user of users.rows)for(const column of ['avatar_url','wechat_avatar_url'] as const){
    const original=user[column];if(!original)continue;
    await audit(async()=>{
      const approved=await safety.avatar(original,{userId:user.id});
      // Preserve a concurrent user edit; never overwrite it with a stale audit result.
      if(approved!==original){
        const changed=await safety.pool.query(`UPDATE users SET ${column}=$2 WHERE id=$1 AND ${column}=$3`,[user.id,approved,original]);
        counts.avatarsUpdated+=changed.rowCount??0;
      }
    });
  }
  return counts;
}

async function main(){
  const command=process.argv[2]??'status';
  const pool=createPool();
  try{
    const safety=createContentSafety(pool,process.env.APP_ORIGIN??'https://game.ccnepower.com');await safety.initialize();
    if(command==='status'){
      const checks=(await pool.query('SELECT provider,decision,count(*)::int AS count FROM content_safety_checks GROUP BY provider,decision ORDER BY provider,decision')).rows;
      const pending=(await pool.query("SELECT count(*)::int AS count FROM content_safety_reviews WHERE status='pending'")).rows[0].count;
      console.log(JSON.stringify({enabled:safety.enabled,checks,pending}));return;
    }
    if(command==='inventory'){
      const result=(await pool.query(`SELECT (SELECT count(*) FROM users)::int AS users,
        (SELECT count(*) FROM users WHERE avatar_url IS NOT NULL OR wechat_avatar_url IS NOT NULL)::int AS avatarUsers,
        (SELECT count(DISTINCT message) FROM direct_messages)::int AS distinctPrivateMessages,
        (SELECT count(*) FROM games)::int AS games`)).rows[0];
      console.log(JSON.stringify(result));return;
    }
    if(command==='audit'){
      const result=await auditLegacy(safety);console.log(JSON.stringify(result));if(result.errors)process.exitCode=1;return;
    }
    if(command==='probe'){
      const playerCode=process.argv[3];
      if(!/^\d{6}$/.test(playerCode??''))throw new Error('Supply your dedicated WeChat test account player code');
      const user=(await pool.query<{id:string;wechat_openid:string|null}>('SELECT id,wechat_openid FROM users WHERE player_code=$1',[playerCode])).rows[0];
      if(!user?.wechat_openid)throw new Error('Test account has no verified WeChat identity; log in with WeChat first');
      const response=await fetch(safety.publicBase+'/art/avatars/wx-1.webp?v=artifact1',{signal:AbortSignal.timeout(5000),redirect:'error'});
      if(!response.ok)throw new Error('Cannot read the built-in test avatar');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>49134)throw new Error('Test avatar exceeds upload size');
      const image='data:image/webp;base64,'+bytes.toString('base64');
      // Unique harmless text forces a live check instead of reusing the content ledger.
      const suffix=Date.now().toString().slice(-6);
      for(const [label,actor] of [['web',{}],['wechat',{userId:user.id,openid:user.wechat_openid}]] as const){
        await safety.text('审核验收'+label+suffix,'profile',actor as SafetyActor);
        await safety.text('大家好，准备开始取经。'+label+suffix,'chat',actor as SafetyActor);
        // Force both providers to check, even when the previous probe approved identical bytes.
        await safety.avatar(image,actor as SafetyActor,true);
        console.log(JSON.stringify({provider:label,status:'passed'}));
      }
      return;
    }
    throw new Error('Use status, inventory, audit, or probe <test-player-code>');
  }finally{await pool.end();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(JSON.stringify({error:error instanceof DomainError?error.code:'AUDIT_FAILED'}));process.exitCode=1;});
