import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerExtras } from '../src/screens/player-extras.js';
import { guideScreen } from '../src/screens/guide.js';
import { PlayerPanel } from '../src/screens/player-panel.js';
import { PracticeSession } from '../src/screens/practice.js';
import { entryScreen } from '../src/screens/entry.js';
import { defaultSettings } from '@avalon/contracts';
import { replayScreen } from '../src/screens/replay.js';

test('player extras use the matching current server endpoints', async () => {
  const calls: { path: string; method: string }[] = [];
  const api = { request: async (path: string, _body?: unknown, method = 'GET') => { calls.push({ path, method }); return { friends: [], presets: [], games: [], nextCursor: null, completed: 0 }; } } as any;
  const extras = new PlayerExtras(api);
  await extras.friends(); await extras.statistics(); await extras.history(); await extras.presets();
  await extras.roomChat('room-id', '你好'); await extras.directChat('friend-id');
  assert.deepEqual(calls.map(call => call.path), ['/friends', '/me/stats', '/me/games', '/me/presets', '/rooms/room-id/chat', '/friends/friend-id/chat']);
  assert.equal(calls[4]?.method, 'POST');
});

test('guide includes the five missions and win conditions', () => {
  const view = guideScreen();
  assert.ok(view.rows.some(row => row.text.includes('五轮')));
  assert.ok(view.rows.some(row => row.text.includes('刺杀')));
  assert.ok(view.rows.some(row => row.text.includes('9–12人法宝')));
  assert.equal(view.rows.filter(row => row.id.startsWith('mission:')).length, 5);
  assert.ok(view.rows.some(row => row.id === 'guide-role:merlin'));
  assert.ok(guideScreen('merlin').rows.some(row => row.text.includes('火眼金睛')));
});

test('account panel loads player statistics and history', async () => {
  const api = { request: async (path: string) => path === '/me/stats' ? { completed: 2, wins: 1, losses: 1, aborted: 0, winRate: 0.5, byRole: {}, byTeam: {} } : { games: [], nextCursor: null } } as any;
  const panel = new PlayerPanel(new PlayerExtras(api), { id: 'u', nickname: '甲', avatar: 'leaf', playerCode: '123456' });
  await panel.open('account');
  assert.ok(panel.model().rows.some(row => row.id === 'page:stats'));
  await panel.open('stats');
  assert.ok(panel.model().rows.some(row => row.text.includes('2')));
});

test('player replay shows full round details and favorite action', () => {
  const replay = { id: 'g', playerCount: 2, rulesetVersion: 'v1', result: { winner: 'blue', reason: 'merlin_survived' },
    settings: { anonymousTeamVote: true }, favorite: false,
    players: [{ id: 'u1', seat: 1, nickname: '甲' }, { id: 'u2', seat: 2, nickname: '乙' }],
    roles: { u1: 'merlin', u2: 'assassin' }, inspections: [], earlyWindows: [],
    rounds: [{ number: 1, mission: 1, captainId: 'u1', team: ['u1', 'u2'], direction: 'clockwise',
      vote: { approvals: 2, rejections: 0, passed: true }, result: { successes: 2, failures: 0, passed: true } }],
  } as any;
  const model = replayScreen(replay, 'page:history', true);
  assert.ok(model.rows.some(row => row.id === 'favorite'));
  assert.ok(model.rows.some(row => row.text.includes('赞成2')));
  assert.ok(model.rows.some(row => row.text.includes('任务：成功2')));
});

test('practice uses the shared local game core and advances bots without API writes', () => {
  const practice = new PracticeSession({ ...defaultSettings, playerCount: 5 }, '我');
  assert.equal(practice.view().game?.players.length, 5);
  assert.equal(practice.view().phase, 'playing');
  practice.stepBot();
  assert.ok(practice.view().game);
});

test('offline visitors can read rules and practice without a network session', () => {
  const actions = entryScreen().rows.map(row => row.id);
  assert.ok(actions.includes('guide'));
  assert.ok(actions.includes('practice'));
});

test('practice can run when the Mini Game runtime lacks structuredClone', () => {
  const nativeClone = globalThis.structuredClone;
  try {
    (globalThis as { structuredClone?: typeof structuredClone }).structuredClone = undefined;
    const practice = new PracticeSession({ ...defaultSettings, playerCount: 5 }, '我');
    assert.equal(practice.view().game?.players.length, 5);
  } finally {
    globalThis.structuredClone = nativeClone;
  }
});

test('incoming direct chat appears in the open conversation', async () => {
  const api = { request: async (path: string) => path === '/friends' ? { friends: [{ id: 'f', nickname: '仙友', status: 'accepted' }] } : { messages: [] } } as any;
  const panel = new PlayerPanel(new PlayerExtras(api), { id: 'u', nickname: '我' });
  await panel.open('friends');
  await panel.handle('friend:f', async () => undefined);
  panel.onDirectChat({ type: 'directChat', messageId: 'm', fromUser: { id: 'f', nickname: '仙友' }, text: '你好', timestamp: '2026-10-22T00:00:00Z' });
  assert.ok(panel.model().rows.some(row => row.text.includes('你好')));
});

test('account panel can save a cropped custom avatar from the mini game picker', async () => {
  let saved: unknown;
  const api = { request: async (path: string, body?: unknown) => {
    if (path === '/me') { saved = body; return { user: { id: 'u', nickname: '我', avatar: 'leaf', avatarUrl: 'data:image/jpeg;base64,AAAA' } }; }
    return {};
  } } as any;
  const panel = new PlayerPanel(new PlayerExtras(api), { id: 'u', nickname: '我', avatar: 'leaf' }, async () => 'data:image/jpeg;base64,AAAA');
  assert.ok(panel.model().rows.some(row => row.id === 'uploadAvatar'));
  await panel.handle('uploadAvatar', async () => undefined);
  assert.equal((saved as { avatarUrl: string }).avatarUrl, 'data:image/jpeg;base64,AAAA');
});
