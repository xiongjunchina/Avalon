import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MiniGameSound } from '../src/platform/sound.js';
test('audio reuses web assets, stays opt-in and pauses on background', () => {
  const played: string[] = [], paused: string[] = [];
  const platform = { get() {}, set() {}, runtime: { createInnerAudioContext: () => ({ src: '', play() { played.push(this.src); }, pause() { paused.push(this.src); }, stop() {}, destroy() {} }) } } as any;
  const sound = new MiniGameSound(platform, 'https://game.example', () => {});
  sound.activate(); assert.equal(played.length, 0);
  sound.configure('music', true);
  assert.ok(played[0]?.includes('/audio/v2/yungong-xunyin'));
  sound.foreground(false); assert.equal(paused.length, 1);
  sound.effect('tap'); assert.equal(played.length, 1);
});
