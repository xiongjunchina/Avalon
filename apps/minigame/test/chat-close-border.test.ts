import {test} from 'node:test';import assert from 'node:assert/strict';
import {PlayerPanel} from '../src/screens/player-panel.js';import {layoutWebScreen} from '../src/ui/web-layout.js';import {strokeWithoutGold} from '../src/ui/web-render.js';
test('room chat close dispatches the panel back action',async()=>{
 const p=new PlayerPanel({} as any,{id:'u',nickname:'玩家'});await p.open('roomchat',{roomId:'r'});
 const model=p.model(),layout=layoutWebScreen(model,{width:390,height:844,top:88,bottom:34});
 const close=layout.nodes.find(n=>n.skin==='chat-close')!;assert.equal(close.id,'back');assert.equal(await p.handle(close.id,async()=>undefined),'back');
});
test('gold strokes disappear but red, blue and selected cyan still draw',()=>{
 for(const [color,expected] of [['#d4a359',0],['#ffd875',0],['rgba(212,163,89,0.5)',0],['#38bdf8',1],['#f87171',1],['#79f2ff',1]] as const){let calls=0;strokeWithoutGold({strokeStyle:color,stroke:()=>calls++} as any);assert.equal(calls,expected,color);}
});
