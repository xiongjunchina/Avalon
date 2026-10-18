import { z } from 'zod';

export const settingsSchema = z.object({
  playerCount: z.number().int().min(5).max(12),
  captainMode: z.enum(['seat_order', 'random_order']),
  anonymousTeamVote: z.boolean(),
  rejectionScope: z.enum(['game', 'mission']),
  ladyEnabled: z.boolean(),
  earlyAssassinationEnabled: z.boolean(),
}).strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  playerCount: 6, captainMode: 'seat_order', anonymousTeamVote: true,
  rejectionScope: 'game', ladyEnabled: false, earlyAssassinationEnabled: false,
};
export const defaultAnonymousTeamVote = (playerCount: number) => playerCount < 8;
export type TeamBallot = boolean | 'abstain';
export const nicknameSchema = z.string().trim().min(1).max(20);
const base = { commandId: z.string().uuid(), expectedVersion: z.number().int().min(1) };
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('setReady'), payload: z.object({ ready: z.boolean() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('updateSettings'), payload: settingsSchema }).strict(),
  z.object({ ...base, type: z.literal('setAdmission'), payload: z.object({ acceptingNewMembers: z.boolean() }).strict() }).strict(),
  ...(['startGame', 'confirmRole', 'startTeamVote', 'returnToLobby', 'requestAbort', 'endGame', 'confirmInspection'] as const).map(type =>
    z.object({ ...base, type: z.literal(type), payload: z.object({}).strict() }).strict()),
  z.object({ ...base, type: z.literal('proposeTeam'), payload: z.object({ playerIds: z.array(z.string().uuid()).max(6), direction: z.enum(['clockwise', 'counterclockwise']) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('updateTeamDraft'), payload: z.object({ playerIds: z.array(z.string().uuid()).max(6), direction: z.enum(['clockwise', 'counterclockwise']) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('teamVote'), payload: z.object({ approve: z.union([z.boolean(), z.literal('abstain')]) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('missionVote'), payload: z.object({ success: z.boolean() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('inspectAlignment'), payload: z.object({ targetId: z.string().uuid() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('earlyAssassinationDecision'), payload: z.object({ attempt: z.boolean() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('assassinate'), payload: z.object({ targetId: z.string().uuid() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('voteAbort'), payload: z.object({ approve: z.boolean() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('leaveRoom'), payload: z.object({}).strict() }).strict(),
  z.object({ ...base, type: z.literal('kickMember'), payload: z.object({ userId: z.string().uuid() }).strict() }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const avatarSchema = z.enum(['leaf','moon','sun','mountain','wave','star']);
export type Avatar = z.infer<typeof avatarSchema>;
export const avatarImageUrlSchema = z
  .string()
  .trim()
  .max(65536)
  .regex(/^(data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>]+|\/art\/[^\s"'<>]+)$/);
export const profileSchema = z.object({
  nickname: nicknameSchema,
  avatar: avatarSchema,
  avatarUrl: avatarImageUrlSchema.nullable().optional(),
  wechatAvatarUrl: avatarImageUrlSchema.nullable().optional(),
}).strict();
export const presetSchema = z.object({name:z.string().trim().min(1).max(24),settings:settingsSchema}).strict();
export interface User { id: string; nickname: string; avatar?: Avatar; avatarUrl?: string | null; wechatAvatarUrl?: string | null }
export interface Member extends User { seat: number; ready: boolean; online: boolean }
export interface RoomView {
  id: string; code: string; hostId: string; version: number;
  serverTime?: string;
  settings: Settings; members: Member[]; phase: 'waiting' | 'playing' | 'finished'; acceptingNewMembers: boolean; game?: GameView;
}
export type ServerMessage =
  | { type: 'snapshot'; room: RoomView }
  | { type: 'commandResult'; commandId: string; ok: boolean; error?: string }
  | { type: 'roomClosed' }
  | { type: 'error'; error: string }
  | { type: 'takenOver' }
  | { type: 'left' };

export type Role = 'merlin' | 'percival' | 'guinevere' | 'loyal' | 'morgana' | 'assassin' | 'mordred' | 'oberon' | 'minion';
export type LoyalGuardian = 'zhubajie' | 'shawujing' | 'bailong' | 'jingang';
export type FemaleDemon = 'spider' | 'baigu' | 'yutu' | 'laoshu';
export type Team = 'blue' | 'red';
export type GamePhase = 'dealing' | 'role_reveal' | 'proposing' | 'discussion' | 'team_vote' | 'mission' | 'lady' | 'lady_reveal' | 'early_window' | 'assassination' | 'finished' | 'aborted';
export type Player = User & { seat: number };
export interface RoundView {
  number: number; mission: number; captainId: string; team: string[];
  direction: 'clockwise' | 'counterclockwise';
  vote?: { approvals: number; rejections: number; abstentions?: number; passed: boolean; ballots?: Record<string, TeamBallot> };
  result?: { successes: number; failures: number; passed: boolean };
}
export interface GameResult {
  winner: Team | null;
  reason: 'three_failures' | 'five_rejections' | 'merlin_found' | 'merlin_survived' | 'early_merlin_found' | 'early_merlin_survived' | 'unanimous_abort' | 'host_ended' | 'offline_timeout';
  targetId?: string;
}
export interface Inspection { afterMission: number; inspectorId: string; targetId: string }
export interface PrivateInspection extends Inspection { team: Team }
export interface EarlyWindow { afterMission: number; afterProposal: number; decision: 'skip' | 'attempt' }
export interface GameView {
  id: string; rulesetVersion: string; phase: GamePhase; players: Player[];
  dealEndsAt?: string;
  mission: number; missionSizes: number[]; failuresRequired: number; rejectionCount: number;
  captainId: string; captainOrder: string[]; rounds: RoundView[];
  draftTeam?: { playerIds: string[]; direction: RoundView['direction'] };
  teamVote?: { startedAt?: string; votedIds: string[]; ballots?: Record<string, TeamBallot> };
  progress: { confirmed: number; teamVotes: number; missionVotes: number };
  lady?: { holderId: string; holderIds: string[]; inspections: Inspection[] };
  earlyAssassination?: { used: boolean; windows: EarlyWindow[] };
  assassinationMode?: 'normal' | 'early';
  assassinId?: string;
  result?: GameResult; revealedRoles?: Record<string, Role>;
  abortPoll?: { requestedBy: string; approvals: number; required: number; voted: boolean };
  self?: { role: Role; loyalGuardian?: LoyalGuardian; femaleDemon?: FemaleDemon; team: Team; evilIds: string[]; merlinCandidates: string[]; guinevereCandidates?: string[];
    confirmed: boolean; teamVoted: boolean; missionVoted: boolean;
    inspections: PrivateInspection[]; canInspect: boolean; canConfirmInspection: boolean; canDecideEarly: boolean };
}

export interface Score { completed:number; wins:number; losses:number; aborted:number; winRate:number|null }
export interface Statistics extends Score { byRole:Record<Role,Score>; byTeam:Record<Team,Score> }
export interface GameSummary {
  id:string; startedAt:string; endedAt:string; rulesetVersion:string; playerCount:number;
  self: {nickname:string;seat:number;role:Role;team:Team}; result:GameResult; favorite:boolean;
}
export interface HistoryPage { games:GameSummary[]; nextCursor:string|null }
export interface Replay extends GameSummary {
  settings:Settings; players:Player[]; roles:Record<string,Role>; rounds:RoundView[];
  inspections:Inspection[]; earlyWindows:EarlyWindow[];
}
export interface SettingPreset { id:string; name:string; settings:Settings; updatedAt:string }
