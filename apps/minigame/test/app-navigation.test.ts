import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildMiniGame } from '../scripts/build.mjs';

test('built client logs in, opens a clean join form and creates the selected web room configuration', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-parity-app-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  let start: any, end: any, confirmKeyboard: any, room: any;
  const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '行者', playerCode: '123456' };
  const storage = new Map(), requests: { path: string; data: any }[] = [];
  let frame: { text: string; x: number; y: number }[] = [];
  const ctx = new Proxy({}, { get: (_target, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} })
    : key === 'measureText' ? (text: string) => ({ width: text.length * 12 })
    : key === 'fillRect' ? (x: number, y: number, w: number, h: number) => { if (x === 0 && y === 0 && w === 390 && h === 844) frame = []; }
    : key === 'fillText' ? (text: string, x: number, y: number) => frame.push({ text, x, y })
    : () => {} });
  const wx = {
    createCanvas: () => ({ getContext: () => ctx }),
    getSystemInfoSync: () => ({ screenWidth: 390, screenHeight: 844, pixelRatio: 2, safeArea: { top: 44, bottom: 810 } }),
    getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key),
    login: (options: any) => options.success({ code: 'verified-on-server' }),
    request: (options: any) => {
      const path = options.url.split('/api')[1]; requests.push({ path, data: options.data });
      let data: any = {};
      if (path === '/system/announcement') data = { announcement: { enabled: false, text: '' }, freeAccessMode: true };
      else if (path === '/sessions/minigame') data = { user, token: 'test-token' };
      else if (path === '/me') data = { user, roomId: null };
      else if (path === '/rooms') { room = { id: '22222222-2222-4222-8222-222222222222', code: '123456', hostId: user.id, version: 1, phase: 'waiting', settings: options.data.settings, members: [{ ...user, seat: 1, ready: false, online: true }], acceptingNewMembers: true }; data = { room }; }
      else if (path.startsWith('/rooms/')) data = { room };
      else if (path === '/minigame/socket-ticket') data = { ticket: 'test-ticket' };
      options.success({ statusCode: 200, data });
    },
    connectSocket: () => ({ send() {}, close() {}, onOpen(callback: () => void) { callback(); }, onMessage() {}, onClose() {}, onError() {} }),
    showKeyboard() {}, hideKeyboard() {}, onKeyboardConfirm(callback: any) { confirmKeyboard = callback; }, offKeyboardConfirm() {},
    onShow() {}, onHide() {}, onShareAppMessage() {},
    onTouchStart(callback: any) { start = callback; }, onTouchEnd(callback: any) { end = callback; },
  };
  runInNewContext(await readFile(join(outDir, 'bundle.js'), 'utf8'), {
    wx, console, crypto: globalThis.crypto, clearTimeout,
    setTimeout: (callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); timers.add(timer); return timer; },
  });
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  async function tap(label: string) {
    const target = [...frame].reverse().find(item => item.text === label && item.y >= 44 && item.y <= 800);
    assert.ok(target, 'visible control missing: ' + label);
    start({ touches: [{ clientX: target.x, clientY: target.y }] });
    end({ changedTouches: [{ clientX: target.x, clientY: target.y }] });
    await settle();
  }
  await settle(); await tap('踏入取经大道');
  assert.ok(frame.some(item => item.text === '开常规房'));
  await tap('加入房间');
  assert.ok(frame.some(item => item.text === '输入房间号或邀请链接'));
  await tap('入座取经');
  assert.ok(frame.some(item => item.text.includes('请输入房间号或邀请链接')));
  await tap('输入房间号或邀请链接');
  confirmKeyboard({ value: '654321' }); await settle();
  await tap('‹'); await tap('加入房间');
  assert.ok(frame.some(item => item.text === '输入房间号或邀请链接'));
  await tap('‹'); await tap('开常规房'); await tap('9');
  for (let index = 0; index < 8 && !frame.some(item => item.text === '敕令开坛 · 创建房间' && item.y < 790); index++) {
    start({ touches: [{ clientY: 760 }] }); end({ changedTouches: [{ clientX: 350, clientY: 240 }] }); await settle();
  }
  await tap('敕令开坛 · 创建房间');
  assert.equal(requests.find(item => item.path === '/rooms')?.data.settings.playerCount, 9);
  assert.ok(frame.some(item => item.text.includes('房号 123456')));
});
