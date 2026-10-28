import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type RoomView } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { GamePanel } from '../src/GamePanel';
import { GuideRules, roleTreasures } from '../src/GuidePanel';
import { IdentityDetails } from '../src/IdentityDetails';
import { SettingsFields, settingsText } from '../src/PresetsPanel';
import { TreasureModal } from '../src/TreasureModal';
import { identityTreasure } from '../src/identity-presentation';
import { GUARDIAN_TREASURE_DISABLED_REASON, treasureAccess } from '../src/treasure-access';

function fixture() {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const settings = { ...defaultSettings, playerCount: 12, treasuresEnabled: true, guardianPerksEnabled: true };
  const game = createGame('guardian-treasure-ui', players, settings, a => a);
  return { players, settings, game };
}

test('blue treasure restriction is private, accurate and keeps the shared treasure button', () => {
  const { players, settings, game } = fixture();
  for (const player of players) {
    const view = projectGame(game, player.id), self = view.self!;
    const access = treasureAccess(view, true);
    if (self.team === 'blue') {
      assert.equal(access.canOpen, false, self.role);
      assert.equal(access.reason, GUARDIAN_TREASURE_DISABLED_REASON);
      assert.deepEqual(identityTreasure(self, 12, true, view), { enabled: false, description: GUARDIAN_TREASURE_DISABLED_REASON });
      const identity = renderToStaticMarkup(createElement(IdentityDetails, { self, players, game: view, treasuresEnabled: true }));
      assert.match(identity, /identity-treasure-entry-btn is-locked/);
      assert.match(identity, /蓝方法宝本局禁用；红方法宝保留/);
      assert.doesNotMatch(identity, /未开启法宝模式/);
      const modal = renderToStaticMarkup(createElement(TreasureModal, { open: true, onClose: () => {}, self, players, game: view, treasuresEnabled: true }));
      assert.match(modal, /蓝方法宝本局禁用；红方法宝保留/);
      assert.doesNotMatch(modal, /treasure-action-box|treasure-result-box|treasure-confirm-btn/);
    } else if (['mordred', 'oberon', 'minion', 'assassin'].includes(self.role)) {
      assert.equal(access.canOpen, true, self.role);
      assert.notEqual(identityTreasure(self, 12, true, view).description, GUARDIAN_TREASURE_DISABLED_REASON);
    }
    const room: RoomView = { id: 'r', code: 'TEST', hostId: players[0].id, version: 1, phase: 'playing', settings,
      acceptingNewMembers: false, members: players.map(p => ({ ...p, online: true, ready: true })), game: view };
    const table = renderToStaticMarkup(createElement(GamePanel, { room, userId: player.id, disabled: false, connected: true, send: () => {} }));
    const entry = table.match(/<button[^>]*treasure-trigger-btn[^>]*>(.*?)<\/button>/s);
    assert.ok(entry, self.role);
    assert.equal(entry[1].trim(), '法宝');
    assert.doesNotMatch(entry[0], /title=|蓝方|天机|照妖镜|锡杖|信物/);
    assert.equal(entry[0].includes('disabled=""'), !access.canOpen);
  }
});

test('saved legacy games keep projected blue treasures even with both settings enabled', () => {
  const { players, settings, game } = fixture();
  game.rulesetVersion = 'standard-no-lancelot-v5';
  const player = players.find(p => game.roles[p.id] === 'percival')!;
  const view = projectGame(game, player.id);
  assert.equal(view.self!.treasures!.disabledReason, undefined);
  assert.equal(treasureAccess(view, true).canOpen, true);
  assert.equal(identityTreasure(view.self!, players.length, settings.treasuresEnabled, view).enabled, true);
});

test('settings and public guides explain the new blue treasure exclusion without changing the switches', () => {
  const { settings } = fixture();
  const render = (guardianPerksEnabled: boolean) => renderToStaticMarkup(createElement(SettingsFields, {
    settings: { ...settings, guardianPerksEnabled }, onChange: () => {},
  }));
  assert.match(render(true), /蓝方法宝禁用，仅红方法宝生效/);
  assert.match(render(false), /双方按角色保留专属法宝/);
  assert.match(settingsText(settings), /专属法宝（仅红方）/);
  assert.match(settingsText(settings, 'standard-no-lancelot-v6'), /专属法宝（仅红方）/);
  assert.doesNotMatch(settingsText(settings, 'standard-no-lancelot-v5'), /仅红方/);
  assert.doesNotMatch(settingsText({ ...settings, guardianPerksEnabled: false }), /仅红方/);
  const rules = renderToStaticMarkup(createElement(GuideRules));
  assert.match(rules, /若已开启护法天机，则蓝方法宝禁用，仅红方法宝生效/);
  assert.match(rules, /也不会出现观音法宝等待期/);
  for (const role of ['percival', 'guinevere', 'loyal'] as const) assert.match(roleTreasures[role], /未开启护法天机时可用/);
});
