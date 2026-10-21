import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerExtras } from '../src/screens/player-extras.js';
import { guideScreen } from '../src/screens/guide.js';
import { PlayerPanel } from '../src/screens/player-panel.js';
import { PracticeSession } from '../src/screens/practice.js';
import { entryScreen } from '../src/screens/entry.js';
import { defaultSettings } from '@avalon/contracts';

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
});

test('account panel loads player statistics and history', async () => {
  const api = { request: async (path: string) => path === '/me/stats' ? { completed: 2, wins: 1, losses: 1, aborted: 0, winRate: 0.5, byRole: {}, byTeam: {} } : { games: [], nextCursor: null } } as any;
  const panel = new PlayerPanel(new PlayerExtras(api), { id: 'u', nickname: '甲', avatar: 'leaf', playerCode: '123456' });
  await panel.open('account');
  assert.ok(panel.model().rows.some(row => row.id === 'page:stats'));
  await panel.open('stats');
  assert.ok(panel.model().rows.some(row => row.text.includes('2')));
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
