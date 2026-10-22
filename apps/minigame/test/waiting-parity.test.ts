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
