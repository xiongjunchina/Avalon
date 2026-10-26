import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RoomConnection } from '../src/room-connection.js';
import { defaultSettings, type RoomView, type Command, type ServerMessage } from '@avalon/contracts';
class FakeSocket {
  readyState=0; sent:Command[]=[];
  onopen:(()=>void)|null=null;onclose:((e:{code:number})=>void)|null=null;
  onmessage:((e:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;
  open(){this.readyState=1;this.onopen?.();}
  message(m:ServerMessage){this.onmessage?.({data:JSON.stringify(m)});}
  send(body:string){this.sent.push(JSON.parse(body));}
  close(code=1000){if(this.readyState===3)return;this.readyState=3;queueMicrotask(()=>this.onclose?.({code}));}
}
const room:RoomView={id:randomUUID(),code:'ABC',hostId:'host',version:1,phase:'waiting',settings:defaultSettings,members:[],acceptingNewMembers:true};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function setup(fetchRoom:()=>Promise<{room:RoomView;invite:string}>=async()=>({room,invite:'test'}), options: {syncIntervalMs?:number;responseTimeoutMs?:number} = {}) {
  const sockets:FakeSocket[]=[],state={busy:false,status:'',errors:[] as string[],ended:[] as string[],versions:[] as number[]};
  const transport=new RoomConnection({fetchRoom,retryDelay:100000,...options,
    socket:()=>{const s=new FakeSocket();sockets.push(s);return s as unknown as WebSocket;},
    handlers:{snapshot:r=>state.versions.push(r.version),invite:()=>{},busy:v=>state.busy=v,status:v=>state.status=v,error:e=>state.errors.push(e),ended:e=>state.ended.push(e)},
  });return {transport,sockets,state};
}
const action=(version=1):Command=>({type:'setReady',payload:{ready:true},commandId:randomUUID(),expectedVersion:version});

test('simultaneous resume events create one connection; disposed attempts never open late sockets',async t=>{
  let resolve!:(v:{room:RoomView;invite:string})=>void;
  let requests=0;
  const f=setup(()=>{requests++;return new Promise(r=>resolve=r);});t.after(()=>f.transport.stop());
  f.transport.start();f.transport.resume();f.transport.resume();assert.equal(requests,1);
  resolve({room,invite:'test'});await flush();assert.equal(f.sockets.length,1);
  f.sockets[0].open();f.transport.resume();assert.equal(requests,1);
  const g=setup(()=>new Promise(r=>resolve=r));g.transport.start();g.transport.stop();resolve({room,invite:'test'});await flush();assert.equal(g.sockets.length,0);
});

test('returning to a still-open mobile socket requests a fresh roster and detects a half-open connection',async t=>{
  const f=setup(undefined,{syncIntervalMs:100000,responseTimeoutMs:15});t.after(()=>f.transport.stop());
  f.transport.start();await flush();const first=f.sockets[0];first.open();first.message({type:'snapshot',room});
  f.transport.resume();
  assert.deepEqual(first.sent,[{type:'sync'}]);
  first.message({type:'snapshot',room:{...room,version:2}});
  assert.equal(f.state.versions.at(-1),2);
  f.transport.resume(); // This socket still says OPEN, but the network never delivers the reply.
  await new Promise(resolve=>setTimeout(resolve,35));
  await flush();
  assert.equal(first.readyState,3);
  f.transport.resume();await flush();
  assert.equal(f.sockets.length,2);
});

test('socket handshake cannot remain stuck connecting indefinitely',async t=>{
  const f=setup(undefined,{responseTimeoutMs:15});t.after(()=>f.transport.stop());
  f.transport.start();await flush();const socket=f.sockets[0];
  await new Promise(resolve=>setTimeout(resolve,35));await flush();
  assert.equal(socket.readyState,3);
  f.transport.resume();await flush();assert.equal(f.sockets.length,2);
});

test('periodic roster sync recovers missed broadcasts without requiring a game action',async t=>{
  const f=setup(undefined,{syncIntervalMs:10,responseTimeoutMs:100000});t.after(()=>f.transport.stop());
  f.transport.start();await flush();const socket=f.sockets[0];socket.open();socket.message({type:'snapshot',room});
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.deepEqual(socket.sent,[{type:'sync'}]);
});

test('a roster without the authenticated player cannot be displayed as their room',async t=>{
  let displayed=false,ended='';
  const transport=new RoomConnection({userId:'道友辉',fetchRoom:async()=>({room,invite:'test'}),
    socket:()=>{throw Error('must not open a socket for another identity');},
    handlers:{snapshot:()=>{displayed=true;},invite:()=>{},status:()=>{},error:()=>{},busy:()=>{},ended:reason=>{ended=reason;}},
  });
  t.after(()=>transport.stop());transport.start();await flush();
  assert.equal(displayed,false);assert.equal(ended,'left');
});

test('old receipts cannot clear a newer command; reconnect resends the same command id',async t=>{
  const f=setup();t.after(()=>f.transport.stop());f.transport.start();await flush();const a=f.sockets[0];a.open();a.message({type:'snapshot',room});
  const first=action();assert.equal(f.transport.send(first),true);
  a.message({type:'commandResult',commandId:first.commandId,ok:true});assert.equal(f.state.busy,false);
  const second=action(2);f.transport.send(second);a.message({type:'commandResult',commandId:first.commandId,ok:true});assert.equal(f.state.busy,true);
  a.close(1006);await flush();f.transport.resume();await flush();const b=f.sockets[1];b.open();b.message({type:'snapshot',room:{...room,version:3}});
  assert.deepEqual(b.sent,[second]);b.message({type:'commandResult',commandId:second.commandId,ok:true});assert.equal(f.state.busy,false);
  b.message({type:'snapshot',room:{...room,version:2}});assert.equal(f.state.versions.at(-1),3);
});

test('taken-over page never auto-reconnects; manual reconnect is explicit; terminal errors stop retries',async t=>{
  const f=setup();t.after(()=>f.transport.stop());f.transport.start();await flush();f.sockets[0].open();
  f.sockets[0].message({type:'takenOver'});f.sockets[0].close(4001);await flush();f.transport.resume();await flush();assert.equal(f.sockets.length,1);
  f.sockets[0].message({type:'snapshot',room:{...room,version:9}});assert.equal(f.state.status,'其他页面已接管');
  f.transport.reconnect();await flush();assert.equal(f.sockets.length,2);f.sockets[1].open();f.sockets[1].message({type:'roomClosed'});await flush();f.transport.resume();assert.equal(f.sockets.length,2);assert.deepEqual(f.state.ended,['closed']);
  const g=setup(async()=>{throw new Error('UNAUTHENTICATED');});g.transport.start();await flush();assert.deepEqual(g.state.ended,['expired']);g.transport.resume();assert.equal(g.sockets.length,0);g.transport.stop();
});

test('roomChat and directChat messages are dispatched to handlers without mutating state', async t => {
  const roomChats: any[] = [];
  const directChats: any[] = [];
  const sockets: FakeSocket[] = [];
  const transport = new RoomConnection({
    fetchRoom: async () => ({ room, invite: 'test' }),
    retryDelay: 100000,
    socket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
    handlers: {
      snapshot: () => {},
      invite: () => {},
      busy: () => {},
      status: () => {},
      error: () => {},
      ended: () => {},
      roomChat: msg => roomChats.push(msg),
      directChat: msg => directChats.push(msg),
    },
  });
  t.after(() => transport.stop());
  transport.start();
  await flush();
  const sock = sockets[0];
  sock.open();

  sock.message({
    type: 'roomChat',
    messageId: 'msg-1',
    fromUserId: 'u1',
    seat: 2,
    nickname: '孙悟空',
    text: '我是好人',
    timestamp: '2026-10-20T12:00:00Z',
  });
  assert.equal(roomChats.length, 1);
  assert.equal(roomChats[0].text, '我是好人');
  assert.equal(roomChats[0].seat, 2);

  sock.message({
    type: 'directChat',
    messageId: 'dir-1',
    fromUser: { id: 'u2', nickname: '猪八戒' },
    text: '来开黑吗',
    timestamp: '2026-10-20T12:01:00Z',
  });
  assert.equal(directChats.length, 1);
  assert.equal(directChats[0].text, '来开黑吗');
  assert.equal(directChats[0].fromUser.nickname, '猪八戒');
});

