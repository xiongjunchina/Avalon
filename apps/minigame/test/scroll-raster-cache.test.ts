import {test} from 'node:test';import assert from 'node:assert/strict';
import {ScrollRasterCache} from '../src/ui/scroll-raster-cache.js';

test('guide raster reuses native-resolution strips and bounds retained memory',()=>{
 let paints=0,blits=0;const buffers:any[]=[];
 const context=()=>({save(){},restore(){},beginPath(){},rect(){},clip(){},scale(){},translate(){},drawImage(){blits++;}});
 const target=context() as any,factory=()=>{const ctx=context(),canvas={width:0,height:0,getContext:()=>ctx};buffers.push(canvas);return canvas as any;};
 const cache=new ScrollRasterCache(),nodes=[{id:'long',kind:'panel' as const,text:'',x:0,y:0,width:390,height:20000}];
 const draw=(scroll:number,key='same')=>cache.draw(target,{key,width:390,ratio:3,scroll,top:88,bottom:810,nodes:nodes.map(n=>({...n,y:n.y-scroll})),factory,paint:()=>paints++});
 assert.equal(draw(0),true);const first=paints;assert.ok(first>=3);assert.equal(buffers[0].width,1170,'keep native DPR');
 draw(1);assert.equal(paints,first,'scroll within cached tiles must not issue document text/path painting');
 for(let i=1;i<40;i++)draw(i*256);assert.ok(cache.size<=6);assert.ok(buffers.some(b=>b.width===1),'eviction releases textures');
 const prior=paints;draw(0,'changed-content');assert.ok(paints>prior);cache.clear();assert.equal(cache.size,0);assert.ok(blits>100);
});
