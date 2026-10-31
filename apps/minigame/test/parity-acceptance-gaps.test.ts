import {RoomBubbles} from '../src/screens/room-bubbles.js';
import {SettingsChoice} from '../src/screens/settings.js';
import {AdminPanel} from '../src/screens/admin/panel.js';
import {SpecialPanel} from '../src/screens/admin/special.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parityFixture,parityPlayerData,parityAdminData} from '../scripts/parity-fixture.js';
import {gameScreen,gameAction,handleGameOverlay,syncGameUi,type GameUiState} from '../src/screens/game.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
import {PlayerPanel} from '../src/screens/player-panel.js';
import {wrapText} from '../src/ui/layout.js';
import {abortConfirmation} from '../src/screens/abort-confirm.js';
import {ServerClock} from '../src/net/server-clock.js';
const viewport={width:390,height:844,top:0,bottom:0};
const state=():GameUiState=>({privateRoleVisible:false,ballotVisible:false});

test('countdown uses server time even when the phone clock is wrong',()=>{
 const clock=new ServerClock();clock.accept(new Date(10000).toISOString(),999000);
 assert.equal(clock.now(1001000),12000);clock.accept('invalid',1001000);assert.equal(clock.now(1002000),13000);
 const {room,user}=parityFixture('mirror-window',12),ui=state();syncGameUi(ui,room);
 assert.equal(gameScreen(room,user,ui,clock.now(1001000)).web!.document!.remainingSeconds,3);
 assert.equal(gameScreen(room,user,ui,clock.now(1020000)).web!.document!.remainingSeconds,0);
});

test('abort confirmation distinguishes host decisions from a participant request',()=>{
 const {room,user}=parityFixture('mission');
 assert.equal(abortConfirmation(room,user).rows.find(r=>r.id==='confirm:yes')?.text,'结束游戏并关闭房间');
 const guest={...user,id:room.members[1]!.id};
 assert.equal(abortConfirmation(room,guest).rows.find(r=>r.id==='confirm:yes')?.text,'向房主申请中止');
 room.game.abortPoll={requestedBy:guest.id,approvals:0,required:1,voted:false};
 assert.equal(abortConfirmation(room,user).rows.find(r=>r.id==='confirm:yes')?.text,'同意结束');
 assert.ok(!abortConfirmation(room,guest).rows.some(r=>r.id==='confirm:yes'));
 for(const width of [320,390,430]){
  const nodes=layoutWebScreen(abortConfirmation(room,user),{...viewport,width}).nodes;
  assert.ok(nodes.some(n=>n.id==='confirm:back'));assert.ok(nodes.some(n=>n.id==='confirm:no'&&n.text==='继续游戏'));
  assert.ok(nodes.filter(n=>n.kind==='button').every(n=>n.x>=0&&n.x+n.width<=width));
 }
});

test('Chinese wrapping keeps closing punctuation with the preceding character',()=>{
 const measure=(s:string)=>Array.from(s).length;
 assert.deepEqual(wrapText('其他玩家正常继续对局。',10,measure),['其他玩家正常继续对','局。']);
 assert.deepEqual(wrapText('甲乙（丙丁）',3,measure),['甲乙','（丙','丁）']);
});

test('mirror window selects a teammate immediately and offers a neutral view to other seats',()=>{
 const {room,user}=parityFixture('notice-mirror',12);room.game.phase='guanyin_window';room.game.self!.treasures!.guanyinMirror={available:true,used:false};
 room.game.rounds=[{...parityFixture('mission',12).room.game.rounds[0]!,team:[user.id,room.members[0]!.id]}];room.game.guanyinEndsAt=new Date(20000).toISOString();
 const ui=state();syncGameUi(ui,room);assert.equal(ui.overlay,'guanyin-window');
 const model=gameScreen(room,user,ui,10000);assert.equal(model.web!.document!.remainingSeconds,10);
 const nodes=layoutWebScreen(model,viewport).nodes;assert.ok(nodes.some(n=>n.id==='treasure:guanyinPick:'+room.members[0]!.id));
 assert.equal(gameAction(room,user,'treasure:guanyinPick:'+room.members[0]!.id,ui)?.type,'useTreasure');
 assert.equal(gameAction(room,user,'treasure:guanyinPick:'+user.id,ui),undefined);
 handleGameOverlay(ui,room,'overlayClose');syncGameUi(ui,room);assert.equal(ui.overlay,undefined);
 handleGameOverlay(ui,room,'treasures');assert.equal(ui.overlay,'guanyin-window');
 room.game.self!.role='loyal';room.game.self!.treasures=undefined;const observer=state();syncGameUi(observer,room);
 const neutral=layoutWebScreen(gameScreen(room,user,observer,10000),viewport).nodes;
 assert.ok(neutral.some(n=>n.id==='mirror-waiting'));assert.ok(!neutral.some(n=>n.id.startsWith('treasure:guanyinPick:')));
});

