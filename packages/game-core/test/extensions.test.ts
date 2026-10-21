import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defaultSettings, commandSchema, type Settings, type Command } from '@avalon/contracts';
import { createGame, transition, projectGame, captain, teamOf, type GameState } from '../src/index.js';
function action(g:GameState,id:string,type:Command['type'],payload:Command['payload']={}) {return transition(g,id,{type,payload},g.players.map(p=>p.id));}
function game(patch:Partial<Settings>={},n=7) {
  let g=createGame(randomUUID(),Array.from({length:n},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`拓展${i+1}`})),{...defaultSettings,playerCount:n,...patch},a=>a);
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
function inspect(g:GameState,target=g.players.find(p=>!g.lady!.holderIds.includes(p.id))!.id) {return action(g,g.lady!.holderId,'inspectAlignment',{targetId:target});}
function acknowledge(g:GameState) {return action(g,g.lady!.inspections.at(-1)!.inspectorId,'confirmInspection');}
function skip(g:GameState) {return action(g,roleId(g,'assassin'),'earlyAssassinationDecision',{attempt:false});}
function publicOnly(g:GameState,id:string){const {self,...publicState}=projectGame(g,id);return publicState;}
test('initial lady holder is physical predecessor of first captain, not predecessor in shuffled order; 5–6 supported',()=>{
  for(const n of [5,6,7,10]){
    const players=Array.from({length:n},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`${i+1}`}));let shuffles=0;
    const g=createGame(randomUUID(),players,{...defaultSettings,playerCount:n,ladyEnabled:true,captainMode:'random_order'},values=>++shuffles===1?values:[values[2],...values.filter((_,i)=>i!==2)]);
    assert.equal(captain(g),players[2].id);assert.equal(g.lady!.holderId,players[1].id);
    assert.notEqual(g.lady!.holderId,g.captainOrder.at(-1));assert.equal(g.lady!.inspections.length,0);
    assert.equal(g.rulesetVersion,'standard-no-lancelot-v3');
  }
});
test('lady runs after missions 2,3,4 only; historical holders excluded; results remain inspector-private after handoff',()=>{
  let g=game({ladyEnabled:true});const original=g.lady!.holderId;
  g=mission(g);assert.equal(g.phase,'proposing');g=mission(g,true);assert.equal(g.phase,'lady');
  const snapshotsBefore=structuredClone(g);
  assert.throws(()=>action(g,g.players[0].id,'inspectAlignment',{targetId:g.players[1].id}),/NOT_LADY_HOLDER/);
  assert.throws(()=>inspect(g,original),/INVALID_INSPECTION_TARGET/);assert.deepEqual(g,snapshotsBefore);
  const target=roleId(g,'merlin');g=inspect(g,target);assert.equal(g.phase,'lady_reveal');assert.equal(g.lady!.holderId,target);
  for(const p of g.players){
    const v=projectGame(g,p.id);assert.deepEqual(v.lady!.inspections,[{afterMission:2,inspectorId:original,targetId:target}]);
    assert.equal('team' in v.lady!.inspections[0],false);
    assert.deepEqual(v.self!.inspections,p.id===original?[{afterMission:2,inspectorId:original,targetId:target,team:'blue'}]:[]);
    assert.equal(v.self!.canConfirmInspection,p.id===original);
  }
  assert.equal('role' in projectGame(g,original).self!.inspections[0],false);
  assert.throws(()=>action(g,target,'confirmInspection'),/NOT_INSPECTOR/);
  g=acknowledge(g);g=mission(g);assert.equal(g.phase,'lady');
  assert.throws(()=>inspect(g,original),/INVALID_INSPECTION_TARGET/);assert.throws(()=>inspect(g,target),/INVALID_INSPECTION_TARGET/);
  g=acknowledge(inspect(g));g=mission(g,true);assert.equal(g.phase,'lady');
  g=acknowledge(inspect(g));assert.deepEqual(g.lady!.inspections.map(i=>i.afterMission),[2,3,4]);
  assert.equal(g.mission,5);assert.equal(g.lady!.holderIds.length,4);
  g=mission(g);assert.equal(g.phase,'assassination');assert.equal(g.lady!.inspections.length,3);
});
test('lady sees alignment of Mordred and Oberon despite original role-vision exceptions',()=>{
  for(const role of ['mordred','oberon']){
    let g=game({ladyEnabled:true},10);g=mission(g);g=mission(g,true);
    // The initial holder is Oberon; first inspect another player, then target the hidden evil role.
    g=acknowledge(inspect(g,roleId(g,'loyal')));g=mission(g);
    const target=roleId(g,role);
    if(role==='oberon'){
      // A fresh game with shuffled captain changes the initial holder, keeping Oberon eligible.
      const players=g.players;let shuffles=0;
      g=createGame(randomUUID(),players,{...g.settings,captainMode:'random_order'},a=>++shuffles===1?a:[a[2],...a.filter((_,i)=>i!==2)]);
      for(const p of g.players)g=action(g,p.id,'confirmRole');g=mission(g);g=mission(g,true);
    }
    const inspector=g.lady!.holderId;g=inspect(g,target);
    assert.equal(projectGame(g,inspector).self!.inspections.at(-1)!.team,'red');
  }
});
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
  assert.equal(g.rounds.filter(r=>r.result).length,2);assert.equal(g.lady,undefined);
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
test('combined extensions order: lady selection → private result acknowledgement → next proposal (while early assassination stays available)',()=>{
  let g=game({ladyEnabled:true,earlyAssassinationEnabled:true});g=mission(g);g=mission(g,true);
  const assassin=roleId(g,'assassin');
  assert.equal(g.phase,'lady');assert.equal(projectGame(g,assassin).self!.canDecideEarly,true);
  g=inspect(g);assert.equal(g.phase,'lady_reveal');
  g=acknowledge(g);assert.equal(g.phase,'proposing');
  g=proposal(g,false);assert.equal(g.phase,'proposing');assert.equal(g.lady!.inspections.length,1);
  assert.equal(projectGame(g,assassin).self!.canDecideEarly,true);
});
test('three successes, three failures and fifth rejection take priority over extension windows',()=>{
  for(const failed of [true,false]){
    let g=game({ladyEnabled:true,earlyAssassinationEnabled:true});g=mission(g,failed);g=mission(g,failed);
    g=acknowledge(inspect(g));g=mission(g,failed);
    assert.equal(g.phase,failed?'finished':'assassination');assert.equal(g.lady!.inspections.length,1);
    if(failed)assert.equal(g.result!.reason,'three_failures');else assert.equal(g.assassinationMode,'normal');
  }
  let g=game({ladyEnabled:true,earlyAssassinationEnabled:true});g=mission(g);g=mission(g,true);g=acknowledge(inspect(g));
  for(let i=0;i<5;i++)g=proposal(g,false);
  assert.equal(g.result!.reason,'five_rejections');assert.equal(g.lady!.inspections.length,1);
});
test('legacy v1 games without extension fields still resume, project and settle normally',()=>{
  let g=game();g.rulesetVersion='standard-no-lancelot-v1';delete g.lady;delete g.earlyAssassination;delete g.assassinationMode;
  for(let i=0;i<3;i++)g=mission(g);assert.equal(g.phase,'assassination');
  assert.deepEqual(projectGame(g,g.players[0].id).self!.inspections,[]);
  assert.equal(projectGame(g).lady,undefined);assert.equal(projectGame(g).earlyAssassination,undefined);
  g=action(g,roleId(g,'assassin'),'assassinate',{targetId:roleId(g,'merlin')});assert.equal(g.result!.reason,'merlin_found');
});
test('extension schema rejects secret fields, forged actors and ambiguous decisions',()=>{
  for(const [type,payload] of [['inspectAlignment',{targetId:randomUUID(),team:'blue'}],['earlyAssassinationDecision',{attempt:'yes'}],['confirmInspection',{inspectorId:randomUUID()}]] as const)
    assert.equal(commandSchema.safeParse({commandId:randomUUID(),expectedVersion:1,type,payload}).success,false);
});

