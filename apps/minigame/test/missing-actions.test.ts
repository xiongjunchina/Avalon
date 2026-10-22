import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PlayerPanel} from '../src/screens/player-panel.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
import {parityFixture,parityPlayerData} from '../scripts/parity-fixture.js';
import type {PlayerExtras} from '../src/screens/player-extras.js';
const viewport={width:390,height:844,top:88,bottom:34};
test('account has a reachable admin entry, not just a hidden action row',async()=>{
 const d=parityPlayerData(),{user}=parityFixture();
 const panel=new PlayerPanel({statistics:async()=>d.stats} as PlayerExtras,user);await panel.open('account');
 const model=panel.model(), layout=layoutWebScreen(model,viewport);
 const end=layoutWebScreen({...model,scroll:layout.maxScroll},viewport);
 const admin=end.nodes.find(n=>n.id==='admin');assert.ok(admin);assert.ok(admin.y>=viewport.top&&admin.y+admin.height<=810);
});
test('friends list exposes and executes room invitations without opening private chat',async()=>{
 const d=parityPlayerData(),{user}=parityFixture();const invited:string[]=[];
 const panel=new PlayerPanel({friends:async()=>({friends:d.friends}),invite:async(roomId:string,id:string)=>{invited.push(roomId+':'+id);return {online:true};}} as unknown as PlayerExtras,user);
 await panel.open('friends',{roomId:'room-1'});await panel.handle('friendTab:friends',async()=>undefined);
 const friend=d.friends.find(f=>f.status==='accepted')!;
 assert.ok(layoutWebScreen(panel.model(),viewport).nodes.some(n=>n.id==='inviteFriend:'+friend.id));
 assert.ok(layoutWebScreen(panel.model(),viewport).nodes.some(n=>n.id==='refresh:friends'));
 await panel.handle('inviteFriend:'+friend.id,async()=>undefined);assert.deepEqual(invited,['room-1:'+friend.id]);
});
test('long account names do not grow through the help text or copy control',async()=>{
 const d=parityPlayerData(),{user}=parityFixture();user.nickname='这是一个很长的仙友尊号';
 const panel=new PlayerPanel({statistics:async()=>d.stats} as PlayerExtras,user);await panel.open('account');
 const nodes=layoutWebScreen(panel.model(),viewport).nodes;
 const name=nodes.find(n=>n.id==='account-name')!,help=nodes.find(n=>n.id==='account-help')!,copy=nodes.find(n=>n.id==='copyCode')!;
 assert.ok(name.y+name.height<=help.y);assert.ok(name.x+name.width<=copy.x||name.y+name.height<=copy.y);
});
