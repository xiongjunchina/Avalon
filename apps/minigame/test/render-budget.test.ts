import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderScreen} from '../src/ui/widgets.js';
import {guideScreen} from '../src/screens/guide.js';
test('long guide does not rasterize text below the visible scroll window',()=>{
 const labels:string[]=[];
 const ctx=new Proxy({}, {get:(_,name)=>name==='measureText'?(s:string)=>({width:s.length*10}):name==='createLinearGradient'||name==='createRadialGradient'?()=>({addColorStop(){}}):(...args:unknown[])=>{if(name==='fillText')labels.push(String(args[0]));}});
 const canvas={getContext:()=>ctx} as unknown as HTMLCanvasElement;
 renderScreen(guideScreen(undefined,'rules'),canvas,{width:390,height:844,top:0,bottom:0});
 assert.ok(labels.length<90,`painted ${labels.length} text runs for one screen`);
});
