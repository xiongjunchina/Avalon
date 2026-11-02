import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parityFixture,parityPlayerData} from '../scripts/parity-fixture.js';
import {gameScreen} from '../src/screens/game.js';
import {lobbyScreen} from '../src/screens/lobby.js';
import {joinScreen} from '../src/screens/join.js';
import {createScrollLayoutCache,hasLinearScrollGeometry} from '../src/ui/scroll-layout-cache.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
import {renderScreen,type ScreenModel} from '../src/ui/widgets.js';
import {setBackdropCanvasFactory,setWebFonts} from '../src/ui/web-render.js';
import type {WebDocument} from '../src/ui/web-document.js';
import type {SafeViewport} from '../src/ui/layout.js';
import type {Artwork} from '../src/ui/assets.js';
import type {Statistics} from '@avalon/contracts';

const rounded=(value:unknown)=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v));
function fixtures(){
 const {user,room}=parityFixture('game',12),d=parityPlayerData();
 const document=(doc:WebDocument):ScreenModel=>({title:'测试页面',rows:[],web:{page:'sheet',document:doc}});
 const models:Record<string,ScreenModel>={
  table:gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false}),
  waiting:lobbyScreen({...room,phase:'waiting',game:undefined},user),
  account:document({kind:'account',user,activeTab:'stats',stats:d.stats as Statistics}),
  history:document({kind:'account',user,activeTab:'history',games:Array.from({length:20},(_,i)=>({...d.summary,id:'history-'+i}))}),
  friends:document({kind:'friends',modal:true,user,friendTab:'friends',friends:Array.from({length:20},(_,i)=>({...d.friends[0]!,id:'friend-'+i,avatar:'moon' as const,status:'accepted',nickname:'仙友'+i}))}),
  presets:document({kind:'presets',user,presets:Array.from({length:10},(_,i)=>({...d.presets[0]!,id:'preset-'+i}))}),
  profile:document({kind:'account',modal:true,user,profileEditing:true,profileDraft:{nickname:user.nickname,avatar:'leaf'}}),
  chat:document({kind:'chat',modal:true,user,activeTab:'roomchat',messages:Array.from({length:30},(_,i)=>({id:'message-'+i,text:'传音内容与投票建议 '+i,name:'仙友'+i,self:!!(i%2)}))}),
  settings:{title:'玩法配置',rows:[],web:{page:'setup',settings:room.settings,document:{kind:'settings',activeTab:'setup',settings:room.settings}}},
  tools:{title:'房间操作',rows:Array.from({length:12},(_,i)=>({id:'tool:'+i,text:'操作选项 '+i})),web:{page:'sheet',document:{kind:'tools',modal:true}}},
  join:joinScreen(user,'123456',false),
 };
 return {models,user,room,d,document};
}

test('core page cached scroll geometry matches direct layout across narrow and tall safe viewports',()=>{
 const {models}=fixtures();
 for(const v of [{width:320,height:568,top:88,bottom:34},{width:390,height:844,top:88,bottom:34},{width:430,height:956,top:96,bottom:34}])for(const [name,model] of Object.entries(models)){
  assert.equal(hasLinearScrollGeometry(model),true,name);
  let calls=0;const cached=createScrollLayoutCache((m,view)=>{calls++;return layoutWebScreen(m,view);});
  cached(model,v);
  for(const scroll of [0,7,60,200,999999])assert.deepEqual(rounded(cached({...model,scroll},v,0,true)),rounded(layoutWebScreen({...model,scroll},v)),`${name} at ${v.width}, scroll ${scroll}`);
  assert.equal(calls,1,`${name} must reuse content geometry during scroll`);
 }
});

test('content, font, viewport and horizontal offset changes invalidate core geometry correctly',()=>{
 const {models}=fixtures(),v={width:390,height:844,top:88,bottom:34};let calls=0;
 const cached=createScrollLayoutCache((m,view)=>{calls++;return layoutWebScreen(m,view);});
 const first=models.friends!;cached(first,v);cached({...first,scroll:90},v,0,true);assert.equal(calls,1);
 const changed={...first,web:{...first.web!,document:{...first.web!.document!,friendQuery:'仙友1'}}};
 assert.deepEqual(cached(changed,v),layoutWebScreen(changed,v));assert.equal(calls,2);
 assert.deepEqual(cached(changed,v,1,true),layoutWebScreen(changed,v));assert.equal(calls,3,'font revision invalidates even while reusing scroll content');
 const small={...v,width:320,height:568};assert.deepEqual(cached(changed,small,1,true),layoutWebScreen(changed,small));assert.equal(calls,4);
 const shifted={...changed,horizontalScroll:90};assert.deepEqual(cached(shifted,small,1),layoutWebScreen(shifted,small));assert.equal(calls,5);
});

