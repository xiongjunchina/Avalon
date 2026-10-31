import {test} from 'node:test';import assert from 'node:assert/strict';
import {parityFixture} from '../scripts/parity-fixture.js';import {lobbyScreen} from '../src/screens/lobby.js';import {layoutWebScreen} from '../src/ui/web-layout.js';
test('waiting room uses ready-seat grid and only offers deal when everyone is ready',()=>{
 const fixture=parityFixture();const user=fixture.user;const room:import('@avalon/contracts').RoomView={...fixture.room,game:undefined,phase:'waiting'};room.members.forEach(m=>m.ready=true);
 const v={width:390,height:844,top:0,bottom:0};
 let layout=layoutWebScreen(lobbyScreen(room,user),v);
 assert.equal(layout.nodes.some(n=>n.kind==='altar'),false);
 assert.equal(layout.nodes.filter(n=>n.skin==='waiting-seat').length,6);
 assert.ok(layout.nodes.some(n=>n.id==='start'&&!n.disabled));
 room.members[1].ready=false;layout=layoutWebScreen(lobbyScreen(room,user),v);
 assert.equal(layout.nodes.some(n=>n.id==='start'&&!n.disabled),false);
 assert.ok(layout.nodes.some(n=>n.id==='practice'));
});
test('ready and deal remain visible above the safe area while the room scrolls',()=>{
 const fixture=parityFixture();const room:import('@avalon/contracts').RoomView={...fixture.room,game:undefined,phase:'waiting'};room.members.forEach(m=>m.ready=true);
 for(const height of [667,844])for(const scroll of [0,10000]){
  const v={width:390,height,top:92,bottom:34};const layout=layoutWebScreen({...lobbyScreen(room,fixture.user),scroll},v);
  for(const id of ['ready','start']){const n=layout.nodes.find(n=>n.id===id)!;assert.ok(n.y>=v.top&&n.y+n.height<=height-v.bottom,`${id} must be fully visible`);}
  const dock=layout.nodes.find(n=>n.id==='action-dock')!;
  if(dock.fixed)assert.ok(layout.contentBottom<=dock.y,'scrolling content must not cover the pinned action dock');
 }
});
