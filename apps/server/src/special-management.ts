import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { dedicatedRoomSchema, type DedicatedRoom, type PlayerCodeAvailability, type PlayerCodeReservation, type PlayerCodeHistoryPage } from '@avalon/contracts';
import { DomainError, type PostgresStore } from './store.js';
import { hashSecret } from './access-secrets.js';
import { lockPlayerCodes } from './player-codes.js';
import { readCursor } from './accounts.js';

export class SpecialManagement {
  constructor(private store: PostgresStore) {}
  async rooms(managerId?: string): Promise<DedicatedRoom[]> {
    return this.store.tx(async c => {
      const { rows } = await c.query(`SELECT d.id,d.code,d.name,d.manager_id,d.settings,(d.password_hash IS NOT NULL) AS protected,
        u.nickname,u.player_code,r.id AS active_id,r.phase AS active_phase FROM dedicated_rooms d JOIN users u ON u.id=d.manager_id
        LEFT JOIN rooms r ON r.dedicated_room_id=d.id AND r.phase<>'closed'
        WHERE ($1::uuid IS NULL OR d.manager_id=$1) ORDER BY d.code`,[managerId ?? null]);
      return rows.map(r => ({ id:r.id,code:r.code,name:r.name,managerId:r.manager_id,managerName:r.nickname,managerCode:r.player_code,
        settings:r.settings,hasPassword:r.protected,...(r.active_id?{activeRoomId:r.active_id,activePhase:r.active_phase}:{}) }));
    });
  }
  async saveRoom(input: z.infer<typeof dedicatedRoomSchema>, id?: string): Promise<void> {
    const passwordHash = input.password ? await hashSecret(input.password) : null;
    await this.store.tx(async c => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext('avalon:room-codes'))");
      if (!(await c.query('SELECT 1 FROM users WHERE id=$1',[input.managerId])).rowCount) throw new DomainError('USER_NOT_FOUND',404);
      const old = id ? (await c.query('SELECT * FROM dedicated_rooms WHERE id=$1',[id])).rows[0] : undefined;
      if (id && !old) throw new DomainError('ROOM_NOT_FOUND',404);
      const active = id ? (await c.query("SELECT * FROM rooms WHERE dedicated_room_id=$1 AND phase<>'closed' FOR UPDATE",[id])).rows[0] : undefined;
      if (active) throw new DomainError('DEDICATED_ROOM_ACTIVE',409);
      if (!old || old.code !== input.code) {
        const used = await c.query('SELECT 1 FROM rooms WHERE code=$1 UNION ALL SELECT 1 FROM dedicated_rooms WHERE code=$1',[input.code]);
        if (used.rowCount) throw new DomainError('ROOM_CODE_TAKEN',409);
      }
      if (old) await c.query('UPDATE dedicated_rooms SET code=$2,name=$3,manager_id=$4,settings=$5,password_hash=$6,updated_at=$7 WHERE id=$1',
        [id,input.code,input.name,input.managerId,input.settings,input.password===undefined?old.password_hash:passwordHash,new Date(this.store.now())]);
      else await c.query('INSERT INTO dedicated_rooms(id,code,name,manager_id,settings,password_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [randomUUID(),input.code,input.name,input.managerId,input.settings,passwordHash]);
    });
  }
  async availability(code: string, userId?: string): Promise<PlayerCodeAvailability> {
    return this.store.tx(async c => {
      const owner = (await c.query('SELECT id,nickname FROM users WHERE player_code=$1',[code])).rows[0];
      if (owner) return {code,status:owner.id===userId?'current':'occupied',nickname:owner.nickname};
      const reserved = (await c.query('SELECT state,user_id FROM player_code_reservations WHERE code=$1',[code])).rows[0];
      return {code,status:reserved?.state==='retired' && reserved.user_id===userId?'reserved':reserved?.state ?? 'available'};
    });
  }
  async reservations(): Promise<PlayerCodeReservation[]> {
    return this.store.tx(async c => (await c.query(`SELECT r.code,r.state,r.user_id AS "userId",r.note,u.nickname,
        NULL::text AS "oldCode",NULL::timestamptz AS "assignedAt"
      FROM player_code_reservations r LEFT JOIN users u ON u.id=r.user_id
      UNION ALL
      SELECT u.player_code,'assigned',u.id,a.reservation_note,u.nickname,a.old_code,a.created_at
      FROM users u JOIN LATERAL (
        SELECT old_code,reservation_note,created_at FROM player_code_audit
        WHERE user_id=u.id AND new_code=u.player_code ORDER BY created_at DESC,id DESC LIMIT 1
      ) a ON true ORDER BY code`)).rows.map(r=>({...r,assignedAt:r.assignedAt?.toISOString()??null})));
  }
  async allocationHistory(cursorValue?:string,limit=20):Promise<PlayerCodeHistoryPage> {
    const cursor=readCursor(cursorValue);
    return this.store.tx(async c=>{
      const rows=(await c.query(`SELECT a.id,a.user_id,a.old_code,a.new_code,a.retained,a.reservation_note,a.created_at,u.nickname,
        to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
        FROM player_code_audit a LEFT JOIN users u ON u.id=a.user_id
        WHERE ($1::timestamptz IS NULL OR (a.created_at,a.id)<($1::timestamptz,$2::uuid))
        ORDER BY a.created_at DESC,a.id DESC LIMIT $3`,[cursor?.at??null,cursor?.id??null,limit+1])).rows;
      const page=rows.slice(0,limit),last=page.at(-1);
      return {history:page.map(r=>({id:r.id,userId:r.user_id,nickname:r.nickname,oldCode:r.old_code,newCode:r.new_code,
        retained:r.retained,note:r.reservation_note,createdAt:r.created_at.toISOString()})),
        nextCursor:rows.length>limit&&last?Buffer.from(JSON.stringify({at:last.cursor_at,id:last.id})).toString('base64url'):null};
    });
  }
  async reserveCode(code: string, note: string) {
    await this.store.tx(async c => {
      await lockPlayerCodes(c);
      if ((await c.query('SELECT 1 FROM users WHERE player_code=$1 UNION ALL SELECT 1 FROM player_code_reservations WHERE code=$1',[code])).rowCount) throw new DomainError('PLAYER_CODE_TAKEN',409);
      await c.query("INSERT INTO player_code_reservations(code,state,note) VALUES($1,'reserved',$2)",[code,note]);
    });
  }
  async releaseReservation(code: string) {
    await this.store.tx(async c => {
      await lockPlayerCodes(c);
      const row = (await c.query('SELECT state FROM player_code_reservations WHERE code=$1',[code])).rows[0];
      if (row?.state==='retired') throw new DomainError('PLAYER_CODE_RETIRED',409);
      await c.query("DELETE FROM player_code_reservations WHERE code=$1 AND state='reserved'",[code]);
    });
  }
  async assignCode(userId: string, code: string, expectedCode: string) {
    return this.store.tx(async c => {
      await lockPlayerCodes(c);
      // Match join/create's non-key lock; start-game roster FKs may take KEY SHARE before the room lock releases.
      const user = (await c.query('SELECT player_code,nickname FROM users WHERE id=$1 FOR NO KEY UPDATE',[userId])).rows[0];
      if (!user) throw new DomainError('USER_NOT_FOUND',404);
      if (user.player_code !== expectedCode) throw new DomainError('PLAYER_CODE_CHANGED',409);
      if (user.player_code===code) return {oldCode:code,newCode:code,retained:false};
      if ((await c.query('SELECT 1 FROM users WHERE player_code=$1',[code])).rowCount) throw new DomainError('PLAYER_CODE_TAKEN',409);
      const reserved = (await c.query('SELECT * FROM player_code_reservations WHERE code=$1',[code])).rows[0];
      if (reserved?.state==='retired' && reserved.user_id!==userId) throw new DomainError('PLAYER_CODE_RETIRED',409);
      const active = await c.query("SELECT r.phase FROM room_members m JOIN rooms r ON r.id=m.room_id WHERE m.user_id=$1 FOR UPDATE OF r",[userId]);
      if (active.rows[0]?.phase==='playing') throw new DomainError('USER_IN_ACTIVE_GAME',409);
      const retained = Boolean((await c.query('SELECT 1 FROM game_participants WHERE user_id=$1 LIMIT 1',[userId])).rowCount);
      await c.query('DELETE FROM player_code_reservations WHERE code=$1',[code]);
      await c.query('UPDATE users SET player_code=$2 WHERE id=$1',[userId,code]);
      if (retained) await c.query("INSERT INTO player_code_reservations(code,state,user_id,note) VALUES($1,'retired',$2,'已有开局记录，旧号保留')",[user.player_code,userId]);
      await c.query('INSERT INTO player_code_audit(id,user_id,old_code,new_code,retained,reservation_note) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),userId,user.player_code,code,retained,reserved?.state==='reserved'?reserved.note:'']);
      return {oldCode:user.player_code,newCode:code,retained};
    });
  }
  async audit(userId: string) {
    return this.store.tx(async c => (await c.query('SELECT old_code AS "oldCode",new_code AS "newCode",retained,created_at AS "createdAt" FROM player_code_audit WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[userId])).rows);
  }
}
