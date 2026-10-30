import {test} from 'node:test';import assert from 'node:assert/strict';
import {RolePreferenceDraft} from '../src/screens/role-preferences.js';
import {parityFixture,parityPlayerData} from '../scripts/parity-fixture.js';
import {adminReplayScreen} from '../src/screens/admin/views.js';
import {replayScreen} from '../src/screens/replay.js';
import {settingsScreen,toggleSetting} from '../src/screens/settings.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
import type {RoomView,Replay} from '@avalon/contracts';
test('preference draft preserves edits across snapshots, limits three and filters unavailable roles',()=>{
 const r={...parityFixture().room,phase:'waiting',settings:{...parityFixture().room.settings,rolePreferenceEnabled:true}} as RoomView;const d=new RolePreferenceDraft();d.open(r);d.toggle('merlin',r);d.toggle('percival',r);d.toggle('assassin',r);assert.throws(()=>d.toggle('loyal',r),/3/);d.sync({...r,selfRolePreferences:[]});assert.deepEqual(d.selected,['merlin','percival','assassin']);d.toggle('merlin',r);assert.deepEqual(d.selected,['percival','assassin']);assert.throws(()=>d.toggle('loyal',{...r,phase:'playing'}));
 const m=d.model(r);const l=layoutWebScreen(m,{width:390,height:844,top:0,bottom:0})!;assert.ok(l.nodes.some(n=>n.id==='prefSave'));assert.ok(l.nodes.some(n=>n.image?.startsWith('roles/')));assert.ok(settingsScreen(r.settings).rows.some(r=>r.id==='rolePreferenceEnabled'));assert.equal(toggleSetting(r.settings,'rolePreferenceEnabled').rolePreferenceEnabled,false);
});
test('deal audit appears only in authenticated admin replay even when ordinary replay receives extra data',()=>{
 const r=parityPlayerData().replay as Replay;r.roleAssignmentAudit={algorithmVersion:'test',weightVersion:'test',protectionLevel:0,playerOrder:[],players:{},draws:[]};assert.ok(adminReplayScreen(r).rows.some(r=>r.id==='audit:meta'));assert.ok(!replayScreen(r,'back').rows.some(r=>r.id.startsWith('audit:')));
});
import {SpecialPanel} from '../src/screens/admin/special.js';
import {gameAction,gameScreen,syncGameUi,handleGameOverlay,type GameUiState} from '../src/screens/game.js';
test('special room settings supports exact twelve-player selection',async()=>{const p=new SpecialPanel({authorized:true} as any,()=>{});await p.handle('special:new',async()=>undefined);await p.handle('special:settings',async()=>undefined);await p.handle('count:12',async()=>undefined);assert.equal(p.model().web?.document?.settings?.playerCount,12);p.clear();assert.equal(p.model().rows.some(r=>r.id==='special:save'),false);});
test('heart bell opens once privately, does not reveal on background, and validates recipients',()=>{
 const {room,user}=parityFixture('mission');room.settings={...room.settings,playerCount:8,treasuresEnabled:true};const g=room.game;g.players.push({...g.players[0]!,id:'p7',seat:7},{...g.players[0]!,id:'p8',seat:8});g.self!.treasures={enabled:true,heartBell:{available:true,used:false,targetIds:['p7']},incomingHeartBell:{mission:1,roundNumber:1,advice:'protect',active:true}};const ui:GameUiState={privateRoleVisible:false,ballotVisible:false};syncGameUi(ui,room,false);assert.equal(ui.privateRoleVisible,false);syncGameUi(ui,room,true);assert.equal(ui.overlay,'treasures');assert.equal(ui.privateRoleVisible,true);handleGameOverlay(ui,room,'overlayClose');syncGameUi(ui,room,true);assert.equal(ui.privateRoleVisible,false);handleGameOverlay(ui,room,'treasures');ui.targetId='p8';assert.equal(gameAction(room,user,'treasure:heartProtect',ui),undefined);ui.targetId='p7';assert.equal(gameAction(room,user,'treasure:heartProtect',ui)?.type,'useTreasure');assert.ok(gameScreen(room,user,ui).rows.some(r=>r.id==='treasure:bell-incoming'));
});
