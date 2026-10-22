import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parityFixture, parityPlayerData } from '../scripts/parity-fixture.js';
import { gameScreen, handleGameOverlay, syncGameUi, gameAction, type GameUiState } from '../src/screens/game.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';
import { PlayerPanel } from '../src/screens/player-panel.js';
import { PlayerExtras } from '../src/screens/player-extras.js';

const state=():GameUiState=>({privateRoleVisible:false,ballotVisible:false});
test('private identity is a masked horizontal card, and closing it removes private metadata',()=>{
 const {room,user}=parityFixture();const ui=state();handleGameOverlay(ui,room,'role');
 const model=gameScreen(room,user,ui);assert.equal(model.web?.document?.kind,'identity');
 const layout=layoutWebScreen(model,{width:390,height:844,top:0,bottom:0});
 assert.ok(layout.nodes.some(n=>n.skin==='identity-card'&&n.height<145));
 assert.ok(layout.nodes.some(n=>n.id==='identity-knowledge'));
 assert.ok(layout.nodes.some(n=>n.id==='identityArt'));
 handleGameOverlay(ui,room,'overlayClose');assert.equal(gameScreen(room,user,ui).web?.document,undefined);
});
test('vote choices retain selection while expanding past missions and submit only explicitly',()=>{
 const {room,user}=parityFixture('vote');const ui=state();syncGameUi(ui,room,true,user.id);
 assert.equal(gameScreen(room,user,ui).web?.document?.kind,'vote');
 handleGameOverlay(ui,room,'vote-choice:approve');assert.equal(gameAction(room,user,'submitVote',ui)?.type,'teamVote');
 handleGameOverlay(ui,room,'voteHistory');assert.equal(ui.voteChoice,true);assert.equal(gameScreen(room,user,ui).web?.document?.historyExpanded,true);
});
test('mission decisions remain inside the web action dock and blue failure clears an earlier success',()=>{
 const {room,user}=parityFixture('mission');const ui=state();syncGameUi(ui,room,true,user.id);
 assert.equal(ui.overlay,undefined);const model=gameScreen(room,user,ui);
 assert.ok(model.rows.some(r=>r.id==='mission-choice:success'));
 handleGameOverlay(ui,room,'mission-choice:success');handleGameOverlay(ui,room,'mission-choice:fail');
 assert.equal(ui.missionChoice,undefined);assert.ok(ui.warning);assert.equal(gameAction(room,user,'submitMission',ui),undefined);
});
test('settlement follows web inline result and preserves room/replay actions',()=>{
 const {room,user}=parityFixture('result');const ui=state();syncGameUi(ui,room,true,user.id);
 assert.equal(ui.overlay,undefined);
 const nodes=layoutWebScreen(gameScreen(room,user,ui),{width:390,height:844,top:0,bottom:0}).nodes;
 assert.ok(nodes.some(n=>n.id==='result-hero'));assert.ok(nodes.some(n=>n.id==='openReplay'));
});
test('personal preset editor works without an online room and favorites keep the correct tab',async()=>{
 const requests:any[]=[];const data=parityPlayerData();
 const api={request:async(path:string,body:any)=>{requests.push({path,body});return path==='/me/presets'?{presets:data.presets,preset:data.presets[0]}:{games:[],nextCursor:null};}} as any;
 const p=new PlayerPanel(new PlayerExtras(api),parityFixture().user);
 await p.open('presets');await p.handle('preset:name',async()=> '我的七人局');await p.handle('preset:count:7',async()=>undefined);await p.handle('preset:save',async()=>undefined);
 assert.ok(requests.some(r=>r.path==='/me/presets'&&r.body?.name==='我的七人局'&&r.body.settings.playerCount===7));
 await p.handle('page:favorites',async()=>undefined);assert.equal(p.model().web?.document?.activeTab,'favorites');
});

