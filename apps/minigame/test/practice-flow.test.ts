import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings } from '@avalon/contracts';
import { PracticeSession } from '../src/screens/practice.js';
import { gameAction, syncGameUi, type GameUiState } from '../src/screens/game.js';

test('5–12 player practice games complete through the real Mini Game actions and shared rules', () => {
  for (let count = 5; count <= 12; count++) {
    const session = new PracticeSession({ ...defaultSettings, playerCount: count, ladyEnabled: true, earlyAssassinationEnabled: true, treasuresEnabled: true }, '行者');
    const ui: GameUiState = { privateRoleVisible: false, ballotVisible: false };
    for (let step = 0; step < 200 && session.view().phase !== 'finished'; step++) {
      const room = session.view(), game = room.game!;
      syncGameUi(ui, room);
      ui.selectedIds = game.players.filter(player => player.id !== game.humanBagBannedPlayerId)
        .slice(0, game.missionSizes[game.mission - 1]).map(player => player.id);
      ui.targetId = game.players.find(player => player.id !== session.user.id)?.id;
      if (game.phase === 'guanyin_window') {
        ui.privateRoleVisible = true;
        ui.targetId = game.rounds.at(-1)?.team.find(id => id !== session.user.id);
      }
      const action = ['confirmRole', 'propose', 'startTeamVote', 'approve', 'treasure:guanyinMirror', 'missionSuccess', 'earlySkip', 'assassinate']
        .map(id => gameAction(room, session.user, id, ui)).find(Boolean);
      if (action) session.act(action);
      else assert.equal(session.stepBot(), true, count + '人练习未能推进：' + game.phase);
    }
    assert.equal(session.view().phase, 'finished', count + '人练习必须能正常结算');
    assert.ok(session.view().game?.result);
  }
});

test('practice rematches retain the last deal as weight input without exposing audit through the player view', () => {
  const first = new PracticeSession(defaultSettings, '行者');
  const second = new PracticeSession(defaultSettings, '行者', first);
  const previousRoles = first.perspectives();
  const evidence = (second as unknown as { game: import('@avalon/game-core').GameState }).game.roleAssignmentAudit!;
  for (const player of previousRoles) assert.deepEqual(evidence.players[player.id].recentRoles, [player.role]);
  assert.equal('roleAssignmentAudit' in second.view().game!, false);
});
