import {lobbyScreen} from '../src/screens/lobby.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeVoice} from '../src/platform/native-voice.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';

test('voice join is visible before music settings without scrolling on short phones',()=>{
 const voice=new NativeVoice({},async()=>({} as any),()=>{});voice.syncRoom('test-room',5);
 for(const width of [320,390,430]){
  const layout=layoutWebScreen({title:'声音设置',rows:voice.rows(),web:{page:'sheet',document:{kind:'sound',modal:true,soundPreferences:{music:true,effects:true}}}}, {width,height:568,top:88,bottom:34});
  const join=layout.nodes.find(n=>n.id==='voice:join')!;
  assert.ok(join,'voice join exists');
  assert.ok(join.y>=layout.contentTop && join.y+join.height<=layout.contentBottom,'join must be fully visible without scrolling');
 }
});

import {parityFixture} from '../scripts/parity-fixture.js';
import {gameScreen} from '../src/screens/game.js';
test('room voice controls are directly reachable in the game without opening sound settings',()=>{
 const {room,user}=parityFixture('game');
 for(const joined of [false,true])for(const width of [320,390,430]){
  const model=gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false});
  model.web!.voice={joined,connecting:false,muted:true,deafened:false,members:2,speakers:1};
  const layout=layoutWebScreen(model,{width,height:700,top:88,bottom:34});
  for(const id of joined?['voice:microphone','voice:speaker','voice:leave']:['voice:join']){
   const n=layout.nodes.find(n=>n.id===id)!;assert.ok(n);assert.ok(n.y>=88&&n.y+n.height<666);assert.ok(n.x>=0&&n.x+n.width<=width);
  }
 }
});

test('waiting room voice rows do not overlap settings or waiting ribbon',()=>{
 const {room,user}=parityFixture();room.game=undefined as any;
 for(const joined of [false,true]){
 const model=lobbyScreen(room,user);model.web!.voice={joined,connecting:false,muted:true,deafened:false,members:2,speakers:0};
 const {nodes}=layoutWebScreen(model,{width:390,height:844,top:88,bottom:34});
 const settings=nodes.find(n=>n.id==='settings')!,ribbon=nodes.find(n=>n.id==='ribbon')!;
 for(const n of nodes.filter(n=>n.id.startsWith('voice:')||n.id==='voice-members')){
 if(n.y<ribbon.y){assert.ok(n.y>=settings.y+settings.height);assert.ok(n.y+n.height<=ribbon.y);}
 }
 }
});

test('waiting room has exactly one voice entry and no duplicate microphone control',()=>{
 const {room,user}=parityFixture();room.game=undefined as any;
 for(const joined of [false,true])for(const width of [320,390,430]){
 const model=lobbyScreen(room,user);model.web!.voice={joined,connecting:false,muted:false,deafened:false,members:2,speakers:1};
 const {nodes}=layoutWebScreen(model,{width,height:844,top:88,bottom:34});
 assert.equal(nodes.filter(n=>n.id===(joined?'voice:microphone':'voice:join')).length,1);
 }
});

test('waiting and active game seats display per-player speech instead of a shared count',()=>{
 const {room,user}=parityFixture();
 for(const waiting of [true,false]){
 const active=waiting?{...room,game:undefined}:room,model=waiting?lobbyScreen(active as any,user):gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false});
 const other=room.members.find(m=>m.id!==user.id)!;
 model.web!.voice={joined:true,connecting:false,muted:true,deafened:false,members:2,speakers:1,players:{[user.id]:'live',[other.id]:'speaking'}};
 const {nodes}=layoutWebScreen(model,{width:390,height:844,top:88,bottom:34});
 assert.equal(nodes.find(n=>n.id===(waiting?'member:':'player:')+user.id)!.micState,'muted');
 assert.equal(nodes.find(n=>n.id===(waiting?'member:':'player:')+other.id)!.micState,'speaking');
 assert.ok(nodes.filter(n=>n.micState==='speaking').length===1);
 }
});