test('a private result remains open while the same game advances and can be reopened',()=>{
 const {room,user}=parityFixture('notice-mirror',12),ui=state();syncGameUi(ui,room);
 assert.equal(ui.overlay,'private-notice');room.game.phase='discussion';syncGameUi(ui,room);
 assert.equal(ui.overlay,'private-notice');assert.equal(ui.privateRoleVisible,true);
 handleGameOverlay(ui,room,'overlayClose');assert.equal(ui.overlay,undefined);
 handleGameOverlay(ui,room,'treasures');assert.equal(ui.noticeKind,'mirror');assert.equal(ui.overlay,'private-notice');
 room.game.id='new-game';room.game.self!.treasures=undefined;syncGameUi(ui,room);assert.notEqual(ui.overlay,'private-notice');
});
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
 const publicNodes=layoutWebScreen(gameScreen(room,user,ui),viewport).nodes.filter(n=>n.id.startsWith('report-ballot:'));assert.equal(new Set(publicNodes.map(n=>n.y)).size,2);
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


test('admin code inventory exposes every web table column through horizontal scrolling',()=>{
 const model:any={title:'兑换码',rows:[],web:{page:'sheet',activeTab:'page:codes',document:{kind:'admin',adminCodes:parityAdminData().codes}}};
 const initial=layoutWebScreen(model,viewport).nodes;
 for(const label of ['兑换码','VIP 天数','备注说明','核销状态','兑换玩家','兑换时间','创建时间'])assert.ok(initial.some(n=>n.text===label),'missing '+label);
 const max=initial.find(n=>n.scrollMaxX)?.scrollMaxX;assert.ok(max&&max>0);
 const shifted=layoutWebScreen({...model,horizontalScroll:max},viewport).nodes;
 const last=shifted.find(n=>n.id==='codes-heading:6')!;assert.ok(last.x>=last.clipLeft!&&last.x+last.width<=last.clipRight!+.001);
});


test('dedicated-room password choices preserve explicit none and block malformed passwords',async()=>{
 const calls:any[]=[];const api:any={authorized:true,users:async()=>({users:[{id:'manager',playerCode:'123456'}]}),special:async(...args:any[])=>{calls.push(args);return {rooms:[],codes:[],history:[],nextCursor:null};}};
 const panel=new SpecialPanel(api,()=>{});await panel.handle('special:new',async()=>undefined);
 await panel.handle('special:managerCode',async()=> '123456');
 await panel.handle('special:password:new',async()=>undefined);
 await panel.handle('special:password',async()=> '');
 let model=panel.model();assert.equal(model.web!.document!.specialDraft!.password,'');
 assert.equal(layoutWebScreen(model,viewport).nodes.find(n=>n.id==='special:save')!.disabled,true);
 await assert.rejects(panel.handle('special:save',async()=>undefined),/密码/);assert.equal(calls.length,0);
 await panel.handle('special:password:none',async()=>undefined);assert.equal(panel.model().web!.document!.specialDraft!.password,null);
});


test('admin room monitor loads live and archived counts and displays full archived identifiers',async()=>{
 const data=parityAdminData();const panel=new AdminPanel({rooms:async()=>({rooms:data.rooms}),games:async()=>({games:data.games})} as any);
 await panel.load('games');const model=panel.model(),nodes=layoutWebScreen(model,viewport).nodes;
 assert.equal(model.web!.document!.adminRooms!.length,1);
 assert.ok(nodes.some(n=>n.id==='admin-game-id:'+data.games[0]!.id&&n.text.includes(data.games[0]!.id)));
 assert.ok(nodes.some(n=>n.id==='admin-game-ended:'+data.games[0]!.id));
 await panel.load('rooms');assert.equal(panel.model().web!.document!.adminGames!.length,1);
});


test('settings selects require an explicit option and closing or reselecting never toggles',()=>{
 const {room}=parityFixture(),choice=new SettingsChoice(),initial=room.settings.captainMode;
 assert.equal(choice.open('special:setting:captainMode',room.settings),true);assert.equal(room.settings.captainMode,initial);
 assert.equal(choice.choose(initial),undefined);assert.equal(choice.current,undefined);
 choice.open('preset:captainMode',room.settings);choice.close();assert.equal(choice.choose('random_order'),undefined);
 choice.open('preset:captainMode',room.settings);assert.equal(choice.choose(initial==='seat_order'?'random_order':'seat_order'),'preset:captainMode');
 choice.open('preset:captainMode',room.settings);assert.equal(choice.choose('forged-value'),undefined);
});

