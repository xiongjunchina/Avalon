import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachTouchNavigation} from '../src/ui/touch.js';
import type {WxRuntime} from '../src/platform/wechat.js';
test('drag updates before release and never triggers a button when dragged back',()=>{
 let start:any,move:any,end:any,cancel:any,scroll=0,taps=0;
 const wx={onTouchStart:(f:any)=>start=f,onTouchMove:(f:any)=>move=f,onTouchEnd:(f:any)=>end=f,onTouchCancel:(f:any)=>cancel=f} as WxRuntime;
 attachTouchNavigation(wx,{scrollBy:delta=>scroll+=delta,tap:()=>taps++});
 start({touches:[{clientX:40,clientY:200}]});move({touches:[{clientX:40,clientY:150}]});
 assert.equal(scroll,50);move({touches:[{clientX:40,clientY:200}]});end({changedTouches:[{clientX:40,clientY:200}]});assert.equal(taps,0);
 start({touches:[{clientX:40,clientY:200}]});end({changedTouches:[{clientX:41,clientY:201}]});assert.equal(taps,1);
 start({touches:[{clientX:40,clientY:200}]});cancel();end({changedTouches:[{clientX:40,clientY:200}]});assert.equal(taps,1);
});

test('horizontal chips lock their own axis and never trigger a quick message while swiping',()=>{
 let start:any,move:any,end:any,vertical=0,horizontal=0,taps=0;
 const wx={onTouchStart:(f:any)=>start=f,onTouchMove:(f:any)=>move=f,onTouchEnd:(f:any)=>end=f} as WxRuntime;
 attachTouchNavigation(wx,{scrollBy:d=>vertical+=d,tap:()=>taps++,canScrollHorizontal:(_x,y)=>y>200,scrollHorizontal:d=>horizontal+=d});
 start({touches:[{clientX:200,clientY:240}]});move({touches:[{clientX:120,clientY:245}]});end({changedTouches:[{clientX:100,clientY:248}]});
 assert.equal(horizontal,100);assert.equal(vertical,0);assert.equal(taps,0);
 start({touches:[{clientX:200,clientY:240}]});move({touches:[{clientX:198,clientY:180}]});end({changedTouches:[{clientX:198,clientY:170}]});
 assert.equal(vertical,70);assert.equal(horizontal,100);
});

test('release continues vertical momentum and a new touch cancels it',()=>{
 let start:any,move:any,end:any,scroll=0;const frames:(()=>void)[]=[];
 const runtime={onTouchStart:(f:any)=>start=f,onTouchMove:(f:any)=>move=f,onTouchEnd:(f:any)=>end=f,requestAnimationFrame:(f:()=>void)=>{frames.push(f);return frames.length;}} as WxRuntime;
 attachTouchNavigation(runtime,{scrollBy:d=>{scroll+=d;},tap:()=>assert.fail('drag must not tap')});
 start({touches:[{clientX:40,clientY:200}]});move({touches:[{clientX:40,clientY:140}]});end({changedTouches:[{clientX:40,clientY:140}]});
 assert.equal(frames.length,1);frames.shift()!();assert.ok(scroll>60);
 const before=scroll;start({touches:[{clientX:40,clientY:140}]});frames.shift()!();assert.equal(scroll,before);
});

test('inertia uses global RAF on WeChat and paints inside that frame without another scheduling hop',t=>{
 let start:any,move:any,end:any;const frames:(()=>void)[]=[];const original=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=((f:any)=>{frames.push(f);return frames.length;}) as any;
 t.after(()=>{if(original)globalThis.requestAnimationFrame=original;else delete (globalThis as any).requestAnimationFrame;});
 const inFrames:boolean[]=[];const cancel=attachTouchNavigation({onTouchStart:(f:any)=>start=f,onTouchMove:(f:any)=>move=f,onTouchEnd:(f:any)=>end=f} as WxRuntime,{scrollBy:(_delta,inFrame)=>{inFrames.push(!!inFrame);},tap:()=>assert.fail()});
 start({touches:[{clientX:20,clientY:200}]});move({touches:[{clientX:20,clientY:100}]});end({changedTouches:[{clientX:20,clientY:100}]});
 assert.equal(frames.length,1);frames.shift()!();assert.equal(inFrames.at(-1),true);cancel();
});
