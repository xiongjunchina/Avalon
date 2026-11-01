import {test} from 'node:test';import assert from 'node:assert/strict';
import {createScrollLayoutCache} from '../src/ui/scroll-layout-cache.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';import {parityFixture} from '../scripts/parity-fixture.js';import {gameScreen} from '../src/screens/game.js';
test('scroll cache matches direct game geometry and invalidates on content/font changes',()=>{
 const {room,user}=parityFixture('game'),model=gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false}),v={width:390,height:568,top:88,bottom:34};let calls=0;
 const cached=createScrollLayoutCache((m,v)=>{calls++;return layoutWebScreen(m,v);});
 for(const scroll of [0,25,100,99999])assert.deepEqual(cached({...model,scroll},v),layoutWebScreen({...model,scroll},v));
 assert.equal(calls,1);cached(model,v,1);assert.equal(calls,2);cached({...model,title:'changed'},v,1);assert.equal(calls,3);
});

test('scroll cache retains sound modal fixed header, frame and clipped body positions',()=>{
 const model:import('../src/ui/widgets.js').ScreenModel={title:'声音设置',rows:Array.from({length:12},(_,i)=>({id:'guide:voice-'+i,text:'测试声音说明'.repeat(8)})),web:{page:'sheet',document:{kind:'sound',modal:true,soundPreferences:{music:true,effects:true}}}};
 const v={width:320,height:568,top:88,bottom:34},cached=createScrollLayoutCache();
 for(const scroll of [0,40,200,9999])assert.deepEqual(cached({...model,scroll},v),layoutWebScreen({...model,scroll},v));
});

import {guideScreen} from '../src/screens/guide.js';
test('long role guide scroll reuses layout while retaining its sticky toolbar',()=>{
 for(const section of ['rules','roles'] as const){
 const model=guideScreen(undefined,section),v={width:390,height:844,top:88,bottom:34};let calls=0;
 const cached=createScrollLayoutCache((m,v)=>{calls++;return layoutWebScreen(m,v);});cached(model,v);
 const rounded=(value:unknown)=>JSON.parse(JSON.stringify(value,(_k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v));
 for(const scroll of [0,7,14,120,1000,999999])assert.deepEqual(rounded(cached({...model,scroll},v,0,true)),rounded(layoutWebScreen({...model,scroll},v)));
 assert.equal(calls,1);
 }
});
