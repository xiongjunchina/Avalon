import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceWakeLockController, type ScreenWakeLock } from '../src/voice-wake-lock';

class FakeLock extends EventTarget implements ScreenWakeLock {
  released = false;
  releases = 0;
  async release() { this.releases++; this.systemRelease(); }
  systemRelease() { this.released = true; this.dispatchEvent(new Event('release')); }
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function fixture(supported = true) {
  let visible = true;
  const locks: FakeLock[] = [];
  const controller = new VoiceWakeLockController({ supported, visible: () => visible, request: async () => {
    const lock = new FakeLock(); locks.push(lock); return lock;
  } });
  return { controller, locks, visible: (value: boolean) => { visible = value; }, change: (value: boolean) => { visible = value; controller.visibilityChanged(); } };
}

test('screen wake lock is off by default, requires voice, and manual opt-out stays off', async () => {
  const f = fixture();
  assert.equal(f.controller.getState().enabled, false);
  f.controller.toggle(); await flush(); assert.equal(f.locks.length, 0);
  f.controller.setVoiceActive(true); await flush(); assert.equal(f.locks.length, 0);
  f.controller.toggle(); await flush();
  assert.equal(f.controller.getState().active, true);
  f.controller.toggle();
  assert.equal(f.locks[0].releases, 1); assert.equal(f.controller.getState().enabled, false);
  f.change(false); f.change(true); await flush(); assert.equal(f.locks.length, 1);
  f.controller.setVoiceActive(false); f.controller.setVoiceActive(true); await flush();
  assert.equal(f.controller.getState().enabled, false); assert.equal(f.locks.length, 1);
  f.controller.dispose();
});

test('backgrounding releases the lock and foregrounding reacquires only while opted in', async () => {
  const f = fixture(); f.controller.setVoiceActive(true); f.controller.toggle(); await flush();
  f.change(false);
  assert.equal(f.locks[0].released, true); assert.equal(f.controller.getState().active, false); assert.equal(f.controller.getState().enabled, true);
  f.change(true); f.change(true); await flush();
  assert.equal(f.locks.length, 2); assert.equal(f.controller.getState().active, true);
  f.controller.dispose(); assert.equal(f.locks[1].released, true); assert.equal(f.controller.getState().enabled, false);
});

test('a browser release that precedes visibilitychange preserves the opt-in for returning to the page', async () => {
  const f = fixture(); f.controller.setVoiceActive(true); f.controller.toggle(); await flush();
  f.visible(false); f.locks[0].systemRelease();
  assert.equal(f.controller.getState().enabled, true);
  f.controller.visibilityChanged(); f.change(true); await flush();
  assert.equal(f.locks.length, 2); assert.equal(f.controller.getState().active, true);
  f.controller.dispose();
});

test('late wake-lock grants after opt-out or leaving voice are immediately released', async () => {
  for (const stop of ['toggle', 'voice', 'dispose'] as const) {
    const pending = deferred<ScreenWakeLock>(), lock = new FakeLock();
    const controller = new VoiceWakeLockController({ supported: true, visible: () => true, request: () => pending.promise });
    controller.setVoiceActive(true); controller.toggle(); assert.equal(controller.getState().pending, true);
    if (stop === 'toggle') controller.toggle();
    else if (stop === 'voice') controller.setVoiceActive(false);
    else controller.dispose();
    pending.resolve(lock); await flush();
    assert.equal(lock.releases, 1); assert.equal(controller.getState().active, false); assert.equal(controller.getState().enabled, false);
    controller.visibilityChanged(); await flush(); assert.equal(controller.getState().active, false);
  }
});

test('a stale background request cannot replace the new foreground lock', async () => {
  const first = deferred<ScreenWakeLock>(), second = deferred<ScreenWakeLock>();
  let visible = true, requests = 0;
  const controller = new VoiceWakeLockController({ supported: true, visible: () => visible, request: () => ++requests === 1 ? first.promise : second.promise });
  controller.setVoiceActive(true); controller.toggle();
  visible = false; controller.visibilityChanged(); visible = true; controller.visibilityChanged();
  const current = new FakeLock(); second.resolve(current); await flush();
  const stale = new FakeLock(); first.resolve(stale); await flush();
  assert.equal(requests, 2); assert.equal(stale.releases, 1); assert.equal(current.releases, 0); assert.equal(controller.getState().active, true);
  controller.dispose(); assert.equal(current.releases, 1);
});

test('unsupported browsers and rejected requests show short feedback without claiming an active lock', async () => {
  const f = fixture(false); f.controller.setVoiceActive(true); f.controller.toggle(); await flush();
  assert.match(f.controller.getState().notice, /不支持/); assert.equal(f.locks.length, 0); assert.equal(f.controller.getState().enabled, false);
  let requests = 0;
  const lock = new FakeLock(), controller = new VoiceWakeLockController({ supported: true, visible: () => true, request: async () => {
    if (++requests === 1) throw Error('NotAllowedError'); return lock;
  } });
  controller.setVoiceActive(true); controller.toggle(); await flush();
  assert.match(controller.getState().notice, /未能保持亮屏/); assert.equal(controller.getState().active, false); assert.equal(controller.getState().enabled, false);
  controller.toggle(); await flush(); assert.equal(controller.getState().active, true); assert.equal(controller.getState().notice, '');
  controller.dispose(); f.controller.dispose();
});

test('an unexpected system release while visible disables the option and allows an explicit retry', async () => {
  const f = fixture(); f.controller.setVoiceActive(true); f.controller.toggle(); await flush();
  f.locks[0].systemRelease();
  assert.equal(f.controller.getState().enabled, false); assert.equal(f.controller.getState().active, false); assert.match(f.controller.getState().notice, /系统暂停/);
  f.controller.visibilityChanged(); await flush(); assert.equal(f.locks.length, 1);
  f.controller.toggle(); await flush(); assert.equal(f.locks.length, 2); assert.equal(f.controller.getState().active, true);
  f.controller.dispose();
});
