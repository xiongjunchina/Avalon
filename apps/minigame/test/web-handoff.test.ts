import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type RoomView, type User } from '@avalon/contracts';
import { copyWebEntry, personalHandoffUrl, roomVoiceGuidance, webHandoffScreen } from '../src/screens/web-handoff.js';
import { lobbyScreen, LobbyController } from '../src/screens/lobby.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';
import { settingsScreen } from '../src/screens/settings.js';

const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '玩家' } as User;
const room = {
  id: '22222222-2222-4222-8222-222222222222', code: '123456', inviteKey: 'public-invitation',
  version: 3, hostId: user.id, phase: 'waiting', settings: { ...defaultSettings, playerCount: 12, voiceChatEnabled: true },
  members: [{ ...user, seat: 1, ready: false, online: true }], acceptingNewMembers: true,
} as RoomView;
const base = 'https://game.ccnepower.com/avalon';
const ticket = 'one-time-test-ticket-'.repeat(3).slice(0, 43);

test('personal handoff retains the game prefix and puts only a short-lived ticket in the fragment', async () => {
  const calls: { path: string; body: unknown }[] = [];
  let copied = '';
  const api = { request: async (path: string, body: unknown) => {
    calls.push({ path, body }); return { ticket, expiresAt: '2026-10-31T12:05:00.000Z' };
  } } as any;
  await copyWebEntry('personal', api, { setClipboardData: o => { copied = o.data; o.success(); } }, base, room);
  assert.deepEqual(calls, [{ path: '/sessions/web-handoff', body: { roomId: room.id } }]);
  const url = new URL(copied);
  assert.equal(url.pathname, '/avalon/');
  assert.equal(url.search, '');
  assert.equal(url.hash, '#avalon-handoff=' + ticket);
  assert.equal(personalHandoffUrl(base + '/', ticket), copied);
  assert.throws(() => personalHandoffUrl(base, 'bad#ticket'), /生成失败/);
  for (const invalid of [ticket.slice(1), ticket + 'a', 'a'.repeat(60)])
    assert.throws(() => personalHandoffUrl(base, invalid), /生成失败/);
});

test('friend invitation never requests or shares the personal handoff credential', async () => {
  let copied = '';
  await copyWebEntry('invite', { request: () => { throw Error('unexpected credential request'); } }, {
    setClipboardData: o => { copied = o.data; o.success(); },
  }, base, room);
  assert.equal(copied, base + '/?invite=public-invitation');
  assert.equal(new URL(copied).hash, '');
});

test('copy failures and unavailable clipboard leave the game state untouched', async () => {
  const before = JSON.stringify(room);
  let requested = false;
  const api = { request: async () => { requested = true; return { ticket }; } } as any;
  await assert.rejects(copyWebEntry('personal', api, {}, base, room), /不支持复制/);
  assert.equal(requested, false);
  await assert.rejects(copyWebEntry('personal', api, { setClipboardData: o => o.fail({}) }, base, room), /复制失败/);
  assert.equal(JSON.stringify(room), before);
});

test('web voice guidance applies to smaller mixed rooms as well as twelve-player rooms', () => {
  for (const playerCount of [5, 8, 10, 11, 12]) {
    const r = { ...room, settings: { ...room.settings, playerCount } };
    assert.match(roomVoiceGuidance(r), playerCount<=10 ? /无需跳转网页/ : /最多10人/);
    assert.match(roomVoiceGuidance(r), /两端不互通/);
  }
  assert.match(roomVoiceGuidance({ settings: defaultSettings }), /微信原生语音/);
  assert.match(roomVoiceGuidance({ settings: defaultSettings }), /无需跳转网页/);
});

test('handoff sheet keeps personal and friend actions distinct and long instructions readable on mobile', () => {
  const model = webHandoffScreen(room, user);
  assert.equal(model.web?.backId, 'auxiliaryClose');
  for (const width of [320, 390, 430]) {
    const viewport = { width, height: 700, top: 36, bottom: 20 };
    const layout = layoutWebScreen(model, viewport);
    for (const id of ['web:copyPersonal', 'web:copyInvite']) {
      const node = layout.nodes.find(n => n.id === id)!;
      assert.equal(node.kind, 'button');
      assert.ok(node.height >= 42);
    }
    const instructions = layout.nodes.find(n => n.id === 'guide:web-personal')!;
    assert.equal(instructions.kind, 'label');
    assert.ok(instructions.height > 42, 'instructions must wrap rather than truncate to one button');
    assert.match(instructions.text, /5 分钟/);
    assert.match(instructions.text, /请勿发给他人/);
    assert.ok(layout.nodes.every(n => n.x >= 0 && n.x + n.width <= width + .01));
  }
});

test('waiting room and settings offer web routing without restricting twelve-player game commands', () => {
  const model = lobbyScreen(room, user);
  assert.ok(model.rows.some(r => r.id === 'web:open'));
  const layout = layoutWebScreen(model, { width: 390, height: 844, top: 44, bottom: 34 });
  assert.ok(layout.nodes.some(n => n.id === 'sound' && n.kind === 'button'));
  assert.ok(!layout.nodes.some(n => /去网页|全员使用网页/.test(n.text)));
  const setup = settingsScreen(room.settings);
  setup.web = { page: 'setup', document: { kind: 'settings', activeTab: 'setup', settings: room.settings } };
  const settings = layoutWebScreen(setup, { width: 390, height: 844, top: 44, bottom: 34 });
  assert.ok(settings.nodes.some(n => n.id === 'setup:web' && n.selected));
  assert.ok(settings.nodes.some(n => n.id === 'count:12' && n.selected));
  const sent: string[] = [];
  const controller = new LobbyController({} as any, user);
  controller.setRoom(room);
  controller.setConnection({ send: command => { sent.push(command.type); return true; } });
  assert.equal(controller.ready(true), true);
  assert.equal(controller.start(), true);
  assert.deepEqual(sent, ['setReady', 'startGame']);
});
