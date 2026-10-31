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
 const submit=nodes.find(n=>n.id==='submitVote')!;assert.equal(submit.fontSize,13);assert.equal(submit.letterSpacing,.5); // The inner .btn-cta-text overrides the button font.
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


test('vote progress keeps all twelve participants above the privacy footer at every supported width',()=>{
 for(const width of [320,390,430]){
  const {room,user}=parityFixture('vote',12);const model=gameScreen(room,user,{...state(),overlay:'vote'});
  const nodes=layoutWebScreen(model,{...viewport,width}).nodes,footer=nodes.find(n=>n.id==='vote-privacy')!;
  const voters=nodes.filter(n=>n.id.startsWith('ballot:'));assert.equal(voters.length,12);
  for(const voter of voters)assert.ok(voter.y+voter.height<=footer.y,`participant ${voter.id} overlaps privacy footer at ${width}`);
 }
});


test('VIP redemption edits without submitting, preserves failed codes and clears only on success',async()=>{
 const {user}=parityFixture();let calls=0,fail=true;
 const panel=new PlayerPanel({statistics:async()=>parityPlayerData().stats,redeem:async(code:string)=>{calls++;assert.equal(code,'ABCD1234');if(fail)throw Error('兑换码无效');return {days:30,vipUntil:'2027-01-01T00:00:00Z'};}} as any,user);
 await panel.open('account');await panel.handle('profileToggle',async()=>undefined);
 await panel.handle('redeem:submit',async()=>undefined);assert.equal(calls,0);
 await panel.handle('redeem:input',async()=> ' abcd1234 ');assert.equal(calls,0);
 await assert.rejects(panel.handle('redeem:submit',async()=>undefined),/兑换码无效/);assert.equal(calls,1);assert.equal(panel.model().web!.document!.redeemCode,' ABCD1234 ');
 await panel.handle('redeem:input',async()=>undefined);assert.equal(panel.model().web!.document!.redeemCode,' ABCD1234 ');
 fail=false;await panel.handle('redeem:submit',async()=>undefined);assert.equal(calls,2);assert.equal(panel.model().web!.document!.redeemCode,'');assert.equal(panel.user.isVip,true);
});

test('replay title and round navigation stay visible when the document reaches its end',async()=>{
 const {user}=parityFixture(),data=parityPlayerData();const panel=new PlayerPanel({replay:async()=>data.replay} as any,user);await panel.openReplay(data.replay.id,'page:history');
 for(const width of [320,390,430]){
  const view={...viewport,width,height:width===320?568:width===430?932:844},initial=layoutWebScreen(panel.model(),view),nodes=layoutWebScreen({...panel.model(),scroll:100000},view).nodes;
  const title=nodes.find(n=>n.id==='page-title')!,nav=nodes.find(n=>n.id==='round-navigation')!,back=nodes.find(n=>n.id==='page:history')!;
  assert.equal(title.y,0);assert.ok(title.fixed&&nav.fixed&&back.fixed);assert.equal(nav.y,Math.max(72,initial.nodes.find(n=>n.id==='round-navigation')!.y-initial.maxScroll));assert.equal(back.y,8);
  for(const n of nodes.filter(n=>n.id.startsWith('round-jump:')))assert.ok(n.fixed&&n.y>=nav.y&&n.y+n.height<=nav.y+nav.height);
 }
});


test('replay six-member missions retain a single row and readable labels on narrow screens',async()=>{
 const {user}=parityFixture(),data=parityPlayerData();
 data.replay.rounds[0]!.team=data.replay.players.slice(0,6).map(p=>p.id);
 const panel=new PlayerPanel({replay:async()=>data.replay} as any,user);await panel.openReplay(data.replay.id,'page:history');
 for(const width of [320,390,430]){
  const nodes=layoutWebScreen(panel.model(),{...viewport,width}).nodes,team=nodes.filter(n=>n.id.startsWith('round-team:1:'));
  assert.equal(team.length,6);assert.equal(new Set(team.map(n=>n.y)).size,1);
  const frame=nodes.find(n=>n.id==='round-party:1')!;
  for(const n of team){assert.ok(n.x>=frame.x&&n.x+n.width<=frame.x+frame.width);assert.ok(n.y+n.height<=frame.y+frame.height);}
 }
});


test('mixed Chinese copy wraps Latin words intact while oversized identifiers remain readable',()=>{
 const measure=(s:string)=>Array.from(s).length;
 assert.deepEqual(wrapText('在线服务的 WebSocket 端口',12,measure),['在线服务的','WebSocket 端口']);
 const lines=wrapText('编号 ABCDEFGHIJKLMNOP',8,measure);
 assert.ok(lines.every(line=>line.length<=8));assert.equal(lines.join('').replaceAll(' ',''),'编号ABCDEFGHIJKLMNOP');
});


