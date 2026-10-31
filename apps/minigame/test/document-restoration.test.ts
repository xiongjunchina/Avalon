import {PlayerPanel} from '../src/screens/player-panel.js';
import {parityFixture,parityPlayerData} from '../scripts/parity-fixture.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webGuideSections} from '../src/ui/web-guide-sections.js';
import {guideScreen} from '../src/screens/guide.js';
import {renderScreen} from '../src/ui/widgets.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
import {setDocumentTextMeasurer} from '../src/ui/web-document-layout.js';
import {AdminPanel} from '../src/screens/admin/panel.js';

test('public guide preserves every chapter, five steps and eight player-count configurations',()=>{
 assert.equal(webGuideSections.length,6);
 type Block=typeof webGuideSections[number]['blocks'][number];
 const blocks:Block[]=[];for(const section of webGuideSections)blocks.push(...section.blocks);
 assert.equal(blocks.find(b=>b.kind==='steps')?.items.length,5);
 const configurations=blocks.find(b=>b.kind==='configs');
 assert.deepEqual(configurations?.items.map(i=>i.title),Array.from({length:8},(_,i)=>(i+5)+' 人局'));
 assert.ok(configurations?.items.every(i=>i.missions.length===5));
 for(const width of [320,390,430]){
  const layout=layoutWebScreen(guideScreen(undefined,'rules'),{width,height:844,top:0,bottom:0});
  assert.equal(layout.nodes.filter(n=>/^guide-anchor:[1-6]$/.test(n.id)).length,6);
  assert.ok(layout.nodes.every(n=>Number.isFinite(n.y)&&n.height>=0));
 }
});

test('Canvas never synthesizes bold for the static display and calligraphy faces',()=>{
 const drawnFonts:string[]=[];let font='';
 const ctx=new Proxy({}, {set:(_,key,value)=>{if(key==='font')font=String(value);return true;},get:(_,key)=>key==='measureText'?(s:string)=>({width:s.length*7}):key==='createLinearGradient'||key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{if(key==='fillText')drawnFonts.push(font);}});
 renderScreen(guideScreen(undefined,'rules'),{getContext:()=>ctx} as unknown as HTMLCanvasElement,{width:390,height:844,top:0,bottom:0});
 assert.ok(drawnFonts.length>20);assert.ok(drawnFonts.filter(f=>/px "(?:ZCOOL XiaoWei|Ma Shan Zheng)"/.test(f)).every(f=>f.startsWith('400 ')));assert.ok(drawnFonts.some(f=>/px "Noto Sans SC"/.test(f)));
 setDocumentTextMeasurer(undefined);
});

test('admin overview mode shortcut keeps the write behind explicit confirmation',async()=>{
 let writes=0;
 const panel=new AdminPanel({verify:async()=>{},overview:async()=>({totalUsers:1,todayNewUsers:1,activeRoomsCount:0,onlineConnections:0,totalGames:0,todayGames:0,freeAccessMode:true}),settings:async()=>({freeAccessMode:true,adRewardHours:24,announcement:{enabled:false,text:''}}),updateSetting:async()=>{writes++;}} as any);
 await panel.open('fixture');
 const layout=layoutWebScreen(panel.model(),{width:390,height:844,top:0,bottom:0});
 assert.equal(layout.nodes.filter(n=>n.skin==='admin-metric').length,6);
 await panel.handle('admin:mode',async()=>undefined);assert.equal(writes,0);assert.equal(panel.model().web?.document?.kind,'confirm');
 await panel.handle('confirm:no',async()=>undefined);assert.equal(writes,0);
});

test('long twelve-player preset summary stays above its edit and delete controls',async()=>{
 const preset=parityPlayerData().presets[0]!;preset.settings={...preset.settings,playerCount:12,earlyAssassinationEnabled:true,guardianPerksEnabled:true,autoRevealRoleEnabled:true,treasuresEnabled:true,rolePreferenceEnabled:true};
 const p=new PlayerPanel({presets:async()=>({presets:[preset]})} as any,parityFixture().user);await p.open('presets');
 for(const width of [320,390,430]){const l=layoutWebScreen(p.model(),{width,height:844,top:0,bottom:0}),description=l.nodes.find(n=>n.id==='preset-settings:'+preset.id)!,edit=l.nodes.find(n=>n.id==='apply:'+preset.id)!;assert.ok(description.y+description.height<edit.y);}
});
test('editing admin announcement and reward drafts never writes before save',async()=>{
 const calls:unknown[]=[];const api={verify:async()=>{},overview:async()=>({}),settings:async()=>({freeAccessMode:true,adRewardHours:24,announcement:{enabled:false,text:''}}),updateSetting:async(...args:unknown[])=>calls.push(args),broadcast:async(...args:unknown[])=>calls.push(args)};
 const p=new AdminPanel(api as any);await p.open('fixture');await p.load('settings');
 await p.handle('reward:input',async()=> '48');await p.handle('broadcast:input',async()=> '测试公告');await p.handle('broadcast:toggle',async()=>undefined);assert.deepEqual(calls,[]);
 await p.handle('broadcast:save',async()=>undefined);assert.deepEqual(calls,[['测试公告',true]]);
});
test('friends already seated in this room are not offered another invite',async()=>{
 const d=parityPlayerData(),room=parityFixture().room,p=new PlayerPanel({friends:async()=>({friends:d.friends})} as any,parityFixture().user);
 await p.open('friends',{roomId:room.id,roomMemberIds:room.members.map(m=>m.id)});await p.handle('friendTab:friends',async()=>undefined);
 await p.handle('refresh:friends',async()=>undefined);
 const l=layoutWebScreen(p.model(),{width:390,height:844,top:0,bottom:0});assert.ok(!l.nodes.some(n=>n.id.startsWith('inviteFriend:')));assert.ok(l.nodes.some(n=>n.id.startsWith('friend:')));
});


