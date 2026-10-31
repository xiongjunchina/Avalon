import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parityFixture,parityPlayerData} from '../scripts/parity-fixture.js';
import {gameScreen,handleGameOverlay,type GameUiState} from '../src/screens/game.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
import {PlayerPanel} from '../src/screens/player-panel.js';
const viewport={width:390,height:844,top:0,bottom:0};
const state=():GameUiState=>({privateRoleVisible:false,ballotVisible:false});
test('per-mission detail filters proposals and its five tabs switch without opening a report',()=>{
 const {room,user}=parityFixture('report');room.game.rounds.push({...room.game.rounds[0]!,number:2,mission:2,result:undefined});
 const ui=state();handleGameOverlay(ui,room,'mission:2');
 let nodes=layoutWebScreen(gameScreen(room,user,ui),viewport).nodes;
 assert.equal(nodes.filter(n=>n.id.startsWith('historyMission:')).length,5);
 assert.ok(nodes.some(n=>n.id==='round:2'));assert.ok(!nodes.some(n=>n.id==='round:1'));
 handleGameOverlay(ui,room,'historyMission:1');nodes=layoutWebScreen(gameScreen(room,user,ui),viewport).nodes;
 assert.equal(ui.overlay,'history');assert.ok(nodes.some(n=>n.id==='round:1'));assert.ok(!nodes.some(n=>n.id==='round:2'));
});
test('public report renders named ballots, anonymous report does not construct them',()=>{
 const {room,user}=parityFixture('report');room.game.rounds[0]!.vote!.ballots={[user.id]:true,[room.game.players[1]!.id]:false};
 const ui={...state(),overlay:'report' as const,reportMission:1};room.settings.anonymousTeamVote=false;
 assert.equal(layoutWebScreen(gameScreen(room,user,ui),viewport).nodes.filter(n=>n.id.startsWith('report-ballot:')).length,room.game.players.length);
 room.settings.anonymousTeamVote=true;
 assert.equal(layoutWebScreen(gameScreen(room,user,ui),viewport).nodes.filter(n=>n.id.startsWith('report-ballot:')).length,0);
});
test('outgoing requests show waiting copy and an empty accepted list',async()=>{
 const {user}=parityFixture(),friend={...parityPlayerData().friends[1]!,isSender:true};
 const p=new PlayerPanel({friends:async()=>({friends:[friend]})} as any,user);await p.open('friends');await p.handle('friendTab:friends',async()=>undefined);
 const nodes=layoutWebScreen(p.model(),viewport).nodes;
 assert.ok(nodes.some(n=>n.text.includes('等待对方回应')));
 assert.ok(nodes.some(n=>n.id==='friends-accepted-empty'));
 assert.ok(!nodes.some(n=>n.text==='申请与你结为仙友'));
});