test('failed mission reports retain the web outcome copy and both card totals',()=>{
 const {room,user}=parityFixture('report-failed');
 const model=gameScreen(room,user,{...state(),overlay:'report',reportMission:1});
 const nodes=layoutWebScreen(model,viewport).nodes;
 assert.equal(nodes.find(n=>n.id==='report-result')?.text,'× 妖魔作祟 · 任务失败');
 assert.equal(nodes.find(n=>n.id==='report-kicker')?.text,'MISSION FAILED · 妖孽作祟');
 assert.equal(nodes.find(n=>n.id==='report-success-total')?.count,1);
 assert.equal(nodes.find(n=>n.id==='report-fail-total')?.count,1);
});

test('admin allocation timestamps move as a readable unit instead of leaving seconds on their own',()=>{
 const stamp='2026/10/22 08:00:00';
 assert.deepEqual(wrapText('分配时间：'+stamp,210,t=>Array.from(t).length*10),['分配时间：',stamp]);
});

test('live seat geometry follows web viewport heights for six and twelve players',()=>{
 for(const [width,height,cell,arena6] of [[320,568,38,158],[390,844,42.1875,170.5625],[430,932,46,182]]){
  for(const count of [6,12]){
   const {room,user}=parityFixture('game',count);
   const nodes=layoutWebScreen(gameScreen(room,user,state()),{width,height,top:0,bottom:0}).nodes;
   const seats=nodes.filter(n=>n.kind==='seat'),arena=nodes.find(n=>n.id==='arena-frame')!;
   assert.equal(seats[0]!.height,cell);
   assert.equal(seats[0]!.y-arena.y,15);
   assert.equal(seats[2]!.y-seats[0]!.y,cell+10);
   assert.equal(arena.height,arena6+(count===12?3*(cell+10):0));
  }
 }
});

test('narrow admin search wraps cleanup and strategy paragraphs never overlap',async()=>{
 const data=parityAdminData(),p=new AdminPanel({users:async()=>({users:data.users,total:2}),settings:async()=>({freeAccessMode:true,adRewardHours:24,announcement:{enabled:false,text:''}})} as any);
 await p.load('users');
 for(const width of [320,390,430]){
  const nodes=layoutWebScreen(p.model(),{width,height:844,top:0,bottom:0}).nodes,input=nodes.find(n=>n.id==='search:input')!,search=nodes.find(n=>n.id==='search:submit')!,cleanup=nodes.find(n=>n.id==='cleanup')!;
  assert.ok(input.width>=52);assert.ok(search.x>=input.x+input.width+7);
  if(width===320)assert.ok(cleanup.y>=input.y+input.height+8);else assert.ok(cleanup.x>=search.x+search.width+7);
 }
 await p.load('settings');
 for(const width of [320,390,430]){
  const nodes=layoutWebScreen(p.model(),{width,height:844,top:0,bottom:0}).nodes,title=nodes.find(n=>n.id==='strategy-mode')!,help=nodes.find(n=>n.id==='strategy-mode-help')!,rule=nodes.find(n=>n.id==='strategy-rule')!;
  assert.ok(help.y>=title.y+title.height+4);assert.ok(rule.y>help.y+help.height);
 }
});

test('admin search clear reloads the unfiltered first page',async()=>{
 const queries:unknown[][]=[],p=new AdminPanel({users:async(...args:unknown[])=>{queries.push(args);return {users:[],total:0};}} as any);
 await p.load('users');await p.handle('search:input',async()=> '行者');await p.handle('search:submit',async()=>undefined);
 assert.deepEqual(queries.at(-1),['行者',0]);
 assert.ok(layoutWebScreen(p.model(),viewport).nodes.some(n=>n.id==='search:clear'));
 await p.handle('search:clear',async()=>undefined);assert.deepEqual(queries.at(-1),['',0]);
 assert.ok(!layoutWebScreen(p.model(),viewport).nodes.some(n=>n.id==='search:clear'));
});

