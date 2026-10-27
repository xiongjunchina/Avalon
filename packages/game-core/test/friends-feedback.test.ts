import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {defaultSettings, defaultAnonymousTeamVote, commandSchema, type Command, type TeamBallot} from '@avalon/contracts';
import {createGame, transition, projectGame, type GameState} from '../src/index';
const fresh = (anonymous=false) => createGame(randomUUID(),Array.from({length:5},(_,i)=>({id:randomUUID(),nickname:`Player${i}`,seat:i+1})),{...defaultSettings,playerCount:5,anonymousTeamVote:anonymous},a=>a,{randomBelow:()=>0n});
const act=(g:GameState,id:string,type:Command['type'],payload:Command['payload']={})=>transition(g,id,{type,payload},g.players.map(p=>p.id));
function voting(anonymous=false) { let g=fresh(anonymous);g=act(g,g.players[0].id,'proposeTeam',{playerIds:g.players.slice(0,2).map(p=>p.id),direction:'clockwise'});return act(g,g.players[0].id,'startTeamVote'); }
test('drafts broadcast immediately and can be edited in discussion, then lock at voting',()=>{
  let g=fresh(),host=g.players[0].id,ids=g.players.map(p=>p.id);
  g=act(g,host,'updateTeamDraft',{playerIds:[ids[2]],direction:'clockwise'});
  assert.deepEqual(projectGame(g,ids[3]).draftTeam?.playerIds,[ids[2]]);
  assert.equal(g.rounds.length,0);
  assert.throws(()=>act(g,ids[1],'updateTeamDraft',{playerIds:[],direction:'clockwise'}),/NOT_CAPTAIN/);
  assert.throws(()=>act(g,host,'updateTeamDraft',{playerIds:[ids[2],ids[2]],direction:'clockwise'}),/INVALID_TEAM/);
  g=act(g,host,'proposeTeam',{playerIds:[ids[2],ids[3]],direction:'clockwise'});
  g=act(g,host,'updateTeamDraft',{playerIds:[ids[3]],direction:'counterclockwise'});
  assert.throws(()=>act(g,host,'startTeamVote'),/INVALID_TEAM/);
  g=act(g,host,'updateTeamDraft',{playerIds:[ids[3],ids[4]],direction:'counterclockwise'});
  assert.deepEqual(projectGame(g,ids[2]).rounds[0].team,[ids[3],ids[4]]);
  assert.equal(g.rounds.length,1);
  g=act(g,host,'startTeamVote');assert.ok(g.teamVoteStartedAt);
  assert.throws(()=>act(g,host,'updateTeamDraft',{playerIds:[],direction:'clockwise'}),/WRONG_PHASE/);
});
test('abstentions are submitted votes; effective majority wins, ties and all abstentions reject',()=>{
  for(const ballots of [[true,true,false,'abstain','abstain'],[true,false,'abstain','abstain','abstain'],Array(5).fill('abstain')] as TeamBallot[][]) {
    let g=voting();for(let i=0;i<5;i++)g=act(g,g.players[i].id,'teamVote',{approve:ballots[i]});
    const vote=g.rounds[0].vote!;
    assert.equal(vote.approvals,ballots.filter(v=>v===true).length);
    assert.equal(vote.rejections,ballots.filter(v=>v===false).length);
    assert.equal(vote.abstentions,ballots.filter(v=>v==='abstain').length);
    assert.equal(vote.passed,vote.approvals>vote.rejections);
  }
  assert.ok(commandSchema.safeParse({commandId:randomUUID(),expectedVersion:1,type:'teamVote',payload:{approve:'abstain'}}).success);
});
test('live ballots publish only in named mode; anonymous publishes completion only',()=>{
  for(const anonymous of [true,false]) {
    let g=voting(anonymous), id=g.players[0].id;
    g=act(g,id,'teamVote',{approve:'abstain'});
    const view=projectGame(g,g.players[1].id);
    assert.deepEqual(view.teamVote?.votedIds,[id]);
    assert.equal(view.teamVote?.ballots?.[id],anonymous?undefined:'abstain');
    assert.equal(view.rounds[0].vote,undefined);
    assert.throws(()=>act(g,id,'teamVote',{approve:true}),/ALREADY_SUBMITTED/);
    assert.equal(Object.keys(g.missionVotes).length,0);
  }
});
test('default anonymous threshold is 8 and an elected host can decide pending aborts',()=>{
  assert.deepEqual([5,6,7,8,9,10,11,12].map(defaultAnonymousTeamVote),[true,true,true,false,false,false,false,false]);
  let g=fresh();g=act(g,g.players[1].id,'requestAbort');
  const newHost=g.players[2].id;
  g=transition(g,newHost,{type:'voteAbort',payload:{approve:true}},[newHost],{hostId:newHost,now:Date.now()});
  assert.equal(g.result?.reason,'host_ended');
});
