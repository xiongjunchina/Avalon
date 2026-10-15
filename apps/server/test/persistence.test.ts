import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { database, service, headers, origin, localSocket } from './helpers.js';
import { digest, SESSION_MS, ROOM_TTL_MS, GRACE_MS, PostgresStore } from '../src/store.js';
import type { Command } from '@avalon/contracts';
const cmd=(version:number,type:Command['type'],payload:unknown,commandId=randomUUID())=>({expectedVersion:version,type,payload,commandId}) as Command;

test('migrations, server restart and duplicate commands preserve users, room, settings and receipts',async t=>{
  const f=await service(t),s=f.store;
  const a=await s.createGuest('持久房主');let r=await s.createRoom(a.user);
  await s.execute(a.user.id,r.id,cmd(r.version,'updateSettings',{...r.settings,playerCount:5}));r=(await s.snapshot(r.id))!;
  const ready=cmd(r.version,'setReady',{ready:true});await s.execute(a.user.id,r.id,ready);
  const before=(await s.snapshot(r.id))!;
  await f.restart();
  const user=await s.authenticate(a.token);assert.equal(user.id,a.user.id);
  const after=(await s.roomFor(user.id,r.id)).room;
  assert.equal(after.version,before.version);assert.equal(after.members[0].ready,true);
  assert.equal(after.settings.playerCount,5);assert.equal(after.members[0].online,false);
  const replay=await s.execute(user.id,r.id,ready);assert.equal(replay.result.type,'commandResult');
  assert.equal((await s.snapshot(r.id))!.version,before.version);
  await assert.rejects(s.execute(user.id,r.id,{...ready,payload:{ready:false}} as Command),{code:'COMMAND_ID_REUSED'});
});

