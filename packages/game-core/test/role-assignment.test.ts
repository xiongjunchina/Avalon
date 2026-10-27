import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type Player, type Role } from '@avalon/contracts';
import { createGame, projectGame, ROLE_CONFIG, roleWeight, roleHistoryAfterDeal, randomBigIntBelow, type RoleProtectionOptions } from '../src/index.js';

const people = (count: number): Player[] => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, nickname: `玩家${i}`, seat: i + 1 }));
const permutations = <T>(items: T[]): T[][] => items.length === 0 ? [[]] :
  items.flatMap((value, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [value, ...rest]));
const fresh = (players: Player[], options: RoleProtectionOptions = {}, enabled = true) =>
  createGame('weighted-test', players, { ...defaultSettings, playerCount: players.length, rolePreferenceEnabled: enabled }, a => a, { randomBelow: () => 0n, ...options });

test('equal-weight five-player sampling covers all 120 complete assignments with symmetric seats', () => {
  const players = people(5), seen = new Set<string>();
  const counts = players.map(() => new Map<Role, number>());
  const factorial = [1n, 1n, 2n, 6n, 24n, 120n];
  for (let rank = 0n; rank < 120n; rank++) {
    let remainingRank = rank, draw = 0;
    const g = fresh(players, { randomBelow: () => {
      const left = 5 - draw++;
      const ticket = remainingRank * 81n ** BigInt(left);
      remainingRank %= factorial[left - 1];
      return ticket;
    } });
    seen.add(players.map(p => g.roles[p.id]).join(','));
    for (let i = 0; i < players.length; i++) counts[i].set(g.roles[players[i].id], (counts[i].get(g.roles[players[i].id]) ?? 0) + 1);
  }
  assert.equal(seen.size, 120);
  for (const byRole of counts) for (const role of ROLE_CONFIG[5]) assert.equal(byRole.get(role), 24);
});

test('partition masses and ticket boundaries match independent exhaustive weighted assignments', () => {
  const players = people(5), roles = ROLE_CONFIG[5];
  const options: RoleProtectionOptions = {
    rolePreferences: { p0: ['merlin', 'percival'], p1: ['assassin', 'merlin'] },
    recentRoles: { p0: ['merlin', 'merlin'], p1: ['assassin'] },
  };
  const oracleWeights: Record<string, Partial<Record<Role, number>>> = {
    p0: { merlin: 72, percival: 324, loyal: 81, morgana: 81, assassin: 81 },
    p1: { merlin: 324, percival: 81, loyal: 81, morgana: 81, assassin: 216 },
  };
  const weight = (index: number, role: Role) => BigInt(oracleWeights[players[index].id]?.[role] ?? 81);
  const all = permutations(roles).map(assignment => ({ assignment, mass: assignment.reduce((n, role, i) => n * weight(i, role), 1n) }));
  const expectedTotal = all.reduce((sum, a) => sum + a.mass, 0n);
  const g = fresh(players, { ...options, randomBelow: total => total / 2n });
  assert.equal(BigInt(g.roleAssignmentAudit!.draws[0].totalWeight), expectedTotal);
  for (let i = 0; i < players.length; i++) {
    const compatible = all.filter(({ assignment }) => players.slice(0, i).every((p, j) => g.roles[p.id] === assignment[j]));
    const suffixTotal = compatible.reduce((sum, { assignment }) => sum + assignment.slice(i).reduce((n, role, offset) => n * weight(i + offset, role), 1n), 0n);
    assert.equal(BigInt(g.roleAssignmentAudit!.draws[i].totalWeight), suffixTotal);
  }
  let start = 0n;
  for (const role of roles) {
    const branch = all.filter(a => a.assignment[0] === role).reduce((sum, a) => sum + a.mass, 0n);
    for (const ticket of [start, start + branch - 1n]) {
      let draw = 0;
      assert.equal(fresh(players, { ...options, randomBelow: () => draw++ === 0 ? ticket : 0n }).roles.p0, role);
    }
    start += branch;
  }
});

test('protected matching removes former seat bias and permuting seats preserves weighted partition mass', () => {
  const players = people(5), protectedIds = ['p0', 'p1'];
  const legal = permutations(ROLE_CONFIG[5]).filter(roles => roles.slice(0, 2).every(r => !['merlin', 'morgana', 'mordred'].includes(r)));
  const base = fresh(players, { bossCooldownUserIds: protectedIds });
  assert.equal(BigInt(base.roleAssignmentAudit!.draws[0].totalWeight), BigInt(legal.length) * 81n ** 5n);
  const targetMasses: bigint[] = [];
  for (const id of ['p2', 'p3', 'p4']) {
    const reordered = players.map(p => ({ ...p, seat: p.id === id ? 1 : p.seat + 1 })).reverse();
    const g = fresh(reordered, { bossCooldownUserIds: protectedIds, recentRoles: { [id]: ['assassin'] } });
    targetMasses.push(BigInt(g.roleAssignmentAudit!.draws[0].totalWeight));
    const counts = new Map(ROLE_CONFIG[5].map(r => [r, legal.filter(assignment => assignment[players.findIndex(p => p.id === id)] === r).length]));
    assert.equal(counts.get('assassin'), legal.filter(assignment => assignment[2] === 'assassin').length);
    let start = 0n;
    for (const role of ROLE_CONFIG[5]) {
      const branch = BigInt(counts.get(role)!) * BigInt(g.roleAssignmentAudit!.players[id].weights[role]!) * 81n ** 4n;
      for (const ticket of [start, start + branch - 1n]) {
        let draw = 0;
        const sampled = fresh(reordered, { bossCooldownUserIds: protectedIds, recentRoles: { [id]: ['assassin'] }, randomBelow: () => draw++ === 0 ? ticket : 0n });
        assert.equal(sampled.roles[id], role);
      }
      start += branch;
    }
    assert.equal(start, targetMasses.at(-1));
  }
  assert.ok(targetMasses.every(mass => mass === targetMasses[0]));
});

