import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type RoomView, type Statistics } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { entryScreen } from '../src/screens/entry';
import { gameScreen } from '../src/screens/game';
import { layoutWebScreen } from '../src/ui/web-layout';
import { parityPlayerData } from '../scripts/parity-fixture';

const viewport = { width: 390, height: 844, top: 0, bottom: 0 };
const user = { id: 'p0', nickname: '仙友', playerCode: '123456' };

test('mini-game uses duel homepage and white dragon for setup and statistics', () => {
  const home = entryScreen(user);
  assert.equal(layoutWebScreen(home, viewport).nodes.find(n => n.id === 'home-duel')?.image, 'home/duel-mobile.jpg');
  for (const page of ['setup', 'sheet'] as const) {
    const model = { title: '房间设置', rows: [], web: { page, settings: defaultSettings,
      ...(page === 'sheet' ? { document: { kind: 'settings' as const, activeTab: 'setup', settings: defaultSettings } } : {}) } };
    assert.equal(layoutWebScreen(model, viewport).nodes.find(n => n.id === 'setupRole:loyal')?.image, 'roles/bailong-loyal-160.webp');
  }
  const { stats } = parityPlayerData();
  const account = { title: '功果簿', rows: [], web: { page: 'sheet' as const,
    document: { kind: 'account' as const, activeTab: 'stats', user, stats: stats as Statistics } } };
  assert.ok(layoutWebScreen(account, viewport).nodes.some(n => n.image === 'roles/bailong-loyal-160.webp'));
});

test('mini-game legacy settlement still shows the assigned pig guardian rather than the new default', () => {
  const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, seat: i + 1, nickname: `仙友${i}` }));
  const game = createGame('legacy-guardian', players, { ...defaultSettings, playerCount: 5 }, a => a, { randomBelow: () => 0n });
  game.rulesetVersion = 'standard-no-lancelot-v3';
  game.phase = 'aborted';
  game.result = { winner: null, reason: 'unanimous_abort' };
  const room: RoomView = { id: 'legacy-room', code: '123456', version: 1, hostId: user.id, phase: 'finished',
    settings: game.settings, acceptingNewMembers: true, members: players.map(p => ({ ...p, ready: true, online: true })),
    game: projectGame(game, user.id) };
  const nodes = layoutWebScreen(gameScreen(room, user, { privateRoleVisible: false, ballotVisible: false }), viewport).nodes;
  assert.equal(nodes.find(n => n.kind === 'seat' && n.count === 3)?.image, 'roles/zhubajie-loyal-160.webp');
});