test('sticky round histories, replay headers and menus anchored to scrolling fields use direct layout',()=>{
 const {models,room,user,d,document}=fixtures();
 const cases=[gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false,overlay:'history'}),document({kind:'replay',replay:d.replay}),{...models.settings!,web:{...models.settings!.web!,document:{...models.settings!.web!.document!,settingChoice:{id:'captainMode',key:'captainMode' as const,value:'seat_order'}}}}];
 const v={width:390,height:844,top:88,bottom:34};
 for(const model of cases){assert.equal(hasLinearScrollGeometry(model),false);let calls=0;const cached=createScrollLayoutCache((m,view)=>{calls++;return layoutWebScreen(m,view);});for(const scroll of [0,14,100,999999])assert.deepEqual(cached({...model,scroll},v,0,true),layoutWebScreen({...model,scroll},v));assert.equal(calls,4);}
});

type PaintEvent={context:number;op:string;args:unknown[]};
function recordingCanvas(){
 const events:PaintEvent[]=[],canvases:HTMLCanvasElement[]=[];
 const factory=()=>{
  const id=canvases.length;
  const target:Record<string,unknown>={font:'14px sans-serif',strokeStyle:'#000000',globalAlpha:1};
  const ctx=new Proxy(target,{get(obj,key:string){if(key in obj)return obj[key];return (...args:unknown[])=>{events.push({context:id,op:key,args});if(key==='measureText')return {width:String(args[0]).length*7};if(key==='createLinearGradient'||key==='createRadialGradient')return {addColorStop(){}};if(key==='getImageData')return {data:new Uint8ClampedArray(Number(args[2])*Number(args[3])*4)};};}});
  const canvas={width:780,height:1688,getContext:()=>ctx} as unknown as HTMLCanvasElement;target.canvas=canvas;canvases.push(canvas);return canvas;
 };
 return {events,canvases,factory};
}

test('warm body rasters reuse text but content, fonts and artwork revisions repaint fresh text',()=>{
 const {models}=fixtures(),v={width:390,height:844,top:88,bottom:34},record=recordingCanvas(),canvas=record.factory();setBackdropCanvasFactory(record.factory);
 const model:ScreenModel={...models.tools!,rows:[{id:'guide:marker',text:'OLD_MARKER'},...models.tools!.rows]};
 const art:Artwork={get:()=>undefined,revision:1} as Artwork;
 renderScreen(model,canvas,v,art);record.events.length=0;
 renderScreen({...model,scroll:1},canvas,v,art);
 assert.ok(!record.events.some(e=>e.context>0&&e.op==='fillText'),'warm strips do not rasterize text again');
 const changed={...model,rows:model.rows.map(r=>r.id==='guide:marker'?{...r,text:'NEW_MARKER'}:r)};
 record.events.length=0;renderScreen(changed,canvas,v,art);
 assert.ok(record.events.some(e=>e.context>0&&e.op==='fillText'&&e.args[0]==='NEW_MARKER'));
 assert.ok(!record.events.some(e=>e.context>0&&e.op==='fillText'&&e.args[0]==='OLD_MARKER'));
 record.events.length=0;setWebFonts({sans:'CoreCacheTestSans'});renderScreen(changed,canvas,v,art);assert.ok(record.events.some(e=>e.context>0&&e.op==='fillText'));
 record.events.length=0;renderScreen(changed,canvas,v,{...art,revision:2});assert.ok(record.events.some(e=>e.context>0&&e.op==='fillText'));
});

test('rasterized modal body stays above its frame and fixed controls retain direct hit bounds',()=>{
 const {models}=fixtures(),v:SafeViewport={width:390,height:844,top:88,bottom:34},record=recordingCanvas(),canvas=record.factory();setBackdropCanvasFactory(record.factory);
 const model=models.friends!,layout=layoutWebScreen(model,v),hits=renderScreen(model,canvas,v,undefined,layout);
 const bodyImage=record.events.findIndex(e=>e.context===0&&e.op==='drawImage'&&record.canvases.indexOf(e.args[0] as HTMLCanvasElement)>1);
 assert.ok(bodyImage>0);
 assert.ok(record.events.slice(0,bodyImage).some(e=>e.context===0&&e.op==='fill'),'modal frame is painted before body strip');
 const fixed=layout.nodes.filter(n=>n.fixed&&n.kind==='button'&&!n.disabled);
 for(const n of fixed){const hit=hits.find(h=>h.id===n.id);assert.ok(hit,n.id);assert.ok(hit.y>=v.top,n.id);assert.ok(hit.x>=0&&hit.x+hit.width<=v.width,n.id);}
 const old=record.canvases.slice(2);renderScreen({title:'Replay',rows:[],web:{page:'sheet',document:{kind:'replay'}}},canvas,v);
 assert.ok(old.some(c=>c.width===1&&c.height===1),'leaving a cached surface releases its strips');
});
