import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defaultSettings, commandSchema, type Settings, type Command } from '@avalon/contracts';
import { createGame, transition, projectGame, captain, teamOf, type GameState } from '../src/index.js';
function action(g:GameState,id:string,type:Command['type'],payload:Command['payload']={}) {return transition(g,id,{type,payload},g.players.map(p=>p.id));}
function game(patch:Partial<Settings>={},n=7) {
  let g=createGame(randomUUID(),Array.from({length:n},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`拓展${i+1}`})),{...defaultSettings,playerCount:n,...patch},a=>a,{randomBelow:()=>0n});
  for(const p of g.players)g=action(g,p.id,'confirmRole');return g;
}
const roleId=(g:GameState,role:string)=>g.players.find(p=>g.roles[p.id]===role)!.id;
function proposal(g:GameState,passed=true) {
  const evil=g.players.filter(p=>teamOf(g.roles[p.id])==='red'),good=g.players.filter(p=>teamOf(g.roles[p.id])==='blue');
  const ids=[...evil,...good].slice(0,projectGame(g).missionSizes[g.mission-1]).map(p=>p.id);
  g=action(g,captain(g),'proposeTeam',{playerIds:ids,direction:'clockwise'});g=action(g,captain(g),'startTeamVote');
  for(const p of g.players)g=action(g,p.id,'teamVote',{approve:passed});return g;
}
function mission(g:GameState,failed=false) {
  g=proposal(g);let failures=failed?projectGame(g).failuresRequired:0;
  for(const id of g.rounds.at(-1)!.team){const fail=teamOf(g.roles[id])==='red'&&failures>0;if(fail)failures--;g=action(g,id,'missionVote',{success:!fail});}
  return g;
}
function skip(g:GameState) {return action(g,roleId(g,'assassin'),'earlyAssassinationDecision',{attempt:false});}
function publicOnly(g:GameState,id:string){const {self,...publicState}=projectGame(g,id);return publicState;}
test('early assassination unlocks after two completed missions without blocking normal proposing flow',()=>{
  let g=game({earlyAssassinationEnabled:true});const assassin=roleId(g,'assassin');
  for(let i=0;i<2;i++){g=proposal(g,false);assert.equal(g.phase,'proposing');}
  assert.throws(()=>action(g,assassin,'earlyAssassinationDecision',{attempt:true}),/WRONG_PHASE/);
  g=mission(g);assert.equal(g.phase,'proposing');
  assert.equal(projectGame(g,assassin).self!.canDecideEarly,false);
  g=mission(g,true);assert.equal(g.phase,'proposing');
  assert.equal(g.earlyAssassination!.used,false);
  for(const p of g.players){assert.deepEqual(publicOnly(g,p.id),publicOnly(g,assassin));assert.equal(projectGame(g,p.id).self!.canDecideEarly,p.id===assassin);}
  assert.equal(JSON.stringify(projectGame(g).earlyAssassination).includes(assassin),false);
  assert.throws(()=>action(g,roleId(g,'merlin'),'earlyAssassinationDecision',{attempt:true}),/NOT_ASSASSIN/);
  // Game continues normally without waiting for assassin
  g=proposal(g,false);assert.equal(g.phase,'proposing');
  assert.equal(g.rounds.filter(r=>r.result).length,2);
  assert.equal(projectGame(g,assassin).self!.canDecideEarly,true);
});
test('early attempt is irrevocable within the game; hit wins red, miss immediately wins blue',()=>{
  for(const hit of [true,false]){
    let g=game({earlyAssassinationEnabled:true});g=mission(g,true);g=mission(g,true);
    const assassin=roleId(g,'assassin');g=action(g,assassin,'earlyAssassinationDecision',{attempt:true});
    assert.equal(g.phase,'assassination');assert.equal(g.assassinationMode,'early');assert.equal(g.earlyAssassination!.used,true);
    assert.throws(()=>skip(g),/WRONG_PHASE/);assert.equal(g.earlyAssassination!.windows.length,1);
    g=action(g,assassin,'assassinate',{targetId:roleId(g,hit?'merlin':'loyal')});
    assert.equal(g.result!.winner,hit?'red':'blue');assert.equal(g.result!.reason,hit?'early_merlin_found':'early_merlin_survived');
    assert.equal(g.rounds.filter(r=>r.result).length,2);assert.throws(()=>action(g,assassin,'assassinate',{targetId:roleId(g,'merlin')}),/GAME_ENDED/);
  }
});
test('three successes, three failures and fifth rejection take priority over extension windows',()=>{
  for(const failed of [true,false]){
    let g=game({earlyAssassinationEnabled:true});g=mission(g,failed);g=mission(g,failed);
    g=mission(g,failed);
    assert.equal(g.phase,failed?'finished':'assassination');
    if(failed)assert.equal(g.result!.reason,'three_failures');else assert.equal(g.assassinationMode,'normal');
  }
  let g=game({earlyAssassinationEnabled:true});g=mission(g);g=mission(g,true);
  for(let i=0;i<5;i++)g=proposal(g,false);
  assert.equal(g.result!.reason,'five_rejections');
});
test('legacy v1 games without extension fields still resume, project and settle normally',()=>{
  let g=game();g.rulesetVersion='standard-no-lancelot-v1';delete (g as any).lady;delete g.earlyAssassination;delete g.assassinationMode;
  for(let i=0;i<3;i++)g=mission(g);assert.equal(g.phase,'assassination');
  assert.equal(projectGame(g).earlyAssassination,undefined);
  g=action(g,roleId(g,'assassin'),'assassinate',{targetId:roleId(g,'merlin')});assert.equal(g.result!.reason,'merlin_found');
});
test('extension schema rejects secret fields, forged actors and ambiguous decisions',()=>{
  for(const [type,payload] of [['earlyAssassinationDecision',{attempt:'yes'}]] as const)
    assert.equal(commandSchema.safeParse({commandId:randomUUID(),expectedVersion:1,type,payload}).success,false);
});

