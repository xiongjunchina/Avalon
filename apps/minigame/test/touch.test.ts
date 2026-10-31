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