test('guardianPerksEnabled generates strictly bounded, role-consistent private clues without leaks',()=>{
  for (const n of [5, 6, 7, 8, 9, 10, 11, 12]) {
    const players = Array.from({ length: n }, (_, i) => ({ id: `p-${i + 1}`, seat: i + 1, nickname: `玩家${i + 1}` }));
    const g = createGame('guardian-test', players, { ...defaultSettings, playerCount: n, guardianPerksEnabled: true }, a => a);
    const pub = projectGame(g);
    assert.equal('guardianClues' in pub, false);
    assert.equal(pub.self, undefined);

    for (const p of g.players) {
      const v = projectGame(g, p.id);
      const role = g.roles[p.id];
      if (role !== 'loyal') {
        assert.equal(v.self?.guardianClue, undefined, `${role} must not receive guardianClue`);
      } else {
        const clue = v.self?.guardianClue;
        assert.ok(clue, `loyal player ${p.id} must receive guardianClue`);
        assert.equal(clue.kind, v.self?.loyalGuardian);

        if (clue.kind === 'zhubajie') {
          assert.equal(clue.targetIds.length, 1);
          assert.notEqual(clue.targetIds[0], p.id);
          assert.notEqual(g.roles[clue.targetIds[0]], 'morgana');
        } else if (clue.kind === 'shawujing') {
          const otherLoyals = g.players.filter(q => q.id !== p.id && g.roles[q.id] === 'loyal');
          if (otherLoyals.length > 0) {
            assert.equal(clue.targetIds.length, 1);
            assert.equal(g.roles[clue.targetIds[0]], 'loyal');
            assert.notEqual(clue.targetIds[0], p.id);
          } else {
            assert.deepEqual(clue.targetIds, []);
          }
        } else if (clue.kind === 'bailong') {
          assert.equal(clue.targetIds.length, 2);
          const rolesInTarget = clue.targetIds.map(id => g.roles[id]);
          assert.ok(rolesInTarget.includes('percival'));
          assert.ok(clue.targetIds.some(id => teamOf(g.roles[id]) === 'red'));
        } else if (clue.kind === 'jingang') {
          assert.equal(clue.targetIds.length, 2);
          const hasRed = clue.targetIds.some(id => teamOf(g.roles[id]) === 'red');
          const hasBlueNotMerlin = clue.targetIds.some(id => teamOf(g.roles[id]) === 'blue' && g.roles[id] !== 'merlin' && id !== p.id);
          assert.ok(hasRed);
          assert.ok(hasBlueNotMerlin);
          assert.ok(!clue.targetIds.includes(g.players.find(q => g.roles[q.id] === 'merlin')!.id));
        }
      }
    }
  }
});

