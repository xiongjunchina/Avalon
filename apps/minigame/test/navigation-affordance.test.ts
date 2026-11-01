import {test} from 'node:test';import assert from 'node:assert/strict';import {navigationHitArea} from '../src/ui/web-render.js';
test('small close and back controls retain actions with at least 44px touch targets',()=>{
 for(const text of ['关闭','返回法坛','‹']){const n=navigationHitArea({id:'back',kind:'button',text,x:270,y:100,width:32,height:30},{width:320,height:568,top:88,bottom:34});assert.equal(n.id,'back');assert.ok(n.width>=44&&n.height>=44);assert.ok(n.x>=0&&n.x+n.width<=320);}
});
