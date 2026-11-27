import {test} from 'node:test';import assert from 'node:assert/strict';
import {parityFixture,parityPlayerData} from '../scripts/parity-fixture.js';
import {adminReplayScreen} from '../src/screens/admin/views.js';
import {replayScreen} from '../src/screens/replay.js';
import {settingsScreen} from '../src/screens/settings.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
import type {RoomView,Replay} from '@avalon/contracts';
test('settings screen excludes role preference toggle',()=>{
 const r={...parityFixture().room,phase:'waiting'} as RoomView;
 assert.equal(settingsScreen(r.settings).rows.some(r=>r.id==='rolePreferenceEnabled'), false);
});
test('deal audit appears only in authenticated admin replay even when ordinary replay receives extra data',()=>{
 const r=parityPlayerData().replay as Replay;r.roleAssignmentAudit={algorithmVersion:'test',weightVersion:'test',protectionLevel:0,playerOrder:[],players:{},draws:[]};assert.ok(adminReplayScreen(r).rows.some(r=>r.id==='audit:meta'));assert.ok(!replayScreen(r,'back').rows.some(r=>r.id.startsWith('audit:')));
});
import {SpecialPanel} from '../src/screens/admin/special.js';
import {gameAction,gameScreen,syncGameUi,handleGameOverlay,type GameUiState} from '../src/screens/game.js';
test('special room settings supports exact twelve-player selection',async()=>{const p=new SpecialPanel({authorized:true} as any,()=>{});await p.handle('special:new',async()=>undefined);await p.handle('special:settings',async()=>undefined);await p.handle('count:12',async()=>undefined);assert.equal(p.model().web?.document?.settings?.playerCount,12);p.clear();assert.equal(p.model().rows.some(r=>r.id==='special:save'),false);});
test('heart bell opens once privately, does not reveal on background, and validates recipients',()=>{
 const {room,user}=parityFixture('mission');room.settings={...room.settings,playerCount:8,treasuresEnabled:true};const g=room.game;g.players.push({...g.players[0]!,id:'p7',seat:7},{...g.players[0]!,id:'p8',seat:8});g.self!.treasures={enabled:true,heartBell:{available:true,used:false,targetIds:['p7']},incomingHeartBell:{mission:1,roundNumber:1,advice:'protect',active:true}};const ui:GameUiState={privateRoleVisible:false,ballotVisible:false};syncGameUi(ui,room,false);assert.equal(ui.privateRoleVisible,false);syncGameUi(ui,room,true);assert.equal(ui.overlay,'private-notice');assert.equal(ui.noticeKind,'bell');assert.equal(ui.privateRoleVisible,true);handleGameOverlay(ui,room,'overlayClose');syncGameUi(ui,room,true);assert.equal(ui.privateRoleVisible,false);handleGameOverlay(ui,room,'treasures');ui.targetId='p8';assert.equal(gameAction(room,user,'treasure:heartProtect',ui),undefined);ui.targetId='p7';assert.equal(gameAction(room,user,'treasure:heartProtect',ui)?.type,'useTreasure');assert.ok(gameScreen(room,user,ui).rows.some(r=>r.id==='treasure:bell-incoming'));
});
