import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { GuanyinWindowDialog, remainingGuanyinSeconds } from '../src/GuanyinWindowDialog';

function fixture() {
  const players = Array.from({ length: 9 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const game = createGame('guanyin-window', players, { ...defaultSettings, playerCount: 9, treasuresEnabled: true }, a => a);
  game.phase = 'guanyin_window';
  game.guanyinEndsAt = '2026-10-28T12:00:05Z';
  const owner = players.find(p => game.roles[p.id] === 'guinevere')!;
  const viewer = players.find(p => p.id !== owner.id)!;
  return { game, players, owner, viewer };
}

test('Guanyin keeps the full five-second selection window with a nonnegative monotonic countdown', () => {
  assert.deepEqual([0, 999, 1000, 4000, 4999, 5000, 6000].map(ms => remainingGuanyinSeconds(5000, ms)), [5, 5, 4, 1, 1, 0, 0]);
  const { game, players, owner } = fixture();
  for (const serverTime of ['2026-10-28T12:00:00Z', undefined]) {
    const html = renderToStaticMarkup(createElement(GuanyinWindowDialog, {
      game: projectGame(game, owner.id), players, userId: owner.id, serverTime, disabled: false, send: () => {},
    }));
    assert.match(html, /剩余时间 5 秒/);
    assert.match(html, /暂不发动 · 保留宝镜/);
  }
});

test('neutral Guanyin progress tracks the five-second deadline without exposing owner identity', () => {
  const { game, players, viewer, owner } = fixture();
  const html = renderToStaticMarkup(createElement(GuanyinWindowDialog, {
    game: projectGame(game, viewer.id), players, userId: viewer.id,
    serverTime: '2026-10-28T12:00:01Z', disabled: false, send: () => {},
  }));
  assert.match(html, /剩余时间 4 秒/);
  assert.match(html, /width:80%/);
  assert.doesNotMatch(html, /照耀此仙心性/);
  assert.doesNotMatch(html, new RegExp(`${owner.seat}号 ${owner.nickname}`));
});
