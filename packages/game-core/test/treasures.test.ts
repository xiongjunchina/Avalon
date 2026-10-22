import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, transition, projectGame, RuleError } from '../src/index.js';
import type { Player, Settings, Command } from '@avalon/contracts';

const defaultSettings: Settings = {
  playerCount: 10,
  captainMode: 'seat_order',
  anonymousTeamVote: true,
  rejectionScope: 'game',
  ladyEnabled: false,
  earlyAssassinationEnabled: false,
  guardianPerksEnabled: false,
  voiceChatEnabled: false,
  autoRevealRoleEnabled: false,
  treasuresEnabled: true,
};

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    seat: i + 1,
    nickname: `Player${i + 1}`,
  }));
}

function fixedRoles10(roles: string[]): <T>(values: T[]) => T[] {
  return <T>(values: T[]): T[] => {
    return roles as unknown as T[];
  };
}

test('treasures: disabled for playerCount < 8 or when setting is false', () => {
  const players7 = makePlayers(7);
  const settings7 = { ...defaultSettings, playerCount: 7, treasuresEnabled: true };
  const game7 = createGame('g7', players7, settings7, values => values);
  const projected7 = projectGame(game7, players7[0].id);
  assert.equal(projected7.self?.treasures?.enabled, false);

  assert.throws(() => {
    transition(
      game7,
      players7[0].id,
      { type: 'useTreasure', payload: { action: 'jinguSeal' } },
      players7.map(p => p.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'TREASURES_DISABLED');
});

test('treasures: enabled and usable for 8-player matches', () => {
  // 8-player roles: merlin, percival, loyal x3, morgana, assassin, minion
  // Assign: 0:percival, 1:merlin, 2:morgana, 3:loyal, 4:loyal, 5:loyal, 6:assassin, 7:minion
  const roles = ['percival', 'merlin', 'morgana', 'loyal', 'loyal', 'loyal', 'assassin', 'minion'];
  const players = makePlayers(8);
  const settings8 = { ...defaultSettings, playerCount: 8, treasuresEnabled: true };
  let g = createGame('g8', players, settings8, values => roles as unknown as typeof values);

  const projectedPercival = projectGame(g, players[0].id);
  assert.equal(projectedPercival.self?.treasures?.enabled, true);

  // Role reveal
  for (const p of players) {
    g = transition(g, p.id, { type: 'confirmRole', payload: {} }, players.map(x => x.id));
  }

  const percivalId = players[0].id;
  const merlinId = players[1].id;
  const morganaId = players[2].id;
  const loyalId = players[3].id;
  const minionId = players[7].id;

  // Complete mission 1 (size for 8p: 3)
  const cap1 = g.captainOrder[g.captainIndex];
  g = transition(g, cap1, { type: 'proposeTeam', payload: { playerIds: [players[0].id, players[1].id, players[3].id], direction: 'clockwise' } }, players.map(x => x.id));
  g = transition(g, cap1, { type: 'startTeamVote', payload: {} }, players.map(x => x.id));
  for (const p of players) {
    g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, players.map(x => x.id));
  }
  for (const id of [players[0].id, players[1].id, players[3].id]) {
    g = transition(g, id, { type: 'missionVote', payload: { success: true } }, players.map(x => x.id));
  }

  // Complete mission 2 (size for 8p: 4)
  const cap2 = g.captainOrder[g.captainIndex];
  g = transition(g, cap2, { type: 'proposeTeam', payload: { playerIds: [players[0].id, players[1].id, players[3].id, players[4].id], direction: 'clockwise' } }, players.map(x => x.id));
  g = transition(g, cap2, { type: 'startTeamVote', payload: {} }, players.map(x => x.id));
  for (const p of players) {
    g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, players.map(x => x.id));
  }
  for (const id of [players[0].id, players[1].id, players[3].id, players[4].id]) {
    g = transition(g, id, { type: 'missionVote', payload: { success: true } }, players.map(x => x.id));
  }

  assert.equal(g.mission, 3);

  // Percival cannot inspect Merlin candidate
  assert.throws(() => {
    transition(g, percivalId, { type: 'useTreasure', payload: { action: 'tinStaff', targetId: merlinId } }, players.map(x => x.id));
  }, (err: unknown) => err instanceof RuleError && err.message === 'CANNOT_INSPECT_CANDIDATE');

  // Percival cannot inspect Morgana candidate
  assert.throws(() => {
    transition(g, percivalId, { type: 'useTreasure', payload: { action: 'tinStaff', targetId: morganaId } }, players.map(x => x.id));
  }, (err: unknown) => err instanceof RuleError && err.message === 'CANNOT_INSPECT_CANDIDATE');

  // Percival inspects minion -> reveals red
  g = transition(g, percivalId, { type: 'useTreasure', payload: { action: 'tinStaff', targetId: minionId } }, players.map(x => x.id));
  const percivalView = projectGame(g, percivalId);
  assert.equal(percivalView.self?.treasures?.tinStaff?.used, true);
  assert.equal(percivalView.self?.treasures?.tinStaff?.result?.team, 'red');
  assert.equal(percivalView.self?.treasures?.tinStaff?.result?.targetId, minionId);
});

test('treasures: Percival tinStaff cannot inspect candidates or before 2 missions, masks Mordred as blue', () => {
  // 10-player roles in config: merlin, percival, guinevere, loyal x3, morgana, assassin, mordred, oberon
  // Assign: 0:percival, 1:merlin, 2:morgana, 3:mordred, 4:guinevere, 5:loyal, 6:loyal, 7:loyal, 8:assassin, 9:oberon
  const roles = ['percival', 'merlin', 'morgana', 'mordred', 'guinevere', 'loyal', 'loyal', 'loyal', 'assassin', 'oberon'];
  const players = makePlayers(10);
  let g = createGame('g10', players, defaultSettings, fixedRoles10(roles));

  // Role reveal
  for (const p of players) {
    g = transition(g, p.id, { type: 'confirmRole', payload: {} }, players.map(x => x.id));
  }

  const percivalId = players[0].id;
  const merlinId = players[1].id;
  const morganaId = players[2].id;
  const mordredId = players[3].id;
  const loyalId = players[5].id;

  // Percival tries to use tinStaff before 2 completed missions -> CANNOT_USE_YET
  assert.throws(() => {
    transition(
      g,
      percivalId,
      { type: 'useTreasure', payload: { action: 'tinStaff', targetId: loyalId } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'CANNOT_USE_YET');

  // Complete mission 1 (size for 10p: 3)
  const cap1 = g.captainOrder[g.captainIndex];
  g = transition(g, cap1, { type: 'proposeTeam', payload: { playerIds: [players[0].id, players[1].id, players[4].id], direction: 'clockwise' } }, players.map(x => x.id));
  g = transition(g, cap1, { type: 'startTeamVote', payload: {} }, players.map(x => x.id));
  for (const p of players) {
    g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, players.map(x => x.id));
  }
  for (const id of [players[0].id, players[1].id, players[4].id]) {
    g = transition(g, id, { type: 'missionVote', payload: { success: true } }, players.map(x => x.id));
  }

  // Complete mission 2 (size for 10p: 4)
  const cap2 = g.captainOrder[g.captainIndex];
  g = transition(g, cap2, { type: 'proposeTeam', payload: { playerIds: [players[0].id, players[1].id, players[4].id, players[5].id], direction: 'clockwise' } }, players.map(x => x.id));
  g = transition(g, cap2, { type: 'startTeamVote', payload: {} }, players.map(x => x.id));
  for (const p of players) {
    g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, players.map(x => x.id));
  }
  for (const id of [players[0].id, players[1].id, players[4].id, players[5].id]) {
    g = transition(g, id, { type: 'missionVote', payload: { success: true } }, players.map(x => x.id));
  }

  assert.equal(g.mission, 3);
  // Now 2 missions completed. Percival tries to inspect Merlin or Morgana -> CANNOT_INSPECT_CANDIDATE
  assert.throws(() => {
    transition(
      g,
      percivalId,
      { type: 'useTreasure', payload: { action: 'tinStaff', targetId: merlinId } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'CANNOT_INSPECT_CANDIDATE');

  assert.throws(() => {
    transition(
      g,
      percivalId,
      { type: 'useTreasure', payload: { action: 'tinStaff', targetId: morganaId } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'CANNOT_INSPECT_CANDIDATE');

  // Percival tries to inspect self -> CANNOT_INSPECT_SELF
  assert.throws(() => {
    transition(
      g,
      percivalId,
      { type: 'useTreasure', payload: { action: 'tinStaff', targetId: percivalId } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'CANNOT_INSPECT_SELF');

  // Percival inspects Mordred (Yellow Eyebrow) -> disguised as blue!
  g = transition(
    g,
    percivalId,
    { type: 'useTreasure', payload: { action: 'tinStaff', targetId: mordredId } },
    players.map(x => x.id)
  );

  const percivalView = projectGame(g, percivalId);
  assert.equal(percivalView.self?.treasures?.tinStaff?.used, true);
  assert.equal(percivalView.self?.treasures?.tinStaff?.result?.team, 'blue');
  assert.equal(percivalView.self?.treasures?.tinStaff?.result?.targetId, mordredId);

  // Other players see no result
  const otherView = projectGame(g, players[1].id);
  assert.equal(otherView.self?.treasures?.tinStaff, undefined);

  // Percival cannot use it again
  assert.throws(() => {
    transition(
      g,
      percivalId,
      { type: 'useTreasure', payload: { action: 'tinStaff', targetId: loyalId } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'ALREADY_USED');
});

test('treasures: Mordred humanBag bans a player from being nominated in mission 3', () => {
  const roles = ['percival', 'merlin', 'morgana', 'mordred', 'guinevere', 'loyal', 'loyal', 'loyal', 'assassin', 'oberon'];
  const players = makePlayers(10);
  let g = createGame('g10-bag', players, defaultSettings, fixedRoles10(roles));

  for (const p of players) {
    g = transition(g, p.id, { type: 'confirmRole', payload: {} }, players.map(x => x.id));
  }

  // Fast forward 2 missions to mission 3
  for (let m = 1; m <= 2; m++) {
    const size = m === 1 ? 3 : 4;
    const team = players.slice(0, size).map(p => p.id);
    const cap = g.captainOrder[g.captainIndex];
    g = transition(g, cap, { type: 'proposeTeam', payload: { playerIds: team, direction: 'clockwise' } }, players.map(x => x.id));
    g = transition(g, cap, { type: 'startTeamVote', payload: {} }, players.map(x => x.id));
    for (const p of players) g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, players.map(x => x.id));
    for (const id of team) g = transition(g, id, { type: 'missionVote', payload: { success: true } }, players.map(x => x.id));
  }

  assert.equal(g.mission, 3);
  const mordredId = players[3].id;
  const currentCap = g.captainOrder[g.captainIndex];
  const targetId = players[1].id; // Merlin

  // Cannot ban current captain
  assert.throws(() => {
    transition(
      g,
      mordredId,
      { type: 'useTreasure', payload: { action: 'humanBag', targetId: currentCap } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'CANNOT_BAN_CAPTAIN');

  // Successfully ban Merlin
  g = transition(
    g,
    mordredId,
    { type: 'useTreasure', payload: { action: 'humanBag', targetId } },
    players.map(x => x.id)
  );

  const view = projectGame(g, players[0].id);
  assert.equal(view.humanBagBannedPlayerId, targetId);

  // Captain tries to propose team containing Merlin -> PLAYER_BANNED_BY_HUMAN_BAG
  assert.throws(() => {
    transition(
      g,
      currentCap,
      { type: 'proposeTeam', payload: { playerIds: [players[0].id, targetId, players[4].id, players[5].id], direction: 'clockwise' } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'PLAYER_BANNED_BY_HUMAN_BAG');

  // Captain proposes team without Merlin -> succeeds
  const cleanTeam = [players[0].id, players[2].id, players[4].id, players[5].id];
  g = transition(
    g,
    currentCap,
    { type: 'proposeTeam', payload: { playerIds: cleanTeam, direction: 'clockwise' } },
    players.map(x => x.id)
  );
  assert.equal(g.phase, 'discussion');
});

test('treasures: Loyal Guardian jinguSeal requires 2 failures and reveals ally to Percival only', () => {
  const roles = ['percival', 'merlin', 'morgana', 'mordred', 'guinevere', 'loyal', 'loyal', 'loyal', 'assassin', 'oberon'];
  const players = makePlayers(10);
  let g = createGame('g10-seal', players, defaultSettings, fixedRoles10(roles));

  for (const p of players) {
    g = transition(g, p.id, { type: 'confirmRole', payload: {} }, players.map(x => x.id));
  }

  const loyalId = players[5].id;
  const percivalId = players[0].id;

  // Not in peril yet -> NOT_IN_PERIL
  assert.throws(() => {
    transition(
      g,
      loyalId,
      { type: 'useTreasure', payload: { action: 'jinguSeal' } },
      players.map(x => x.id)
    );
  }, (err: unknown) => err instanceof RuleError && err.message === 'NOT_IN_PERIL');

  // Fail 2 missions
  for (let m = 1; m <= 2; m++) {
    const size = m === 1 ? 3 : 4;
    const team = [players[0].id, players[2].id, players[3].id, players[4].id].slice(0, size);
    const cap = g.captainOrder[g.captainIndex];
    g = transition(g, cap, { type: 'proposeTeam', payload: { playerIds: team, direction: 'clockwise' } }, players.map(x => x.id));
    g = transition(g, cap, { type: 'startTeamVote', payload: {} }, players.map(x => x.id));
    for (const p of players) g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, players.map(x => x.id));
    for (const id of team) {
      const isRed = ['morgana', 'mordred'].includes(roles[players.findIndex(p => p.id === id)]);
      g = transition(g, id, { type: 'missionVote', payload: { success: !isRed } }, players.map(x => x.id));
    }
  }

  // 2 missions failed
  assert.equal(g.rounds.filter(r => r.result && !r.result.passed).length, 2);

  // Now loyal guardian uses jinguSeal
  g = transition(
    g,
    loyalId,
    { type: 'useTreasure', payload: { action: 'jinguSeal' } },
    players.map(x => x.id)
  );

  // Percival sees jinguAllyId
  const percivalView = projectGame(g, percivalId);
  assert.equal(percivalView.self?.treasures?.jinguAllyId, loyalId);

  // Loyal view sees activatedBy
  const loyalView = projectGame(g, loyalId);
  assert.equal(loyalView.self?.treasures?.jinguSeal?.used, true);
  assert.equal(loyalView.self?.treasures?.jinguSeal?.activatedBy, loyalId);

  // Other players see no jinguAllyId
  const assassinView = projectGame(g, players[8].id);
  assert.equal(assassinView.self?.treasures?.jinguAllyId, undefined);
});

test('treasures: Oberon bananaFan arms and blows away passed proposal without incrementing rejectionCount', () => {
  const roles = ['percival', 'merlin', 'morgana', 'mordred', 'guinevere', 'loyal', 'loyal', 'loyal', 'assassin', 'oberon'];
  const players = makePlayers(10);
  let g = createGame('g10-fan', players, defaultSettings, fixedRoles10(roles));

  for (const p of players) {
    g = transition(g, p.id, { type: 'confirmRole', payload: {} }, players.map(x => x.id));
  }

  const oberonId = players[9].id;
  const initialCapIndex = g.captainIndex;
  const initialCap = g.captainOrder[initialCapIndex];

  // Oberon arms the fan during discussion
  const team1 = [players[0].id, players[1].id, players[4].id];
  g = transition(g, initialCap, { type: 'proposeTeam', payload: { playerIds: team1, direction: 'clockwise' } }, players.map(x => x.id));

  g = transition(
    g,
    oberonId,
    { type: 'useTreasure', payload: { action: 'bananaFan', armed: true } },
    players.map(x => x.id)
  );

  const oberonView = projectGame(g, oberonId);
  assert.equal(oberonView.self?.treasures?.bananaFan?.armed, true);

  // Start vote and pass it
  g = transition(g, initialCap, { type: 'startTeamVote', payload: {} }, players.map(x => x.id));
  for (const p of players) {
    g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, players.map(x => x.id));
  }

  // Because fan was armed:
  // 1. Phase should return to proposing, NOT mission!
  assert.equal(g.phase, 'proposing');
  // 2. Captain index should rotate to next captain!
  assert.equal(g.captainIndex, (initialCapIndex + 1) % 10);
  // 3. Rejection count MUST NOT increment!
  assert.equal(g.rejectionCount, 0);
  // 4. Oberon's fan is consumed
  assert.equal(g.treasuresState?.bananaFan?.used, true);
  assert.equal(g.treasuresState?.bananaFan?.armed, false);
  // 5. Public notice is displayed
  assert.ok(g.bananaFanNotice && g.bananaFanNotice.includes('芭蕉神扇'));
});
