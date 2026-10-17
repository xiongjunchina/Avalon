import type { Command, GameResult, GameView, LoyalGuardian, Player, Role, RoundView, Settings, Team, PrivateInspection, EarlyWindow, TeamBallot } from '@avalon/contracts';
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
export const MISSION_SIZES: Record<number, number[]> = {
  5: [2,3,2,3,3], 6: [2,3,4,3,4], 7: [2,3,3,4,4],
  8: [3,4,4,5,5], 9: [3,4,4,5,4], 10: [3,4,4,5,5],
  11: [3,4,5,6,5], 12: [3,4,5,6,6],
};
export const ROLE_CONFIG: Record<number, Role[]> = {
  5: ['merlin','percival','loyal','morgana','assassin'],
  6: ['merlin','percival','loyal','loyal','morgana','assassin'],
  7: ['merlin','percival','loyal','loyal','morgana','assassin','oberon'],
  8: ['merlin','percival','loyal','loyal','loyal','morgana','assassin','minion'],
  9: ['merlin','percival','guinevere','loyal','loyal','morgana','assassin','mordred','oberon'],
  10: ['merlin','percival','guinevere','loyal','loyal','loyal','morgana','assassin','mordred','oberon'],
  11: ['merlin','percival','guinevere','loyal','loyal','loyal','loyal','morgana','assassin','mordred','minion'],
  12: ['merlin','percival','guinevere','loyal','loyal','loyal','loyal','morgana','assassin','mordred','minion','oberon'],
};
export const teamOf = (role: Role): Team => ['merlin','percival','guinevere','loyal'].includes(role) ? 'blue' : 'red';
export class RuleError extends Error {}
function requireRule(condition: unknown, code: string): asserts condition { if (!condition) throw new RuleError(code); }
export interface GameState {
  id: string; rulesetVersion: string; settings: Settings; players: Player[]; roles: Record<string, Role>;
  dealEndsAt?: string;
  phase: GameView['phase']; mission: number; rejectionCount: number; captainOrder: string[]; captainIndex: number;
  confirmed: string[]; teamVotes: Record<string, TeamBallot>; missionVotes: Record<string, boolean>; rounds: RoundView[];
  draftTeam?: { playerIds: string[]; direction: RoundView['direction'] };
  teamVoteStartedAt?: string;
  guinevereCandidates?: string[];
  lady?: { holderId: string; holderIds: string[]; inspections: PrivateInspection[] };
  earlyAssassination?: { used: boolean; windows: EarlyWindow[] };
  assassinationMode?: 'normal' | 'early';
  result?: GameResult; abortPoll?: { requestedBy: string; electorate: string[]; approvals: string[] };
}
export function createGame(
  id: string,
  players: Player[],
  settings: Settings,
  shuffle: <T>(values: T[]) => T[],
  protectedUserIds: string[] = []
): GameState {
  requireRule(players.length === settings.playerCount && ROLE_CONFIG[players.length], 'NOT_READY');
  const sorted = [...players].sort((a,b) => a.seat-b.seat);
  const configRoles = [...ROLE_CONFIG[players.length]];
  const validProtected = sorted.filter(p => protectedUserIds.includes(p.id)).map(p => p.id);
  let roles: Record<string, Role>;
  if (validProtected.length > 0) {
    const visionPool = shuffle(configRoles.filter(r => r !== 'loyal' && r !== 'oberon'));
    const restPool = configRoles.filter(r => r === 'loyal' || r === 'oberon');
    const assignedProtected = visionPool.slice(0, validProtected.length);
    const remainingRoles = shuffle([...visionPool.slice(validProtected.length), ...restPool]);
    roles = {};
    let pIdx = 0, rIdx = 0;
    for (const p of sorted) {
      roles[p.id] = validProtected.includes(p.id) ? assignedProtected[pIdx++] : remainingRoles[rIdx++];
    }
  } else {
    const dealt = shuffle(configRoles);
    roles = Object.fromEntries(sorted.map((p,i) => [p.id, dealt[i]]));
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
  const seats = sorted.map(p => p.id);
  const captainOrder = settings.captainMode === 'random_order' ? shuffle(seats) : seats;
  const initialHolder = seats[(seats.indexOf(captainOrder[0])+seats.length-1)%seats.length];
  return { id, rulesetVersion: RULESET_VERSION, settings: { ...settings }, players: sorted,
    roles, phase: 'role_reveal', mission: 1,
    rejectionCount: 0, captainOrder,
    ...(guinevereCandidates ? { guinevereCandidates } : {}),
    ...(settings.ladyEnabled ? { lady: { holderId: initialHolder, holderIds: [initialHolder], inspections: [] } } : {}),
    ...(settings.earlyAssassinationEnabled ? { earlyAssassination: { used: false, windows: [] } } : {}),
    captainIndex: 0, confirmed: [], teamVotes: {}, missionVotes: {}, rounds: [] };
}
export const isEnded = (g: GameState) => g.phase === 'finished' || g.phase === 'aborted';
export const captain = (g: GameState) => g.captainOrder[g.captainIndex];
export const failuresRequiredFor = (playerCount: number, mission: number): number =>
  (playerCount >= 7 && mission === 4) || ((playerCount === 9 || playerCount === 12) && mission === 3) ? 2 : 1;
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
      requireRule(playerIds.length === MISSION_SIZES[g.players.length][g.mission-1] && new Set(playerIds).size === playerIds.length && playerIds.every(id => g.players.some(p => p.id === id)), 'INVALID_TEAM');
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
    ...(['role_reveal','proposing','discussion'].includes(g.phase) && g.draftTeam ? { draftTeam: structuredClone(g.draftTeam) } : {}),
    ...(g.phase === 'team_vote' ? { teamVote: { startedAt: g.teamVoteStartedAt, votedIds: Object.keys(g.teamVotes), ...(!g.settings.anonymousTeamVote ? { ballots: { ...g.teamVotes } } : {}) } } : {}),
    progress: { confirmed: g.confirmed.length, teamVotes: Object.keys(g.teamVotes).length, missionVotes: Object.keys(g.missionVotes).length },
    ...(g.lady ? { lady: { holderId: g.lady.holderId, holderIds: [...g.lady.holderIds],
      // Explicit whitelist; private team results must never enter a shared snapshot.
      inspections: g.lady.inspections.map(i => ({ afterMission: i.afterMission, inspectorId: i.inspectorId, targetId: i.targetId })) } } : {}),
    ...(g.earlyAssassination ? { earlyAssassination: structuredClone(g.earlyAssassination) } : {}),
    ...(g.assassinationMode || g.phase === 'assassination' ? { assassinationMode: g.assassinationMode ?? 'normal' } : {}),
    ...(g.phase === 'assassination' ? { assassinId: g.players.find(p => g.roles[p.id] === 'assassin')?.id } : {}),
    ...(g.result ? { result: { ...g.result }, revealedRoles: { ...g.roles } } : {}),
    ...(g.abortPoll ? { abortPoll: { requestedBy: g.abortPoll.requestedBy, approvals: g.abortPoll.approvals.length,
      required: g.abortPoll.electorate.length, voted: !!userId && g.abortPoll.approvals.includes(userId) } } : {}),
    ...(role && userId ? { self: { role, ...(role === 'loyal' ? { loyalGuardian: assignLoyalGuardians(g.id, g.players, g.roles)[userId] } : {}), team: teamOf(role), evilIds,
      merlinCandidates: role === 'percival' ? g.players.filter(p => ['merlin','morgana'].includes(g.roles[p.id])).map(p => p.id) : [],
      guinevereCandidates: role === 'guinevere' ? [...(g.guinevereCandidates ?? [])] : [],
      confirmed: g.confirmed.includes(userId), teamVoted: userId in g.teamVotes, missionVoted: userId in g.missionVotes,
      inspections: structuredClone((g.lady?.inspections ?? []).filter(i => i.inspectorId === userId)),
      canInspect: g.phase === 'lady' && g.lady?.holderId === userId,
      canConfirmInspection: g.phase === 'lady_reveal' && g.lady?.inspections.at(-1)?.inspectorId === userId,
      canDecideEarly: role === 'assassin' && canUseEarlyAssassination(g) } } : {}),
  };
}
