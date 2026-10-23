import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type HeartBellMessage } from '@avalon/contracts';
import { createGame, projectGame, transition } from '@avalon/game-core';
import { HeartBellControls, HeartBellDialog, heartBellNoticeKey } from '../src/HeartBell';
import { TreasureModal } from '../src/TreasureModal';
import { treasureAccess } from '../src/treasure-access';
import { readPrivateAcknowledgement, savePrivateAcknowledgement } from '../src/private-notice';

function fixture() {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const game = createGame('bell-ui', players, { ...defaultSettings, playerCount: 12, treasuresEnabled: true }, a => a);
  const sender = players.find(p => game.roles[p.id] === 'minion')!.id;
  const target = players.find(p => game.roles[p.id] === 'morgana')!.id;
  game.phase = 'mission';
  game.rounds = [{ number: 1, mission: 1, captainId: players[0].id, team: [sender, target, players[0].id], direction: 'clockwise', vote: { passed: true, approvals: 12, rejections: 0 } }];
  const sent = transition(game, sender, { type: 'useTreasure', payload: { action: 'heartBell', targetId: target, advice: 'sabotage' } }, players.map(p => p.id));
  return { players, game, sent, sender, target };
}

test('Morgana can review incoming bell despite having no active treasure of his own', () => {
  const { game, sent, players, sender, target } = fixture();
  assert.equal(treasureAccess(projectGame(game, target), true).canOpen, false);
  const view = projectGame(sent, target);
  assert.equal(treasureAccess(view, true).canOpen, true);
  const html = renderToStaticMarkup(createElement(TreasureModal, { open: true, onClose: () => {}, self: view.self!, players, game: view, treasuresEnabled: true, userId: target }));
  assert.match(html, /同心铃 · 私密传音回看/);
  assert.match(html, /建议作祟/);
  assert.doesNotMatch(html, /选择同车同伙/);
  for (const player of players) assert.equal(Boolean(heartBellNoticeKey(projectGame(sent, player.id), player.id)), player.id === target);
  assert.equal(heartBellNoticeKey(projectGame(sent), 'spectator'), null);
  assert.equal(heartBellNoticeKey(projectGame(sent, sender), sender), null);
});

test('fixed options are gated until an eligible target is selected; usage displays a sender receipt', () => {
  const { game, sent, players, sender, target } = fixture();
  const render = (g: typeof game) => renderToStaticMarkup(createElement(HeartBellControls, { bell: projectGame(g, sender).self!.treasures!.heartBell, players, disabled: false, send: () => {} }));
  const html = render(game);
  assert.match(html, new RegExp(`<option value="${target}">`));
  assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<textarea|<input/);
  const used = render(sent);
  assert.match(used, /本局已使用/);
  assert.match(used, /已私密送达/);
  assert.doesNotMatch(used, /<select|<button/);
});

test('incoming advice is distinguishable from an expired message and acknowledges locally without secret storage', () => {
  const { sent, target } = fixture();
  const view = projectGame(sent, target);
  const message = view.self!.treasures!.incomingHeartBell!;
  const render = (m: HeartBellMessage) => renderToStaticMarkup(createElement(HeartBellDialog, { message: m, onClose: () => {} }));
  assert.match(render(message), /如何出牌由你决定/);
  assert.match(render({ ...message, active: false }), /已过出牌时机/);
  assert.doesNotMatch(render(message), /女妖精|蜘蛛精|senderId/);
  const records = new Map<string, string>();
  const storage = { getItem: (k: string) => records.get(k) ?? null, setItem: (k: string, v: string) => { records.set(k, v); } };
  const key = heartBellNoticeKey(view, target)!;
  savePrivateAcknowledgement(key, storage);
  assert.equal(readPrivateAcknowledgement(key, storage), true);
  assert.deepEqual([...records.values()], ['read']);
  assert.equal(readPrivateAcknowledgement(heartBellNoticeKey({ ...view, id: 'new-game' }, target), storage), false);
  assert.equal(readPrivateAcknowledgement(heartBellNoticeKey(view, 'another-seat'), storage), false);
});
