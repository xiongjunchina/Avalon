import type { Command, GameResult, GameView, Player, Role, RoundView, Settings, Team, PrivateInspection, EarlyWindow } from '@avalon/contracts';
export const RULESET_VERSION = 'standard-no-lancelot-v2';
export const MISSION_SIZES: Record<number, number[]> = {
  5: [2,3,2,3,3], 6: [2,3,4,3,4], 7: [2,3,3,4,4],
  8: [3,4,4,5,5], 9: [3,4,4,5,5], 10: [3,4,4,5,5],
};
export const ROLE_CONFIG: Record<number, Role[]> = {
  5: ['merlin','percival','loyal','morgana','assassin'],
  6: ['merlin','percival','loyal','loyal','morgana','assassin'],
  7: ['merlin','percival','loyal','loyal','morgana','assassin','oberon'],
  8: ['merlin','percival','loyal','loyal','loyal','morgana','assassin','minion'],
  9: ['merlin','percival','loyal','loyal','loyal','loyal','morgana','assassin','mordred'],
  10: ['merlin','percival','loyal','loyal','loyal','loyal','morgana','assassin','mordred','oberon'],
};
export const teamOf = (role: Role): Team => ['merlin','percival','loyal'].includes(role) ? 'blue' : 'red';
export class RuleError extends Error {}
function requireRule(condition: unknown, code: string): asserts condition { if (!condition) throw new RuleError(code); }
export interface GameState {
  id: string; rulesetVersion: string; settings: Settings; players: Player[]; roles: Record<string, Role>;
  dealEndsAt?: string;
  phase: GameView['phase']; mission: number; rejectionCount: number; captainOrder: string[]; captainIndex: number;
  confirmed: string[]; teamVotes: Record<string, boolean>; missionVotes: Record<string, boolean>; rounds: RoundView[];
  lady?: { holderId: string; holderIds: string[]; inspections: PrivateInspection[] };
  earlyAssassination?: { used: boolean; windows: EarlyWindow[] };
  assassinationMode?: 'normal' | 'early';
  result?: GameResult; abortPoll?: { requestedBy: string; electorate: string[]; approvals: string[] };
}
export function createGame(id: string, players: Player[], settings: Settings, shuffle: <T>(values: T[]) => T[]): GameState {
  requireRule(players.length === settings.playerCount && ROLE_CONFIG[players.length], 'NOT_READY');
  const sorted = [...players].sort((a,b) => a.seat-b.seat);
  const dealt = shuffle([...ROLE_CONFIG[players.length]]);
  const seats = sorted.map(p => p.id);
  const captainOrder = settings.captainMode === 'random_order' ? shuffle(seats) : seats;
  const initialHolder = seats[(seats.indexOf(captainOrder[0])+seats.length-1)%seats.length];
  return { id, rulesetVersion: RULESET_VERSION, settings: { ...settings }, players: sorted,
    roles: Object.fromEntries(sorted.map((p,i) => [p.id,dealt[i]])), phase: 'role_reveal', mission: 1,
    rejectionCount: 0, captainOrder,
    ...(settings.ladyEnabled ? { lady: { holderId: initialHolder, holderIds: [initialHolder], inspections: [] } } : {}),
    ...(settings.earlyAssassinationEnabled ? { earlyAssassination: { used: false, windows: [] } } : {}),
    captainIndex: 0, confirmed: [], teamVotes: {}, missionVotes: {}, rounds: [] };
}
export const isEnded = (g: GameState) => g.phase === 'finished' || g.phase === 'aborted';
export const captain = (g: GameState) => g.captainOrder[g.captainIndex];
export const failuresRequired = (g: GameState) => g.players.length >= 7 && g.mission === 4 ? 2 : 1;
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
const sortedIds = (ids: string[]) => [...ids].sort().join(',');
export function syncAbortElectorate(g: GameState, onlineIds: string[]) {
  if (g.abortPoll && sortedIds(g.abortPoll.electorate) !== sortedIds(onlineIds)) delete g.abortPoll;
}
// Returns a new state. Rejected commands cannot leave partial state mutations behind.
export function transition(state: GameState, userId: string, action: Pick<Command, 'type' | 'payload'>, onlineIds: string[]): GameState {
  const g = structuredClone(state);
  requireRule(g.players.some(p => p.id === userId), 'FORBIDDEN');
  requireRule(!isEnded(g), 'GAME_ENDED');
  requireRule(g.phase !== 'dealing', 'DEAL_PENDING');
  syncAbortElectorate(g, onlineIds);
  if (action.type === 'requestAbort') {
    requireRule(onlineIds.includes(userId), 'FORBIDDEN');
    requireRule(!g.abortPoll, 'ABORT_PENDING');
    g.abortPoll = { requestedBy: userId, electorate: [...onlineIds], approvals: [userId] };
    if (onlineIds.length === 1) finish(g, { winner: null, reason: 'unanimous_abort' });
    return g;
  }
  if (action.type === 'voteAbort') {
    requireRule(g.abortPoll && g.abortPoll.electorate.includes(userId), 'NO_ABORT_POLL');
    requireRule(!g.abortPoll.approvals.includes(userId), 'ALREADY_SUBMITTED');
    if (!(action.payload as { approve: boolean }).approve) delete g.abortPoll;
    else {
      g.abortPoll.approvals.push(userId);
      if (g.abortPoll.approvals.length === g.abortPoll.electorate.length) finish(g, { winner: null, reason: 'unanimous_abort' });
    }
    return g;
  }
  switch (action.type) {
    case 'confirmRole':
      requireRule(g.phase === 'role_reveal', 'WRONG_PHASE');
      requireRule(!g.confirmed.includes(userId), 'ALREADY_SUBMITTED');
      g.confirmed.push(userId);
      if (g.confirmed.length === g.players.length) g.phase = 'proposing';
      break;
    case 'proposeTeam': {
      requireRule(g.phase === 'proposing', 'WRONG_PHASE');
      requireRule(userId === captain(g), 'NOT_CAPTAIN');
      const { playerIds, direction } = action.payload as { playerIds: string[]; direction: RoundView['direction'] };
      requireRule(playerIds.length === MISSION_SIZES[g.players.length][g.mission-1] && new Set(playerIds).size === playerIds.length && playerIds.every(id => g.players.some(p => p.id === id)), 'INVALID_TEAM');
      g.rounds.push({ number: g.rounds.length+1, mission: g.mission, captainId: userId,
        team: g.players.filter(p => playerIds.includes(p.id)).map(p => p.id), direction });
      g.phase = 'discussion'; g.teamVotes = {}; g.missionVotes = {};
      break;
    }
    case 'startTeamVote':
      requireRule(g.phase === 'discussion', 'WRONG_PHASE');
      requireRule(userId === captain(g), 'NOT_CAPTAIN');
      g.phase = 'team_vote'; break;
    case 'teamVote': {
      requireRule(g.phase === 'team_vote', 'WRONG_PHASE');
      requireRule(!(userId in g.teamVotes), 'ALREADY_SUBMITTED');
      g.teamVotes[userId] = (action.payload as { approve: boolean }).approve;
      if (Object.keys(g.teamVotes).length === g.players.length) {
        const approvals = Object.values(g.teamVotes).filter(Boolean).length, passed = approvals > g.players.length/2;
        g.rounds.at(-1)!.vote = { approvals, rejections: g.players.length-approvals, passed,
          ...(!g.settings.anonymousTeamVote ? { ballots: { ...g.teamVotes } } : {}) };
        g.teamVotes = {};
        if (passed) g.phase = 'mission';
        else {
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
          // Terminal results above always take precedence over both extensions.
          if (g.lady && completed.length >= 2 && completed.length <= 4) g.phase = 'lady';
          else openEarlyWindowOrPropose(g);
          if (g.settings.rejectionScope === 'mission') g.rejectionCount = 0;
        }
      }
      break;
    }
    case 'inspectAlignment': {
      requireRule(g.phase === 'lady' && g.lady, 'WRONG_PHASE');
      requireRule(g.lady.holderId === userId, 'NOT_LADY_HOLDER');
      const { targetId } = action.payload as { targetId: string };
      requireRule(g.players.some(p => p.id === targetId) && !g.lady.holderIds.includes(targetId), 'INVALID_INSPECTION_TARGET');
      g.lady.inspections.push({ afterMission: g.rounds.filter(r => r.result).length,
        inspectorId: userId, targetId, team: teamOf(g.roles[targetId]) });
      g.lady.holderId = targetId; g.lady.holderIds.push(targetId);
      // Persist a separate read/ack step: do not advance past the private result on disconnect.
      g.phase = 'lady_reveal'; break;
    }
    case 'confirmInspection':
      requireRule(g.phase === 'lady_reveal' && g.lady, 'WRONG_PHASE');
      requireRule(g.lady.inspections.at(-1)?.inspectorId === userId, 'NOT_INSPECTOR');
      openEarlyWindowOrPropose(g); break;
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
    default: throw new RuleError('WRONG_PHASE');
  }
  // Any progress invalidates an interruption request made against an older state.
  delete g.abortPoll;
  return g;
}
export function projectGame(g: GameState, userId?: string): GameView {
  const role = userId && g.phase !== 'dealing' ? g.roles[userId] : undefined;
  const evilIds = role === 'merlin'
    ? g.players.filter(p => teamOf(g.roles[p.id]) === 'red' && g.roles[p.id] !== 'mordred').map(p => p.id)
    : role && teamOf(role) === 'red' && role !== 'oberon'
      ? g.players.filter(p => p.id !== userId && teamOf(g.roles[p.id]) === 'red' && g.roles[p.id] !== 'oberon').map(p => p.id) : [];
  return { id: g.id, rulesetVersion: g.rulesetVersion, phase: g.phase, players: structuredClone(g.players), mission: g.mission,
    ...(g.phase === 'dealing' ? { dealEndsAt: g.dealEndsAt } : {}),
    missionSizes: [...MISSION_SIZES[g.players.length]], failuresRequired: failuresRequired(g), rejectionCount: g.rejectionCount,
    captainId: captain(g), captainOrder: [...g.captainOrder], rounds: structuredClone(g.rounds),
    progress: { confirmed: g.confirmed.length, teamVotes: Object.keys(g.teamVotes).length, missionVotes: Object.keys(g.missionVotes).length },
    ...(g.lady ? { lady: { holderId: g.lady.holderId, holderIds: [...g.lady.holderIds],
      // Explicit whitelist; private team results must never enter a shared snapshot.
      inspections: g.lady.inspections.map(i => ({ afterMission: i.afterMission, inspectorId: i.inspectorId, targetId: i.targetId })) } } : {}),
    ...(g.earlyAssassination ? { earlyAssassination: structuredClone(g.earlyAssassination) } : {}),
    ...(g.assassinationMode || g.phase === 'assassination' ? { assassinationMode: g.assassinationMode ?? 'normal' } : {}),
    ...(g.result ? { result: { ...g.result }, revealedRoles: { ...g.roles } } : {}),
    ...(g.abortPoll ? { abortPoll: { requestedBy: g.abortPoll.requestedBy, approvals: g.abortPoll.approvals.length,
      required: g.abortPoll.electorate.length, voted: !!userId && g.abortPoll.approvals.includes(userId) } } : {}),
    ...(role && userId ? { self: { role, team: teamOf(role), evilIds,
      merlinCandidates: role === 'percival' ? g.players.filter(p => ['merlin','morgana'].includes(g.roles[p.id])).map(p => p.id) : [],
      confirmed: g.confirmed.includes(userId), teamVoted: userId in g.teamVotes, missionVoted: userId in g.missionVotes,
      inspections: structuredClone((g.lady?.inspections ?? []).filter(i => i.inspectorId === userId)),
      canInspect: g.phase === 'lady' && g.lady?.holderId === userId,
      canConfirmInspection: g.phase === 'lady_reveal' && g.lady?.inspections.at(-1)?.inspectorId === userId,
      canDecideEarly: role === 'assassin' && canUseEarlyAssassination(g) } } : {}),
  };
}
