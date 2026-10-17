import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Command, GameView, Replay} from '@avalon/contracts';
import {gameFixture} from './game-helpers';

test('drafts and live ballots survive restart; host approval closes room atomically and frees every guest',async t=>{
  const f=await gameFixture(t,true,{anonymousTeamVote:false});
  const ids=f.people.map(p=>p.user.id), host=ids[0], g=(await f.state()).game!, captain=g.captainId;
  await f.command(captain,'updateTeamDraft',{playerIds:[ids[2]],direction:'clockwise'});
  await f.restart();
  assert.deepEqual((await f.state(ids[3])).game!.draftTeam?.playerIds,[ids[2]]);
  await f.command(captain,'proposeTeam',{playerIds:[ids[2],ids[3]],direction:'clockwise'});
  await f.command(captain,'updateTeamDraft',{playerIds:[ids[3],ids[4]],direction:'counterclockwise'});
  await f.command(captain,'startTeamVote');
  await f.command(ids[2],'teamVote',{approve:'abstain'});
  const began=(await f.state()).game!.teamVote!.startedAt;
  await f.restart();
  assert.equal((await f.state(ids[4])).game!.teamVote!.startedAt,began);
  assert.equal((await f.state(ids[4])).game!.teamVote!.ballots![ids[2]],'abstain');
  for(const id of ids.filter(id=>id!==ids[2]))await f.command(id,'teamVote',{approve:id===host});
  await f.store.connect(ids[1],f.room.id,randomUUID());
  await f.command(ids[1],'requestAbort');
  await assert.rejects(f.command(ids[2],'endGame'),/FORBIDDEN/);
  await assert.rejects(f.command(ids[2],'voteAbort',{approve:true}),/FORBIDDEN/);
  await f.restart(); // The request is durable even with no other users connected.
  const action:Command={type:'voteAbort',payload:{approve:true},commandId:randomUUID(),expectedVersion:(await f.state()).version};
  await f.store.execute(host,f.room.id,action);
  assert.equal((await f.store.execute(host,f.room.id,action)).result.type,'commandResult');
  assert.equal(await f.store.snapshot(f.room.id),null);
  for(const id of ids)assert.equal(await f.store.currentRoom(id),null);
  await f.restart();assert.equal(await f.store.currentRoom(host),null);
  const history=(await f.app.inject({url:`/api/games/${g.id}/replay`,headers:{cookie:`avalon_session=${f.people[0].token}`}})).json<Replay>();
  assert.equal(history.result.reason,'host_ended');assert.equal(history.result.winner,null);
  assert.equal(history.rounds[0].vote!.abstentions,1);
  assert.equal(history.rounds[0].vote!.ballots![ids[2]],'abstain');
  await f.store.createRoom(f.people[0].user); // No stale active-room membership.
});
test('host can close a game directly during countdown without approval',async t=>{
  const f=await gameFixture(t,false), host=f.people[0].user.id;
  await f.command(host,'startGame');const id=(await f.state()).game!.id;
  await f.command(host,'endGame');
  assert.equal(await f.store.currentRoom(host),null);
  const state=(await f.pool.query<{state:GameView}>('SELECT state FROM games WHERE id=$1',[id])).rows[0].state;
  assert.equal(state.result!.reason,'host_ended');
});

test('connected guests receive live previews and roomClosed; closed-room HTTP cannot restore membership',async t=>{
  const {localSocket,origin}=await import('./helpers');
  const f=await gameFixture(t),host=f.people[0],guest=f.people[1],messages:import('@avalon/contracts').ServerMessage[]=[];
  const ws=await f.app.injectWS(`/api/rooms/${f.room.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${guest.token}`}},{onInit:s=>s.on('message',raw=>messages.push(JSON.parse(raw.toString())))});
  t.after(async()=>{ws.terminate();});
  const until=async(check:()=>boolean)=>{for(let n=0;n<150;n++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('missing broadcast');};
  await until(()=>messages.some(m=>m.type==='snapshot'));
  const hostMessages:import('@avalon/contracts').ServerMessage[]=[];
  const hs=await f.app.injectWS(`/api/rooms/${f.room.id}/socket`,{socket:localSocket(),headers:{origin,cookie:`avalon_session=${host.token}`}},{onInit:s=>s.on('message',raw=>hostMessages.push(JSON.parse(raw.toString())))});
  t.after(async()=>{hs.terminate();});
  await until(()=>hostMessages.some(m=>m.type==='snapshot'));
  hs.send(JSON.stringify({type:'updateTeamDraft',payload:{playerIds:[guest.user.id],direction:'clockwise'},commandId:randomUUID(),expectedVersion:(await f.state()).version}));
  await until(()=>messages.some(m=>m.type==='snapshot'&&m.room.game?.draftTeam?.playerIds[0]===guest.user.id));
  hs.send(JSON.stringify({type:'endGame',payload:{},commandId:randomUUID(),expectedVersion:(await f.state()).version}));
  await until(()=>messages.some(m=>m.type==='roomClosed'));
  assert.equal((await f.app.inject({url:`/api/rooms/${f.room.id}`,headers:{cookie:`avalon_session=${guest.token}`}})).statusCode,410);
  const me=(await f.app.inject({url:'/api/me',headers:{cookie:`avalon_session=${guest.token}`}})).json();
  assert.equal(me.roomId,null);
});
