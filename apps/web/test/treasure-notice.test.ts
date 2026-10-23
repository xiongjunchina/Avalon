import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type RoomView } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { GamePanel } from '../src/GamePanel';
import { treasureAccess } from '../src/treasure-access';
import { guanyinNoticeKey } from '../src/guanyin-notice';
import { privateNoticeVisible, readPrivateAcknowledgement, savePrivateAcknowledgement } from '../src/private-notice';

function fixture(count: number, enabled = true) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const settings = { ...defaultSettings, playerCount: count, treasuresEnabled: enabled };
  const game = createGame('treasure-notice', players, settings, a => a);
  return { players, settings, game };
}

test('every role has a visible treasure entry; count, room setting and role gate access', () => {
  for (const [count, enabled] of [[6, true], [8, false], [12, true]] as const) {
    const { game, players, settings } = fixture(count, enabled);
    for (const player of players) {
      const view = projectGame(game, player.id);
      const role = view.self!.role;
      const expected = role === 'assassin' || (count >= 8 && enabled && ['percival', 'guinevere', 'loyal', 'mordred', 'oberon', 'minion'].includes(role));
      assert.equal(treasureAccess(view, enabled).canOpen, expected, `${count}p ${role}`);
      const room: RoomView = {
        id: 'r', code: 'TEST', hostId: players[0].id, version: 1, phase: 'playing', settings,
        acceptingNewMembers: false, members: players.map(p => ({ ...p, online: true, ready: true })), game: view,
      };
      const html = renderToStaticMarkup(createElement(GamePanel, { room, userId: player.id, disabled: false, connected: true, send: () => {} }));
      const entry = html.match(/<button[^>]*treasure-trigger-btn[^>]*>/)?.[0];
      assert.ok(entry, `${role} has the same entry`);
      assert.equal(entry.includes('disabled=""'), !expected);
    }
  }
});

test('only Guanyin receives a private notice, and it survives the mission phase and state reload', () => {
  const { game, players } = fixture(12);
  const owner = players.find(p => game.roles[p.id] === 'guinevere')!;
  const target = players.find(p => game.roles[p.id] === 'mordred')!;
  game.phase = 'mission';
  game.treasuresState!.guanyinMirror = { used: true, result: { targetId: target.id, alignment: 'evil' } };
  for (const player of players) {
    const view = projectGame(structuredClone(game), player.id);
    assert.equal(Boolean(guanyinNoticeKey(view, player.id)), player.id === owner.id);
    if (player.id !== owner.id) assert.equal(view.self?.treasures?.guanyinMirror, undefined);
  }
  assert.equal(guanyinNoticeKey(projectGame(game), 'spectator'), null);
});

test('read acknowledgement is scoped by game and seat, stores no secret, and handles blocked storage', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const { game, players } = fixture(9);
  const owner = players.find(p => game.roles[p.id] === 'guinevere')!;
  game.treasuresState!.guanyinMirror = { used: true, result: { targetId: 'p9', alignment: 'evil' } };
  const view = projectGame(game, owner.id);
  const key = guanyinNoticeKey(view, owner.id)!;
  assert.equal(readPrivateAcknowledgement(key, storage), false);
  savePrivateAcknowledgement(key, storage);
  assert.equal(readPrivateAcknowledgement(key, storage), true);
  assert.deepEqual([...data.values()], ['read']);
  assert.equal(readPrivateAcknowledgement(guanyinNoticeKey({ ...view, id: 'next-game' }, owner.id), storage), false);
  assert.equal(readPrivateAcknowledgement(guanyinNoticeKey(view, 'other-seat'), storage), false);
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.doesNotThrow(() => savePrivateAcknowledgement(key, blocked));
  assert.equal(readPrivateAcknowledgement(key, blocked), false);
});

test('foreground notices stay open until read; background/reconnect require explicit review', () => {
  const base = { key: 'game-seat', unread: true, connected: true, visible: true, automatic: true, reviewing: null };
  assert.equal(privateNoticeVisible(base), true);
  assert.equal(privateNoticeVisible({ ...base, visible: false }), false);
  assert.equal(privateNoticeVisible({ ...base, connected: false }), false);
  assert.equal(privateNoticeVisible({ ...base, automatic: false }), false);
  assert.equal(privateNoticeVisible({ ...base, unread: false }), false);
  assert.equal(privateNoticeVisible({ ...base, unread: false, automatic: false, reviewing: base.key }), true);
  assert.equal(privateNoticeVisible({ ...base, unread: false, reviewing: 'previous-game' }), false);
});
