import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type RoomView } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { gameAction, gameScreen } from '../src/screens/game';
import { guideScreen } from '../src/screens/guide';
import { settingsScreen } from '../src/screens/settings';
import { layoutWebScreen } from '../src/ui/web-layout';
import { webGuideRules } from '../src/ui/web-guide-rules';

function fixture() {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const settings = { ...defaultSettings, playerCount: 12, treasuresEnabled: true, guardianPerksEnabled: true };
  const game = createGame('mini-guardian-treasure', players, settings, a => a);
  const player = players.find(p => game.roles[p.id] === 'percival')!;
  const room: RoomView = { id: 'r', code: '123456', hostId: players[0].id, version: 1, phase: 'playing', settings,
    acceptingNewMembers: false, members: players.map(p => ({ ...p, online: true, ready: true })), game: projectGame(game, player.id) };
  return { players, settings, game, player, room };
}

test('mini game locks blue treasure entry from private projection while legacy entry stays available', () => {
  const { game, player, room } = fixture();
  const ui = { privateRoleVisible: true, ballotVisible: false, overlay: 'identity' as const };
  const identity = gameScreen(room, player, ui);
  const button = layoutWebScreen(identity, { width: 390, height: 844, top: 0, bottom: 0 }).nodes.find(n => n.id === 'treasures');
  assert.equal(button?.disabled, true);
  assert.match(button!.detail!, /蓝方法宝本局禁用；红方法宝保留/);
  assert.equal(gameAction(room, player, 'treasure:tinStaff', ui), undefined);
  const treasure = gameScreen(room, player, { ...ui, overlay: 'treasures' });
  assert.match(JSON.stringify(treasure.rows), /蓝方法宝本局禁用；红方法宝保留/);
  assert.equal(treasure.rows.some(r => r.id === 'treasure:tinStaff'), false);
  assert.equal(treasure.rows.some(r => r.id.startsWith('player:')), false);
  game.rulesetVersion = 'standard-no-lancelot-v5';
  room.game = projectGame(game, player.id);
  const legacy = layoutWebScreen(gameScreen(room, player, ui), { width: 390, height: 844, top: 0, bottom: 0 }).nodes.find(n => n.id === 'treasures');
  assert.equal(legacy?.disabled, false);
});

test('mini game settings and both guide representations explain red-only treasures', () => {
  const { settings } = fixture();
  assert.match(settingsScreen(settings).rows.find(r => r.id === 'treasureRule')!.text, /蓝方禁用、红方保留/);
  assert.match(settingsScreen({ ...settings, guardianPerksEnabled: false }).rows.find(r => r.id === 'treasureRule')!.text, /双方按角色保留/);
  assert.match(guideScreen().rows.find(r => r.id === 'guide:treasureBalance')!.text, /蓝方法宝禁用，红方法宝保留/);
  assert.match(webGuideRules.map(r => r.text).join(''), /若已开启护法天机，则蓝方法宝禁用，仅红方法宝生效/);
});