test('concurrent last-seat joins and simultaneous cross-room joins obey DB uniqueness',async t=>{
  const {store:s,pool}=await database(t);
  const owner=await s.createGuest('房主');let r=await s.createRoom(owner.user);
  await s.execute(owner.user.id,r.id,cmd(r.version,'updateSettings',{...r.settings,playerCount:5}));
  for(let n=0;n<3;n++)await s.join((await s.createGuest(`成员${n}`)).user,r.code);
  const a=await s.createGuest('竞争A'),b=await s.createGuest('竞争B');
  const joined=await Promise.allSettled([s.join(a.user,r.code),s.join(b.user,r.code)]);
  assert.equal(joined.filter(v=>v.status==='fulfilled').length,1);
  assert.equal((joined.find(v=>v.status==='rejected') as PromiseRejectedResult).reason.code,'ROOM_FULL');
  assert.equal((await s.snapshot(r.id))!.members.length,5);
  const other=await s.createRoom((await s.createGuest('另一个房主')).user),third=await s.createRoom((await s.createGuest('第三房主')).user);
  const x=await s.createGuest('跨房');const raced=await Promise.allSettled([s.join(x.user,other.code),s.join(x.user,third.code)]);
  assert.equal(raced.filter(v=>v.status==='fulfilled').length,1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM room_members WHERE user_id=$1',[x.user.id])).rows[0].count,1);
});

test('admission closure keeps ready state, blocks newcomers, permits existing users; host-only',async t=>{
  const {store:s}=await database(t);
  const a=await s.createGuest('房主'),b=await s.createGuest('队友'),c=await s.createGuest('新朋友');
  let r=await s.createRoom(a.user);r=await s.join(b.user,r.code);
  await s.execute(b.user.id,r.id,cmd(r.version,'setReady',{ready:true}));r=(await s.snapshot(r.id))!;
  await assert.rejects(s.execute(b.user.id,r.id,cmd(r.version,'setAdmission',{acceptingNewMembers:false})),{code:'FORBIDDEN'});
  await s.execute(a.user.id,r.id,cmd(r.version,'setAdmission',{acceptingNewMembers:false}));
  assert.equal((await s.join(b.user,r.code)).members.find(m=>m.id===b.user.id)!.ready,true);
  await assert.rejects(s.join(c.user,r.code),{code:'JOIN_DISABLED'});
  await s.connect(b.user.id,r.id,randomUUID());assert.equal((await s.snapshot(r.id))!.members.find(m=>m.id===b.user.id)!.online,true);
});

test('session renewal updates database and cookie together; expired credentials cannot be revived',async t=>{
  const f=await service(t);const a=await f.store.createGuest('续期');const cookie=`avalon_session=${a.token}`;
  f.advance(20*86400_000);
  const response=await f.app.inject({method:'POST',url:'/api/sessions/refresh',headers:{...headers,cookie},payload:{}});
  assert.equal(response.statusCode,200);assert.match(String(response.headers['set-cookie']),/Max-Age=2592000/i);
  const expiry=(await f.pool.query('SELECT expires_at FROM sessions WHERE token_hash=$1',[digest(a.token)])).rows[0].expires_at;
  assert.equal(expiry.getTime(),f.now()+SESSION_MS);
  f.advance(SESSION_MS+1);
  const expired=await f.app.inject({method:'POST',url:'/api/sessions/refresh',headers:{...headers,cookie},payload:{}});
  assert.equal(expired.statusCode,401);assert.equal(expired.headers['set-cookie'],undefined);
});

test('host timeout: 60s boundary, reconnect cancellation, later member arrival and joined-time ordering',async t=>{
  const f=await database(t),s=f.store;
  const a=await s.createGuest('原房主'),b=await s.createGuest('早加入'),c=await s.createGuest('后加入');
  let r=await s.createRoom(a.user);f.advance(1);await s.join(b.user,r.code);f.advance(1);await s.join(c.user,r.code);
  const aConn=randomUUID(),bConn=randomUUID(),cConn=randomUUID();await s.connect(a.user.id,r.id,aConn);await s.connect(b.user.id,r.id,bConn);
  await s.disconnect(a.user.id,r.id,aConn);f.advance(GRACE_MS-1);await s.touch([bConn]);await s.maintain();
  assert.equal((await s.snapshot(r.id))!.hostId,a.user.id);
  await s.connect(a.user.id,r.id,aConn);f.advance(2);await s.touch([aConn,bConn]);await s.maintain();assert.equal((await s.snapshot(r.id))!.hostId,a.user.id);
  await s.disconnect(a.user.id,r.id,aConn);await s.disconnect(b.user.id,r.id,bConn);f.advance(GRACE_MS);
  await s.maintain();assert.equal((await s.snapshot(r.id))!.hostId,a.user.id);
  await s.connect(c.user.id,r.id,cConn);assert.equal((await s.snapshot(r.id))!.hostId,c.user.id);
  // A leaves; B keeps older joined_at despite sitting at a later seat than newly rejoined A.
  r=(await s.snapshot(r.id))!;await s.execute(a.user.id,r.id,cmd(r.version,'leaveRoom',{}));
  f.advance(1);await s.join(a.user,r.code);await s.connect(a.user.id,r.id,randomUUID());await s.connect(b.user.id,r.id,bConn);
  r=(await s.snapshot(r.id))!;await s.execute(c.user.id,r.id,cmd(r.version,'leaveRoom',{}));
  assert.equal((await s.snapshot(r.id))!.hostId,b.user.id);
});

test('restart grace and durable 24h expiry survive recovery; users retained; empty room closes immediately',async t=>{
  const f=await database(t),s=f.store;
  const a=await s.createGuest('房主'),b=await s.createGuest('朋友');const r=await s.createRoom(a.user);await s.join(b.user,r.code);
  f.advance(120000);await s.recoverPresence();const bConn=randomUUID();await s.connect(b.user.id,r.id,bConn);
  assert.equal((await s.snapshot(r.id))!.hostId,a.user.id);
  f.advance(GRACE_MS-1);await s.touch([bConn]);await s.maintain();assert.equal((await s.snapshot(r.id))!.hostId,a.user.id);
  f.advance(1);await s.touch([bConn]);await s.maintain();assert.equal((await s.snapshot(r.id))!.hostId,b.user.id);
  await s.disconnect(b.user.id,r.id,bConn);f.advance(ROOM_TTL_MS-1);
  await s.recoverPresence();await s.maintain();assert.notEqual(await s.snapshot(r.id),null);
  f.advance(1);await s.maintain();assert.equal(await s.snapshot(r.id),null);
  assert.equal((await s.authenticate(a.token)).id,a.user.id);assert.equal(await s.currentRoom(a.user.id),null);
  await assert.rejects(s.join(a.user,r.code),{code:'ROOM_CLOSED'});
  const fresh=await s.createRoom(a.user);await s.execute(a.user.id,fresh.id,cmd(fresh.version,'leaveRoom',{}));assert.equal(await s.snapshot(fresh.id),null);
});

test('receipt retention is 30 days after closing, not 30 days after command',async t=>{
  const f=await database(t),s=f.store;const a=await s.createGuest('房主');let r=await s.createRoom(a.user);
  await s.execute(a.user.id,r.id,cmd(r.version,'setReady',{ready:true}));f.advance(SESSION_MS+1);
  // Keep the room alive directly; retention must not remove active-room receipts.
  await s.connect(a.user.id,r.id,randomUUID());await s.maintain();
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM command_receipts')).rows[0].n,1);
  r=(await s.snapshot(r.id))!;await s.execute(a.user.id,r.id,cmd(r.version,'leaveRoom',{}));
  f.advance(SESSION_MS-1);await s.maintain();assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM command_receipts')).rows[0].n,2);
  f.advance(1);await s.maintain();assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM command_receipts')).rows[0].n,0);
});

test('database write failure rolls back state and receipt; no memory success fallback',async t=>{
  const {store:s,pool}=await database(t);const a=await s.createGuest('房主');const r=await s.createRoom(a.user);
  await pool.query(`CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test write failure'; END $$;
    CREATE TRIGGER fail_receipt BEFORE INSERT ON command_receipts FOR EACH ROW EXECUTE FUNCTION fail_receipt()`);
  await assert.rejects(s.execute(a.user.id,r.id,cmd(r.version,'setReady',{ready:true})),{code:'SERVICE_UNAVAILABLE'});
  const after=(await s.snapshot(r.id))!;assert.equal(after.version,r.version);assert.equal(after.members[0].ready,false);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM command_receipts')).rows[0].n,0);
});

test('database connection loss surfaces SERVICE_UNAVAILABLE through HTTP and rejects new guest creation',async t=>{
  const f=await service(t);
  const before=(await f.pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
  await f.admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1',[f.schema]);
  // owner connection error is delivered on the next event loop turn
  await new Promise(resolve=>setTimeout(resolve,30));
  const response=await f.app.inject({method:'POST',url:'/api/sessions/guest',headers,payload:{nickname:'故障时访客'}});
  assert.equal(response.statusCode,503);assert.equal(response.json().error,'SERVICE_UNAVAILABLE');
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n,before);
});

test('single server ownership prevents another instance from resetting presence',async t=>{
  const f=await service(t);const {buildApp}=await import('../src/app.js');
  await assert.rejects(buildApp({store:new PostgresStore(f.pool)}),/Another Avalon server/);
});

test('WebSocket write failure returns an error, never success or a mutated snapshot',async t=>{
  const f=await service(t);const a=await f.store.createGuest('回滚验收');const r=await f.store.createRoom(a.user);
  const messages:unknown[]=[];
  const socket=await f.app.injectWS(`/api/rooms/${r.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${a.token}`}},{onInit:ws=>ws.on('message',raw=>messages.push(JSON.parse(raw.toString())))});
  t.after(()=>socket.terminate());
  // Wait for persisted connection initialization before submitting the failing command.
  for(let i=0;i<100&&!messages.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  await f.pool.query(`CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test write failure'; END $$;
    CREATE TRIGGER fail_receipt BEFORE INSERT ON command_receipts FOR EACH ROW EXECUTE FUNCTION fail_receipt()`);
  const command=cmd(r.version,'setReady',{ready:true});socket.send(JSON.stringify(command));
  const result=()=>messages.find((m:any)=>m.type==='commandResult'&&m.commandId===command.commandId) as any;
  for(let i=0;i<100&&!result();i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(result()?.ok,false);assert.equal(result()?.error,'SERVICE_UNAVAILABLE');
  assert.equal(messages.some((m:any)=>m.type==='snapshot'&&m.room.members.some((p:any)=>p.ready)),false);
  assert.equal((await f.store.snapshot(r.id))!.version,r.version);
});
