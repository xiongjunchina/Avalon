import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderQueue } from '../src/ui/render-queue.js';

test('touch bursts paint the latest position once per native frame, including horizontal content changes', () => {
  const frames: (() => void)[] = [], paints: { position: number; reuse: boolean }[] = [];
  let position = 0;
  const queue = createRenderQueue(callback => frames.push(callback), reuse => paints.push({ position, reuse }));
  for (let i = 0; i < 30; i++) { position++; queue.request(); }
  queue.request(false);
  assert.equal(frames.length, 1);
  assert.deepEqual(paints, []);
  frames.shift()!();
  assert.deepEqual(paints, [{ position: 30, reuse: false }]);
  position++; queue.request(); frames.shift()!();
  assert.deepEqual(paints.at(-1), { position: 31, reuse: true });
});

test('an inertia frame flush or navigation cancels an older queued touch paint', () => {
  const frames: (() => void)[] = [], paints: boolean[] = [];
  const queue = createRenderQueue(callback => frames.push(callback), reuse => paints.push(reuse));
  queue.request(false); queue.flush(); frames.shift()!();
  assert.deepEqual(paints, [false]);
  queue.request(); queue.cancel(); frames.shift()!();
  assert.deepEqual(paints, [false]);
});

test('runtimes without a frame API still render input', () => {
  const paints: boolean[] = [];
  const queue = createRenderQueue(undefined, reuse => paints.push(reuse));
  queue.request(); queue.request(false);
  assert.deepEqual(paints, [true, false]);
});
