import {RoomBubbles} from '../src/screens/room-bubbles.js';
import {SettingsChoice} from '../src/screens/settings.js';
import {AdminPanel} from '../src/screens/admin/panel.js';
import {SpecialPanel} from '../src/screens/admin/special.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parityFixture,parityPlayerData,parityAdminData} from '../scripts/parity-fixture.js';
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
