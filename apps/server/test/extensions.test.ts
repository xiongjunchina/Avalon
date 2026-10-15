import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Command, GameView, RoomView, ServerMessage } from '@avalon/contracts';
import { gameFixture, confirm, mission } from './game-helpers.js';
import { origin, localSocket } from './helpers.js';
async function fixture(t:Parameters<typeof gameFixture>[0]) {
  const f=await gameFixture(t,true,{ladyEnabled:true,earlyAssassinationEnabled:true,playerCount:7});
  await confirm(f);await mission(f);await mission(f);return f;
}
const member=(f:Awaited<ReturnType<typeof fixture>>,id:string)=>f.people.find(p=>p.user.id===id)!;
async function rolePlayer(f:Awaited<ReturnType<typeof fixture>>,role:string){for(const p of f.people)if((await f.state(p.user.id)).game!.self!.role===role)return p;throw Error('role absent');}
async function httpGame(f:Awaited<ReturnType<typeof fixture>>,id:string):Promise<GameView>{const r=await f.app.inject({url:`/api/rooms/${f.room.id}`,headers:{cookie:`avalon_session=${member(f,id).token}`}});assert.equal(r.statusCode,200);return r.json().room.game;}
test('lady selection, private result, early decision and committed assassination survive separate server restarts',async t=>{
  const f=await fixture(t),initial=(await f.state()).game!,inspector=initial.lady!.holderId,target=initial.players.find(p=>p.id!==inspector)!.id;
  assert.equal(initial.phase,'lady');await f.restart();assert.deepEqual((await f.state()).game,initial);
  const inspect=await f.command(inspector,'inspectAlignment',{targetId:target});await f.restart();
  const revealed=await httpGame(f,inspector);assert.equal(revealed.phase,'lady_reveal');assert.equal(revealed.self!.canConfirmInspection,true);
  assert.equal(revealed.self!.inspections.length,1);assert.deepEqual((await httpGame(f,target)).self!.inspections,[]);
  await f.store.execute(inspector,f.room.id,inspect);assert.equal((await f.state()).game!.lady!.inspections.length,1);
  await assert.rejects(f.command(target,'confirmInspection'),/NOT_INSPECTOR/);
  const ack=await f.command(inspector,'confirmInspection');const assassin=await rolePlayer(f,'assassin');
  await f.restart();const early=(await f.state()).game!;assert.equal(early.phase,'early_window');
  await f.store.execute(inspector,f.room.id,ack);assert.equal((await f.state()).game!.phase,'early_window');
  for(const p of f.people){const v=await httpGame(f,p.user.id);assert.equal(v.self!.canDecideEarly,p.user.id===assassin.user.id);const {self,...pub}=v;assert.deepEqual(pub,early);}
  await f.command(assassin.user.id,'earlyAssassinationDecision',{attempt:false});assert.equal((await f.state()).game!.phase,'proposing');
  // A rejected proposal after two actual missions opens a new decision window.
  const g=(await f.state()).game!;
  await f.command(g.captainId,'proposeTeam',{playerIds:g.players.slice(0,g.missionSizes[g.mission-1]).map(p=>p.id),direction:'clockwise'});
  await f.command(g.captainId,'startTeamVote');for(const p of f.people)await f.command(p.user.id,'teamVote',{approve:false});
  const attempt=await f.command(assassin.user.id,'earlyAssassinationDecision',{attempt:true});await f.restart();
  await f.store.execute(assassin.user.id,f.room.id,attempt);const pending=(await f.state()).game!;
  assert.equal(pending.phase,'assassination');assert.equal(pending.assassinationMode,'early');assert.equal(pending.earlyAssassination!.used,true);assert.equal(pending.earlyAssassination!.windows.length,2);
  const merlin=await rolePlayer(f,'merlin');const hit=await f.command(assassin.user.id,'assassinate',{targetId:merlin.user.id});await f.restart();await f.store.execute(assassin.user.id,f.room.id,hit);
  assert.equal((await f.state()).game!.result!.reason,'early_merlin_found');
  await f.command(f.people[0].user.id,'returnToLobby');for(const p of f.people)await f.command(p.user.id,'setReady',{ready:true});await f.command(f.people[0].user.id,'startGame');
  const next=(await f.state()).game!;assert.notEqual(next.id,initial.id);assert.deepEqual(next.lady!.inspections,[]);assert.deepEqual(next.earlyAssassination!.windows,[]);assert.equal(next.earlyAssassination!.used,false);
  const previous=(await f.pool.query('SELECT state FROM games WHERE id=$1',[initial.id])).rows[0].state;assert.equal(previous.result.reason,'early_merlin_found');assert.equal(previous.lady.inspections.length,1);
});
test('inspection failure rolls back; concurrent targets, stale commands and changed duplicate payload cannot re-inspect',async t=>{
  const f=await fixture(t),before=await f.state(),g=before.game!,id=g.lady!.holderId,targets=g.players.filter(p=>p.id!==id).slice(0,2);
  const make=(targetId:string):Command=>({type:'inspectAlignment',payload:{targetId},commandId:randomUUID(),expectedVersion:before.version});
  const first=make(targets[0].id);
  await f.pool.query(`CREATE FUNCTION reject_inspection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected write error'; END $$; CREATE TRIGGER reject_inspection BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION reject_inspection()`);
  await assert.rejects(f.store.execute(id,f.room.id,first),/SERVICE_UNAVAILABLE/);assert.deepEqual(await f.state(),before);
  assert.equal((await f.pool.query('SELECT 1 FROM command_receipts WHERE command_id=$1',[first.commandId])).rowCount,0);
  await f.pool.query('DROP TRIGGER reject_inspection ON games');
  const commands=[first,make(targets[1].id)],outcomes=await Promise.allSettled(commands.map(c=>f.store.execute(id,f.room.id,c)));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);const win=outcomes.findIndex(r=>r.status==='fulfilled'),lose=1-win;
  assert.match(String((outcomes[lose] as PromiseRejectedResult).reason),/VERSION_CONFLICT/);
  await f.store.execute(id,f.room.id,commands[win]);assert.equal((await f.state()).game!.lady!.inspections.length,1);
  await assert.rejects(f.store.execute(id,f.room.id,{type:'inspectAlignment',commandId:commands[win].commandId,expectedVersion:commands[win].expectedVersion,payload:{targetId:targets[lose].id}}),/COMMAND_ID_REUSED/);
  await assert.rejects(f.command(id,'inspectAlignment',{targetId:targets[lose].id}),/WRONG_PHASE/);
});
test('WebSocket inspection result is private; public early window has no actor ID or role and rejects non-assassin decisions',async t=>{
  const f=await fixture(t),g=(await f.state()).game!,inspector=g.lady!.holderId,target=g.players.find(p=>p.id!==inspector)!.id;
  const clients: {id:string;socket:Awaited<ReturnType<typeof f.app.injectWS>>;messages:ServerMessage[]}[]=[];
  t.after(async()=>{for(const c of clients)c.socket.terminate();});
  async function wait(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('missing extension broadcast');}
  for(const id of [inspector,target]){
    const messages:ServerMessage[]=[];
    const socket=await f.app.injectWS(`/api/rooms/${f.room.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${member(f,id).token}`}},{onInit:ws=>ws.on('message',raw=>messages.push(JSON.parse(raw.toString())))});
    clients.push({id,socket,messages});
  }
  await wait(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot')));
  const cmd:Command={commandId:randomUUID(),expectedVersion:(await f.state()).version,type:'inspectAlignment',payload:{targetId:target}};
  clients[0].socket.send(JSON.stringify(cmd));
  await wait(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.game!.phase==='lady_reveal')));
  for(const c of clients){const v=(c.messages.find(m=>m.type==='snapshot'&&m.room.game!.phase==='lady_reveal') as {room:RoomView}).room.game!;
    assert.deepEqual(v,await httpGame(f,c.id));assert.equal(v.self!.inspections.length,c.id===inspector?1:0);assert.equal('team' in v.lady!.inspections[0],false);assert.equal(v.revealedRoles,undefined);
  }
  clients[0].socket.send(JSON.stringify({type:'confirmInspection',payload:{},commandId:randomUUID(),expectedVersion:(await f.state()).version}));
  await wait(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.game!.phase==='early_window')));
  for(const c of clients){const v=(c.messages.find(m=>m.type==='snapshot'&&m.room.game!.phase==='early_window') as {room:RoomView}).room.game!;const {self,...pub}=v;assert.deepEqual(pub,(await f.state()).game);}
  const nonAssassin=await rolePlayer(f,'merlin');await assert.rejects(f.command(nonAssassin.user.id,'earlyAssassinationDecision',{attempt:true}),/NOT_ASSASSIN/);
  assert.equal((await f.state()).game!.phase,'early_window');
});