test('long admin announcements remain fully reviewable and retain their edit draft',async()=>{
 const text='这是一条用于核对公告后半段不会被截掉的测试消息。'.repeat(9),p=new AdminPanel({verify:async()=>{},overview:async()=>({}),settings:async()=>({freeAccessMode:true,adRewardHours:24,announcement:{enabled:true,text}})} as any);
 await p.open('fixture');await p.load('settings');assert.equal(p.inputValue('broadcast:input'),text);
 for(const width of [320,390,430]){const n=layoutWebScreen(p.model(),{width,height:844,top:0,bottom:0}).nodes.find(n=>n.id==='broadcast:input')!;assert.ok(n.height>=(n.lines?.length??0)*20+24);}
});

test('special room editor keeps configuration drafts local until save',async()=>{
 const calls:unknown[]=[];const p=new AdminPanel({authorized:true,verify:async()=>{},overview:async()=>({}),special:async(path:string,body:unknown)=>{if(body)calls.push(body);return path.includes('history')?{history:[],nextCursor:null}:path.includes('player-codes')?{codes:[]}:{rooms:[]};}} as any);
 await p.open('fixture');await p.load('special');await p.handle('special:new',async()=>undefined);
 assert.equal(p.model().web?.document?.kind,'special-editor');await p.handle('special:setting:count:12',async()=>undefined);assert.equal(p.model().web?.document?.settings?.playerCount,12);
 await p.handle('special:cancel',async()=>undefined);assert.deepEqual(calls,[]);assert.equal(p.model().web?.document?.kind,'admin');
});


test('reserved player codes stay local until explicit submit and clear after success',async()=>{
 const writes:unknown[]=[];const p=new AdminPanel({authorized:true,verify:async()=>{},overview:async()=>({}),special:async(path:string,body:unknown)=>{if(body)writes.push(body);return path.includes('history')?{history:[],nextCursor:null}:path.includes('player-codes')?{codes:[]}:{rooms:[]};}} as any);
 await p.open('fixture');await p.load('special');await p.handle('special:reserveCode',async()=> '123456');await p.handle('special:reserveNote',async()=> '公测预留');
 assert.deepEqual(writes,[]);assert.equal(p.inputValue('special:reserveNote'),'公测预留');await p.handle('special:reserve',async()=>{throw Error('must submit the visible draft');});assert.deepEqual(writes,[{code:'123456',note:'公测预留'}]);assert.equal(p.inputValue('special:reserveCode'),'');
});

test('full-length account nicknames remain readable at all supported widths',async()=>{
 const d=parityPlayerData(),user={...parityFixture().user,nickname:'一二三四五六七八九十一二三四五六七八九十'};const p=new PlayerPanel({statistics:async()=>d.stats} as any,user);await p.open('account');
 for(const width of [320,390,430]){const nodes=layoutWebScreen(p.model(),{width,height:844,top:0,bottom:0}).nodes,name=nodes.find(n=>n.id==='account-name')!,copy=nodes.find(n=>n.id==='copyCode')!,help=nodes.find(n=>n.id==='account-help')!;assert.equal(name.lines?.join(''),user.nickname);assert.ok(name.y+name.height<=copy.y);assert.ok(copy.y+copy.height<=help.y);}
});


test('player code editor checks availability and requires a reviewed confirmation before writing',async()=>{
 const user={...parityFixture().user,gamesCount:1,friendsCount:0,createdAt:'2026-10-22',isBanned:false,isVip:false},writes:unknown[]=[];
 const api={authorized:true,users:async()=>({users:[user],total:1}),special:async(path:string,body:unknown)=>{if(body){writes.push(body);return {retained:true};}if(path.includes('/check'))return {code:'654321',status:'available'};return {history:[]};}};
 const p=new AdminPanel(api as any);await p.load('users');await p.handle('userAction:playerCode:'+user.id,async()=>{throw Error('opening editor must not prompt');});assert.equal(p.model().web?.document?.kind,'code-editor');
 await p.handle('codeEditor:input',async()=> '654321');assert.deepEqual(writes,[]);assert.equal(p.inputValue('codeEditor:input'),'654321');await p.handle('codeEditor:save',async()=>undefined);assert.deepEqual(writes,[]);assert.ok(p.model().rows.some(r=>r.id==='confirm:yes'));
 await p.handle('confirm:no',async()=>undefined);assert.equal(p.model().web?.document?.kind,'code-editor');await p.handle('codeEditor:save',async()=>undefined);await p.handle('confirm:yes',async()=>undefined);assert.deepEqual(writes,[{playerCode:'654321',expectedCode:user.playerCode}]);assert.equal(p.model().web?.document?.playerCodeEditor?.currentCode,'654321');
});

test('guide chapter selector exposes every chapter and keeps its options inside narrow safe areas',()=>{
 for(const section of ['rules','roles'] as const){
  const model=guideScreen(undefined,section,false,true);
  const layout=layoutWebScreen(model,{width:320,height:568,top:88,bottom:34});
  const options=layout.nodes.filter(n=>n.skin==='chapter-option');
  assert.equal(options.length,section==='rules'?6:9);
  for(const option of options){assert.ok(option.fixed);assert.ok(option.y>=88&&option.y+option.height<=534);assert.ok(option.id.startsWith('guide-jump:guide-anchor:'));}
  assert.ok(layout.nodes.some(n=>n.id==='guide:chapters'));
 }
});
