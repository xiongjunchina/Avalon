import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, roleWeight, ROLE_CONFIG } from '../src/index.js';
import { defaultSettings, type Player, type Role } from '@avalon/contracts';

const players: Player[] = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, nickname: `玩家${i}`, seat: i + 1 }));
const settings = { ...defaultSettings, playerCount: 5, rolePreferenceEnabled: true };

test('preferences provide 8/4/2/1 relative weights rather than a guaranteed first available choice', () => {
  const preferences: Role[] = ['merlin', 'assassin', 'percival'];
  assert.deepEqual(ROLE_CONFIG[5].map(r => roleWeight(r, preferences, [])), [648, 162, 81, 81, 324]);
  const outcomes = new Set<Role>();
  const suffix = 24n * 81n ** 4n;
  let ticket = 0n;
  for (const role of ROLE_CONFIG[5]) {
    let draw = 0;
    const g = createGame('preferences', players, settings, a => a, {
      rolePreferences: { p0: preferences }, randomBelow: () => draw++ === 0 ? ticket : 0n,
    });
    assert.equal(g.roles.p0, role);
    outcomes.add(g.roles.p0);
    ticket += BigInt(roleWeight(role, preferences, [])) * suffix;
  }
  assert.equal(outcomes.size, 5, 'a legal unselected role must remain possible');
});

test('a repeated second-choice assassin is downweighted and remains possible without displacing role counts', () => {
  const baseline = createGame('fresh', players, settings, a => a, {
    rolePreferences: { p0: ['merlin', 'assassin', 'percival'] }, randomBelow: () => 0n,
  });
  const repeated = createGame('repeat', players, settings, a => a, {
    rolePreferences: { p0: ['merlin', 'assassin', 'percival'] },
    recentRoles: { p0: ['assassin', 'assassin'] }, randomBelow: () => 0n,
  });
  const weights = (g: typeof baseline) => g.roleAssignmentAudit!.players.p0.weights;
  const before = weights(baseline), after = weights(repeated);
  assert.equal(before.assassin, 324);
  assert.equal(after.assassin, 36);
  assert.equal(after.merlin, before.merlin);
  // Exact marginal changes from 1/4 to 1/28 in this controlled five-player scenario.
  assert.equal(Object.values(before).reduce((a, b) => a + b, 0), before.assassin! * 4);
  assert.equal(Object.values(after).reduce((a, b) => a + b, 0), after.assassin! * 28);
  assert.deepEqual(Object.values(repeated.roles).sort(), [...ROLE_CONFIG[5]].sort());
});

test('preference weights never override protections and disabling preferences ignores saved wishes', () => {
  const g = createGame('protected', players, settings, a => a, {
    rolePreferences: { p0: ['merlin', 'percival'], p1: ['loyal', 'assassin'] },
    bossCooldownUserIds: ['p0'], visionGuaranteedUserIds: ['p1'], randomBelow: () => 0n,
  });
  assert.equal(g.roleAssignmentAudit!.players.p0.weights.merlin, 0);
  assert.equal(g.roleAssignmentAudit!.players.p1.weights.loyal, 0);
  assert.ok(!['merlin', 'morgana', 'mordred'].includes(g.roles.p0));
  assert.ok(!['loyal', 'oberon'].includes(g.roles.p1));
  const disabled = createGame('disabled', players, { ...settings, rolePreferenceEnabled: false }, a => a, {
    rolePreferences: { p0: ['assassin'] }, randomBelow: () => 0n,
  });
  assert.deepEqual(disabled.roleAssignmentAudit!.players.p0.preferences, []);
  assert.ok(Object.values(disabled.roleAssignmentAudit!.players.p0.weights).every(w => w === 81));
});