test('duplicate guardian copies do not multiply the count of distinct complete role assignments', () => {
  const players = people(6), g = fresh(players);
  const total = BigInt(g.roleAssignmentAudit!.draws[0].totalWeight);
  assert.equal(total, 360n * 81n ** 6n, 'six players with two identical guardians have 6!/2! distinct deals');
  let start = 0n;
  for (const role of [...new Set(ROLE_CONFIG[6])]) {
    const roleCount = role === 'loyal' ? 120n : 60n;
    for (const ticket of [start, start + roleCount * 81n ** 6n - 1n]) {
      let draw = 0;
      assert.equal(fresh(players, { randomBelow: () => draw++ === 0 ? ticket : 0n }).roles.p0, role);
    }
    start += roleCount * 81n ** 6n;
  }
  assert.equal(start, total);
});

test('5–12 player pools and duplicated guardians remain exact under all protection fallbacks', () => {
  for (let count = 5; count <= 12; count++) {
    const players = people(count);
    const scenarios: [RoleProtectionOptions, number][] = [
      [{}, 0],
      [{ bossCooldownUserIds: players.map(p => p.id) }, 1],
      [{ blueGuaranteedUserIds: players.map(p => p.id) }, 2],
      [{ visionGuaranteedUserIds: players.map(p => p.id) }, 3],
    ];
    for (const [options, expectedLevel] of scenarios) {
      const g = fresh(players, options);
      assert.deepEqual(Object.values(g.roles).sort(), [...ROLE_CONFIG[count]].sort());
      assert.equal(g.roleAssignmentAudit!.protectionLevel, expectedLevel);
      assert.equal(g.roleAssignmentAudit!.draws.length, count);
      assert.ok(g.players.every(p => g.roleAssignmentAudit!.players[p.id].assignedRole === g.roles[p.id]));
      assert.doesNotThrow(() => JSON.stringify(g));
    }
  }
});

test('every role receives decreasing nonzero repeat weights and audit remains a private snapshot', () => {
  for (const role of ROLE_CONFIG[12]) {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(n => roleWeight(role, [], Array(n).fill(role))), [81, 27, 9, 3, 1, 1]);
  }
  assert.equal(roleWeight('assassin', [], ['loyal', 'assassin', 'assassin']), 81, 'an interrupted streak resets the penalty');
  const players = people(5), recent = Array<Role>(8).fill('assassin');
  const g = fresh(players, { recentRoles: { p0: recent }, rolePreferences: { p0: ['assassin'] } });
  assert.deepEqual(g.roleAssignmentAudit!.roleOrder, ROLE_CONFIG[5]);
  assert.equal(g.roleAssignmentAudit!.players.p0.recentRoles.length, 5);
  recent[0] = 'merlin';
  assert.equal(g.roleAssignmentAudit!.players.p0.recentRoles[0], 'assassin');
  for (const p of [undefined, ...players.map(p => p.id)]) assert.equal('roleAssignmentAudit' in projectGame(g, p), false);
  g.phase = 'finished'; g.result = { winner: 'blue', reason: 'merlin_survived' };
  assert.equal('roleAssignmentAudit' in projectGame(g, players[0].id), false);
});

test('practice rematch history carries latest actual deals and caps at five without rewriting old evidence', () => {
  const players = people(5);
  let game = fresh(players);
  const original = JSON.stringify(game.roleAssignmentAudit);
  for (let i = 0; i < 7; i++) {
    const history = roleHistoryAfterDeal(game);
    assert.equal(history.p0[0], game.roles.p0);
    assert.ok(history.p0.length <= 5);
    game = fresh(players, { recentRoles: history });
    assert.deepEqual(game.roleAssignmentAudit!.players.p0.recentRoles, history.p0);
  }
  assert.equal(game.roleAssignmentAudit!.players.p0.recentRoles.length, 5);
  assert.equal(original, JSON.stringify(fresh(players).roleAssignmentAudit));
  const legacy = { roles: { p0: 'loyal' as Role } };
  assert.deepEqual(roleHistoryAfterDeal(legacy), { p0: ['loyal'] });
});

test('bounded sampling supports exact large integers, rejection and invalid ticket checks', () => {
  let fills = 0;
  assert.equal(randomBigIntBelow(10n, bytes => { bytes.fill(fills++ === 0 ? 255 : 5); }), 5n);
  assert.equal(fills, 2);
  assert.equal(randomBigIntBelow(1n, () => assert.fail('bound one needs no entropy')), 0n);
  const upper = 2n ** 100n;
  assert.equal(randomBigIntBelow(upper, bytes => bytes.fill(255)), upper - 1n);
  assert.throws(() => randomBigIntBelow(0n), /INVALID_RANDOM_BOUND/);
  assert.throws(() => randomBigIntBelow(3n, bytes => bytes.fill(255)), /RANDOM_SOURCE_FAILED/);
  assert.throws(() => fresh(people(5), { randomBelow: upper => upper }), /INVALID_RANDOM_TICKET/);
});
