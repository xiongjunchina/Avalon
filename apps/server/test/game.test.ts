import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Command, RoomView, ServerMessage } from '@avalon/contracts';
import type { WebSocket } from 'ws';
import { headers, origin, localSocket } from './helpers.js';
import { ROOM_TTL_MS } from '../src/store.js';
import { gameFixture, confirm, propose, mission } from './game-helpers.js';
test('start gating, locked seats/settings, private HTTP projection and restart mid-vote preserve original deal',async t=>{
  const f=await gameFixture(t,false),host=f.people[0];
  await assert.rejects(f.command(f.people[1].user.id,'startGame'),/FORBIDDEN/);
  await f.command(host.user.id,'setReady',{ready:false});await assert.rejects(f.command(host.user.id,'startGame'),/NOT_READY/);
  await f.command(host.user.id,'setReady',{ready:true});const start=await f.command(host.user.id,'startGame');
  const first=await f.state();await f.store.execute(host.user.id,f.room.id,start);
  assert.equal((await f.state()).game!.id,first.game!.id);
  await f.finishDeal();
  const roles:Record<string,string>={};
  for(const p of f.people){
    const res=await f.app.inject({url:`/api/rooms/${f.room.id}`,headers:{cookie:`avalon_session=${p.token}`}});
    assert.equal(res.statusCode,200);const g=res.json().room.game;
    roles[p.user.id]=g.self.role;assert.equal(g.roles,undefined);assert.equal(g.revealedRoles,undefined);assert.equal(g.missionVotes,undefined);
  }
  assert.equal(new Set(Object.values(roles)).size,5);assert.equal(first.game!.self,undefined);
  const outsider=await f.store.createGuest('未入局');await assert.rejects(f.store.join(outsider.user,f.room.code),/GAME_IN_PROGRESS/);
  for(const type of ['leaveRoom','setAdmission','updateSettings'] as const){
    const payload:Command['payload']=type==='setAdmission'?{acceptingNewMembers:false}:type==='updateSettings'?first.settings:{};
    await assert.rejects(f.command(host.user.id,type,payload),/GAME_IN_PROGRESS/);
  }
  await confirm(f);await propose(f);const ballot=await f.command(host.user.id,'teamVote',{approve:true});
  await f.restart();
  const restored=await f.state(host.user.id);assert.equal(restored.game!.id,first.game!.id);assert.equal(restored.game!.self!.role,roles[host.user.id]);
  assert.equal(restored.game!.self!.teamVoted,true);assert.equal(restored.game!.progress.teamVotes,1);
  await f.store.execute(host.user.id,f.room.id,ballot);assert.equal((await f.state()).game!.progress.teamVotes,1);
  for(const p of f.people.slice(1))await f.command(p.user.id,'teamVote',{approve:true});
  assert.equal((await f.state()).game!.phase,'mission');
});
test('concurrent last cards settle once; completed game persists; same room next game retains history and clears secrets',async t=>{
  const f=await gameFixture(t);await confirm(f);const team=await propose(f);
  for(const p of f.people)await f.command(p.user.id,'teamVote',{approve:true});
  const version=(await f.state()).version;
  const cards=team.map(id=>({id,action:{type:'missionVote',payload:{success:true},commandId:randomUUID(),expectedVersion:version} as Command}));
  const outcomes=await Promise.allSettled(cards.map(c=>f.store.execute(c.id,f.room.id,c.action)));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const loser=outcomes.findIndex(r=>r.status==='rejected');assert.match(String((outcomes[loser] as PromiseRejectedResult).reason),/VERSION_CONFLICT/);
  await f.restart();assert.equal((await f.state()).game!.progress.missionVotes,1);
  await f.command(cards[loser].id,'missionVote',{success:true});
  const accepted=cards[outcomes.findIndex(r=>r.status==='fulfilled')];await f.store.execute(accepted.id,f.room.id,accepted.action);
  assert.equal((await f.state()).game!.rounds.filter(r=>r.result).length,1);
  await mission(f);await mission(f);assert.equal((await f.state()).game!.phase,'assassination');
  const views=await Promise.all(f.people.map(p=>f.state(p.user.id))),assassin=f.people[views.findIndex(v=>v.game!.self!.role==='assassin')],merlin=f.people[views.findIndex(v=>v.game!.self!.role==='merlin')];
  const end=await f.command(assassin.user.id,'assassinate',{targetId:merlin.user.id});
  const ended=await f.state();assert.equal(ended.phase,'finished');assert.equal(ended.game!.result!.winner,'red');
  await f.restart();await f.store.execute(assassin.user.id,f.room.id,end);assert.deepEqual((await f.state()).game!.result,ended.game!.result);
  const saved=(await f.pool.query('SELECT state,ended_at FROM games WHERE id=$1',[ended.game!.id])).rows[0];
  assert.ok(saved.ended_at);assert.deepEqual(saved.state.missionVotes,{});assert.deepEqual(saved.state.teamVotes,{});
  const receipts=await f.pool.query('SELECT command_body,command_fingerprint FROM command_receipts WHERE room_id=$1',[f.room.id]);
  assert.ok(receipts.rows.every(r=>r.command_body===null&&r.command_fingerprint));
  await f.command(f.people[0].user.id,'returnToLobby');assert.equal((await f.state()).game,undefined);assert.ok((await f.state()).members.every(p=>!p.ready));
  for(const p of f.people)await f.command(p.user.id,'setReady',{ready:true});await f.command(f.people[0].user.id,'startGame');
  assert.notEqual((await f.state()).game!.id,ended.game!.id);assert.equal((await f.state()).game!.rounds.length,0);
  assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM games WHERE room_id=$1',[f.room.id])).rows[0].n,2);
});
test('game transaction failure rolls back state, version and receipt; retry succeeds once',async t=>{
  const f=await gameFixture(t);await confirm(f);const team=await propose(f);
  for(const p of f.people)await f.command(p.user.id,'teamVote',{approve:true});await f.command(team[0],'missionVote',{success:true});
  const before=await f.state(), action={type:'missionVote',payload:{success:true},commandId:randomUUID(),expectedVersion:before.version} as Command;
  await f.pool.query(`CREATE FUNCTION fail_game_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER fail_game_write BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION fail_game_write()`);
  await assert.rejects(f.store.execute(team[1],f.room.id,action),/SERVICE_UNAVAILABLE/);
  assert.deepEqual(await f.state(),before);assert.equal((await f.pool.query('SELECT 1 FROM command_receipts WHERE command_id=$1',[action.commandId])).rowCount,0);
  await f.pool.query('DROP TRIGGER fail_game_write ON games');await f.store.execute(team[1],f.room.id,action);
  assert.equal((await f.state()).game!.mission,2);
});
test('online unanimity abort cancels on presence changes; 24h expiry persists interrupted game without winner',async t=>{
  const f=await gameFixture(t),host=f.people[0].user.id;
  await f.command(host,'requestAbort');assert.equal((await f.state()).game!.abortPoll?.required,5);
  const connection=(await f.pool.query('SELECT connection_id FROM room_members WHERE user_id=$1',[f.people[1].user.id])).rows[0].connection_id;
  await f.store.disconnect(f.people[1].user.id,f.room.id,connection);assert.equal((await f.state()).game!.abortPoll,undefined);
  await f.command(host,'requestAbort');for(const p of f.people.slice(2))await f.command(p.user.id,'voteAbort',{approve:true});
  assert.equal((await f.state()).game!.result!.winner,null);assert.equal((await f.state()).phase,'finished');
  await f.command(host,'returnToLobby');for(const p of f.people)await f.command(p.user.id,'setReady',{ready:true});await f.command(host,'startGame');
  const id=(await f.state()).game!.id;await f.restart();f.advance(ROOM_TTL_MS+1);await f.store.maintain();
  assert.equal(await f.store.snapshot(f.room.id),null);
  const game=(await f.pool.query('SELECT state FROM games WHERE id=$1',[id])).rows[0].state;
  assert.equal(game.phase,'aborted');assert.deepEqual(game.result,{winner:null,reason:'offline_timeout'});
});
test('WebSocket broadcasts and HTTP reconnect expose only the authenticated player role and permitted vision',async t=>{
  const f=await gameFixture(t,false),clients:{socket:WebSocket;messages:ServerMessage[]}[]=[];
  t.after(async()=>{for(const c of clients)c.socket.terminate();});
  for(const p of f.people){
    const messages:ServerMessage[]=[];
    const socket=await f.app.injectWS(`/api/rooms/${f.room.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${p.token}`}},{onInit:ws=>ws.on('message',raw=>messages.push(JSON.parse(raw.toString())))});
    clients.push({socket,messages});
  }
  async function waitUntil(check:()=>boolean){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('missing game snapshot');}
  await waitUntil(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.members.every(p=>p.online))));
  const room=await f.state(),cmd={type:'startGame',payload:{},commandId:randomUUID(),expectedVersion:room.version};clients[0].socket.send(JSON.stringify(cmd));
  await waitUntil(()=>clients.every(c=>c.messages.some(m=>m.type==='snapshot'&&m.room.game)));
  for(let i=0;i<clients.length;i++){
    const message=clients[i].messages.find(m=>m.type==='snapshot'&&m.room.game) as {type:'snapshot';room:RoomView};
    assert.deepEqual(message.room.game,(await f.state(f.people[i].user.id)).game);
    assert.equal('roles' in message.room.game!,false);assert.equal(message.room.game!.revealedRoles,undefined);
    const res=await f.app.inject({method:'POST',url:'/api/rooms/join',headers:{...headers,cookie:`avalon_session=${f.people[i].token}`},payload:{key:f.room.code}});
    assert.deepEqual(res.json().room.game,message.room.game);
  }
  // A non-captain cannot forge another user, phase or exact role in a command.
  const before=(await f.state()).version;
  clients[1].socket.send(JSON.stringify({type:'confirmRole',commandId:randomUUID(),expectedVersion:before,payload:{userId:f.people[0].user.id,role:'merlin'}}));
  await waitUntil(()=>clients[1].messages.some(m=>m.type==='commandResult'&&!m.ok&&m.error==='INVALID_INPUT'));
  assert.equal((await f.state()).version,before);
});
