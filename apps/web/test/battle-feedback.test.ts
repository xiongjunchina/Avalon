import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type RoomView, type RoundView } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { BattleHistory } from '../src/BattleRound';
import { GamePanel } from '../src/GamePanel';

const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `朋友${i + 1}` }));

test('battle history preserves all missions and rejected proposals in order', () => {
  const rounds: RoundView[] = Array.from({ length: 4 }, (_, i) => ({
    number: i + 1, mission: Math.max(1, i), captainId: players[i].id,
    team: ['p1', 'p2'], direction: 'clockwise',
    vote: { approvals: i ? 5 : 2, rejections: i ? 1 : 4, abstentions: 0, passed: i > 0,
      ballots: Object.fromEntries(players.map(p => [p.id, p.seat <= (i ? 5 : 2)])) },
    ...(i ? { result: { successes: i === 2 ? 1 : 2, failures: i === 2 ? 1 : 0, passed: i !== 2 } } : {}),
  }));
  for (const anonymous of [false, true]) {
    const html = renderToStaticMarkup(createElement(BattleHistory, { rounds, players, anonymous }));
    assert.deepEqual([...html.matchAll(/aria-label="第(\d+)次提案"/g)].map(m => Number(m[1])), [1, 2, 3, 4]);
    assert.match(html, /组队未通过（流局）/);
    assert.equal((html.match(/✓ 任务成功/g) ?? []).length, 2);
    assert.equal((html.match(/× 任务失败/g) ?? []).length, 1);
    assert.equal((html.match(/aria-label="全员公开票型"/g) ?? []).length, anonymous ? 0 : 4);
  }
});

test('end-game controls follow room ownership, independently of captain or viewing player', () => {
  const game = createGame('host-controls', players, defaultSettings, a => a);
  game.captainIndex = game.captainOrder.indexOf('p2');
  const hostId = 'p1';
  for (const userId of ['p1', 'p2', 'p3']) {
    const room: RoomView = {
      id: 'room', code: 'TEST', hostId, version: 1, phase: 'playing',
      settings: defaultSettings, acceptingNewMembers: false,
      members: players.map(p => ({ ...p, online: true, ready: true })),
      game: projectGame(game, userId),
    };
    const html = renderToStaticMarkup(createElement(GamePanel, { room, userId, disabled: false, connected: true, send: () => {} }));
    assert.equal(html.includes('aria-label="结束游戏"'), userId === hostId);
    assert.equal(html.includes('aria-label="申请中止游戏"'), userId !== hostId);
  }
});

test('GamePanel renders active Jingu Seal notification and ally seat badge for Percival', () => {
  const p8 = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const roles = ['percival', 'merlin', 'morgana', 'loyal', 'loyal', 'loyal', 'assassin', 'mordred'];
  const game = createGame('jingu-test', p8, { ...defaultSettings, playerCount: 8, treasuresEnabled: true }, values => roles as unknown as typeof values);
  // Trigger jinguSeal by loyal player p4
  game.treasuresState = { jinguSeal: { used: true, activatedBy: 'p4' } };

  const percivalView = projectGame(game, 'p1');
  assert.equal(percivalView.self?.treasures?.jinguAllyId, 'p4');

  const room: RoomView = {
    id: 'room-jingu', code: 'JINGU', hostId: 'p1', version: 1, phase: 'playing',
    settings: { ...defaultSettings, playerCount: 8, treasuresEnabled: true },
    acceptingNewMembers: false,
    members: p8.map(p => ({ ...p, online: true, ready: true })),
    game: percivalView,
  };

  const html = renderToStaticMarkup(createElement(GamePanel, {
    room,
    userId: 'p1',
    disabled: false,
    connected: true,
    send: () => {},
  }));

  // Percival sees the active notification modal
  assert.match(html, /金箍显圣 · 护法归位/);
  assert.match(html, /阿弥陀佛，贫僧知晓了/);
  // Percival sees the badge on ally's seat
  assert.match(html, /badge-jingu-ally/);
  assert.match(html, /📿 护法/);
});
