import {test} from 'node:test';import assert from 'node:assert/strict';
import {NativeVoice,type NativeVoiceRuntime} from '../src/platform/native-voice.js';
test('disabled release never registers voice listeners, obtains a ticket or invokes microphone APIs',async()=>{
 let called=false;const forbidden=()=>{called=true;throw Error('unexpected native voice call');};
 const v=new NativeVoice({authorize:forbidden,joinVoIPChat:forbidden,onVoIPChatMembersChanged:forbidden,onVoIPChatSpeakersChanged:forbidden,onVoIPChatInterrupted:forbidden},async()=>{forbidden();return {} as any;},()=>{},false);
 v.syncRoom('r',5);await assert.rejects(v.join(),/不支持实时语音/);assert.equal(called,false);
 assert.equal(v.rows().length,1);assert.match(v.rows()[0].text,/不支持实时语音/);
});
function fixture(){let joins=0,exits=0,muted=true;let members:(e:{openIdList:string[]})=>void=()=>{};const runtime:NativeVoiceRuntime={authorize:o=>o.success(),joinVoIPChat:o=>{joins++;o.success({openIdList:['a']});},exitVoIPChat:o=>{exits++;o.success();},updateVoIPChatMuteConfig:o=>{muted=o.muteMicrophone;o.success();},onVoIPChatMembersChanged:cb=>{members=cb;}};const v=new NativeVoice(runtime,async()=>({groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'}),()=>{});return {v,get joins(){return joins;},get exits(){return exits;},get muted(){return muted;},members:(ids:string[])=>members({openIdList:ids})};}
test('voice starts muted, updates controls and exits when room changes',async()=>{const f=fixture();f.v.syncRoom('r',5);await f.v.join();assert.equal(f.v.joined,true);assert.equal(f.v.microphoneMuted,true);await f.v.toggleMicrophone();assert.equal(f.muted,false);f.members(['a','b']);assert.equal(f.v.members,2);f.v.syncRoom(undefined,0);await new Promise(r=>setTimeout(r,0));assert.equal(f.exits,1);assert.equal(f.v.joined,false);});
test('11 and 12 player games offer whole-room web voice guidance and cannot attempt native voice',async()=>{for(const count of [11,12]){const f=fixture();f.v.syncRoom('r',count);await assert.rejects(f.v.join(),/最多10人/);assert.equal(f.joins,0);assert.ok(!f.v.rows().some(row=>row.id==='voice:join'));assert.match(f.v.rows()[0].text,/全员转到网页版/);}});
test('room departure while ticket is pending does not open microphone or join',async()=>{let done:(v:any)=>void=()=>{},joins=0;const v=new NativeVoice({authorize:o=>o.success(),joinVoIPChat:()=>{joins++;}},()=>new Promise(r=>{done=r;}),()=>{});v.syncRoom('r',5);const p=v.join();await new Promise(r=>setTimeout(r,0));v.syncRoom(undefined,0);done({groupId:'g'});await p;assert.equal(joins,0);assert.equal(v.joined,false);});
test('microphone denial never requests a signature or joins',async()=>{
 let requested=false;const v=new NativeVoice({authorize:o=>o.fail?.({}),joinVoIPChat:()=>{throw Error('must not join');}},async()=>{requested=true;throw Error('must not request');},()=>{});
 v.syncRoom('r',5);await assert.rejects(v.join(),/麦克风/);assert.equal(requested,false);assert.equal(v.joined,false);
});
test('privacy, microphone and ticket failures before native join can be retried without native exit',async()=>{
 for(const stage of ['privacy','microphone','ticket']){
  let fail=true,joins=0,exits=0;
  const v=new NativeVoice({
   requirePrivacyAuthorize:o=>fail&&stage==='privacy'?o.fail?.({errMsg:'privacy denied'}):o.success(),
   authorize:o=>fail&&stage==='microphone'?o.fail?.({errMsg:'microphone denied'}):o.success(),
   joinVoIPChat:o=>{joins++;o.success({});},
   exitVoIPChat:o=>{exits++;o.fail?.({errMsg:'not in room'});},
  },async()=>{if(fail&&stage==='ticket')throw Error('WECHAT_VOICE_IDENTITY');return {groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'};},()=>{});
  v.syncRoom('r',5);await assert.rejects(v.join(),stage==='ticket'?/WECHAT_VOICE_IDENTITY/:/denied/);
  assert.equal(joins,0,stage);assert.equal(exits,0,stage);assert.equal(v.joined,false,stage);
  fail=false;await v.join();assert.equal(joins,1,stage);assert.equal(v.joined,true,stage);assert.equal(v.microphoneMuted,true,stage);
 }
});
test('cancelling before native join does not call exit or lock the next attempt',async()=>{
 let resolveTicket:(ticket:any)=>void=()=>{},first=true,joins=0,exits=0;
 const ticket={groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'};
 const v=new NativeVoice({authorize:o=>o.success(),joinVoIPChat:o=>{joins++;o.success({});},exitVoIPChat:o=>{exits++;o.fail?.({errMsg:'not in room'});}},()=>first?new Promise(resolve=>{resolveTicket=resolve;}):Promise.resolve(ticket),()=>{});
 v.syncRoom('r',5);const joining=v.join();await new Promise(resolve=>setTimeout(resolve,0));
 v.syncRoom(undefined,0);resolveTicket(ticket);await joining;
 assert.equal(joins,0);assert.equal(exits,0);assert.equal(v.joined,false);
 first=false;v.syncRoom('next',5);await v.join();assert.equal(joins,1);assert.equal(v.joined,true);
});
test('a native join failure still requires confirmed exit before retry',async()=>{
 let joins=0,exits=0;
 const v=new NativeVoice({authorize:o=>o.success(),joinVoIPChat:o=>{joins++;o.fail?.({errMsg:'native join failed'});},exitVoIPChat:o=>{exits++;o.fail?.({errMsg:'native exit failed'});}},async()=>({groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'}),()=>{});
 v.syncRoom('r',5);await assert.rejects(v.join(),/native join failed/);
 assert.equal(joins,1);assert.equal(exits,1);await assert.rejects(v.join(),/尚未确认/);assert.equal(joins,1);
});
test('ticket rate limiting keeps its cooldown without creating a native cleanup failure',async t=>{
 t.mock.timers.enable({apis:['Date'],now:1_000});let requests=0,joins=0,exits=0;
 const v=new NativeVoice({authorize:o=>o.success(),joinVoIPChat:o=>{joins++;o.success({});},exitVoIPChat:o=>{exits++;o.fail?.({errMsg:'not in room'});}},async()=>{if(++requests===1)throw Error('RATE_LIMITED');return {groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'};},()=>{});
 v.syncRoom('r',5);await assert.rejects(v.join(),/RATE_LIMITED/);assert.equal(exits,0);
 await v.join();assert.equal(requests,1);assert.match(v.message,/1分钟/);
 t.mock.timers.tick(60_001);await v.join();assert.equal(requests,2);assert.equal(joins,1);assert.equal(v.joined,true);
});
test('late native join completion after departure is followed by exit',async()=>{
 let complete:((v:{openIdList:string[]})=>void)|undefined;let exits=0;
 const v=new NativeVoice({authorize:o=>o.success(),joinVoIPChat:o=>{complete=o.success;},exitVoIPChat:o=>{exits++;o.success();}},async()=>({groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'}),()=>{});
 v.syncRoom('r',5);const joining=v.join();await new Promise(r=>setTimeout(r,0));v.syncRoom(undefined,0);complete!({openIdList:['x']});await joining;await new Promise(r=>setTimeout(r,0));assert.equal(v.joined,false);assert.ok(exits>=2);
});
test('increasing capacity to twelve immediately ends native voice',async()=>{const f=fixture();f.v.syncRoom('r',10);await f.v.join();f.v.syncRoom('r',12);await new Promise(r=>setTimeout(r,0));assert.equal(f.v.joined,false);assert.equal(f.exits,1);});
test('mute timeout exits and late success cannot silently reopen voice',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let complete:(()=>void)|undefined;let exits=0;
 const v=new NativeVoice({authorize:o=>o.success(),joinVoIPChat:o=>o.success({}),updateVoIPChatMuteConfig:o=>{complete=()=>o.success();},exitVoIPChat:o=>{exits++;o.success();}},async()=>({groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'}),()=>{});
 v.syncRoom('r',5);await v.join();const pending=v.toggleMicrophone();const rejected=assert.rejects(pending,/超时/);t.mock.timers.tick(15001);await rejected;
 assert.equal(v.joined,false);await assert.rejects(v.join(),/尚未确认/);complete!();await Promise.resolve();await Promise.resolve();assert.ok(exits>=2);assert.equal(v.joined,false);
});
test('failed exit remains visible after leaving room and offers retry',async()=>{
 let fail=true;const v=new NativeVoice({authorize:o=>o.success(),joinVoIPChat:o=>o.success({}),exitVoIPChat:o=>fail?o.fail?.({}):o.success()},async()=>({groupId:'g',nonceStr:'n',timeStamp:1,signature:'s'}),()=>{});
 v.syncRoom('r',5);await v.join();await v.leave();v.syncRoom(undefined,0);await v.leave();assert.ok(v.rows().some(r=>r.id==='voice:leave'));assert.match(v.rows()[0].text,/退出未确认/);fail=false;await v.leave();assert.ok(!v.rows().some(r=>r.id==='voice:leave'));
});
