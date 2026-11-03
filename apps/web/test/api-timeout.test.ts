import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

test('web profile submissions can wait 20 seconds while concurrent game requests keep the 10-second budget', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = new Map<string, AbortSignal>();
  t.mock.method(globalThis, 'fetch', (url: string, options: RequestInit) => {
    const signal = options.signal!;
    signals.set(url, signal);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true }));
  });
  const profile = api('/me', { nickname: '仙友', avatarUrl: null }, 'PATCH', { timeoutMs: 20_000 });
  const game = api('/rooms/room/commands', { type: 'ready', ready: true });
  const voice = api('/rooms/room/voice-token', {});
  const profileRejected = assert.rejects(profile, /ABORTED/);
  const gameRejected = assert.rejects(game, /ABORTED/);
  const voiceRejected = assert.rejects(voice, /ABORTED/);
  const signal = (suffix: string) => [...signals].find(([url]) => url.endsWith(suffix))![1];
  t.mock.timers.tick(10_000);
  assert.equal(signal('/me').aborted, false);
  assert.equal(signal('/rooms/room/commands').aborted, true);
  assert.equal(signal('/rooms/room/voice-token').aborted, true);
  await Promise.all([gameRejected, voiceRejected]);
  t.mock.timers.tick(9_999);
  assert.equal(signal('/me').aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal('/me').aborted, true);
  await profileRejected;
});