test('long replay navigation remains one scrollable row with reachable final round',async()=>{
 const {user}=parityFixture('game'),data=parityPlayerData();
 data.replay.rounds=Array.from({length:12},(_,i)=>({...data.replay.rounds[0]!,number:i+1}));
 const panel=new PlayerPanel({replay:async()=>data.replay} as any,user);await panel.openReplay(data.replay.id,'page:history');
 for(const width of [320,390,430]){
  const model=panel.model(),initial=layoutWebScreen(model,{...viewport,width}),buttons=initial.nodes.filter(n=>n.id.startsWith('round-jump:'));
  assert.equal(new Set(buttons.map(n=>n.y)).size,1);
  const max=buttons[0]!.scrollMaxX!;assert.ok(max>0);
  const end=layoutWebScreen({...model,horizontalScroll:max},{...viewport,width}).nodes.filter(n=>n.id.startsWith('round-jump:')).at(-1)!;
  assert.ok(end.x>=end.clipLeft!&&end.x+end.width<=end.clipRight!+.01);
  const result=initial.nodes.find(n=>n.id==='round-result:1')!,privacy=initial.nodes.find(n=>n.id==='round-result-privacy:1')!;
  assert.ok(privacy.y+privacy.height<=result.y+result.height);
 }
});

test('populated battle history keeps public ballots inside its frame and anonymous votes private',()=>{
 for(const width of [320,390,430])for(const count of [6,12]){
  const {room,user}=parityFixture('battle-public',count),model=gameScreen(room,user,{...state(),overlay:'history'});
  const layout=layoutWebScreen({...model,activeRound:1},{...viewport,width}),voters=layout.nodes.filter(n=>n.id.startsWith('public-ballot:')),frame=layout.nodes.find(n=>n.id==='round-vote-frame:1')!;
  assert.equal(voters.length,count);assert.ok(voters.every(n=>n.x>=frame.x&&n.x+n.width<=frame.x+frame.width&&n.y+n.height<=frame.y+frame.height));
  const jump=layout.nodes.filter(n=>n.id==='round-jump:1');assert.equal(jump.filter(n=>n.selected).length,1);
  room.settings.anonymousTeamVote=true;
  assert.ok(!layoutWebScreen(gameScreen(room,user,{...state(),overlay:'history'}),{...viewport,width}).nodes.some(n=>n.id.startsWith('public-ballot:')));
 }
});

test('room chat pins composer and tactical strip while long messages scroll',async()=>{
 const {user,room}=parityFixture('game');const panel=new PlayerPanel({} as any,user);await panel.open('roomchat',{roomId:room.id});
 for(let i=0;i<30;i++)panel.onRoomChat({messageId:'m'+i,fromUserId:user.id,nickname:'行者',seat:1,text:'这是用于验证窄屏长消息换行和滚动的文字。'.repeat(3),timestamp:'2026-10-22T00:00:00Z'});
 for(const width of [320,390,430]){const model=panel.model(),v={...viewport,width};const first=layoutWebScreen(model,v);assert.ok(first.maxScroll>0);model.scroll=first.maxScroll;model.horizontalScroll=100;const last=layoutWebScreen(model,v);assert.equal(last.nodes.find(n=>n.id==='chat:sendroom')!.y,first.nodes.find(n=>n.id==='chat:sendroom')!.y);assert.equal(last.nodes.find(n=>n.id==='chat:m29')!.clipBottom,last.contentBottom);assert.ok(last.nodes.find(n=>n.id==='quick:0')!.scrollMaxX!>0);assert.equal(last.nodes.find(n=>n.id==='dialog-frame')!.fixed,true);assert.ok(last.nodes.find(n=>n.id==='chat:sendroom')!.disabled);}
 let limit=0;await panel.handle('chat:input',async(_prompt,max)=>{limit=max??0;return '测试';});assert.equal(limit,100);assert.equal(layoutWebScreen(panel.model(),viewport).nodes.find(n=>n.id==='chat:sendroom')!.disabled,false);
});

test('admin confirmations retain their dashboard and cancel without executing writes',async()=>{
 let deletes=0;const d=parityAdminData(),panel=new AdminPanel({verify:async()=>{},overview:async()=>({}),users:async()=>({users:d.users,total:d.users.length}),deleteEmptyUsers:async()=>{deletes++;}} as any);
 await panel.open('mock');await panel.handle('page:users',async()=>undefined);await panel.handle('cleanup',async()=>undefined);
 const confirm=panel.model();assert.equal(confirm.web?.document?.kind,'confirm');assert.equal(confirm.web?.underlay?.web?.document?.kind,'admin');assert.equal(confirm.web?.underlay?.web?.activeTab,'page:users');assert.equal(confirm.web?.underlay?.web?.document?.adminUsers?.length,d.users.length);
 await panel.handle('confirm:no',async()=>undefined);assert.equal(deletes,0);assert.equal(panel.model().web?.document?.kind,'admin');
});

