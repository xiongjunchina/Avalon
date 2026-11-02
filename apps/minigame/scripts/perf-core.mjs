// Deterministic CPU/Canvas-command benchmark, not a phone FPS measurement.
// Run: node --import tsx apps/minigame/scripts/perf-core.mjs [report.json]
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {parityFixture,parityPlayerData} from './parity-fixture.ts';
import {entryScreen} from '../src/screens/entry.ts';
import {lobbyScreen} from '../src/screens/lobby.ts';
import {gameScreen} from '../src/screens/game.ts';
import {guideScreen} from '../src/screens/guide.ts';
import {PlayerPanel} from '../src/screens/player-panel.ts';
import {layoutWebScreen} from '../src/ui/web-layout.ts';
import {createScrollLayoutCache} from '../src/ui/scroll-layout-cache.ts';
import {renderScreen} from '../src/ui/widgets.ts';
import {setBackdropCanvasFactory} from '../src/ui/web-render.ts';

export async function corePerformanceFixtures(){
 const {user,room}=parityFixture('game',12),data=parityPlayerData();
 const models={home:entryScreen(user),waiting:lobbyScreen({...room,phase:'waiting',game:undefined},user),table:gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false}),guide:guideScreen(),roles:guideScreen(undefined,'roles')};
 const api={statistics:async()=>data.stats,history:async()=>({games:Array.from({length:40},(_,i)=>({...data.summary,id:'history-'+i})),nextCursor:null}),presets:async()=>({presets:Array.from({length:10},(_,i)=>({...data.presets[0],id:'preset-'+i}))}),friends:async()=>({friends:Array.from({length:40},(_,i)=>({...data.friends[0],id:'friend-'+i,nickname:'仙友'+i}))}),directChat:async()=>({messages:[]}),replay:async()=>data.replay};
 for(const name of ['account','history','friends','presets','profile','chat','replay']){
  const panel=new PlayerPanel(api,user);
  await panel.open(name==='profile'?'account':name==='chat'?'roomchat':name==='replay'?'history':name,{roomId:room.id});
  if(name==='profile')await panel.handle('profileToggle',async()=>undefined);
  if(name==='friends')await panel.handle('friendTab:friends',async()=>undefined);
  if(name==='replay')await panel.openReplay(data.replay.id);
  if(name==='chat')for(let i=0;i<40;i++)panel.onRoomChat({messageId:'message-'+i,fromUserId:user.id,nickname:user.nickname,seat:1,text:'第'+i+'条传音：请根据大家的发言与投票认真判断。',timestamp:'2026-11-02T00:00:00Z'});
  models[name]=panel.model();
 }
 models.settings={title:'玩法配置',rows:[],web:{page:'setup',settings:room.settings,document:{kind:'settings',activeTab:'setup',settings:room.settings}}};
 models.sound={title:'声音设置',rows:Array.from({length:10},(_,i)=>({id:'guide:voice'+i,text:'声音说明，请根据需要选择。'.repeat(5)})),web:{page:'sheet',document:{kind:'sound',modal:true,soundPreferences:{music:true,effects:true}}}};
 models.tools={title:'房间工具',rows:Array.from({length:12},(_,i)=>({id:'tool:'+i,text:'房间操作 '+i})),web:{page:'sheet',document:{kind:'tools',modal:true}}};
 return models;
}
const rounded=value=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v));
function counters(){
 let counts={};
 const canvas=()=>{
  const target={font:'14px sans-serif',strokeStyle:'#000000',globalAlpha:1};
  const context=new Proxy(target,{get(obj,key){if(key in obj)return obj[key];return (...args)=>{counts[key]=(counts[key]??0)+1;if(key==='measureText')return {width:String(args[0]).length*7};if(key==='createLinearGradient'||key==='createRadialGradient')return {addColorStop(){}};if(key==='getImageData')return {data:new Uint8ClampedArray(args[2]*args[3]*4)};};}});
  return {width:780,height:1688,getContext:()=>context};
 };
 return {canvas,reset(){counts={};},get:()=>({...counts})};
}
if(process.argv[1]?.endsWith('perf-core.mjs')){
 const models=await corePerformanceFixtures(),v={width:390,height:844,top:88,bottom:34};
 const report={measuredAt:new Date().toISOString(),method:'Node layout timings and instrumented Canvas command counts; no native phone/GPU/FPS claim',viewport:v,pages:{}};
 for(const [name,model] of Object.entries(models)){
  const base=layoutWebScreen({...model,scroll:0},v),offsets=[0,7,14,60,200,999999];
  let mismatch;
  for(const offset of offsets){const scroll=Math.min(offset,base.maxScroll),translated={...base,nodes:base.nodes.map(n=>n.fixed?n:{...n,y:n.y-scroll})},direct=layoutWebScreen({...model,scroll},v);if(!isDeepStrictEqual(rounded(translated),rounded(direct))){mismatch=direct.nodes.find((n,i)=>!isDeepStrictEqual(rounded(n),rounded(translated.nodes[i])) )?.id??'layout';break;}}
  let calls=0;const cache=createScrollLayoutCache((m,view)=>{calls++;return layoutWebScreen(m,view);});cache(model,v);for(let i=1;i<=60;i++)cache({...model,scroll:i},v,0,true);
  const times=[];for(let i=0;i<120;i++){const start=performance.now();layoutWebScreen({...model,scroll:i},v);times.push(performance.now()-start);}times.sort((a,b)=>a-b);
  const counter=counters(),canvas=counter.canvas();setBackdropCanvasFactory(counter.canvas);renderScreen(model,canvas,v);counter.reset();renderScreen({...model,scroll:1},canvas,v);const paint=counter.get();
  report.pages[name]={nodes:base.nodes.length,maxScroll:base.maxScroll,linearTranslationEquivalent:!mismatch,firstMismatch:mismatch??null,layoutCallsFor60ScrollFrames:calls,layoutMedianMs:+times[60].toFixed(3),layoutP95Ms:+times[114].toFixed(3),warmScrollCommands:{text:paint.fillText??0,textMeasures:paint.measureText??0,drawImage:paint.drawImage??0,gradients:(paint.createLinearGradient??0)+(paint.createRadialGradient??0),all:Object.values(paint).reduce((a,b)=>a+b,0)}};
 }
 console.log(JSON.stringify(report,null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
}
