import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Command, GameView, RoomView, ServerMessage } from '@avalon/contracts';
import { gameFixture, confirm, mission } from './game-helpers.js';
import { origin, localSocket } from './helpers.js';
async function fixture(t:Parameters<typeof gameFixture>[0]) {
  const f=await gameFixture(t,true,{earlyAssassinationEnabled:true,playerCount:7});
  await confirm(f);await mission(f);await mission(f);return f;
}
const member=(f:Awaited<ReturnType<typeof fixture>>,id:string)=>f.people.find(p=>p.user.id===id)!;
async function rolePlayer(f:Awaited<ReturnType<typeof fixture>>,role:string){for(const p of f.people)if((await f.state(p.user.id)).game!.self!.role===role)return p;throw Error('role absent');}
async function httpGame(f:Awaited<ReturnType<typeof fixture>>,id:string):Promise<GameView>{const r=await f.app.inject({url:`/api/rooms/${f.room.id}`,headers:{cookie:`avalon_session=${member(f,id).token}`}});assert.equal(r.statusCode,200);return r.json().room.game;}
test('early decision and committed assassination survive separate server restarts',async t=>{
  const f=await fixture(t),initial=(await f.state()).game!;
  assert.equal(initial.phase,'proposing');await f.restart();assert.deepEqual((await f.state()).game,initial);
  const assassin=await rolePlayer(f,'assassin');
  for(const p of f.people){const v=await httpGame(f,p.user.id);assert.equal(v.self!.canDecideEarly,p.user.id===assassin.user.id);const {self,...pub}=v;assert.deepEqual(pub,initial);}
  await f.command(assassin.user.id,'earlyAssassinationDecision',{attempt:false});assert.equal((await f.state()).game!.phase,'proposing');
  // A rejected proposal after two actual missions keeps early assassination available.
  const g=(await f.state()).game!;
  await f.command(g.captainId,'proposeTeam',{playerIds:g.players.slice(0,g.missionSizes[g.mission-1]).map(p=>p.id),direction:'clockwise'});
  await f.command(g.captainId,'startTeamVote');for(const p of f.people)await f.command(p.user.id,'teamVote',{approve:false});
  const attempt=await f.command(assassin.user.id,'earlyAssassinationDecision',{attempt:true});await f.restart();
  await f.store.execute(assassin.user.id,f.room.id,attempt);const pending=(await f.state()).game!;
  assert.equal(pending.phase,'assassination');assert.equal(pending.assassinationMode,'early');assert.equal(pending.earlyAssassination!.used,true);assert.equal(pending.earlyAssassination!.windows.length,2);
  const merlin=await rolePlayer(f,'merlin');const hit=await f.command(assassin.user.id,'assassinate',{targetId:merlin.user.id});await f.restart();await f.store.execute(assassin.user.id,f.room.id,hit);
  assert.equal((await f.state()).game!.result!.reason,'early_merlin_found');
  await f.command(f.people[0].user.id,'returnToLobby');for(const p of f.people)await f.command(p.user.id,'setReady',{ready:true});await f.command(f.people[0].user.id,'startGame');
  const next=(await f.state()).game!;assert.notEqual(next.id,initial.id);assert.deepEqual(next.earlyAssassination!.windows,[]);assert.equal(next.earlyAssassination!.used,false);
  const previous=(await f.pool.query('SELECT state FROM games WHERE id=$1',[initial.id])).rows[0].state;assert.equal(previous.result.reason,'early_merlin_found');
});
test('early decision failure rolls back; concurrent decisions, stale commands and duplicate payloads reject',async t=>{
  const f=await fixture(t),before=await f.state(),g=before.game!;
  const assassin=await rolePlayer(f,'assassin');
  const make=(attempt:boolean):Command=>({type:'earlyAssassinationDecision',payload:{attempt},commandId:randomUUID(),expectedVersion:before.version});
  const first=make(true);
  await f.pool.query(`CREATE FUNCTION reject_early() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected write error'; END $$; CREATE TRIGGER reject_early BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION reject_early()`);
  await assert.rejects(f.store.execute(assassin.user.id,f.room.id,first),/SERVICE_UNAVAILABLE/);assert.deepEqual(await f.state(),before);
  assert.equal((await f.pool.query('SELECT 1 FROM command_receipts WHERE command_id=$1',[first.commandId])).rowCount,0);
  await f.pool.query('DROP TRIGGER reject_early ON games');
  const commands=[first,make(false)],outcomes=await Promise.allSettled(commands.map(c=>f.store.execute(assassin.user.id,f.room.id,c)));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);const win=outcomes.findIndex(r=>r.status==='fulfilled'),lose=1-win;
  assert.match(String((outcomes[lose] as PromiseRejectedResult).reason),/VERSION_CONFLICT/);
  await assert.rejects(f.store.execute(assassin.user.id,f.room.id,{type:'earlyAssassinationDecision',commandId:commands[win].commandId,expectedVersion:commands[win].expectedVersion,payload:{attempt:false}}),/COMMAND_ID_REUSED/);
});
test('WebSocket public early window has no actor ID or role and rejects non-assassin decisions',async t=>{
  const f=await fixture(t),g=(await f.state()).game!;
  const assassin=await rolePlayer(f,'assassin'),merlin=await rolePlayer(f,'merlin');
  const clients: {id:string;socket:Awaited<ReturnType<typeof f.app.injectWS>>;messages:ServerMessage[]}[]=[];
  t.after(async()=>{for(const c of clients)c.socket.terminate();});
  async function wait(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('missing extension broadcast');}
  for(const p of [assassin,merlin]){
    const messages:ServerMessage[]=[];
    const socket=await f.app.injectWS(`/api/rooms/${f.room.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${p.token}`}},{onInit:ws=>ws.on('message',raw=>messages.push(JSON.parse(raw.toString())))});
    clients.push({id:p.user.id,socket,messages});
  }
  await wait(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot')));
  for(const c of clients){
    const v=(c.messages.find(m=>m.type==='snapshot') as {room:RoomView}).room.game!;
    assert.equal(v.self!.canDecideEarly,c.id===assassin.user.id);
  }
  await assert.rejects(f.command(merlin.user.id,'earlyAssassinationDecision',{attempt:true}),/NOT_ASSASSIN/);
  assert.equal((await f.state()).game!.phase,'proposing');
});
