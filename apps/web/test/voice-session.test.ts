import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {VoiceSession} from '../src/voice-session';

function deferred<T>(){
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>resolve=done);
  return {promise,resolve};
}
const token={appId:'test',channel:'room-a',uid:1,token:'temporary-test-token'};
function setup(){
  const calls={tokens:[] as string[],joined:[] as typeof token[],gestures:[] as boolean[],leaves:0,errors:[] as unknown[]};
  let result:'ready'|'interaction'|'reconnect'='ready';
  const manager={
    async join(config:typeof token){calls.joined.push(config);},
    async leave(){calls.leaves++;},
    async recover(gesture=false){calls.gestures.push(gesture);return result;},
    getState(){return {} as any;},
  };
  const session=new VoiceSession(manager,async room=>{calls.tokens.push(room);return token;},error=>calls.errors.push(error));
  return {session,manager,calls,setResult:(next:typeof result)=>{result=next;}};
}

test('foreground events never enable voice before an explicit join or after an explicit leave',async()=>{
  const h=setup();await h.session.resume();assert.equal(h.calls.tokens.length,0);assert.deepEqual(h.calls.gestures,[]);
  await h.session.start('room-a');await h.session.leave();await h.session.resume(true);
  assert.equal(h.calls.tokens.length,1);assert.deepEqual(h.calls.gestures,[]);
});

test('audio recovery and click-to-play do not fetch another token or join a healthy channel again',async()=>{
  const h=setup();await h.session.start('room-a');await h.session.resume();h.setResult('interaction');await h.session.resume(true);
  assert.deepEqual(h.calls.gestures,[false,true]);assert.equal(h.calls.tokens.length,1);assert.equal(h.calls.joined.length,1);
});

test('a disconnected channel obtains a fresh token once across simultaneous resume events',async()=>{
  const h=setup();await h.session.start('room-a');h.setResult('reconnect');
  const first=h.session.resume(),second=h.session.resume();assert.equal(first,second);await first;
  assert.equal(h.calls.tokens.length,2);assert.equal(h.calls.joined.length,2);
});

test('leaving while a foreground check is pending cannot restart a room',async()=>{
  const h=setup(),pending=deferred<'reconnect'>();await h.session.start('room-a');
  h.manager.recover=()=>pending.promise;
  const recovering=h.session.resume();await h.session.leave();pending.resolve('reconnect');await recovering;
  assert.equal(h.calls.tokens.length,1);assert.equal(h.calls.joined.length,1);
});

test('duplicate joins share token lookup and a late token after leaving never joins',async()=>{
  const pending=deferred<typeof token>();let fetches=0,joins=0;
  const session=new VoiceSession({async join(){joins++;},async leave(){},async recover(){return 'ready';},getState(){return {} as any;}},
    ()=>{fetches++;return pending.promise;},()=>{});
  const first=session.start('room-a'),second=session.start('room-a');assert.equal(first,second);assert.equal(fetches,1);
  await session.leave();pending.resolve(token);await first;assert.equal(joins,0);
});

test('switching rooms ignores the old room token and its delayed errors',async()=>{
  const old=deferred<typeof token>();const h=setup();let calls=0;
  const session=new VoiceSession(h.manager,()=>++calls===1?old.promise:Promise.resolve({...token,channel:'room-b'}),error=>h.calls.errors.push(error));
  const first=session.start('room-a');await session.leave();await session.start('room-b');old.resolve(token);await first;await setImmediate();
  assert.deepEqual(h.calls.joined.map(config=>config.channel),['room-b']);assert.deepEqual(h.calls.errors,[]);
});
