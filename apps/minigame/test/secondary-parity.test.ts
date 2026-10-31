import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parityFixture, parityPlayerData } from '../scripts/parity-fixture.js';
import { gameScreen, handleGameOverlay, syncGameUi, gameAction, type GameUiState } from '../src/screens/game.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';
import { PlayerPanel, playerPanelScroll } from '../src/screens/player-panel.js';
import { PlayerExtras } from '../src/screens/player-extras.js';

const state=():GameUiState=>({privateRoleVisible:false,ballotVisible:false});
test('battle history retains the web minimum sheet height even before the first proposal',()=>{
 const {room,user}=parityFixture();const ui=state();handleGameOverlay(ui,room,'history');
 for(const [width,height] of [[320,568],[390,844],[430,932]]){
  const layout=layoutWebScreen(gameScreen(room,user,ui),{width:width!,height:height!,top:0,bottom:0});
  assert.equal(layout.nodes.find(n=>n.id==='dialog-frame')!.height,Math.min(height!*.82,760));
  assert.equal(layout.nodes.find(n=>n.id==='empty')!.text,'尚无已完成的组队提案。');
 }
});
test('private identity is a masked horizontal card, and closing it removes private metadata',()=>{
 const {room,user}=parityFixture();const ui=state();handleGameOverlay(ui,room,'role');
 const model=gameScreen(room,user,ui);assert.equal(model.web?.document?.kind,'identity');
 const layout=layoutWebScreen(model,{width:390,height:844,top:0,bottom:0});
 assert.ok(layout.nodes.some(n=>n.skin==='identity-card'&&n.height<145));
 assert.ok(layout.nodes.some(n=>n.id==='identity-knowledge'));
 assert.ok(layout.nodes.some(n=>n.id==='identityArt'));
 handleGameOverlay(ui,room,'overlayClose');assert.equal(gameScreen(room,user,ui).web?.document,undefined);
});
test('vote choices remain selected and expose inline past missions before explicit submission',()=>{
 const {room,user}=parityFixture('vote');const ui=state();syncGameUi(ui,room,true,user.id);
 assert.equal(gameScreen(room,user,ui).web?.document?.kind,'vote');
 handleGameOverlay(ui,room,'vote-choice:approve');assert.equal(gameAction(room,user,'submitVote',ui)?.type,'teamVote');
 assert.equal(ui.voteChoice,true);assert.ok(layoutWebScreen(gameScreen(room,user,ui),{width:390,height:844,top:0,bottom:0}).nodes.some(n=>n.id==='vote-history-heading'));
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
 const data=parityPlayerData(),p=new PlayerPanel({presets:async()=>({presets:data.presets})} as any,parityFixture().user);await p.open('presets',{roomId:'r',settings:parityFixture().room.settings,canApplyPreset:true});await p.handle('preset:new',async()=>undefined);const nodes=layoutWebScreen(p.model(),{width:390,height:844,top:0,bottom:0}).nodes;
 assert.ok(nodes.some(n=>n.id==='preset-room-summary'));assert.equal(nodes.some(n=>n.id==='preset:count:12'),false);
});
test('profile edits require save; quick phrases send like the web and failed sends retain the draft',async()=>{
 const data=parityPlayerData(),writes:any[]=[];let fail=true;
 const p=new PlayerPanel({statistics:async()=>data.stats,updateProfile:async(profile:any)=>{writes.push(profile);return{user:{...parityFixture().user,...profile}};},roomChat:async()=>{if(fail)throw new Error('offline');writes.push('sent');}} as any,parityFixture().user);
 await p.open('account');await p.handle('profileToggle',async()=>undefined);await p.handle('profile:nickname',async()=> '新行者');assert.equal(writes.length,0);await p.handle('profile:save',async()=>undefined);assert.equal(p.user.nickname,'新行者');
 await p.open('roomchat',{roomId:'r'});await assert.rejects(p.handle('quick:0',async()=>undefined),/offline/);assert.ok(p.model().web?.document?.chatDraft);assert.equal(writes.length,1);await assert.rejects(p.handle('chat:sendroom',async()=>undefined),/offline/);assert.ok(p.model().web?.document?.chatDraft);fail=false;assert.equal(await p.handle('chat:sendroom',async()=>undefined),'back');assert.equal(p.model().web?.document?.chatDraft,'');
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

test('incoming friend can be accepted directly and deletion remains explicitly confirmed',async()=>{
 const data=parityPlayerData(),writes:string[]=[],p=new PlayerPanel({friends:async()=>({friends:data.friends}),acceptFriend:async(id:string)=>{writes.push('accept:'+id);},removeFriend:async(id:string)=>{writes.push('remove:'+id);}} as any,parityFixture().user);
 await p.open('friends');await p.handle('friendTab:friends',async()=>undefined);const incoming=data.friends[1]!.id,accepted=data.friends[0]!.id;
 assert.ok(layoutWebScreen(p.model(),{width:390,height:844,top:0,bottom:0}).nodes.some(n=>n.id==='acceptFriend:'+incoming));
 await p.handle('acceptFriend:'+incoming,async()=>undefined);assert.deepEqual(writes,['accept:'+incoming]);await p.handle('removeFriend:'+accepted,async()=>undefined);assert.equal(writes.length,1);await p.handle('confirm:yes',async()=>undefined);assert.equal(writes[1],'remove:'+accepted);
});

test('account editor opens as a modal with an always reachable save action',async()=>{
 const p=new PlayerPanel({statistics:async()=>parityPlayerData().stats} as any,parityFixture().user);
 await p.open('account');await p.handle('profileToggle',async()=>undefined);
 assert.equal(p.model().web?.document?.modal,true);
 for(const width of [320,390,430]){const v={width,height:568,top:24,bottom:34},m=p.model(),first=layoutWebScreen(m,v);m.scroll=first.maxScroll;
 for(const l of [first,layoutWebScreen(m,v)]){const save=l.nodes.find(n=>n.id==='profile:save')!;assert.ok(save.fixed);assert.ok(save.y>=v.top&&save.y+save.height<=v.height-v.bottom);}}
 await p.handle('profileToggle',async()=>undefined);assert.equal(p.model().web?.document?.modal,false);
});

test('preset list opens editor explicitly, cancel does not save, save closes on success',async()=>{
 let writes=0;const p=new PlayerPanel({presets:async()=>({presets:parityPlayerData().presets}),savePreset:async()=>{writes++;}} as any,parityFixture().user);
 await p.open('presets');assert.equal(p.model().web?.document?.modal,false);
 await p.handle('preset:new',async()=>undefined);assert.equal(p.model().web?.document?.modal,true);
 await p.handle('preset:cancel',async()=>undefined);assert.equal(writes,0);assert.equal(p.model().web?.document?.modal,false);
 await p.handle('apply:preset-1',async()=>undefined);assert.equal(p.model().web?.document?.modal,true);
 await p.handle('preset:save',async()=>undefined);assert.equal(writes,1);assert.equal(p.model().web?.document?.modal,false);
});

test('seat artwork uses CSS coordinates at every physical pixel density',()=>{
 const {room,user}=parityFixture(),m=gameScreen(room,user,state()),v={width:390,height:844,top:0,bottom:0};
 const draws=(dpr:number)=>{const arcs:any[]=[];const canvas:any={width:390*dpr,height:844*dpr};const noop=()=>{},gradient={addColorStop:noop};const ctx=new Proxy({canvas,arc:(...args:any[])=>arcs.push(args),measureText:(s:string)=>({width:s.length*12}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?(o as any)[k]:noop});canvas.getContext=()=>ctx;renderScreen(m,canvas,v);return arcs;};
 assert.deepEqual(draws(3),draws(1));
});

test('editing a preset from a scrolled list starts at the name and resets on return',async()=>{
 const p=new PlayerPanel({presets:async()=>({presets:parityPlayerData().presets})} as any,parityFixture().user);
 await p.open('presets');const list=p.model();await p.handle('apply:preset-1',async()=>undefined);const editor=p.model();
 assert.equal(playerPanelScroll(list,editor,2000),0);assert.equal(playerPanelScroll(editor,editor,200),200);
 await p.handle('preset:cancel',async()=>undefined);assert.equal(playerPanelScroll(editor,p.model(),700),0);
 assert.equal(editor.web?.underlay?.web?.document?.kind,'presets');assert.equal(editor.web?.underlay?.web?.document?.modal,false);
});

test('direct quick phrases scroll as one clipped row and send once on tap',async()=>{
 const {hitTest}=await import('../src/ui/layout.js');
 const data=parityPlayerData();let writes=0,release:()=>void=()=>{};
 const p=new PlayerPanel({friends:async()=>({friends:data.friends}),directChat:async()=>({messages:[]}),sendDirect:async()=>{writes++;await new Promise<void>(r=>release=r);}} as any,parityFixture().user);
 await p.open('friends');await p.handle('friend:'+data.friends[0]!.id,async()=>undefined);
 const v={width:390,height:844,top:0,bottom:0},m=p.model(),chips=layoutWebScreen(m,v).nodes.filter(n=>n.id.startsWith('quick:'));
 assert.ok(chips.length>3);assert.equal(new Set(chips.map(n=>n.y)).size,1);assert.ok(chips[0]!.scrollMaxX!>0);
 assert.equal(hitTest(chips,389,chips[0]!.y+4),undefined);
 const scrolled=layoutWebScreen({...m,horizontalScroll:9999},v).nodes.filter(n=>n.id.startsWith('quick:'));
 assert.ok(scrolled.at(-1)!.x+scrolled.at(-1)!.width<=scrolled.at(-1)!.clipRight!+.01);
 const pending=p.handle('quick:0',async()=>undefined);await p.handle('quick:1',async()=>undefined);assert.equal(writes,1);release();await pending;assert.equal(p.model().web?.document?.chatDraft,'');
});


test('human bag preserves web legal targets including self, excludes captain, and requires explicit activation',()=>{
 const {room,user}=parityFixture('treasures-mordred',12);const ui:GameUiState={privateRoleVisible:true,ballotVisible:false,overlay:'treasures'};
 assert.notEqual(room.game!.captainId,user.id);
 const model=gameScreen(room,user,ui);
 assert.ok(model.rows.some(r=>r.id==='player:'+user.id));
 assert.ok(!model.rows.some(r=>r.id==='player:'+room.game!.captainId));
 assert.equal(gameAction(room,user,'treasure:humanBag',ui),undefined);
 handleGameOverlay(ui,room,'treasureTargets');assert.equal(ui.treasureTargetsExpanded,true);
 handleGameOverlay(ui,room,'player:'+user.id);ui.targetId=user.id;
 assert.equal(ui.treasureTargetsExpanded,false);
 assert.equal(gameAction(room,user,'player:'+user.id,ui),undefined);
 assert.equal(gameAction(room,user,'treasure:humanBag',ui)?.type,'useTreasure');
 ui.targetId=room.game!.captainId;assert.equal(gameAction(room,user,'treasure:humanBag',ui),undefined);
});
test('enabled heart bell shows unavailable controls rather than claiming treasure mode is disabled',()=>{
 const {room,user}=parityFixture('treasures-minion',12);const ui:GameUiState={privateRoleVisible:true,ballotVisible:false,overlay:'treasures'};
 const nodes=layoutWebScreen(gameScreen(room,user,ui),{width:390,height:844,top:0,bottom:0}).nodes;
 assert.ok(nodes.some(n=>n.id==='bell-unavailable'));
 assert.ok(!nodes.some(n=>n.id==='treasure-empty'));
 assert.ok(nodes.filter(n=>n.id.startsWith('treasure:heart')).every(n=>n.disabled));
});


test('home request badge counts only incoming pending friendships',async()=>{
 const friends=[{id:'a',status:'pending',isSender:false},{id:'b',status:'pending',isSender:true},{id:'c',status:'accepted',isSender:false}];
 const p=new PlayerPanel(new PlayerExtras({request:async()=>({friends})} as any),parityFixture().user);
 await p.refreshFriends();assert.equal(p.incomingFriendRequests,1);
});

test('an invalid friend response cannot corrupt the homepage badge',async()=>{
 const p=new PlayerPanel(new PlayerExtras({request:async()=>({ok:true})} as any),parityFixture().user);
 await p.refreshFriends();assert.equal(p.incomingFriendRequests,0);
});

test('spent treasures expose their private result card and cannot be activated again',()=>{
 for(const role of ['percival','guinevere','mordred','oberon']){
  const {room,user}=parityFixture('treasures-'+role+'-used',12),ui:GameUiState={privateRoleVisible:true,ballotVisible:false,overlay:'treasures'};
  const model=gameScreen(room,user,ui),nodes=layoutWebScreen(model,{width:390,height:844,top:0,bottom:0}).nodes;
  assert.ok(nodes.some(n=>n.skin==='treasure-result'),role);
  assert.ok(!nodes.some(n=>n.id==='treasureTargets'),role);
  for(const r of model.rows.filter(r=>r.id.startsWith('treasure:')))assert.equal(gameAction(room,user,r.id,ui),undefined);
 }
});

test('battle history exposes the same completed early-assassination decisions as web',()=>{
 const {room,user}=parityFixture();room.game.earlyAssassination={used:false,windows:[{afterMission:1,afterProposal:2,decision:'skip'}]};
 const ui=state();handleGameOverlay(ui,room,'history');
 const viewport={width:390,height:844,top:0,bottom:0};
 assert.ok(layoutWebScreen(gameScreen(room,user,ui),viewport).nodes.some(n=>n.id==='earlyHistory'));
 assert.ok(!layoutWebScreen(gameScreen(room,user,ui),viewport).nodes.some(n=>n.id==='early-window:0'));
 handleGameOverlay(ui,room,'earlyHistory');
 assert.match(layoutWebScreen(gameScreen(room,user,ui),viewport).nodes.find(n=>n.id==='early-window:0')!.text,/第 2 次提案后：本次跳过/);
});

test('friends can join an online accepted friend room only when not already seated',async()=>{
 const {user}=parityFixture(),friends=parityPlayerData().friends;friends[0]={...friends[0],roomCode:'654321'} as any;
 const panel=new PlayerPanel({friends:async()=>({friends})} as any,user);
 await panel.open('friends');await panel.handle('friendTab:friends',async()=>undefined);
 const id='joinFriend:'+friends[0]!.id;
 assert.ok(layoutWebScreen(panel.model(),{width:390,height:844,top:0,bottom:0}).nodes.some(n=>n.id===id));
 assert.deepEqual(await panel.handle(id,async()=>undefined),{joinCode:'654321'});
 assert.equal(await panel.handle('joinFriend:unknown',async()=>undefined),undefined);
 await panel.open('friends',{roomId:'already-seated'});
 assert.equal(await panel.handle(id,async()=>undefined),undefined);
});
