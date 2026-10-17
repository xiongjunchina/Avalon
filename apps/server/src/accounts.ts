import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { teamOf, type GameState } from '@avalon/game-core';
import { type GameSummary, type HistoryPage, type Replay, type Statistics, type Score, type Role, type Team,
  type User, type SettingPreset, profileSchema, presetSchema } from '@avalon/contracts';
import { DomainError, type PostgresStore } from './store.js';

const cursorSchema=z.object({at:z.iso.datetime(),id:z.string().uuid()}).strict();
export function readCursor(value?:string) {
  if(!value)return null;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8'))); }
  catch { throw new DomainError('INVALID_INPUT'); }
}
export const historyQuery=z.object({cursor:z.string().min(1).max(512).optional(),
  limit:z.coerce.number().int().min(1).max(50).default(10),favorites:z.enum(['true','false']).default('false')}).strict();
type GameRow={id:string;state:GameState;created_at:Date;ended_at:Date;cursor_at:string;favorite:boolean};
const summary=(r:GameRow,userId:string):GameSummary=>{
  const g=r.state,p=g.players.find(p=>p.id===userId)!;
  return {id:r.id,startedAt:r.created_at.toISOString(),endedAt:r.ended_at.toISOString(),rulesetVersion:g.rulesetVersion,
    playerCount:g.players.length,self:{nickname:p.nickname,seat:p.seat,role:g.roles[userId],team:teamOf(g.roles[userId])},
    result:{winner:g.result!.winner,reason:g.result!.reason,...(g.result!.targetId?{targetId:g.result!.targetId}:{})},favorite:r.favorite};
};
const gameSelect=`SELECT g.*,to_char(g.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
  EXISTS(SELECT 1 FROM favorites f WHERE f.game_id=g.id AND f.user_id=$1) AS favorite
  FROM games g JOIN game_participants p ON p.game_id=g.id AND p.user_id=$1
  WHERE g.ended_at IS NOT NULL AND g.state->>'phase' IN ('finished','aborted')`;

