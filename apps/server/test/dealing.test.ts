import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ServerMessage, RoomView } from '@avalon/contracts';
import { gameFixture } from './game-helpers.js';
import { localSocket, origin } from './helpers.js';
import { DEAL_MS } from '../src/store.js';

async function until(check:()=>boolean) {
  for(let i=0;i<250;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail('countdown broadcast missing');
}
test('five-second deal hides every identity over HTTP; repeat starts, early commands and refresh cannot reveal or redeal',async t=>{
  const f=await gameFixture(t,false),host=f.people[0],start=await f.command(host.user.id,'startGame');
  const room=await f.state(host.user.id),game=room.game!;
  assert.equal(game.phase,'dealing');assert.equal(Date.parse(game.dealEndsAt!)-Date.parse(room.serverTime!),DEAL_MS);
  for(const p of f.people) {
    const res=await f.app.inject({url:`/api/rooms/${room.id}`,headers:{cookie:`avalon_session=${p.token}`}});
    assert.equal(res.statusCode,200);assert.deepEqual(res.json().room.game,game);
    assert.equal(res.json().room.game.self,undefined);assert.equal(res.json().room.game.roles,undefined);
    const joined=await f.store.join(p.user,room.code);assert.equal(joined.game!.self,undefined);
    await assert.rejects(f.command(p.user.id,'confirmRole'),/DEAL_PENDING/);
  }
  await assert.rejects(f.command(host.user.id,'updateTeamDraft',{playerIds:[],direction:'clockwise'}),/DEAL_PENDING/);
  await assert.rejects(f.command(host.user.id,'updateSettings',room.settings),/GAME_IN_PROGRESS/);
  f.advance(2000);await f.store.execute(host.user.id,room.id,start);
  const repeated=(await f.state()).game!;assert.equal(repeated.id,game.id);assert.equal(repeated.dealEndsAt,game.dealEndsAt);
  await assert.rejects(f.command(host.user.id,'startGame'),/GAME_IN_PROGRESS/);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM games')).rows[0].n,1);
  f.advance(2999);assert.equal((await f.store.releaseDeal(room.id)).changed,false);
  assert.equal((await f.state(host.user.id)).game!.self,undefined);
  f.advance(1);const results=await Promise.all([f.store.releaseDeal(room.id),f.store.releaseDeal(room.id)]);
  assert.equal(results.filter(r=>r.changed).length,1);
  const after=await f.state(host.user.id);assert.equal(after.version,room.version+1);assert.equal(after.game!.phase,'role_reveal');assert.ok(after.game!.self);
  assert.equal(after.game!.dealEndsAt,undefined);assert.equal(after.game!.revealedRoles,undefined);
});

test('restart retains deadline and original deal, reconstructs timer and broadcasts only after committed release',async t=>{
  const f=await gameFixture(t,false),host=f.people[0];await f.command(host.user.id,'startGame');
  const original=(await f.state()).game!,saved=(await f.pool.query('SELECT state FROM games WHERE id=$1',[original.id])).rows[0].state;
  f.advance(4500);await f.restart();
  assert.equal((await f.state()).game!.dealEndsAt,original.dealEndsAt);
  const clients:{socket:Awaited<ReturnType<typeof f.app.injectWS>>;messages:ServerMessage[]}[]=[];
  t.after(async()=>{for(const c of clients)c.socket.terminate();});
  for(const p of f.people.slice(0,2)) {
    const messages:ServerMessage[]=[];
    const socket=await f.app.injectWS(`/api/rooms/${f.room.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${p.token}`}},{onInit:ws=>ws.on('message',raw=>messages.push(JSON.parse(raw.toString())))});
    clients.push({socket,messages});
  }
  await until(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot')));
  for(const c of clients){const snapshots=c.messages.filter(m=>m.type==='snapshot');assert.ok(snapshots.every(m=>m.room.game!.self===undefined&&m.room.game!.dealEndsAt===original.dealEndsAt));}
  f.advance(500);
  await until(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.game?.phase==='role_reveal')));
  for(let i=0;i<clients.length;i++) {
    const reveal=clients[i].messages.find(m=>m.type==='snapshot'&&m.room.game?.phase==='role_reveal') as {room:RoomView};
    assert.equal(reveal.room.game!.self!.role,saved.roles[f.people[i].user.id]);assert.equal(reveal.room.game!.id,original.id);
    assert.equal(reveal.room.game!.revealedRoles,undefined);
  }
});

test('database failure cannot release identities or advance version; retry releases once after recovery',async t=>{
  const f=await gameFixture(t,false);await f.command(f.people[0].user.id,'startGame');f.advance(DEAL_MS);
  const before=await f.state(f.people[0].user.id);
  await f.pool.query(`CREATE FUNCTION reject_deal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected write error'; END $$;
    CREATE TRIGGER reject_deal BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION reject_deal()`);
  await assert.rejects(f.store.releaseDeal(f.room.id),/SERVICE_UNAVAILABLE/);
  assert.deepEqual(await f.state(f.people[0].user.id),before);
  await f.pool.query('DROP TRIGGER reject_deal ON games');assert.equal((await f.store.releaseDeal(f.room.id)).changed,true);
  assert.equal((await f.store.releaseDeal(f.room.id)).changed,false);
});

test('live WebSocket start schedules automatic release and shares one deadline with every connected client',async t=>{
  const f=await gameFixture(t,false),clients:{socket:Awaited<ReturnType<typeof f.app.injectWS>>;messages:ServerMessage[]}[]=[];
  t.after(async()=>{for(const c of clients)c.socket.terminate();});
  for(const p of f.people) {
    const messages:ServerMessage[]=[];
    const socket=await f.app.injectWS(`/api/rooms/${f.room.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${p.token}`}},{onInit:ws=>ws.on('message',raw=>messages.push(JSON.parse(raw.toString())))});
    clients.push({socket,messages});
  }
  await until(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot')));
  const action={type:'startGame',payload:{},commandId:randomUUID(),expectedVersion:(await f.state()).version};
  clients[0].socket.send(JSON.stringify(action));
  await until(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.game?.phase==='dealing')));
  const views=clients.map(c=>(c.messages.find(m=>m.type==='snapshot'&&m.room.game?.phase==='dealing') as {room:RoomView}).room.game!);
  assert.equal(new Set(views.map(g=>g.dealEndsAt)).size,1);assert.ok(views.every(g=>!g.self));
  // Real timer is five seconds; advance the injected database clock to its deadline.
  f.advance(DEAL_MS);
  for(let i=0;i<650;i++){if(clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.game?.phase==='role_reveal')))break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.game?.phase==='role_reveal')));
});
