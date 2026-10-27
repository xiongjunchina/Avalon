import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import type { IAgoraRTC, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { AgoraVoiceManager } from '../src/agora-voice';

const config = { appId: 'test-app', channel: 'room-a', token: 'test-token', uid: 101 };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function track() {
  const media=Object.assign(new EventTarget(),{readyState:'live',muted:false});
  const audio=Object.assign(new EventEmitter(),{ stopped: false, closed: false, muted: false,media,
    stop() { this.stopped = true; }, close() { this.closed = true; },
    async setMuted(muted: boolean) { this.muted = muted; },
    getMediaStreamTrack(){return media as unknown as MediaStreamTrack;},
  });
  return audio;
}
function harness(options: {
  join?: (client: Client) => Promise<void>;
  leave?: (client: Client) => Promise<void>;
  mic?: () => Promise<ReturnType<typeof track>>;
  timeout?: number;
  resume?:()=>void;
} = {}) {
  class Client extends EventEmitter {
    remoteUsers: any[] = [];
    connectionState='CONNECTED';
    unpublished:unknown[]=[];
    publishes = 0;
    leaves = 0;
    async join() { await options.join?.(this); }
    async leave() { this.leaves++; await options.leave?.(this); }
    async publish() { this.publishes++; }
    async unpublish(track:unknown) {this.unpublished.push(track);}
    async subscribe() {}
    enableAudioVolumeIndicator() {}
  }
  const clients: Client[] = [], tracks: ReturnType<typeof track>[] = [];
  let micCalls = 0;
  const events=new EventEmitter();
  const rtc = Object.assign(events,{
    checkSystemRequirements: () => true,
    createClient: () => { const client = new Client(); clients.push(client); return client; },
    createMicrophoneAudioTrack: async () => {
      micCalls++;
      const audio = options.mic ? await options.mic() : track(); tracks.push(audio);
      return audio as unknown as IMicrophoneAudioTrack;
    },
    resumeAudioContext(){options.resume?.();},
  }) as unknown as IAgoraRTC;
  return { manager: new AgoraVoiceManager(async () => rtc, options.timeout ?? 1000), clients, tracks, rtc, events, get micCalls() { return micCalls; } };
}
type Client = ReturnType<typeof harness>['clients'][number];

test('repeated join while connecting reuses the same connection', async () => {
  const pending = deferred<void>(), h = harness({ join: () => pending.promise });
  const first = h.manager.join(config), second = h.manager.join(config);
  assert.equal(first, second);
  await setImmediate();
  assert.equal(h.clients.length, 1);
  pending.resolve(); await first;
  assert.equal(h.manager.getState().status, 'connected');
  assert.equal(h.clients[0].publishes, 1);
  await h.manager.leave();
});

test('leaving a pending connection suppresses the expected WS_ABORT LEAVE', async () => {
  const pending = deferred<void>();
  const h = harness({ join: () => pending.promise, leave: async () => pending.reject(new Error('AgoraRTCError WS_ABORT: LEAVE')) });
  const joining = h.manager.join(config); await setImmediate();
  await h.manager.leave(); await assert.doesNotReject(joining);
  assert.equal(h.manager.getState().status, 'disconnected');
  assert.equal(h.manager.getState().error, undefined);
  assert.equal(h.micCalls, 0);
});

test('leaving while loading the SDK never starts a late channel join', async () => {
  const sdk = deferred<IAgoraRTC>(), h = harness();
  const manager = new AgoraVoiceManager(() => sdk.promise);
  const joining = manager.join(config); await setImmediate();
  await manager.leave(); await joining;
  sdk.resolve(h.rtc); await setImmediate();
  assert.equal(h.clients.length, 0);
  assert.equal(manager.getState().status, 'disconnected');
});

test('a microphone granted after cancellation is closed without publishing', async () => {
  const mic = deferred<ReturnType<typeof track>>(), h = harness({ mic: () => mic.promise });
  const joining = h.manager.join(config); await setImmediate();
  assert.equal(h.micCalls, 1);
  await h.manager.leave(); await joining;
  const audio = track(); mic.resolve(audio); await setImmediate();
  assert.equal(audio.closed, true);
  assert.equal(h.clients[0].publishes, 0);
  assert.equal(h.manager.getState().onlineUids.size, 0);
});

test('an old asynchronous leave cannot disconnect a newer room', async () => {
  const leaving = deferred<void>();
  const h = harness({ leave: client => client === h.clients[0] ? leaving.promise : Promise.resolve() });
  await h.manager.join(config);
  const oldLeave = h.manager.leave();
  await h.manager.join({ ...config, channel: 'room-b' });
  leaving.resolve(); await oldLeave;
  assert.equal(h.manager.getState().status, 'connected');
  assert.equal(h.manager.getState().channel, 'room-b');
  await h.manager.toggleMute();
  assert.equal(h.tracks[1].muted, true);
  await h.manager.leave();
});

test('a stalled join times out, releases resources and permits a fresh retry', async () => {
  const pending = deferred<void>();
  const h = harness({ timeout: 15, join: client => client === h.clients[0] ? pending.promise : Promise.resolve() });
  await assert.rejects(h.manager.join(config), /语音连接超时/);
  assert.equal(h.manager.getState().status, 'error');
  assert.equal(h.clients[0].leaves, 1);
  await h.manager.join(config);
  pending.resolve(); await setImmediate();
  assert.equal(h.manager.getState().status, 'connected');
  assert.equal(h.clients[1].publishes, 1);
  await h.manager.leave();
});

test('network loss exposes recovery controls and stale SDK events cannot restore old presence', async () => {
  const h = harness(); await h.manager.join(config);
  const old = h.clients[0], stale = old.listeners('user-joined')[0];
  old.emit('connection-state-change', 'RECONNECTING', 'CONNECTED');
  assert.equal(h.manager.getState().status, 'error');
  old.emit('connection-state-change', 'CONNECTED', 'RECONNECTING');
  assert.equal(h.manager.getState().status, 'connected');
  old.emit('connection-state-change', 'DISCONNECTED', 'CONNECTED', 'NETWORK_ERROR');
  assert.equal(h.manager.getState().status, 'error');
  assert.equal(h.tracks[0].closed, true);
  await h.manager.join({ ...config, channel: 'room-b' });
  stale({ uid: 999, hasAudio: true });
  assert.equal(h.manager.getState().onlineUids.has(999), false);
  await h.manager.leave();
});

test('foreground recovery resumes playback without rejoining the channel or opening a muted microphone',async()=>{
  let resumed=0;const h=harness({resume:()=>{resumed++;}});await h.manager.join(config);
  let played=0;h.clients[0].remoteUsers=[{uid:202,audioTrack:{play(){played++;},stop(){}}}];
  await h.manager.toggleMute();h.events.emit('audio-context-state-changed','suspended');
  assert.equal(h.manager.getState().recoveryNeeded,true);
  assert.equal(await h.manager.recover(),'ready');
  assert.equal(resumed,1);assert.equal(played,1);assert.equal(h.clients.length,1);assert.equal(h.micCalls,1);
  assert.equal(h.manager.getState().muted,true);assert.equal(h.manager.getState().recoveryNeeded,false);
  await h.manager.leave();
});

test('autoplay blocking has a recovery prompt even while signaling is connected; a click can recover it',async()=>{
  let blocked=true;const h=harness();await h.manager.join(config);
  h.clients[0].remoteUsers=[{audioTrack:{play(){if(blocked)h.events.emit('autoplay-failed');}}}];
  assert.equal(await h.manager.recover(),'interaction');
  assert.equal(h.manager.getState().status,'connected');assert.equal(h.manager.getState().recoveryNeeded,true);
  blocked=false;assert.equal(await h.manager.recover(true),'ready');assert.equal(h.manager.getState().recoveryNeeded,false);
  await h.manager.leave();assert.equal(h.events.listenerCount('autoplay-failed'),0);assert.equal(h.events.listenerCount('audio-context-state-changed'),0);
});

test('ended microphone is replaced once and duplicate foreground events share the recovery',async()=>{
  const replacement=deferred<ReturnType<typeof track>>();let count=0;
  const h=harness({mic:async()=>++count===1?track():replacement.promise});await h.manager.join(config);
  h.tracks[0].media.readyState='ended';h.tracks[0].emit('track-ended');
  assert.equal(h.manager.getState().micOpenUids.has(config.uid),false);
  const first=h.manager.recover(),second=h.manager.recover();assert.equal(first,second);await setImmediate();
  assert.equal(h.micCalls,2);assert.equal(h.tracks[0].closed,true);assert.deepEqual(h.clients[0].unpublished,[h.tracks[0]]);
  await h.manager.toggleMute(); // A mute while microphone acquisition is pending must be respected.
  const next=track();replacement.resolve(next);await first;
  assert.equal(next.muted,true);assert.equal(h.manager.getState().muted,true);assert.equal(h.manager.getState().micOpenUids.has(config.uid),false);
  await h.manager.leave();
});

test('leaving during microphone recovery closes a late grant without publishing or restoring presence',async()=>{
  const replacement=deferred<ReturnType<typeof track>>();let count=0;
  const h=harness({mic:async()=>++count===1?track():replacement.promise});await h.manager.join(config);
  h.tracks[0].media.readyState='ended';const recovery=h.manager.recover();await setImmediate();
  await h.manager.leave();await recovery;
  const late=track();replacement.resolve(late);await setImmediate();
  assert.equal(late.closed,true);assert.equal(h.clients[0].publishes,1);assert.equal(h.manager.getState().status,'disconnected');
});

test('deafened users stay silent and only a disconnected channel requests rejoining',async()=>{
  let resumed=0;const h=harness({resume:()=>resumed++});await h.manager.join(config);
  h.clients[0].remoteUsers=[{audioTrack:{play(){throw Error('must stay silent');},stop(){}}}];
  await h.manager.toggleDeafen();h.tracks[0].media.readyState='ended';
  assert.equal(await h.manager.recover(),'ready');assert.equal(resumed,0);assert.equal(h.micCalls,1);
  assert.equal(h.manager.getState().deafened,true);assert.equal(h.manager.getState().muted,true);
  h.clients[0].connectionState='RECONNECTING';assert.equal(await h.manager.recover(),'ready');
  assert.equal(await h.manager.recover(true),'reconnect');
  h.clients[0].connectionState='DISCONNECTED';assert.equal(await h.manager.recover(),'reconnect');
  await h.manager.leave();
});

test('timed-out microphone recovery never publishes a late grant',async()=>{
  const replacement=deferred<ReturnType<typeof track>>();let count=0;
  const h=harness({timeout:15,mic:async()=>++count===1?track():replacement.promise});await h.manager.join(config);
  h.tracks[0].media.readyState='ended';assert.equal(await h.manager.recover(),'interaction');
  assert.equal(h.manager.getState().status,'error');
  const late=track();replacement.resolve(late);await setImmediate();
  assert.equal(late.closed,true);assert.equal(h.clients[0].publishes,1);
  assert.equal(await h.manager.recover(),'reconnect');await h.manager.leave();
});

test('leaving while microphone unpublication stalls still closes the original capture',async()=>{
  const pending=deferred<void>(),h=harness();await h.manager.join(config);
  h.clients[0].unpublish=()=>pending.promise;h.tracks[0].media.readyState='ended';
  const recovery=h.manager.recover();await setImmediate();await h.manager.leave();await recovery;
  assert.equal(h.tracks[0].closed,true);pending.resolve();await setImmediate();assert.equal(h.micCalls,1);
});

test('a failed replacement publication closes that track and a later retry publishes a fresh one',async()=>{
  const h=harness();await h.manager.join(config);h.tracks[0].media.readyState='ended';let fail=true;
  h.clients[0].publish=async()=>{h.clients[0].publishes++;if(fail){fail=false;throw Error('publication failed');}};
  assert.equal(await h.manager.recover(),'interaction');assert.equal(h.tracks[1].closed,true);
  assert.equal(h.manager.getState().micOpenUids.has(config.uid),false);
  assert.equal(await h.manager.recover(true),'ready');assert.equal(h.micCalls,3);
  assert.equal(h.manager.getState().micOpenUids.has(config.uid),true);await h.manager.leave();
});

test('rapid avatar mute changes during recovery do not create a second microphone',async()=>{
  const pending=deferred<ReturnType<typeof track>>();let count=0;
  const h=harness({mic:async()=>++count===1?track():pending.promise});await h.manager.join(config);
  h.tracks[0].media.readyState='ended';const recovery=h.manager.recover();await setImmediate();
  await h.manager.toggleMute();await h.manager.toggleMute();assert.equal(h.micCalls,2);
  const replacement=track();pending.resolve(replacement);await recovery;
  assert.equal(replacement.muted,false);assert.equal(h.micCalls,2);await h.manager.leave();
});

test('system-muted microphones require an explicit recovery before recapture',async()=>{
  const h=harness();await h.manager.join(config);h.tracks[0].media.muted=true;h.tracks[0].media.dispatchEvent(new Event('mute'));
  assert.equal(h.manager.getState().recoveryNeeded,true);
  assert.equal(await h.manager.recover(),'interaction');assert.equal(h.micCalls,1);
  assert.equal(await h.manager.recover(true),'ready');assert.equal(h.micCalls,2);await h.manager.leave();
});

test('a missing remote audio track is subscribed again before clearing the recovery notice',async()=>{
  const h=harness();await h.manager.join(config);let subscribed=0,played=0;
  const remote:any={uid:202,hasAudio:true};h.clients[0].remoteUsers=[remote];
  h.clients[0].subscribe=async()=>{subscribed++;remote.audioTrack={play(){played++;}};};
  h.events.emit('autoplay-failed');assert.equal(await h.manager.recover(true),'ready');
  assert.equal(subscribed,1);assert.equal(played,1);await h.manager.leave();
});
