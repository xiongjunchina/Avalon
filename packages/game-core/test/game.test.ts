import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defaultSettings, commandSchema, type Command, type Settings } from '@avalon/contracts';
import { createGame, transition, projectGame, captain, ROLE_CONFIG, MISSION_SIZES, teamOf, type GameState } from '../src/index.js';
function game(n=5, patch:Partial<Settings>={}) { return createGame(randomUUID(),Array.from({length:n},(_,i)=>({id:randomUUID(),nickname:`玩家${i+1}`,seat:i+1})),{...defaultSettings,playerCount:n,...patch},values=>values); }
function act(g:GameState,id:string,type:Command['type'],payload:Command['payload']={}) {return transition(g,id,{type,payload},g.players.map(p=>p.id));}
function ready(g:GameState) {for(const p of g.players)g=act(g,p.id,'confirmRole');return g;}
function propose(g:GameState, ids=g.players.slice(0,MISSION_SIZES[g.players.length][g.mission-1]).map(p=>p.id)) {g=act(g,captain(g),'proposeTeam',{playerIds:ids,direction:'clockwise'});return act(g,captain(g),'startTeamVote');}
function vote(g:GameState, approves:number) {for(let i=0;i<g.players.length;i++)g=act(g,g.players[i].id,'teamVote',{approve:i<approves});return g;}
function mission(g:GameState, failures=0) {
  const red=g.players.filter(p=>teamOf(g.roles[p.id])==='red').map(p=>p.id), others=g.players.filter(p=>!red.includes(p.id)).map(p=>p.id);
  const team=[...red,...others].slice(0,MISSION_SIZES[g.players.length][g.mission-1]);
  g=vote(propose(g,team),g.players.length);
  for(const id of team)g=act(g,id,'missionVote',{success:!red.slice(0,failures).includes(id)});
  return g;
}
test('all 5–12 configurations, exact mission sizes, role vision matrix and private projections',()=>{
  for(let n=5;n<=12;n++){
    const g=game(n);assert.equal(g.players.length,n);assert.deepEqual(Object.values(g.roles),ROLE_CONFIG[n]);
    assert.deepEqual(projectGame(g).missionSizes,MISSION_SIZES[n]);assert.equal(projectGame(g).self,undefined);
    for(const p of g.players){
      const v=projectGame(g,p.id), role=g.roles[p.id];
      assert.equal(v.self?.role,role);assert.equal(v.revealedRoles,undefined);assert.equal('roles' in v,false);
      const expected=role==='merlin'?g.players.filter(q=>teamOf(g.roles[q.id])==='red'&&g.roles[q.id]!=='mordred').map(q=>q.id)
        :teamOf(role)==='red'&&role!=='oberon'?g.players.filter(q=>q.id!==p.id&&teamOf(g.roles[q.id])==='red'&&g.roles[q.id]!=='oberon').map(q=>q.id):[];
      assert.deepEqual(v.self!.evilIds,expected);
      assert.deepEqual(v.self!.merlinCandidates,role==='percival'?g.players.filter(q=>['merlin','morgana'].includes(g.roles[q.id])).map(q=>q.id):[]);
      if(role==='guinevere'){
        const cands=v.self!.guinevereCandidates??[];
        assert.equal(cands.length,2);
        const mordredId=g.players.find(q=>g.roles[q.id]==='mordred')!.id;
        assert.ok(cands.includes(mordredId));
        const decoyId=cands.find(id=>id!==mordredId)!;
        assert.ok(['percival','loyal'].includes(g.roles[decoyId]));
      }else{
        assert.deepEqual(v.self!.guinevereCandidates,[]);
      }
    }
  }
});
test('silent anti-3-streak loyal protection guarantees vision role to protected players',()=>{
  for(let n=5;n<=12;n++){
    const players=Array.from({length:n},(_,i)=>({id:`u-${i+1}`,nickname:`玩家${i+1}`,seat:i+1}));
    // Under identity shuffle (values=>values), find seats that would normally draw 'loyal'
    const baseline=createGame(randomUUID(),players,{...defaultSettings,playerCount:n},values=>values);
    const loyalIds=players.filter(p=>baseline.roles[p.id]==='loyal').map(p=>p.id);
    assert.ok(loyalIds.length>=1);
    const protectedIds=loyalIds;
    const protectedGame=createGame(randomUUID(),players,{...defaultSettings,playerCount:n},values=>values,protectedIds);
    for(const pid of protectedIds){
      assert.notEqual(protectedGame.roles[pid],'loyal');
      assert.notEqual(protectedGame.roles[pid],'oberon');
    }
    assert.equal(Object.values(protectedGame.roles).sort().join(','), [...ROLE_CONFIG[n]].sort().join(','));
  }
});
test('confirmation, permission, exact unique team size and fixed shuffled captain cycle',()=>{
  let g=game(5,{captainMode:'random_order'});
  g=createGame(g.id,g.players,g.settings,values=>values.reverse());
  assert.deepEqual(g.captainOrder,g.players.map(p=>p.id).reverse());
  // Captain can propose directly without waiting for manual confirmRole from all players
  assert.equal(propose(g).phase,'team_vote');
  g=ready(g);
  assert.throws(()=>act(g,g.players[0].id,'proposeTeam',{playerIds:g.players.slice(0,2).map(p=>p.id),direction:'clockwise'}),/NOT_CAPTAIN/);
  assert.throws(()=>act(g,captain(g),'proposeTeam',{playerIds:[g.players[0].id,g.players[0].id],direction:'clockwise'}),/INVALID_TEAM/);
  const order=[...g.captainOrder];g=vote(propose(g),0);assert.equal(captain(g),order[1]);assert.deepEqual(g.captainOrder,order);
  assert.equal(g.mission,1);assert.equal(g.rejectionCount,1);
});
test('tie rejects; ballots private until completion; anonymous mode never retains named team votes',()=>{
  for(const anonymousTeamVote of [false,true]){
    let g=propose(ready(game(6,{anonymousTeamVote})));
    g=act(g,g.players[0].id,'teamVote',{approve:true});
    assert.equal(projectGame(g,g.players[1].id).progress.teamVotes,1);assert.equal(projectGame(g).rounds[0].vote,undefined);
    assert.throws(()=>act(g,g.players[0].id,'teamVote',{approve:false}),/ALREADY_SUBMITTED/);
    for(let i=1;i<6;i++)g=act(g,g.players[i].id,'teamVote',{approve:i<3});
    assert.equal(g.phase,'proposing');assert.equal(g.rounds[0].vote?.passed,false);
    assert.equal(!!g.rounds[0].vote?.ballots,!anonymousTeamVote);assert.deepEqual(g.teamVotes,{});
  }
});
test('only chosen players can play; blue cannot fail; failed commands do not mutate state',()=>{
  let g=vote(propose(ready(game())),5), before=structuredClone(g);
  assert.throws(()=>act(g,g.players[2].id,'missionVote',{success:true}),/NOT_ON_TEAM/);
  assert.throws(()=>act(g,g.players[0].id,'missionVote',{success:false}),/BLUE_MUST_SUCCEED/);
  assert.deepEqual(g,before);
  g=act(g,g.players[0].id,'missionVote',{success:true});assert.throws(()=>act(g,g.players[0].id,'missionVote',{success:true}),/ALREADY_SUBMITTED/);
  assert.equal(projectGame(g).rounds[0].result,undefined);
  g=act(g,g.players[1].id,'missionVote',{success:true});assert.equal(g.mission,2);assert.deepEqual(g.missionVotes,{});
});
test('7–12 fourth mission and 9/11/12 third mission take two fails, all others take one',()=>{
  for(let n=5;n<=12;n++) for(const failures of [1,2]){
    let g=ready(game(n));g=mission(g,0);g=mission(g,1);
    assert.equal(g.mission,3);
    const g3=mission(structuredClone(g),failures);
    assert.equal(g3.rounds.at(-1)!.result?.passed,(n===9||n===11||n===12)&&failures===1);
    g=mission(g,0);assert.equal(g.mission,4);
    g=mission(g,failures);assert.equal(g.rounds.at(-1)!.result?.passed,n>=7&&failures===1);
  }
});
test('five rejections end game; mission-scoped count resets only after an actual mission',()=>{
  for(const rejectionScope of ['game','mission'] as const){
    let g=ready(game(5,{rejectionScope}));for(let i=0;i<4;i++)g=vote(propose(g),0);
    assert.equal(g.rejectionCount,4);g=mission(g,0);assert.equal(g.rejectionCount,rejectionScope==='game'?4:0);
    for(let i=0;i<(rejectionScope==='game'?1:5);i++)g=vote(propose(g),0);
    assert.equal(g.result?.reason,'five_rejections');assert.equal(g.result?.winner,'red');
  }
});
test('three failed missions win red; three successes enter assassination with exact-role permission',()=>{
  let g=ready(game());for(let i=0;i<3;i++)g=mission(g,1);
  assert.deepEqual(g.result,{winner:'red',reason:'three_failures'});
  for(const hit of [true,false]){
    let g=ready(game());for(let i=0;i<3;i++)g=mission(g,0);
    assert.equal(g.phase,'assassination');assert.equal(projectGame(g).revealedRoles,undefined);
    const assassin=g.players.find(p=>g.roles[p.id]==='assassin')!.id;
    assert.equal(projectGame(g).assassinId,assassin);
    const target=g.players.find(p=>g.roles[p.id]===(hit?'merlin':'loyal'))!.id;
    assert.throws(()=>act(g,target,'assassinate',{targetId:assassin}),/NOT_ASSASSIN/);
    g=act(g,assassin,'assassinate',{targetId:target});assert.equal(g.result?.winner,hit?'red':'blue');
    assert.deepEqual(projectGame(g).revealedRoles,g.roles);assert.deepEqual(g.missionVotes,{});
    assert.throws(()=>act(g,assassin,'requestAbort'),/GAME_ENDED/);
  }
});
test('only the room host can end a game or approve an interruption; progress preserves requests',()=>{
  let g=ready(game()), host=g.players[0].id, requester=g.players[1].id;
  g=act(g,requester,'requestAbort');
  assert.equal(g.abortPoll?.requestedBy,requester);
  assert.throws(()=>act(g,requester,'endGame'),/FORBIDDEN/);
  assert.throws(()=>act(g,requester,'voteAbort',{approve:true}),/FORBIDDEN/);
  g=act(g,host,'voteAbort',{approve:false});assert.equal(g.abortPoll,undefined);
  g=act(g,requester,'requestAbort');g=propose(g);assert.ok(g.abortPoll);
  g=transition(g,host,{type:'voteAbort',payload:{approve:true}},[host]);
  assert.equal(g.phase,'aborted');assert.equal(g.result?.reason,'host_ended');
  let dealing=game();dealing.phase='dealing';
  dealing=act(dealing,dealing.players[0].id,'endGame');assert.equal(dealing.phase,'aborted');
});
test('strict protocol rejects forged fields and wrong ballot types',()=>{
  for(const [type,payload] of [['teamVote',{approve:'yes'}],['missionVote',{success:true,role:'red'}],['startGame',{roles:[]}]] as const)
    assert.equal(commandSchema.safeParse({commandId:randomUUID(),expectedVersion:1,type,payload}).success,false);
});
