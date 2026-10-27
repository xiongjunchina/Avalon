import type { Player, Role, RoleAssignmentAudit } from '@avalon/contracts';
import { randomBigIntBelow, type RandomBelow } from './random.js';

export const ROLE_ASSIGNMENT_VERSION = 'global-weighted-v1';
export const ROLE_WEIGHT_VERSION = 'preferences-8-4-2-repeat-thirds-v1';
const PREFERENCE_WEIGHTS = [8, 4, 2];
const REPEAT_SCALE = 81;

export interface RoleProtectionOptions {
  visionGuaranteedUserIds?: string[];
  blueGuaranteedUserIds?: string[];
  bossCooldownUserIds?: string[];
  rolePreferences?: Record<string, Role[]>;
  /** Recent deals, newest first; abandoned deals also count. */
  recentRoles?: Record<string, Role[]>;
  randomBelow?: RandomBelow;
}

export function roleWeight(role: Role, preferences: readonly Role[], recentRoles: readonly Role[]): number {
  const rank = preferences.indexOf(role);
  const preference = rank >= 0 && rank < 3 ? PREFERENCE_WEIGHTS[rank] : 1;
  let streak = 0;
  for (const previous of recentRoles.slice(0, 5)) {
    if (previous !== role) break;
    streak++;
  }
  // A player-specific common scale cancels out of the full-assignment distribution.
  // Integer weights retain nonzero chances even after four or more identical deals.
  return preference * (REPEAT_SCALE / 3 ** Math.min(streak, 4));
}

/** Sample whole legal assignments proportionally to their product of player/role weights. */
export function assignWeightedRoles(
  players: Player[], pool: Role[], roleOrder: Role[], options: RoleProtectionOptions,
): { roles: Record<string, Role>; audit: RoleAssignmentAudit } {
  const roleTypes = [...new Set(roleOrder)];
  const quantities = roleTypes.map(role => pool.filter(item => item === role).length);
  if (quantities.some(count => !count) || quantities.reduce((a, b) => a + b, 0) !== players.length ||
      new Set(players.map(p => p.id)).size !== players.length) throw new Error('INVALID_ROLE_POOL');
  const knownRoles = new Set<Role>(['merlin', 'percival', 'guinevere', 'loyal', 'morgana', 'assassin', 'mordred', 'oberon', 'minion']);
  const vision = new Set(options.visionGuaranteedUserIds ?? []);
  const blue = new Set(options.blueGuaranteedUserIds ?? []);
  const boss = new Set(options.bossCooldownUserIds ?? []);
  const redRoles = new Set<Role>(['morgana', 'assassin', 'mordred', 'oberon', 'minion']);
  const bossRoles = new Set<Role>(['merlin', 'morgana', 'mordred']);
  const preferences = players.map(p => [...new Set(options.rolePreferences?.[p.id] ?? [])].filter(r => pool.includes(r)).slice(0, 3));
  const histories = players.map(p => (options.recentRoles?.[p.id] ?? []).filter(r => knownRoles.has(r)).slice(0, 5));
  const weights = players.map((_, i) => roleTypes.map(role => roleWeight(role, preferences[i], histories[i])));
  const allowed = (index: number, role: Role, level: number) => {
    const id = players[index].id;
    if (level < 3 && vision.has(id) && (role === 'loyal' || role === 'oberon')) return false;
    if (level < 2 && blue.has(id) && redRoles.has(role)) return false;
    if (level === 0 && boss.has(id) && bossRoles.has(role)) return false;
    return true;
  };
  const randomBelow = options.randomBelow ?? randomBigIntBelow;
  for (let level = 0; level <= 3; level++) {
    const memo = new Map<string, bigint>();
    function mass(index: number, remaining: number[]): bigint {
      if (index === players.length) return 1n;
      const key = remaining.join(',');
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      let total = 0n;
      for (let r = 0; r < roleTypes.length; r++) {
        if (!remaining[r] || !allowed(index, roleTypes[r], level)) continue;
        remaining[r]--;
        total += BigInt(weights[index][r]) * mass(index + 1, remaining);
        remaining[r]++;
      }
      memo.set(key, total);
      return total;
    }
    const remaining = [...quantities];
    if (mass(0, remaining) === 0n) continue;
    const roles: Record<string, Role> = {};
    const audit: RoleAssignmentAudit = {
      algorithmVersion: ROLE_ASSIGNMENT_VERSION, weightVersion: ROLE_WEIGHT_VERSION,
      protectionLevel: level as RoleAssignmentAudit['protectionLevel'],
      playerOrder: players.map(p => p.id), roleOrder: [...roleTypes], players: {}, draws: [],
    };
    for (let i = 0; i < players.length; i++) {
      const total = mass(i, remaining), ticket = randomBelow(total);
      if (ticket < 0n || ticket >= total) throw new RangeError('INVALID_RANDOM_TICKET');
      audit.draws.push({ userId: players[i].id, totalWeight: total.toString(), ticket: ticket.toString() });
      let cursor = ticket;
      for (let r = 0; r < roleTypes.length; r++) {
        if (!remaining[r] || !allowed(i, roleTypes[r], level)) continue;
        remaining[r]--;
        const branch = BigInt(weights[i][r]) * mass(i + 1, remaining);
        if (cursor < branch) { roles[players[i].id] = roleTypes[r]; break; }
        cursor -= branch;
        remaining[r]++;
      }
      audit.players[players[i].id] = {
        preferences: [...preferences[i]], recentRoles: [...histories[i]],
        weights: Object.fromEntries(roleTypes.map((role, r) => [role, allowed(i, role, level) ? weights[i][r] : 0])),
        protections: { visionGuaranteed: vision.has(players[i].id), blueGuaranteed: blue.has(players[i].id), bossCooldown: boss.has(players[i].id) },
        assignedRole: roles[players[i].id],
      };
    }
    return { roles, audit };
  }
  throw new Error('ROLE_ASSIGNMENT_UNAVAILABLE');
}
