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
  return { stopped: false, closed: false, muted: false,
    stop() { this.stopped = true; }, close() { this.closed = true; },
    async setMuted(muted: boolean) { this.muted = muted; },
  };
}
function harness(options: {
  join?: (client: Client) => Promise<void>;
  leave?: (client: Client) => Promise<void>;
  mic?: () => Promise<ReturnType<typeof track>>;
  timeout?: number;
} = {}) {
  class Client extends EventEmitter {
    remoteUsers = [];
    publishes = 0;
    leaves = 0;
    async join() { await options.join?.(this); }
    async leave() { this.leaves++; await options.leave?.(this); }
    async publish() { this.publishes++; }
    async subscribe() {}
    enableAudioVolumeIndicator() {}
  }
  const clients: Client[] = [], tracks: ReturnType<typeof track>[] = [];
  let micCalls = 0;
  const rtc = {
    checkSystemRequirements: () => true,
    createClient: () => { const client = new Client(); clients.push(client); return client; },
    createMicrophoneAudioTrack: async () => {
      micCalls++;
      const audio = options.mic ? await options.mic() : track(); tracks.push(audio);
      return audio as unknown as IMicrophoneAudioTrack;
    },
  } as unknown as IAgoraRTC;
  return { manager: new AgoraVoiceManager(async () => rtc, options.timeout ?? 1000), clients, tracks, rtc, get micCalls() { return micCalls; } };
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
