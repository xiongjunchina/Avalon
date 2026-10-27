import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type Player, type Role } from '@avalon/contracts';
import { assignLoyalGuardians, createGame, projectGame } from '../src/index';

function fixture(count: number) {
  const players: Player[] = Array.from({ length: count + 2 }, (_, i) => ({ id: `p${i}`, seat: i + 1, nickname: `仙友${i}` }));
  const roles: Record<string, Role> = Object.fromEntries(players.map((p, i) => [p.id, i < count ? 'loyal' : i === count ? 'merlin' : 'assassin']));
  return { players, roles };
}

test('new games select one to four guardians in priority order before assigning them to players', () => {
  const priority = ['bailong', 'zhubajie', 'shawujing', 'jingang'];
  for (let count = 0; count <= 4; count++) {
    const { players, roles } = fixture(count);
    for (let seed = 0; seed < 32; seed++) {
      const assignment = assignLoyalGuardians(`priority-${seed}`, players, roles);
      assert.deepEqual(Object.keys(assignment), players.slice(0, count).map(p => p.id));
      assert.deepEqual(Object.values(assignment).sort(), priority.slice(0, count).sort());
      // Input ordering and reconnecting cannot change a player's assigned identity.
      assert.deepEqual(assignLoyalGuardians(`priority-${seed}`, [...players].reverse(), roles), assignment);
    }
  }
});

test('priority does not assign white dragon to a fixed seat across games', () => {
  const { players, roles } = fixture(2);
  const firstSeat = new Set(Array.from({ length: 32 }, (_, seed) => assignLoyalGuardians(`random-${seed}`, players, roles).p0));
  assert.deepEqual([...firstSeat].sort(), ['bailong', 'zhubajie']);
});

test('v1–v3 games keep the original full-pool random assignment', () => {
  // Recorded from the previous algorithm before this change.
  const original = ['zhubajie', 'bailong', 'jingang', 'shawujing'];
  for (const version of ['standard-no-lancelot-v1', 'standard-no-lancelot-v2', 'standard-no-lancelot-v3']) {
    for (let count = 1; count <= 4; count++) {
      const { players, roles } = fixture(count);
      assert.deepEqual(Object.values(assignLoyalGuardians('legacy-guardian', players, roles, version)), original.slice(0, count));
    }
  }
});

test('restoring an old game preserves its identity and saved clue while a new game uses white dragon', () => {
  const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, seat: i + 1, nickname: `仙友${i}` }));
  const fresh = createGame('legacy-guardian', players, { ...defaultSettings, playerCount: 5 }, a => a, { randomBelow: () => 0n });
  assert.equal(projectGame(fresh, 'p2').self?.loyalGuardian, 'bailong');
  const legacy = structuredClone(fresh);
  legacy.rulesetVersion = 'standard-no-lancelot-v3';
  legacy.settings.guardianPerksEnabled = true;
  legacy.guardianClues = { p2: { kind: 'zhubajie', title: '旧局巡山', description: '已保存的私密线索', targetIds: ['p0'] } };
  const restored = JSON.parse(JSON.stringify(legacy));
  const self = projectGame(restored, 'p2').self!;
  assert.equal(self.loyalGuardian, 'zhubajie');
  assert.deepEqual(self.guardianClue, legacy.guardianClues.p2);
  assert.equal(projectGame(restored).self, undefined);
});
