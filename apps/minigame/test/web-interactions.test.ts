import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings } from '@avalon/contracts';
import { PracticeSession } from '../src/screens/practice.js';
import { handleGameOverlay, syncGameUi, gameScreen, type GameUiState } from '../src/screens/game.js';

test('practice changes perspective without recreating the game or its roles', () => {
  const session = new PracticeSession(defaultSettings, '行者');
  const first = session.view(), secondId = first.game!.players[1]!.id;
  session.switchSeat(secondId);
  assert.equal(session.user.id, secondId);
  assert.equal(session.view().game!.id, first.game!.id);
  assert.ok(session.view().game?.self);
  assert.equal(session.perspectives().length, defaultSettings.playerCount);
});

test('team voting opens its own sheet and selecting a card does not submit', () => {
  const practice = new PracticeSession(defaultSettings, '行者');
  const room = practice.view();
  room.game!.phase = 'team_vote'; room.game!.self!.teamVoted = false;
  const ui: GameUiState = { privateRoleVisible: false, ballotVisible: false };
  syncGameUi(ui, room);
  assert.equal(ui.overlay, 'vote');
  assert.equal(handleGameOverlay(ui, room, 'vote-choice:approve'), true);
  assert.equal(ui.voteChoice, true);
  const model = gameScreen(room, practice.user, ui);
  assert.equal(model.web?.sheet, 'vote');
  assert.ok(model.rows.some(row => row.id === 'submitVote'));
  handleGameOverlay(ui, room, 'overlayClose');
  assert.equal(ui.overlay, undefined);
  assert.equal(ui.privateRoleVisible, false);
});
