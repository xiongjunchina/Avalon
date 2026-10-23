import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createGame, ROLE_CONFIG, type GameState } from '../src/index.js';
import { defaultSettings, type Player, type Role } from '@avalon/contracts';

function makePlayers(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `player-${i + 1}`,
    nickname: `玩家${i + 1}`,
    seat: i + 1,
  }));
}

test('role preference: priority matching satisfies highest priority choice', () => {
  const players = makePlayers(5);
  // ROLE_CONFIG[5]: ['merlin', 'percival', 'loyal', 'morgana', 'assassin']
  // Fixed priority: player-2 first, then player-1, player-3, player-4, player-5
  const priorityOrder = [players[1], players[0], players[2], players[3], players[4]];
  let shuffleCalls = 0;
  const mockShuffle = <T>(arr: T[]): T[] => {
    shuffleCalls++;
    if (shuffleCalls === 1) {
      // First shuffle is priority order of players
      return priorityOrder as unknown as T[];
    }
    // Remaining shuffle
    return arr;
  };

  const rolePreferences: Record<string, Role[]> = {
    'player-1': ['merlin', 'percival'],
    'player-2': ['merlin', 'morgana'],
  };

  const game = createGame(
    randomUUID(),
    players,
    { ...defaultSettings, playerCount: 5, rolePreferenceEnabled: true },
    mockShuffle,
    { rolePreferences }
  );

  // player-2 has priority 1 -> gets 1st choice 'merlin'
  assert.equal(game.roles['player-2'], 'merlin');
  // player-1 has priority 2 -> 'merlin' is taken, gets 2nd choice 'percival'
  assert.equal(game.roles['player-1'], 'percival');

  // Verify pool conservation
  const assignedRoles = Object.values(game.roles).sort();
  const expectedRoles = [...ROLE_CONFIG[5]].sort();
  assert.deepEqual(assignedRoles, expectedRoles);
});

test('role preference: fallback to random allocation when all preferences are exhausted', () => {
  const players = makePlayers(5);
  // Priority: player-1, player-2, player-3, player-4, player-5
  const mockShuffle = <T>(arr: T[]): T[] => arr;

  // Both player-1 and player-2 ONLY want 'merlin'
  const rolePreferences: Record<string, Role[]> = {
    'player-1': ['merlin'],
    'player-2': ['merlin'],
  };

  const game = createGame(
    randomUUID(),
    players,
    { ...defaultSettings, playerCount: 5, rolePreferenceEnabled: true },
    mockShuffle,
    { rolePreferences }
  );

  // player-1 gets merlin
  assert.equal(game.roles['player-1'], 'merlin');
  // player-2 could not get merlin, falls back to remaining roles (percival, loyal, morgana, assassin)
  assert.notEqual(game.roles['player-2'], 'merlin');
  assert.ok(['percival', 'loyal', 'morgana', 'assassin'].includes(game.roles['player-2']));

  // All 5 roles assigned and conserved
  const assignedRoles = Object.values(game.roles).sort();
  assert.deepEqual(assignedRoles, [...ROLE_CONFIG[5]].sort());
});

test('role preference: respects bossCooldown and visionGuaranteed restrictions', () => {
  const players = makePlayers(5);
  const mockShuffle = <T>(arr: T[]): T[] => arr;

  const rolePreferences: Record<string, Role[]> = {
    // player-1 wants merlin, but has bossCooldown
    'player-1': ['merlin', 'percival'],
    // player-2 wants loyal, but has visionGuaranteed
    'player-2': ['loyal', 'assassin'],
  };

  const game = createGame(
    randomUUID(),
    players,
    { ...defaultSettings, playerCount: 5, rolePreferenceEnabled: true },
    mockShuffle,
    {
      bossCooldownUserIds: ['player-1'],
      visionGuaranteedUserIds: ['player-2'],
      rolePreferences,
    }
  );

  // player-1 on bossCooldown cannot get merlin -> gets 2nd choice percival
  assert.equal(game.roles['player-1'], 'percival');
  // player-2 on visionGuaranteed cannot get loyal -> gets 2nd choice assassin
  assert.equal(game.roles['player-2'], 'assassin');

  // Total role pool conserved
  const assignedRoles = Object.values(game.roles).sort();
  assert.deepEqual(assignedRoles, [...ROLE_CONFIG[5]].sort());
});
