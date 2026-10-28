import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type Command, type Player, type Role, type RoundView } from '@avalon/contracts';
import { createGame, projectGame, transition, teamOf, treasuresEnabledFor, RULESET_VERSION, type GameState } from '../src/index.js';

function fixture(playerCount = 12, guardianPerksEnabled = true, treasuresEnabled = true, rulesetVersion = RULESET_VERSION) {
  const players: Player[] = Array.from({ length: playerCount }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const g = createGame(`balance-${playerCount}`, players,
    { ...defaultSettings, playerCount, guardianPerksEnabled, treasuresEnabled }, a => a, { randomBelow: () => 0n });
  g.rulesetVersion = rulesetVersion;
  return g;
}
const playerWith = (g: GameState, role: Role) => g.players.find(p => g.roles[p.id] === role)!.id;
const use = (g: GameState, userId: string, payload: Extract<Command, { type: 'useTreasure' }>['payload']) =>
  transition(g, userId, { type: 'useTreasure', payload }, g.players.map(p => p.id));
const round = (g: GameState, number: number, team: string[], passed?: boolean): RoundView => ({
  number, mission: number, captainId: g.captainOrder[0], team, direction: 'clockwise',
  ...(passed === undefined ? {} : { result: { successes: passed ? team.length : team.length - 1, failures: passed ? 0 : 1, passed } }),
});
function afterTwoFailures(g: GameState) {
  g.phase = 'proposing'; g.mission = 3;
  g.rounds = [round(g, 1, g.players.slice(0, 3).map(p => p.id), false), round(g, 2, g.players.slice(0, 4).map(p => p.id), false)];
  return g;
}

test('v6 treasure policy covers every role, both feature switches, and all supported player counts', () => {
  assert.equal(RULESET_VERSION, 'standard-no-lancelot-v6');
  for (const count of [5, 6, 7, 8, 9, 10, 11, 12]) {
    for (const guardian of [false, true]) for (const treasures of [false, true]) {
      const g = fixture(count, guardian, treasures);
      for (const player of g.players) {
        const role = g.roles[player.id], blue = teamOf(role) === 'blue';
        const expected = treasures && count >= 8 && !(guardian && blue);
        const self = projectGame(g, player.id).self!;
        assert.equal(treasuresEnabledFor(g.settings, count, role), expected, `${count}/${guardian}/${treasures}/${role}`);
        assert.equal(self.treasures?.enabled, expected, `${count}/${guardian}/${treasures}/${role}`);
        if (treasures && count >= 8 && guardian && blue) {
          assert.deepEqual(self.treasures, { enabled: false, disabledReason: 'guardian_perks' });
        } else {
          assert.equal(self.treasures?.disabledReason, undefined);
        }
      }
    }
  }
});

test('v6 guardian mode rejects every blue treasure on the authoritative transition', () => {
  for (const count of [8, 9, 10, 11, 12]) {
    const g = afterTwoFailures(fixture(count));
    const percival = playerWith(g, 'percival'), loyal = playerWith(g, 'loyal'), assassin = playerWith(g, 'assassin');
    assert.throws(() => use(g, percival, { action: 'tinStaff', targetId: assassin }), { message: 'BLUE_TREASURES_DISABLED' });
    assert.throws(() => use(g, loyal, { action: 'jinguSeal' }), { message: 'BLUE_TREASURES_DISABLED' });
    if (count >= 9) {
      g.phase = 'guanyin_window';
      g.rounds.push(round(g, 3, [assassin, percival, loyal]));
      const guanyin = playerWith(g, 'guinevere');
      assert.throws(() => use(g, guanyin, { action: 'guanyinMirror', targetId: assassin }), { message: 'BLUE_TREASURES_DISABLED' });
      assert.throws(() => use(g, guanyin, { action: 'guanyinMirror', skip: true }), { message: 'BLUE_TREASURES_DISABLED' });
    }
    // Bypassing the UI with another role's action cannot bypass the blue restriction.
    assert.throws(() => use(g, playerWith(g, 'merlin'), { action: 'bananaFan', armed: true }), { message: 'BLUE_TREASURES_DISABLED' });
  }
});

test('v6 guardian mode keeps human bag, banana fan and heart bell operational for red players', () => {
  for (const count of [8, 9, 10, 11, 12]) {
    const g = afterTwoFailures(fixture(count));
    const mordred = playerWith(g, 'mordred'), loyal = playerWith(g, 'loyal');
    const bag = use(g, mordred, { action: 'humanBag', targetId: loyal });
    assert.equal(bag.treasuresState?.humanBag?.targetId, loyal);
    assert.equal(projectGame(bag, mordred).self?.treasures?.humanBag?.used, true);
    assert.equal(projectGame(bag, loyal).humanBagBannedPlayerId, loyal);
    if (count >= 10) {
      const oberon = playerWith(g, 'oberon');
      const fan = use(g, oberon, { action: 'bananaFan', armed: true });
      assert.equal(projectGame(fan, oberon).self?.treasures?.bananaFan?.armed, true);
    }
    if (count >= 11) {
      const demon = playerWith(g, 'minion'), assassin = playerWith(g, 'assassin');
      g.phase = 'mission'; g.mission = 1; g.rounds = [round(g, 1, [demon, assassin, loyal])];
      const bell = use(g, demon, { action: 'heartBell', targetId: assassin, advice: 'sabotage' });
      assert.equal(projectGame(bell, demon).self?.treasures?.heartBell?.sent?.targetId, assassin);
      assert.equal(projectGame(bell, assassin).self?.treasures?.incomingHeartBell?.advice, 'sabotage');
      assert.equal(projectGame(bell, loyal).self?.treasures?.incomingHeartBell, undefined);
      assert.equal(projectGame(bell).self, undefined);
    }
  }
});

test('disabling guardian clues restores all blue treasure actions in v6; legacy v5 retains the saved rules', () => {
  for (const [guardian, version] of [[false, RULESET_VERSION], [true, 'standard-no-lancelot-v5']] as const) {
    const g = afterTwoFailures(fixture(12, guardian, true, version));
    const percival = playerWith(g, 'percival'), loyal = playerWith(g, 'loyal'), assassin = playerWith(g, 'assassin');
    const inspected = use(g, percival, { action: 'tinStaff', targetId: assassin });
    assert.equal(projectGame(inspected, percival).self?.treasures?.tinStaff?.result?.team, 'red');
    const ally = use(g, loyal, { action: 'jinguSeal' });
    assert.equal(projectGame(ally, percival).self?.treasures?.jinguAllyId, loyal);
    assert.equal(projectGame(ally, loyal).self?.treasures?.jinguSeal?.used, true);
    g.phase = 'guanyin_window';
    g.rounds.push(round(g, 3, [assassin, loyal, percival]));
    const guanyin = playerWith(g, 'guinevere');
    const mirrored = use(g, guanyin, { action: 'guanyinMirror', targetId: assassin });
    assert.equal(projectGame(mirrored, guanyin).self?.treasures?.guanyinMirror?.result?.alignment, 'evil');
    assert.equal(projectGame(mirrored, guanyin).self?.treasures?.disabledReason, undefined);
  }
});

test('new guardian-mode votes skip the Guanyin window while no-clue and legacy games keep it', () => {
  for (const [guardian, version, expected] of [
    [true, RULESET_VERSION, 'mission'], [false, RULESET_VERSION, 'guanyin_window'], [true, 'standard-no-lancelot-v5', 'guanyin_window'],
  ] as const) for (const count of [9, 10, 11, 12]) {
    let g = fixture(count, guardian, true, version);
    const online = g.players.map(p => p.id);
    for (const p of g.players) g = transition(g, p.id, { type: 'confirmRole', payload: {} }, online);
    const captain = g.captainOrder[g.captainIndex];
    g = transition(g, captain, { type: 'proposeTeam', payload: { playerIds: online.slice(0, 3), direction: 'clockwise' } }, online);
    g = transition(g, captain, { type: 'startTeamVote', payload: {} }, online);
    for (const p of g.players) g = transition(g, p.id, { type: 'teamVote', payload: { approve: true } }, online);
    assert.equal(g.phase, expected);
    assert.equal(Boolean(g.guanyinEndsAt), expected === 'guanyin_window');
  }
});

test('blue restriction hides saved treasure-derived information while preserving native vision and guardian clues', () => {
  const g = afterTwoFailures(fixture());
  const assassin = playerWith(g, 'assassin'), loyal = playerWith(g, 'loyal');
  g.treasuresState = {
    tinStaff: { used: true, result: { targetId: assassin, team: 'red' } },
    guanyinMirror: { used: true, result: { targetId: assassin, alignment: 'evil' } },
    jinguSeal: { used: true, activatedBy: loyal },
  };
  for (const p of g.players.filter(p => teamOf(g.roles[p.id]) === 'blue')) {
    const self = projectGame(g, p.id).self!;
    assert.deepEqual(self.treasures, { enabled: false, disabledReason: 'guardian_perks' });
    if (self.role === 'merlin') assert.ok(self.evilIds.includes(assassin));
    if (self.role === 'percival') assert.deepEqual(self.merlinCandidates, g.players.filter(p => ['merlin', 'morgana'].includes(g.roles[p.id])).map(p => p.id));
    if (self.role === 'guinevere') assert.deepEqual(self.guinevereCandidates, g.guinevereCandidates);
    if (self.role === 'loyal') assert.deepEqual(self.guardianClue, g.guardianClues?.[p.id]);
  }
  const publicView = projectGame(g);
  assert.equal(publicView.self, undefined);
  assert.equal('treasuresState' in publicView, false);
  assert.equal('guardianClues' in publicView, false);

  // Existing replays with treasures already used retain their original private result projection.
  g.rulesetVersion = 'standard-no-lancelot-v5';
  assert.equal(projectGame(g, playerWith(g, 'percival')).self?.treasures?.jinguAllyId, loyal);
  assert.equal(projectGame(g, playerWith(g, 'guinevere')).self?.treasures?.guanyinMirror?.result?.targetId, assassin);
});
