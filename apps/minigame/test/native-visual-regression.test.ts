import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entryScreen} from '../src/screens/entry.js';
import {lobbyScreen} from '../src/screens/lobby.js';
import {gameScreen} from '../src/screens/game.js';
import {settingsScreen} from '../src/screens/settings.js';
import {parityFixture} from '../scripts/parity-fixture.js';
import {layoutWebScreen,type WebNode} from '../src/ui/web-layout.js';
import {renderScreen,type ScreenModel} from '../src/ui/widgets.js';
import type {SafeViewport} from '../src/ui/layout.js';
import type {Artwork} from '../src/ui/assets.js';

function recordingCanvas(){
 const images:unknown[][]=[],labels:string[]=[],fills:{x:number;y:number;width:number;height:number}[]=[];
 let points:number[][]=[];
 const methods={
  measureText:(text:string)=>({width:Array.from(text).length*10}),
  createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
  drawImage:(...args:unknown[])=>images.push(args),fillText:(text:string)=>labels.push(text),
  beginPath:()=>{points=[];},moveTo:(x:number,y:number)=>points.push([x,y]),lineTo:(x:number,y:number)=>points.push([x,y]),
  arc:(x:number,y:number,r:number)=>points.push([x-r,y-r],[x+r,y+r]),
  fill:()=>{if(points.length){const xs=points.map(p=>p[0]!),ys=points.map(p=>p[1]!);fills.push({x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});}},
 };
 const ctx=new Proxy(methods,{get:(target,key)=>target[key as keyof typeof methods]??(()=>{})});
 const canvas={getContext:()=>ctx} as unknown as HTMLCanvasElement;
 return {canvas,images,labels,fills};
}

test('tall native home retains both image edges and undistorted monkey portraits',()=>{
 const img={width:640,height:1280},artwork={get:(path:string)=>path==='home/duel-mobile.jpg'?img:undefined} as Artwork;
 for(const [width,height] of [[320,568],[390,844],[390,915],[430,932]]){
  const viewport={width:width!,height:height!,top:88,bottom:34},model=entryScreen({id:'u',nickname:'行者'});
  const layout=layoutWebScreen(model,viewport),duel=layout.nodes.find(n=>n.id==='home-duel')!;
  const recorded=recordingCanvas();
  renderScreen(model,recorded.canvas,viewport,artwork,{...layout,nodes:[duel]});
  assert.equal(recorded.images.length,3);
  for(const call of recorded.images){assert.equal(call[1],0);assert.equal(call[3],640);assert.equal(call[5],0);assert.equal(call[7],width);}
  const portrait=recorded.images[1]!;
  assert.equal(portrait[2],192);assert.equal(portrait[4],640);
  assert.equal(Number(portrait[7])/640,Number(portrait[8])/640,'portrait proportions must not change');
  assert.equal(recorded.images[0]![6],0);
  assert.ok(Math.abs(Number(recorded.images[2]![6])+Number(recorded.images[2]![8])-height!)<.001);
 }
});

test('home sound setting is an icon-only square with a state label retained for interaction metadata',()=>{
 for(const width of [320,390,430])for(const enabled of [false,true]){
  const model=entryScreen({id:'u',nickname:'行者'});model.web!.soundPreferences={music:enabled,effects:false};
  const viewport={width,height:844,top:88,bottom:34},layout=layoutWebScreen(model,viewport),sound=layout.nodes.find(n=>n.id==='sound')!;
  assert.equal(sound.width,sound.height);
  assert.equal(sound.text,enabled?'声音已开':'已静音');
  const recorded=recordingCanvas();renderScreen(model,recorded.canvas,viewport,undefined,{...layout,nodes:[sound]});
  assert.deepEqual(recorded.labels,[],'sound state is drawn using speaker arcs/cross, not text');
 }
});

test('back controls paint exactly inside their layout boxes without stretching into the next row',()=>{
 const model:ScreenModel={title:'测试',rows:[],web:{page:'sheet'}};
 for(const [width,height] of [[26,26],[32,32],[38,38],[84,32],[94,48]]){
  const node:WebNode={id:'back',kind:'button',text:width!<55?'‹':'返回法坛',x:16,y:100,width:width!,height:height!,fixed:true};
  const recorded=recordingCanvas();renderScreen(model,recorded.canvas,{width:390,height:844,top:88,bottom:34},undefined,{nodes:[node],maxScroll:0,contentTop:88,contentBottom:810});
  assert.deepEqual(recorded.fills,[{x:node.x,y:node.y,width:node.width,height:node.height}]);
 }
});

test('lobby, live game, practice and setup keep back controls within their core header geometry',()=>{
 const {user,room}=parityFixture('game',10);
 const live=gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false});
 const practice={...live,web:{...live.web!,practice:true}};
 const waiting=lobbyScreen({...room,game:undefined,phase:'waiting'},user);
 for(const width of [320,390,430]){
  const viewport:SafeViewport={width,height:width===320?568:932,top:88,bottom:34};
  for(const model of [waiting,live,practice]){
   const {nodes}=layoutWebScreen(model,viewport),frame=nodes.find(n=>n.id==='table-toolbar-frame')!,back=nodes.find(n=>n.id===(model.web!.practice?'exitPractice':'leave'))!;
   assert.equal(back.width,back.height);
   assert.ok(back.x>=frame.x&&back.x+back.width<=frame.x+frame.width);
   assert.ok(back.y>=frame.y&&back.y+back.height<=frame.y+frame.height);
  }
  const setup=settingsScreen(room.settings);setup.web={page:'setup',document:{kind:'settings',settings:room.settings,activeTab:'setup'}};
  const {nodes}=layoutWebScreen(setup,viewport),back=nodes.find(n=>n.id==='cancelSettings')!,title=nodes.find(n=>n.id==='setup-title')!;
  assert.equal(back.width,38);assert.equal(back.height,38);
  assert.ok(back.x+back.width<title.x,'heading wraps without shrinking the back control');
 }
});