test('settings option overlay stays reachable above the modal footer on a small screen',()=>{
 const {room}=parityFixture();const model:any={title:'预设',rows:[],scroll:10000,web:{page:'sheet',document:{kind:'presets',modal:true,presetEditing:true,settings:room.settings,settingChoice:{id:'preset:rejectionScope',key:'rejectionScope',value:'game'}}}};
 const nodes=layoutWebScreen(model,{width:320,height:568,top:44,bottom:34}).nodes;
 const options=nodes.filter(n=>n.id.startsWith('settingChoice:value:'));assert.equal(options.length,2);
 for(const n of options){assert.ok(n.fixed);assert.ok(n.y>=44&&n.y+n.height<=534);}
 assert.ok(nodes.findIndex(n=>n.id==='settingChoice:close')<nodes.indexOf(options[0]!));
});


test('public room bubbles replace per player, expire and never cross rooms or backgrounding',()=>{
 const bubbles=new RoomBubbles();bubbles.sync('room-a');bubbles.receive('p1','第一条',0);bubbles.receive('p2','另一位玩家',100);bubbles.receive('p1','新消息',1000);
 assert.deepEqual(bubbles.snapshot(3800),{p1:'新消息',p2:'另一位玩家'});assert.deepEqual(bubbles.snapshot(4800),{});
 bubbles.receive('p1','不应跨房间',5000);bubbles.sync('room-b');assert.deepEqual(bubbles.snapshot(5001),{});
 bubbles.receive('p2','退后台清除',5002);bubbles.clear();assert.deepEqual(bubbles.snapshot(5003),{});
});


test('small-screen vote instructions reserve both lines before the expedition card',()=>{
 const {room,user}=parityFixture('vote');const model=gameScreen(room,user,{...state(),overlay:'vote'});
 const nodes=layoutWebScreen(model,{width:320,height:568,top:0,bottom:0}).nodes;
 const rule=nodes.find(n=>n.id==='vote-rule')!,copy=nodes.find(n=>n.id==='guide:vote-rule')!,party=nodes.find(n=>n.id==='vote-team-panel')!;
 assert.equal(copy.lines?.length,2);assert.ok(rule.height>=copy.height+10);assert.ok(party.y>=rule.y+rule.height+10);
 const submit=nodes.find(n=>n.id==='submitVote')!;assert.equal(submit.fontSize,13);
});


test('admin allocation pagination does not duplicate a record repeated at a page boundary',async()=>{
 const first=parityAdminData().allocations[0]!,second={...first,id:'second-allocation'};
 const p=new SpecialPanel({authorized:true,special:async(path:string)=>path.includes('history')?path.includes('cursor=')?{history:[first,second],nextCursor:null}:{history:[first],nextCursor:'next'}:path.includes('player-codes')?{codes:[]}:{rooms:[]}} as any,()=>{});
 await p.load();await p.handle('special:more',async()=>undefined);
 assert.deepEqual(p.data().history.history.map(h=>h.id),[first.id,second.id]);
});


test('private treasure notices open individually, queue unread results and hide with privacy state',()=>{
 const {room,user}=parityFixture('mission',12);const t={enabled:true,guanyinMirror:{available:false,used:true,result:{targetId:room.members[1]!.id,alignment:'pure' as const}},incomingHeartBell:{mission:1,roundNumber:1,advice:'protect' as const,active:true},jinguAllyId:room.members[2]!.id};room.game.self!.treasures=t;room.game.self!.role='guinevere';
 const ui=state();syncGameUi(ui,room,false);assert.equal(ui.privateRoleVisible,false);
 syncGameUi(ui,room,true);assert.equal(ui.overlay,'private-notice');assert.equal(ui.noticeKind,'mirror');
 let model=gameScreen(room,user,ui);assert.equal(model.web!.document!.kind,'private-notice');assert.equal(model.web!.document!.self?.treasures?.guanyinMirror?.result?.alignment,'pure');
 handleGameOverlay(ui,room,'overlayClose');assert.equal(ui.noticeKind,'bell');
 room.game.self!.role='percival';handleGameOverlay(ui,room,'overlayClose');assert.equal(ui.noticeKind,'jingu');
 handleGameOverlay(ui,room,'overlayClose');syncGameUi(ui,room,true);assert.equal(ui.overlay,undefined);assert.equal(ui.privateRoleVisible,false);
 model=gameScreen(room,user,{...ui,overlay:'private-notice',noticeKind:'mirror',privateRoleVisible:false});assert.equal(model.web!.document!.self,undefined);
});