import { guideScreen } from '../src/screens/guide.js';
test('guide keeps a reachable fixed return control after scrolling either tab',()=>{
 for(const width of [320,390,430])for(const tab of ['rules','roles'] as const){const v={width,height:568,top:24,bottom:34},m=guideScreen(undefined,tab);m.scroll=layoutWebScreen(m,v).maxScroll;const back=layoutWebScreen(m,v).nodes.find(n=>n.id==='back');assert.ok(back);assert.ok(back.y>=v.top&&back.y+back.height<=v.height-v.bottom);assert.equal(back.fixed,true);}
});
test('room preset save shows the current room snapshot rather than ineffective editable controls',async()=>{
 const data=parityPlayerData(),p=new PlayerPanel({presets:async()=>({presets:data.presets})} as any,parityFixture().user);await p.open('presets',{roomId:'r',settings:parityFixture().room.settings,canApplyPreset:true});const nodes=layoutWebScreen(p.model(),{width:390,height:844,top:0,bottom:0}).nodes;
 assert.ok(nodes.some(n=>n.id==='preset-room-summary'));assert.equal(nodes.some(n=>n.id==='preset:count:12'),false);
});
test('profile edits and chat quick phrases do not write until explicit save/send; failed send retains draft',async()=>{
 const data=parityPlayerData(),writes:any[]=[];let fail=true;
 const p=new PlayerPanel({statistics:async()=>data.stats,updateProfile:async(profile:any)=>{writes.push(profile);return{user:{...parityFixture().user,...profile}};},roomChat:async()=>{if(fail)throw new Error('offline');writes.push('sent');}} as any,parityFixture().user);
 await p.open('account');await p.handle('profileToggle',async()=>undefined);await p.handle('profile:nickname',async()=> '新行者');assert.equal(writes.length,0);await p.handle('profile:save',async()=>undefined);assert.equal(p.user.nickname,'新行者');
 await p.open('roomchat',{roomId:'r'});await p.handle('quick:0',async()=>undefined);assert.ok(p.model().web?.document?.chatDraft);assert.equal(writes.length,1);await assert.rejects(p.handle('chat:sendroom',async()=>undefined),/offline/);assert.ok(p.model().web?.document?.chatDraft);fail=false;assert.equal(await p.handle('chat:sendroom',async()=>undefined),'back');assert.equal(p.model().web?.document?.chatDraft,'');
});
test('private modal return and vote submit stay reachable on small safe-area screens',()=>{
 for(const scene of ['identity','vote'] as const)for(const width of [320,390,430]){const {room,user}=parityFixture(scene),ui=state();if(scene==='identity')handleGameOverlay(ui,room,'role');else{syncGameUi(ui,room,true,user.id);handleGameOverlay(ui,room,'vote-choice:approve');}const m=gameScreen(room,user,ui),v={width,height:568,top:24,bottom:34};const first=layoutWebScreen(m,v);m.scroll=first.maxScroll;const last=layoutWebScreen(m,v);assert.ok(last.nodes.some(n=>n.id==='overlayClose'&&n.kind==='button'&&n.y>=v.top&&n.y+n.height<=v.height-v.bottom));assert.ok(first.nodes.some(n=>n.id==='noop'&&n.kind==='hitbox'));if(scene==='vote')assert.ok(last.nodes.some(n=>n.id==='submitVote'&&n.y+n.height>last.contentTop&&n.y<last.contentBottom));}
});

test('past mission report uses that mission failure threshold, not the current mission',()=>{
 const {room,user}=parityFixture('report');room.game.players.push({...room.game.players[5]!,id:'extra',seat:7});room.game.mission=5;room.game.failuresRequired=1;room.game.rounds[0]!.mission=4;
 const nodes=layoutWebScreen(gameScreen(room,user,{...state(),overlay:'report',reportMission:4}),{width:390,height:844,top:0,bottom:0}).nodes;
 assert.match(nodes.find(n=>n.id==='report-rule')!.text,/需 2 张/);
});
test('battle history suppresses named ballots when anonymous mode is enabled',()=>{
 const {room,user}=parityFixture('report');room.game.rounds[0]!.vote!.ballots={[user.id]:false};room.settings={...room.settings,anonymousTeamVote:true};
 assert.equal(gameScreen(room,user,{...state(),overlay:'history'}).rows.some(r=>r.id.startsWith('replay:ballot:')),false);
 room.settings.anonymousTeamVote=false;assert.ok(gameScreen(room,user,{...state(),overlay:'history'}).rows.some(r=>r.id.startsWith('replay:ballot:')&&r.text.includes('封驳')));
});

import { renderScreen } from '../src/ui/widgets.js';
import { hitTest } from '../src/ui/layout.js';
test('fixed guide return wins the tap over a scrolled character card; modal blank area consumes taps',()=>{
 const noop=()=>{},gradient={addColorStop:noop};const ctx=new Proxy({measureText:(s:string)=>({width:s.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?(o as any)[k]:noop});const canvas={getContext:()=>ctx} as any,v={width:390,height:844,top:0,bottom:0};
 const guide=guideScreen(undefined,'roles');guide.scroll=246.4;assert.equal(hitTest(renderScreen(guide,canvas,v),38,45)?.id,'back');
 const {room,user}=parityFixture('vote'),ui=state();syncGameUi(ui,room,true,user.id);const m=gameScreen(room,user,ui),nodes=layoutWebScreen(m,v).nodes,frame=nodes.find(n=>n.id==='dialog-frame')!;
 assert.equal(hitTest(renderScreen(m,canvas,v),frame.x+4,frame.y+100)?.id,'noop');
});
