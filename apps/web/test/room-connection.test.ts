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
function setup(fetchRoom:()=>Promise<{room:RoomView;invite:string}>=async()=>({room,invite:'test'})) {
  const sockets:FakeSocket[]=[],state={busy:false,status:'',errors:[] as string[],ended:[] as string[],versions:[] as number[]};
  const transport=new RoomConnection({fetchRoom,retryDelay:100000,
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
  f.transport.reconnect();await flush();assert.equal(f.sockets.length,2);f.sockets[1].open();f.sockets[1].message({type:'roomClosed'});await flush();f.transport.resume();assert.equal(f.sockets.length,2);assert.deepEqual(f.state.ended,['closed']);
  const g=setup(async()=>{throw new Error('UNAUTHENTICATED');});g.transport.start();await flush();assert.deepEqual(g.state.ended,['expired']);g.transport.resume();assert.equal(g.sockets.length,0);g.transport.stop();
});