test('admin replay opens real replay sections and gates audit to admin views',async()=>{
 const {parityAdminReplay}=await import('../scripts/parity-fixture.js');const replay=parityAdminReplay(),d=parityAdminData(),panel=new AdminPanel({verify:async()=>{},overview:async()=>({}),rooms:async()=>({rooms:d.rooms}),games:async()=>({games:d.games}),replay:async()=>replay} as any);
 await panel.open('mock');await panel.handle('page:games',async()=>undefined);await panel.handle('replay:'+replay.id,async()=>undefined);
 assert.equal(panel.model().web?.document?.adminReplay,true);assert.equal(panel.model().web?.underlay?.web?.activeTab,'page:games');
 let layout=layoutWebScreen(panel.model(),viewport);assert.ok(layout.nodes.some(n=>n.id==='details:metadata'));assert.ok(!layout.nodes.some(n=>n.id==='audit-note'));
 await panel.handle('details:audit',async()=>undefined);layout=layoutWebScreen(panel.model(),viewport);assert.ok(layout.nodes.some(n=>n.id==='audit-note'));assert.ok(layout.nodes.some(n=>n.text.includes('1234567890123456')));
 await panel.handle('details:identities',async()=>undefined);layout=layoutWebScreen(panel.model(),viewport);assert.equal(layout.nodes.filter(n=>n.id.startsWith('replay-player:')).length,replay.players.length);
 const publicModel=panel.model();publicModel.web!.document!.adminReplay=false;publicModel.web!.document!.modal=false;assert.ok(!layoutWebScreen(publicModel,viewport).nodes.some(n=>n.id==='audit-note'));
 await panel.handle('page:games',async()=>undefined);assert.equal(panel.model().web?.activeTab,'page:games');
});

test('narrow social dialog wraps its complete title instead of ellipsizing it',async()=>{
 const {user}=parityFixture('game'),panel=new PlayerPanel({friends:async()=>({friends:parityPlayerData().friends})} as any,user);await panel.open('friends');
 const narrow=layoutWebScreen(panel.model(),{width:320,height:568,top:0,bottom:0}),title=narrow.nodes.find(n=>n.id==='dialog-title')!;
 assert.equal(title.lines?.join(''),'仙友录 · 召集与好友');assert.equal(title.height,72);assert.ok(narrow.nodes.find(n=>n.id==='friendTab:invite')!.y>=title.y+title.height);
});


test('narrow avatar editor grows its preview and keeps presets below wrapped help',async()=>{
 const {user}=parityFixture('game'),d=parityPlayerData(),panel=new PlayerPanel({statistics:async()=>d.stats} as any,user);await panel.open('account');await panel.handle('profileToggle',async()=>undefined);
 for(const width of [320,390,430]){const layout=layoutWebScreen(panel.model(),{...viewport,width}),nodes=layout.nodes,frame=nodes.find(n=>n.id==='profile-preview')!,help=nodes.find(n=>n.id==='avatar-help')!,upload=nodes.find(n=>n.id==='uploadAvatar')!,hint=nodes.find(n=>n.id==='avatar-hint')!,first=nodes.find(n=>n.id==='profile:builtin:0')!;assert.ok(upload.y>=help.y+help.height+9);assert.ok(upload.y+upload.height<frame.y+frame.height);assert.ok(first.y>=hint.y+hint.height+7);}
});

test('submitted vote explanation stays inside its responsive card',()=>{
 const {room,user}=parityFixture('vote-submitted');for(const width of [320,390,430]){const nodes=layoutWebScreen(gameScreen(room,user,{...state(),overlay:'vote'}),{...viewport,width}).nodes,card=nodes.find(n=>n.id==='vote-submitted')!,copy=nodes.find(n=>n.id==='submitted')!;assert.ok(card);assert.ok(copy.y+copy.height<=card.y+card.height-18);}
});


test('wide replay keeps captain and direction on one row while narrow screens wrap',async()=>{
 const {user}=parityFixture('game'),d=parityPlayerData(),panel=new PlayerPanel({replay:async()=>d.replay} as any,user);await panel.openReplay(d.replay.id,'page:history');
 for(const width of [320,430]){const nodes=layoutWebScreen(panel.model(),{...viewport,width}).nodes,frame=nodes.find(n=>n.id==='round-captain:1')!,captain=nodes.find(n=>n.id==='round-captain-token:1')!,direction=nodes.find(n=>n.id==='round-direction:1')!;if(width===430){assert.equal(frame.height,60);assert.ok(direction.x>=captain.x+captain.width);}else{assert.equal(frame.height,94.25);assert.ok(direction.y>=captain.y+captain.height);}}
});
