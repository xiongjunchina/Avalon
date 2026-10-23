import type { Command, GameResult, GameView, LoyalGuardian, FemaleDemon, Player, Role, RoundView, Settings, Team, PrivateInspection, EarlyWindow, TeamBallot, GuardianClue, SelfTreasures } from '@avalon/contracts';
export const RULESET_VERSION = 'standard-no-lancelot-v3';
export const LOYAL_GUARDIAN_POOL: readonly LoyalGuardian[] = ['zhubajie', 'shawujing', 'bailong', 'jingang'];
export function assignLoyalGuardians(gameId: string, players: Player[], roles: Record<string, Role>): Record<string, LoyalGuardian> {
  let seed = 2166136261;
  for (let i = 0; i < gameId.length; i++) {
    seed = Math.imul(seed ^ gameId.charCodeAt(i), 16777619) >>> 0;
  }
  const pool = [...LOYAL_GUARDIAN_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sortedLoyal = [...players].sort((a, b) => a.seat - b.seat).filter(p => roles[p.id] === 'loyal');
  return Object.fromEntries(sortedLoyal.map((p, idx) => [p.id, pool[idx % pool.length]]));
}
export const FEMALE_DEMON_POOL: readonly FemaleDemon[] = ['spider', 'baigu', 'yutu', 'laoshu'];
export function assignFemaleDemons(gameId: string, players: Player[], roles: Record<string, Role>): Record<string, FemaleDemon> {
  let seed = 2166136261;
  for (let i = 0; i < gameId.length; i++) {
    seed = Math.imul(seed ^ gameId.charCodeAt(i), 16777619) >>> 0;
  }
  // Reverse gameId hash pass so seed differs from loyal guardians
  for (let i = gameId.length - 1; i >= 0; i--) {
    seed = Math.imul(seed ^ (gameId.charCodeAt(i) + 17), 16777619) >>> 0;
  }
  const pool = [...FEMALE_DEMON_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const sortedMinions = [...players].sort((a, b) => a.seat - b.seat).filter(p => roles[p.id] === 'minion');
  return Object.fromEntries(sortedMinions.map((p, idx) => [p.id, pool[idx % pool.length]]));
}
export const MISSION_SIZES: Record<number, number[]> = {
  5: [2,3,2,3,3], 6: [2,3,4,3,4], 7: [2,3,3,4,4],
  8: [3,4,4,5,5], 9: [3,4,4,5,5], 10: [3,4,4,5,5],
  11: [3,4,5,5,5], 12: [3,4,5,6,6],
};
export const ROLE_CONFIG: Record<number, Role[]> = {
  5: ['merlin','percival','loyal','morgana','assassin'],
  6: ['merlin','percival','loyal','loyal','morgana','assassin'],
  7: ['merlin','percival','loyal','loyal','morgana','assassin','oberon'],
  8: ['merlin','percival','loyal','loyal','loyal','morgana','assassin','mordred'],
  9: ['merlin','percival','guinevere','loyal','loyal','loyal','morgana','assassin','mordred'],
  10: ['merlin','percival','guinevere','loyal','loyal','loyal','morgana','assassin','mordred','oberon'],
  11: ['merlin','percival','guinevere','loyal','loyal','loyal','morgana','assassin','mordred','minion','oberon'],
  12: ['merlin','percival','guinevere','loyal','loyal','loyal','loyal','morgana','assassin','mordred','minion','oberon'],
};
export const teamOf = (role: Role): Team => ['merlin','percival','guinevere','loyal'].includes(role) ? 'blue' : 'red';
export class RuleError extends Error {}
function requireRule(condition: unknown, code: string): asserts condition { if (!condition) throw new RuleError(code); }
export interface GameState {
  id: string; rulesetVersion: string; settings: Settings; players: Player[]; roles: Record<string, Role>;
  dealEndsAt?: string;
  guanyinEndsAt?: string;
  phase: GameView['phase']; mission: number; rejectionCount: number; captainOrder: string[]; captainIndex: number;
  confirmed: string[]; teamVotes: Record<string, TeamBallot>; missionVotes: Record<string, boolean>; rounds: RoundView[];
  draftTeam?: { playerIds: string[]; direction: RoundView['direction'] };
  teamVoteStartedAt?: string;
  guinevereCandidates?: string[];
  guardianClues?: Record<string, GuardianClue>;
  earlyAssassination?: { used: boolean; windows: EarlyWindow[] };
  assassinationMode?: 'normal' | 'early';
  treasuresState?: {
    tinStaff?: { used: boolean; result?: { targetId: string; team: Team } };
    guanyinMirror?: { used: boolean; result?: { targetId: string; alignment: 'pure' | 'evil' } };
    humanBag?: { used: boolean; targetId?: string; activeBannedMission?: number };
    jinguSeal?: { used: boolean; activatedBy?: string };
    bananaFan?: { used: boolean; armed: boolean };
  };
  bananaFanNotice?: string;
  result?: GameResult; abortPoll?: { requestedBy: string; electorate: string[]; approvals: string[] };
}
export interface RoleProtectionOptions {
  visionGuaranteedUserIds?: string[];
  blueGuaranteedUserIds?: string[];
  bossCooldownUserIds?: string[];
  rolePreferences?: Record<string, Role[]>;
}

export function createGame(
  id: string,
  players: Player[],
  settings: Settings,
  shuffle: <T>(values: T[]) => T[],
  protection: string[] | RoleProtectionOptions = []
): GameState {
  requireRule(players.length === settings.playerCount && ROLE_CONFIG[players.length], 'NOT_READY');
  const sorted = [...players].sort((a,b) => a.seat-b.seat);
  const configRoles = [...ROLE_CONFIG[players.length]];
  const protectionOpts: RoleProtectionOptions = Array.isArray(protection)
    ? { visionGuaranteedUserIds: protection }
    : protection;

  const visionGuaranteed = new Set(protectionOpts.visionGuaranteedUserIds || []);
  const blueGuaranteed = new Set(protectionOpts.blueGuaranteedUserIds || []);
  const bossCooldown = new Set(protectionOpts.bossCooldownUserIds || []);
  const rolePreferences = protectionOpts.rolePreferences || {};

  const isAllowed = (playerId: string, role: Role, level: number): boolean => {
    if (visionGuaranteed.has(playerId) && (role === 'loyal' || role === 'oberon')) return false;
    if (level <= 1 && blueGuaranteed.has(playerId) && teamOf(role) === 'red') return false;
    if (level === 0 && bossCooldown.has(playerId) && (role === 'merlin' || role === 'morgana' || role === 'mordred')) return false;
    return true;
  };

  const hasPreferences = Object.values(rolePreferences).some(prefs => Array.isArray(prefs) && prefs.length > 0);

  let roles: Record<string, Role> = {};

  if (hasPreferences) {
    const priorityPlayers = shuffle([...sorted]);
    const assigned: Record<string, Role> = {};
    const availableRoles = [...configRoles];
    const unassignedPlayers: Player[] = [];

    const canSolve = (unassigned: Player[], remaining: Role[], level = 0): boolean => {
      const used = new Array(remaining.length).fill(false);
      function dfs(pIdx: number): boolean {
        if (pIdx === unassigned.length) return true;
        const p = unassigned[pIdx];
        for (let rIdx = 0; rIdx < remaining.length; rIdx++) {
          if (!used[rIdx] && isAllowed(p.id, remaining[rIdx], level)) {
            used[rIdx] = true;
            if (dfs(pIdx + 1)) return true;
            used[rIdx] = false;
          }
        }
        return false;
      }
      return dfs(0);
    };

    for (const p of priorityPlayers) {
      const prefs = rolePreferences[p.id] || [];
      let satisfied = false;
      for (const desiredRole of prefs) {
        const rIdx = availableRoles.indexOf(desiredRole);
        if (rIdx !== -1 && isAllowed(p.id, desiredRole, 0)) {
          const testRemaining = [...availableRoles];
          testRemaining.splice(rIdx, 1);
          const remainingPlayers = priorityPlayers.filter(other => other.id !== p.id && !assigned[other.id]);
          if (canSolve(remainingPlayers, testRemaining, 0)) {
            assigned[p.id] = desiredRole;
            availableRoles.splice(rIdx, 1);
            satisfied = true;
            break;
          }
        }
      }
      if (!satisfied) {
        unassignedPlayers.push(p);
      }
    }

    const shuffledRemaining = shuffle(availableRoles);
    for (let level = 0; level <= 3; level++) {
      const used = new Array(shuffledRemaining.length).fill(false);
      const candidate: Record<string, Role> = {};

      function solveRemaining(pIdx: number): boolean {
        if (pIdx === unassignedPlayers.length) return true;
        const p = unassignedPlayers[pIdx];
        for (let rIdx = 0; rIdx < shuffledRemaining.length; rIdx++) {
          if (!used[rIdx] && isAllowed(p.id, shuffledRemaining[rIdx], level)) {
            used[rIdx] = true;
            candidate[p.id] = shuffledRemaining[rIdx];
            if (solveRemaining(pIdx + 1)) return true;
            used[rIdx] = false;
          }
        }
        return false;
      }

      if (solveRemaining(0)) {
        roles = { ...assigned, ...candidate };
        break;
      }
    }
  } else {
    const shuffledRoles = shuffle([...configRoles]);
    for (let level = 0; level <= 3; level++) {
      const used = new Array(shuffledRoles.length).fill(false);
      const candidate: Record<string, Role> = {};

      function solve(pIdx: number): boolean {
        if (pIdx === sorted.length) return true;
        const p = sorted[pIdx];
        for (let rIdx = 0; rIdx < shuffledRoles.length; rIdx++) {
          if (!used[rIdx] && isAllowed(p.id, shuffledRoles[rIdx], level)) {
            used[rIdx] = true;
            candidate[p.id] = shuffledRoles[rIdx];
            if (solve(pIdx + 1)) return true;
            used[rIdx] = false;
          }
        }
        return false;
      }

      if (solve(0)) {
        roles = candidate;
        break;
      }
    }
  }
  let guinevereCandidates: string[] | undefined;
  if (Object.values(roles).includes('guinevere')) {
    const mordredId = sorted.find(p => roles[p.id] === 'mordred')?.id;
    const blueDecoys = sorted.filter(p => ['percival', 'loyal'].includes(roles[p.id])).map(p => p.id);
    const decoyId = shuffle(blueDecoys)[0];
    guinevereCandidates = sorted
      .filter(p => p.id === mordredId || p.id === decoyId)
      .map(p => p.id);
  }
  let guardianClues: Record<string, GuardianClue> | undefined;
  if (settings.guardianPerksEnabled) {
    guardianClues = {};
    const loyalGuardians = assignLoyalGuardians(id, sorted, roles);
    const loyalPlayers = sorted.filter(p => roles[p.id] === 'loyal');
    for (const p of loyalPlayers) {
      const gKind = loyalGuardians[p.id];
      if (gKind === 'zhubajie') {
        const nonMorganas = sorted.filter(q => q.id !== p.id && roles[q.id] !== 'morgana');
        const target = shuffle(nonMorganas)[0];
        guardianClues[p.id] = {
          kind: 'zhubajie',
          title: '【八戒巡山】天机灵觉',
          description: '你巡山探路获知：此仙友绝非混世魔猴六耳猕猴（假猴王）。',
          targetIds: target ? [target.id] : [],
        };
      } else if (gKind === 'shawujing') {
        const otherLoyals = sorted.filter(q => q.id !== p.id && roles[q.id] === 'loyal');
        const target = shuffle(otherLoyals)[0];
        guardianClues[p.id] = {
          kind: 'shawujing',
          title: '【同修感应】天机灵觉',
          description: target ? '你感应到同门佛光：此仙友亦是取经护法同修，可互为倚仗。' : '你感应天地流沙：其余护法皆在天庭未下凡，此局取经唯君独守。',
          targetIds: target ? [target.id] : [],
        };
      } else if (gKind === 'bailong') {
        const percivalPlayer = sorted.find(q => roles[q.id] === 'percival');
        const redPool = sorted.filter(q => teamOf(roles[q.id]) === 'red');
        const redDecoy = shuffle(redPool)[0];
        const targetIds = percivalPlayer && redDecoy
          ? sorted.filter(q => q.id === percivalPlayer.id || q.id === redDecoy.id).map(q => q.id)
          : [];
        guardianClues[p.id] = {
          kind: 'bailong',
          title: '【龙驹护圣】天机灵觉',
          description: '你隐闻圣僧佛光：两位仙友之中，必有一位是大唐圣僧（唐三藏）。',
          targetIds,
        };
      } else if (gKind === 'jingang') {
        const redPool = sorted.filter(q => teamOf(roles[q.id]) === 'red');
        const bluePool = sorted.filter(q => teamOf(roles[q.id]) === 'blue' && roles[q.id] !== 'merlin' && q.id !== p.id);
        const chosenRed = shuffle(redPool)[0];
        const chosenBlue = shuffle(bluePool)[0];
        const targetIds = chosenRed && chosenBlue
          ? sorted.filter(q => q.id === chosenRed.id || q.id === chosenBlue.id).map(q => q.id)
          : [];
        guardianClues[p.id] = {
          kind: 'jingang',
          title: '【金刚怒目】天机灵觉',
          description: '你目运金光察得：两位仙友之中，至少潜藏一位混世妖魔。',
          targetIds,
        };
      }
    }
  }
  const seats = sorted.map(p => p.id);
  const captainOrder = settings.captainMode === 'random_order' ? shuffle(seats) : seats;
  return { id, rulesetVersion: RULESET_VERSION, settings: { ...settings }, players: sorted,
    roles, phase: 'role_reveal', mission: 1,
    rejectionCount: 0, captainOrder,
    ...(guinevereCandidates ? { guinevereCandidates } : {}),
    ...(guardianClues ? { guardianClues } : {}),
    ...(settings.earlyAssassinationEnabled ? { earlyAssassination: { used: false, windows: [] } } : {}),
    ...(settings.treasuresEnabled && sorted.length >= 8 ? { treasuresState: {} } : {}),
    captainIndex: 0, confirmed: [], teamVotes: {}, missionVotes: {}, rounds: [] };
}
export const isEnded = (g: GameState) => g.phase === 'finished' || g.phase === 'aborted';
export const captain = (g: GameState) => g.captainOrder[g.captainIndex];
export const failuresRequiredFor = (playerCount: number, mission: number): number =>
  (playerCount >= 7 && mission === 4) || ((playerCount === 11 || playerCount === 12) && mission === 3) ? 2 : 1;
export const failuresRequired = (g: GameState) => failuresRequiredFor(g.players.length, g.mission);
export function finish(g: GameState, result: GameResult) {
  g.result = result; g.phase = result.winner ? 'finished' : 'aborted';
  // Individual mission cards are ephemeral private state, never part of the replay.
  g.teamVotes = {}; g.missionVotes = {}; delete g.abortPoll;
}
function rotate(g: GameState) { g.captainIndex = (g.captainIndex+1)%g.players.length; }
function canUseEarlyAssassination(g: GameState): boolean {
  const completed = g.rounds.filter(r => r.result).length;
  return Boolean(
    g.earlyAssassination &&
    !g.earlyAssassination.used &&
    completed >= 2 &&
    !isEnded(g) &&
    !['dealing', 'role_reveal', 'assassination'].includes(g.phase)
  );
}
function openEarlyWindowOrPropose(g: GameState) {
  g.phase = 'proposing';
}
// Room ownership, not presence or unanimous voting, controls interruption.
export function transition(state: GameState, userId: string, action: Pick<Command, 'type' | 'payload'>, onlineIds: string[], context = { hostId: state.players[0].id, now: Date.now() }): GameState {
  const g = structuredClone(state);
  requireRule(g.players.some(p => p.id === userId), 'FORBIDDEN');
  requireRule(!isEnded(g), 'GAME_ENDED');
  if (action.type === 'endGame' || action.type === 'requestAbort' || action.type === 'voteAbort') {
    if (action.type === 'endGame' || (action.type === 'requestAbort' && userId === context.hostId)) {
      requireRule(userId === context.hostId, 'FORBIDDEN');
      finish(g, { winner: null, reason: 'host_ended' });
    } else if (action.type === 'requestAbort') {
      requireRule(onlineIds.includes(userId), 'FORBIDDEN');
      requireRule(!g.abortPoll, 'ABORT_PENDING');
      g.abortPoll = { requestedBy: userId, electorate: [context.hostId], approvals: [] };
    } else {
      requireRule(userId === context.hostId, 'FORBIDDEN');
      requireRule(g.abortPoll, 'NO_ABORT_POLL');
      if ((action.payload as { approve: boolean }).approve) finish(g, { winner: null, reason: 'host_ended' });
      else delete g.abortPoll;
    }
    return g;
  }
  requireRule(g.phase !== 'dealing', 'DEAL_PENDING');
  switch (action.type) {
    case 'confirmRole':
      requireRule(g.phase === 'role_reveal', 'WRONG_PHASE');
      requireRule(!g.confirmed.includes(userId), 'ALREADY_SUBMITTED');
      g.confirmed.push(userId);
      if (g.confirmed.length === g.players.length) g.phase = 'proposing';
      break;
    case 'updateTeamDraft': {
      requireRule(['role_reveal','proposing','discussion'].includes(g.phase), 'WRONG_PHASE');
      requireRule(userId === captain(g), 'NOT_CAPTAIN');
      const { playerIds, direction } = action.payload as { playerIds: string[]; direction: RoundView['direction'] };
      requireRule(playerIds.length <= MISSION_SIZES[g.players.length][g.mission-1] && new Set(playerIds).size === playerIds.length && playerIds.every(id => g.players.some(p => p.id === id)), 'INVALID_TEAM');
      if (g.treasuresState?.humanBag?.activeBannedMission === g.mission && g.treasuresState.humanBag.targetId) {
        requireRule(!playerIds.includes(g.treasuresState.humanBag.targetId), 'PLAYER_BANNED_BY_HUMAN_BAG');
      }
      g.draftTeam = { playerIds: [...playerIds], direction };
      if (g.phase === 'discussion') {
        g.rounds.at(-1)!.team = [...playerIds];
        g.rounds.at(-1)!.direction = direction;
      }
      break;
    }
    case 'proposeTeam': {
      requireRule(g.phase === 'proposing' || g.phase === 'role_reveal', 'WRONG_PHASE');
      requireRule(userId === captain(g), 'NOT_CAPTAIN');
      const { playerIds, direction } = action.payload as { playerIds: string[]; direction: RoundView['direction'] };
      requireRule(playerIds.length <= MISSION_SIZES[g.players.length][g.mission-1] && new Set(playerIds).size === playerIds.length && playerIds.every(id => g.players.some(p => p.id === id)), 'INVALID_TEAM');
      if (g.treasuresState?.humanBag?.activeBannedMission === g.mission && g.treasuresState.humanBag.targetId) {
        requireRule(!playerIds.includes(g.treasuresState.humanBag.targetId), 'PLAYER_BANNED_BY_HUMAN_BAG');
      }
      g.rounds.push({ number: g.rounds.length+1, mission: g.mission, captainId: userId,
        team: g.players.filter(p => playerIds.includes(p.id)).map(p => p.id), direction });
      delete g.draftTeam;
      g.phase = 'discussion'; g.teamVotes = {}; g.missionVotes = {};
      break;
    }
    case 'startTeamVote':
      requireRule(g.phase === 'discussion', 'WRONG_PHASE');
      requireRule(userId === captain(g), 'NOT_CAPTAIN');
      requireRule(g.rounds.at(-1)!.team.length === MISSION_SIZES[g.players.length][g.mission-1], 'INVALID_TEAM');
      delete g.draftTeam;
      g.teamVoteStartedAt = new Date(context.now).toISOString();
      g.phase = 'team_vote'; break;
    case 'teamVote': {
      requireRule(g.phase === 'team_vote', 'WRONG_PHASE');
      requireRule(!(userId in g.teamVotes), 'ALREADY_SUBMITTED');
      g.teamVotes[userId] = (action.payload as { approve: TeamBallot }).approve;
      if (Object.keys(g.teamVotes).length === g.players.length) {
        const values = Object.values(g.teamVotes), approvals = values.filter(v => v === true).length, rejections = values.filter(v => v === false).length, abstentions = values.filter(v => v === 'abstain').length;
        const passed = approvals > rejections;
        g.rounds.at(-1)!.vote = { approvals, rejections, abstentions, passed,
          ...(!g.settings.anonymousTeamVote ? { ballots: { ...g.teamVotes } } : {}) };
        g.teamVotes = {};
        if (passed) {
          if (g.treasuresState?.bananaFan?.armed) {
            g.treasuresState.bananaFan.used = true;
            g.treasuresState.bananaFan.armed = false;
            g.bananaFanNotice = `第 ${g.rounds.at(-1)!.number} 轮组队投票通过，但牛魔王祭起【芭蕉神扇】狂风呼啸！本次发车被强行吹散，由下一任队长重新组队！`;
            rotate(g);
            openEarlyWindowOrPropose(g);
          } else {
            delete g.bananaFanNotice;
            const hasUnusedGuanyin = Boolean(
              g.settings.treasuresEnabled &&
              g.players.length >= 9 &&
              g.players.some(p => g.roles[p.id] === 'guinevere') &&
              !g.treasuresState?.guanyinMirror?.used
            );
            if (hasUnusedGuanyin) {
              g.phase = 'guanyin_window';
              g.guanyinEndsAt = new Date(context.now + 4000).toISOString();
            } else {
              g.phase = 'mission';
            }
          }
        } else {
          delete g.bananaFanNotice;
          g.rejectionCount++;
          if (g.rejectionCount >= 5) finish(g, { winner: 'red', reason: 'five_rejections' });
          else { rotate(g); openEarlyWindowOrPropose(g); }
        }
      }
      break;
    }
    case 'missionVote': {
      requireRule(g.phase === 'mission', 'WRONG_PHASE');
      const round = g.rounds.at(-1)!;
      requireRule(round.team.includes(userId), 'NOT_ON_TEAM');
      requireRule(!(userId in g.missionVotes), 'ALREADY_SUBMITTED');
      const { success } = action.payload as { success: boolean };
      requireRule(success || teamOf(g.roles[userId]) === 'red', 'BLUE_MUST_SUCCEED');
      g.missionVotes[userId] = success;
      if (Object.keys(g.missionVotes).length === round.team.length) {
        const failures = Object.values(g.missionVotes).filter(v => !v).length;
        round.result = { successes: round.team.length-failures, failures, passed: failures < failuresRequired(g) };
        g.missionVotes = {};
        const completed = g.rounds.filter(r => r.result), successes = completed.filter(r => r.result!.passed).length;
        if (completed.length-successes >= 3) finish(g, { winner: 'red', reason: 'three_failures' });
        else if (successes >= 3) { g.phase = 'assassination'; g.assassinationMode = 'normal'; }
        else {
          g.mission++; rotate(g);
          openEarlyWindowOrPropose(g);
          if (g.settings.rejectionScope === 'mission') g.rejectionCount = 0;
        }
      }
      break;
    }
    case 'earlyAssassinationDecision': {
      requireRule(canUseEarlyAssassination(g) && g.earlyAssassination, 'WRONG_PHASE');
      requireRule(g.roles[userId] === 'assassin', 'NOT_ASSASSIN');
      const { attempt } = action.payload as { attempt: boolean };
      g.earlyAssassination.windows.push({ afterMission: g.rounds.filter(r => r.result).length,
        afterProposal: g.rounds.length, decision: attempt ? 'attempt' : 'skip' });
      if (attempt) {
        g.earlyAssassination.used = true;
        g.assassinationMode = 'early';
        g.teamVotes = {};
        g.missionVotes = {};
        g.phase = 'assassination';
      } else if (g.phase === 'early_window') {
        g.phase = 'proposing';
      }
      break;
    }
    case 'assassinate': {
      requireRule(g.phase === 'assassination', 'WRONG_PHASE');
      requireRule(g.roles[userId] === 'assassin', 'NOT_ASSASSIN');
      const { targetId } = action.payload as { targetId: string };
      requireRule(g.players.some(p => p.id === targetId) && targetId !== userId, 'INVALID_TARGET');
      const hit = g.roles[targetId] === 'merlin';
      const reason = g.assassinationMode === 'early'
        ? hit ? 'early_merlin_found' : 'early_merlin_survived'
        : hit ? 'merlin_found' : 'merlin_survived';
      finish(g, { winner: hit ? 'red' : 'blue', reason, targetId });
      break;
    }
    case 'useTreasure': {
      requireRule(g.settings.treasuresEnabled && g.players.length >= 8, 'TREASURES_DISABLED');
      if (!g.treasuresState) g.treasuresState = {};
      const payload = action.payload as {
        action: 'tinStaff' | 'guanyinMirror' | 'humanBag' | 'jinguSeal' | 'bananaFan';
        targetId?: string;
        armed?: boolean;
      };
      switch (payload.action) {
        case 'tinStaff': {
          requireRule(g.roles[userId] === 'percival', 'NOT_PERCIVAL');
          requireRule(!g.treasuresState.tinStaff?.used, 'ALREADY_USED');
          const completedMissions = g.rounds.filter(r => r.result).length;
          requireRule(completedMissions >= 2, 'CANNOT_USE_YET');
          const { targetId } = payload;
          requireRule(targetId && g.players.some(p => p.id === targetId), 'INVALID_TARGET');
          requireRule(targetId !== userId, 'CANNOT_INSPECT_SELF');
          const candidateIds = g.players.filter(p => ['merlin', 'morgana'].includes(g.roles[p.id])).map(p => p.id);
          requireRule(!candidateIds.includes(targetId), 'CANNOT_INSPECT_CANDIDATE');
          const targetRole = g.roles[targetId];
          const inspectedTeam = targetRole === 'mordred' ? 'blue' : teamOf(targetRole);
          g.treasuresState.tinStaff = { used: true, result: { targetId, team: inspectedTeam } };
          break;
        }
        case 'guanyinMirror': {
          requireRule(g.roles[userId] === 'guinevere', 'NOT_GUINEVERE');
          requireRule(!g.treasuresState.guanyinMirror?.used, 'ALREADY_USED');
          requireRule(g.phase === 'guanyin_window', 'WRONG_PHASE');
          const round = g.rounds.at(-1);
          requireRule(round, 'WRONG_PHASE');
          const guanyinPayload = payload as { action: 'guanyinMirror'; targetId?: string; skip?: boolean };
          if (guanyinPayload.skip) {
            g.phase = 'mission';
            delete g.guanyinEndsAt;
            break;
          }
          const { targetId } = guanyinPayload;
          requireRule(targetId && round.team.includes(targetId), 'TARGET_NOT_ON_TEAM');
          requireRule(targetId !== userId, 'CANNOT_INSPECT_SELF');
          const targetRole = g.roles[targetId];
          const alignment = teamOf(targetRole) === 'red' ? 'evil' : 'pure';
          g.treasuresState.guanyinMirror = { used: true, result: { targetId, alignment } };
          g.phase = 'mission';
          delete g.guanyinEndsAt;
          break;
        }
        case 'humanBag': {
          requireRule(g.roles[userId] === 'mordred', 'NOT_MORDRED');
          requireRule(!g.treasuresState.humanBag?.used, 'ALREADY_USED');
          requireRule(g.mission >= 3, 'CANNOT_USE_YET');
          requireRule(g.phase === 'proposing', 'WRONG_PHASE');
          const { targetId } = payload;
          requireRule(targetId && g.players.some(p => p.id === targetId), 'INVALID_TARGET');
          requireRule(targetId !== captain(g), 'CANNOT_BAN_CAPTAIN');
          g.treasuresState.humanBag = { used: true, targetId, activeBannedMission: g.mission };
          break;
        }
        case 'jinguSeal': {
          requireRule(g.roles[userId] === 'loyal', 'NOT_LOYAL');
          requireRule(!g.treasuresState.jinguSeal?.used, 'ALREADY_USED');
          const failedMissions = g.rounds.filter(r => r.result && !r.result.passed).length;
          requireRule(failedMissions >= 2, 'NOT_IN_PERIL');
          g.treasuresState.jinguSeal = { used: true, activatedBy: userId };
          break;
        }
        case 'bananaFan': {
          requireRule(g.roles[userId] === 'oberon', 'NOT_OBERON');
          requireRule(!g.treasuresState.bananaFan?.used, 'ALREADY_USED');
          if (!g.treasuresState.bananaFan) g.treasuresState.bananaFan = { used: false, armed: false };
          g.treasuresState.bananaFan.armed = Boolean(payload.armed);
          break;
        }
        default:
          throw new RuleError('INVALID_TREASURE_ACTION');
      }
      break;
    }
    default: throw new RuleError('WRONG_PHASE');
  }
  return g;
}
export function projectGame(g: GameState, userId?: string): GameView {
  const role = userId && g.phase !== 'dealing' ? g.roles[userId] : undefined;
  const evilIds = role === 'merlin'
    ? g.players.filter(p => teamOf(g.roles[p.id]) === 'red' && g.roles[p.id] !== 'mordred').map(p => p.id)
    : role && teamOf(role) === 'red' && role !== 'oberon'
      ? g.players.filter(p => p.id !== userId && teamOf(g.roles[p.id]) === 'red' && g.roles[p.id] !== 'oberon').map(p => p.id) : [];
  const treasuresEnabled = Boolean(g.settings.treasuresEnabled && g.players.length >= 8);
  const completedMissions = g.rounds.filter(r => r.result).length;
  const failedMissions = g.rounds.filter(r => r.result && !r.result.passed).length;
  const currentRound = g.rounds.at(-1);

  return { id: g.id, rulesetVersion: g.rulesetVersion, phase: g.phase, players: structuredClone(g.players), mission: g.mission,
    ...(g.phase === 'dealing' ? { dealEndsAt: g.dealEndsAt } : {}),
    ...(g.phase === 'guanyin_window' ? { guanyinEndsAt: g.guanyinEndsAt } : {}),
    missionSizes: [...MISSION_SIZES[g.players.length]], failuresRequired: failuresRequired(g), rejectionCount: g.rejectionCount,
    captainId: captain(g), captainOrder: [...g.captainOrder], rounds: structuredClone(g.rounds),
    ...(['role_reveal','proposing','discussion'].includes(g.phase) && g.draftTeam ? { draftTeam: structuredClone(g.draftTeam) } : {}),
    ...(g.phase === 'team_vote' ? { teamVote: { startedAt: g.teamVoteStartedAt, votedIds: Object.keys(g.teamVotes), ...(!g.settings.anonymousTeamVote ? { ballots: { ...g.teamVotes } } : {}) } } : {}),
    progress: { confirmed: g.confirmed.length, teamVotes: Object.keys(g.teamVotes).length, missionVotes: Object.keys(g.missionVotes).length },
    ...(g.earlyAssassination ? { earlyAssassination: structuredClone(g.earlyAssassination) } : {}),
    ...(g.assassinationMode || g.phase === 'assassination' ? { assassinationMode: g.assassinationMode ?? 'normal' } : {}),
    ...(g.phase === 'assassination' ? { assassinId: g.players.find(p => g.roles[p.id] === 'assassin')?.id } : {}),
    ...(g.treasuresState?.humanBag?.activeBannedMission === g.mission && g.treasuresState.humanBag.targetId
      ? { humanBagBannedPlayerId: g.treasuresState.humanBag.targetId } : {}),
    ...(g.bananaFanNotice ? { bananaFanNotice: g.bananaFanNotice } : {}),
    ...(g.result ? { result: { ...g.result }, revealedRoles: { ...g.roles } } : {}),
    ...(g.abortPoll ? { abortPoll: { requestedBy: g.abortPoll.requestedBy, approvals: g.abortPoll.approvals.length,
      required: g.abortPoll.electorate.length, voted: !!userId && g.abortPoll.approvals.includes(userId) } } : {}),
    ...(role && userId ? { self: { role, ...(role === 'loyal' ? { loyalGuardian: assignLoyalGuardians(g.id, g.players, g.roles)[userId] } : {}), ...(role === 'minion' ? { femaleDemon: assignFemaleDemons(g.id, g.players, g.roles)[userId] } : {}), team: teamOf(role), evilIds,
      merlinCandidates: role === 'percival' ? g.players.filter(p => ['merlin','morgana'].includes(g.roles[p.id])).map(p => p.id) : [],
      guinevereCandidates: role === 'guinevere' ? [...(g.guinevereCandidates ?? [])] : [],
      guardianClue: role === 'loyal' && g.guardianClues ? g.guardianClues[userId] : undefined,
      confirmed: g.confirmed.includes(userId), teamVoted: userId in g.teamVotes, missionVoted: userId in g.missionVotes,
      canDecideEarly: role === 'assassin' && canUseEarlyAssassination(g),
      treasures: {
        enabled: treasuresEnabled,
        ...(role === 'percival' && treasuresEnabled ? {
          tinStaff: {
            used: Boolean(g.treasuresState?.tinStaff?.used),
            available: !g.treasuresState?.tinStaff?.used && completedMissions >= 2 && !isEnded(g),
            result: g.treasuresState?.tinStaff?.result,
          },
          ...(g.treasuresState?.jinguSeal?.activatedBy ? { jinguAllyId: g.treasuresState.jinguSeal.activatedBy } : {}),
        } : {}),
        ...(role === 'guinevere' && treasuresEnabled ? {
          guanyinMirror: {
            used: Boolean(g.treasuresState?.guanyinMirror?.used),
            available: !g.treasuresState?.guanyinMirror?.used && Boolean(currentRound && g.phase === 'guanyin_window' && !isEnded(g)),
            result: g.treasuresState?.guanyinMirror?.result,
          },
        } : {}),
        ...(role === 'mordred' && treasuresEnabled ? {
          humanBag: {
            used: Boolean(g.treasuresState?.humanBag?.used),
            available: !g.treasuresState?.humanBag?.used && g.mission >= 3 && g.phase === 'proposing' && !isEnded(g),
            targetId: g.treasuresState?.humanBag?.targetId,
          },
        } : {}),
        ...(role === 'loyal' && treasuresEnabled ? {
          jinguSeal: {
            used: Boolean(g.treasuresState?.jinguSeal?.used),
            available: !g.treasuresState?.jinguSeal?.used && failedMissions >= 2 && !isEnded(g),
            activatedBy: g.treasuresState?.jinguSeal?.activatedBy,
          },
        } : {}),
        ...(role === 'oberon' && treasuresEnabled ? {
          bananaFan: {
            used: Boolean(g.treasuresState?.bananaFan?.used),
            armed: Boolean(g.treasuresState?.bananaFan?.armed),
            available: !g.treasuresState?.bananaFan?.used && !isEnded(g),
          },
        } : {}),
      },
    } } : {}),
  };
}