// Account queries never depend on current room membership and never return live game state.
export class Accounts {
  constructor(private store:PostgresStore) {}
  async updateProfile(userId:string,input:z.infer<typeof profileSchema>):Promise<User> {
    return this.store.tx(async c=>{
      const r=(await c.query<{id:string;nickname:string;avatar:User['avatar'];avatar_url:string|null;wechat_avatar_url:string|null}>(
        `UPDATE users SET nickname=$2, avatar=$3,
          avatar_url = CASE WHEN $4::boolean THEN $5 ELSE avatar_url END,
          wechat_avatar_url = CASE WHEN $6::boolean THEN $7 ELSE wechat_avatar_url END
         WHERE id=$1 RETURNING id,nickname,avatar,avatar_url,wechat_avatar_url`,
        [userId,input.nickname,input.avatar,input.avatarUrl!==undefined,input.avatarUrl??null,input.wechatAvatarUrl!==undefined,input.wechatAvatarUrl??null]
      )).rows[0];
      return {id:r.id,nickname:r.nickname,avatar:r.avatar,...(r.avatar_url?{avatarUrl:r.avatar_url}:{}),...(r.wechat_avatar_url?{wechatAvatarUrl:r.wechat_avatar_url}:{})};
    });
  }
  async history(userId:string,query:z.infer<typeof historyQuery>):Promise<HistoryPage> {
    const cursor=readCursor(query.cursor);
    return this.store.tx(async c=>{
      const rows=(await c.query<GameRow>(`${gameSelect}
        AND ($2::timestamptz IS NULL OR (g.ended_at,g.id)<($2::timestamptz,$3::uuid))
        AND (NOT $4::boolean OR EXISTS(SELECT 1 FROM favorites f WHERE f.game_id=g.id AND f.user_id=$1))
        ORDER BY g.ended_at DESC,g.id DESC LIMIT $5`,[userId,cursor?.at??null,cursor?.id??null,query.favorites==='true',query.limit+1])).rows;
      const page=rows.slice(0,query.limit),last=page.at(-1);
      return {games:page.map(r=>summary(r,userId)),nextCursor:rows.length>query.limit&&last?
        Buffer.from(JSON.stringify({at:last.cursor_at,id:last.id})).toString('base64url'):null};
    });
  }
  async replay(userId:string,id:string):Promise<Replay> {
    return this.store.tx(async c=>{
      const r=(await c.query<GameRow>(`${gameSelect} AND g.id=$2`,[userId,id])).rows[0];
      // Same answer for missing, unfinished and non-participating games.
      if(!r)throw new DomainError('GAME_NOT_FOUND',404);
      const g=r.state;
      // Explicit allowlist: future engine fields and legacy raw ballots must not leak into replays.
      return {...summary(r,userId),settings:{...g.settings},
        players:g.players.map(p=>({id:p.id,nickname:p.nickname,seat:p.seat})),
        roles:Object.fromEntries(g.players.map(p=>[p.id,g.roles[p.id]])),
        rounds:g.rounds.map(r=>({number:r.number,mission:r.mission,captainId:r.captainId,team:[...r.team],direction:r.direction,
          ...(r.vote?{vote:{approvals:r.vote.approvals,rejections:r.vote.rejections,abstentions:r.vote.abstentions??0,passed:r.vote.passed,
            ...(!g.settings.anonymousTeamVote&&r.vote.ballots?{ballots:Object.fromEntries(g.players.filter(p=>(typeof r.vote!.ballots![p.id]==='boolean'||r.vote!.ballots![p.id]==='abstain')).map(p=>[p.id,r.vote!.ballots![p.id]]))}:{})}}:{}),
          ...(r.result?{result:{successes:r.result.successes,failures:r.result.failures,passed:r.result.passed}}:{})})),
        inspections:(g.lady?.inspections??[]).map(i=>({afterMission:i.afterMission,inspectorId:i.inspectorId,targetId:i.targetId})),
        earlyWindows:(g.earlyAssassination?.windows??[]).map(w=>({afterMission:w.afterMission,afterProposal:w.afterProposal,decision:w.decision}))};
    });
  }
  async statistics(userId:string):Promise<Statistics> {
    const empty=():Score=>({completed:0,wins:0,losses:0,aborted:0,winRate:null});
    const roles:Role[]=['merlin','percival','guinevere','loyal','morgana','assassin','mordred','oberon','minion'];
    const stats:Statistics={...empty(),byRole:Object.fromEntries(roles.map(r=>[r,empty()])) as Record<Role,Score>,byTeam:{blue:empty(),red:empty()}};
    return this.store.tx(async c=>{
      const rows=(await c.query<{role:Role;winner:Team|null;count:number}>(`SELECT g.state->'roles'->>($1::text) AS role,
        g.state->'result'->>'winner' AS winner,count(*)::int AS count
        FROM games g JOIN game_participants p ON p.game_id=g.id AND p.user_id=$1::uuid
        WHERE g.ended_at IS NOT NULL AND g.state->>'phase' IN ('finished','aborted')
        GROUP BY 1,2`,[userId])).rows;
      for(const r of rows)for(const s of [stats,stats.byRole[r.role],stats.byTeam[teamOf(r.role)]]) {
        if(r.winner===null)s.aborted+=r.count;
        else {s.completed+=r.count;if(r.winner===teamOf(r.role))s.wins+=r.count;else s.losses+=r.count;}
        s.winRate=s.completed?s.wins/s.completed:null;
      }
      return stats;
    });
  }
  async favorite(userId:string,id:string,enabled:boolean) {
    return this.store.tx(async c=>{
      if(!(await c.query(`${gameSelect} AND g.id=$2`,[userId,id])).rowCount)throw new DomainError('GAME_NOT_FOUND',404);
      if(enabled)await c.query('INSERT INTO favorites(user_id,game_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,id]);
      else await c.query('DELETE FROM favorites WHERE user_id=$1 AND game_id=$2',[userId,id]);
      return {favorite:enabled};
    });
  }
  async presets(userId:string):Promise<SettingPreset[]> {
    return this.store.tx(async c=>(await c.query('SELECT id,name,settings,updated_at FROM setting_presets WHERE user_id=$1 ORDER BY updated_at DESC,id',[userId])).rows.map(r=>({id:r.id,name:r.name,settings:r.settings,updatedAt:r.updated_at.toISOString()})));
  }
  async savePreset(userId:string,input:z.infer<typeof presetSchema>):Promise<SettingPreset> {
    return this.store.tx(async c=>{
      // Serialize per-user quota and same-name updates, including concurrent requests.
      await c.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE',[userId]);
      const existing=await c.query('SELECT name FROM setting_presets WHERE user_id=$1',[userId]);
      if(existing.rows.length>=10&&!existing.rows.some(r=>r.name===input.name))throw new DomainError('PRESET_LIMIT',409);
      const r=(await c.query(`INSERT INTO setting_presets(id,user_id,name,settings,updated_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,name) DO UPDATE SET settings=EXCLUDED.settings,updated_at=EXCLUDED.updated_at RETURNING *`,
        [randomUUID(),userId,input.name,input.settings,new Date(this.store.now())])).rows[0];
      return {id:r.id,name:r.name,settings:r.settings,updatedAt:r.updated_at.toISOString()};
    });
  }
  async deletePreset(userId:string,id:string) {
    return this.store.tx(async c=>{await c.query('DELETE FROM setting_presets WHERE id=$1 AND user_id=$2',[id,userId]);return {ok:true};});
  }
}
