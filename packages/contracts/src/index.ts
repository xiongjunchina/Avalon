import { z } from 'zod';

export const settingsSchema = z.object({
  playerCount: z.number().int().min(5).max(12),
  captainMode: z.enum(['seat_order', 'random_order']),
  anonymousTeamVote: z.boolean(),
  rejectionScope: z.enum(['game', 'mission']),
  ladyEnabled: z.boolean().optional(),
  earlyAssassinationEnabled: z.boolean(),
  guardianPerksEnabled: z.boolean().default(false),
  voiceChatEnabled: z.boolean().default(false),
  autoRevealRoleEnabled: z.boolean().default(false),
  treasuresEnabled: z.boolean().default(false),
  rolePreferenceEnabled: z.boolean().default(false),
}).strict();
export type Settings = z.infer<typeof settingsSchema>;
export const specialCodeSchema = z.string().regex(/^[1-9]\d{5}$/);
export const roomPasswordSchema = z.string().min(4).max(8).nullable();
export const dedicatedRoomSchema = z.object({
  code: specialCodeSchema, name: z.string().trim().min(1).max(30),
  managerId: z.string().uuid(), settings: settingsSchema,
  password: roomPasswordSchema.optional(),
}).strict();
export interface DedicatedRoom {
  id: string; code: string; name: string; managerId: string; managerName: string;
  managerCode?: string; settings: Settings; hasPassword: boolean;
  activeRoomId?: string; activePhase?: 'waiting' | 'playing' | 'finished';
}
export interface PlayerCodeReservation {
  code: string; state: 'reserved' | 'retired'; userId?: string; nickname?: string; note: string;
}
export interface PlayerCodeAvailability {
  code: string; status: 'available' | 'reserved' | 'occupied' | 'retired' | 'current';
  nickname?: string;
}
export const defaultSettings: Settings = {
  playerCount: 6, captainMode: 'seat_order', anonymousTeamVote: true,
  rejectionScope: 'game', earlyAssassinationEnabled: false,
  guardianPerksEnabled: false,
  voiceChatEnabled: false,
  autoRevealRoleEnabled: false,
  treasuresEnabled: false,
  rolePreferenceEnabled: false,
};
export const defaultAnonymousTeamVote = (playerCount: number) => playerCount < 8;
export type TeamBallot = boolean | 'abstain';
export const nicknameSchema = z.string().trim().min(1).max(20);
export const roleSchema = z.enum([
  'merlin',
  'percival',
  'guinevere',
  'loyal',
  'morgana',
  'assassin',
  'mordred',
  'oberon',
  'minion',
]);
export type Role = z.infer<typeof roleSchema>;
const base = { commandId: z.string().uuid(), expectedVersion: z.number().int().min(1) };
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('setReady'), payload: z.object({ ready: z.boolean() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('setRolePreferences'), payload: z.object({ preferences: z.array(roleSchema).max(3).refine(arr => new Set(arr).size === arr.length, 'DUPLICATE_PREFERENCES') }).strict() }).strict(),
  z.object({ ...base, type: z.literal('updateSettings'), payload: settingsSchema }).strict(),
  z.object({ ...base, type: z.literal('setAdmission'), payload: z.object({ acceptingNewMembers: z.boolean() }).strict() }).strict(),
  ...(['startGame', 'confirmRole', 'startTeamVote', 'returnToLobby', 'requestAbort', 'endGame'] as const).map(type =>
    z.object({ ...base, type: z.literal(type), payload: z.object({}).strict() }).strict()),
  z.object({ ...base, type: z.literal('proposeTeam'), payload: z.object({ playerIds: z.array(z.string().uuid()).max(6), direction: z.enum(['clockwise', 'counterclockwise']) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('updateTeamDraft'), payload: z.object({ playerIds: z.array(z.string().uuid()).max(6), direction: z.enum(['clockwise', 'counterclockwise']) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('teamVote'), payload: z.object({ approve: z.union([z.boolean(), z.literal('abstain')]) }).strict() }).strict(),
  z.object({ ...base, type: z.literal('missionVote'), payload: z.object({ success: z.boolean() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('earlyAssassinationDecision'), payload: z.object({ attempt: z.boolean() }).strict() }).strict(),
  z.object({ ...base, type: z.literal('assassinate'), payload: z.object({ targetId: z.string().uuid() }).strict() }).strict(),
  z.object({
    ...base,
    type: z.literal('useTreasure'),
    payload: z.discriminatedUnion('action', [
      z.object({ action: z.literal('tinStaff'), targetId: z.string().uuid() }).strict(),
      z.object({ action: z.literal('guanyinMirror'), targetId: z.string().uuid().optional(), skip: z.boolean().optional() }).strict(),
      z.object({ action: z.literal('humanBag'), targetId: z.string().uuid() }).strict(),
      z.object({ action: z.literal('jinguSeal') }).strict(),
      z.object({ action: z.literal('bananaFan'), armed: z.boolean() }).strict(),
      z.object({ action: z.literal('heartBell'), targetId: z.string().uuid(), advice: z.enum(['protect', 'sabotage']) }).strict(),
    ]),
  }).strict(),
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
export interface User {
  id: string;
  nickname: string;
  avatar?: Avatar;
  avatarUrl?: string | null;
  wechatAvatarUrl?: string | null;
  playerCode?: string;
  isVip?: boolean;
  vipUntil?: string | null;
}
export interface Member extends User {
  seat: number;
  ready: boolean;
  online: boolean;
  hasRolePreference?: boolean;
}
export interface RoomView {
  id: string;
  code: string;
  hostId: string;
  version: number;
  serverTime?: string;
  settings: Settings;
  members: Member[];
  phase: 'waiting' | 'playing' | 'finished';
  acceptingNewMembers: boolean;
  game?: GameView;
  selfRolePreferences?: Role[];
  hasPassword?: boolean;
  dedicatedRoomId?: string;
  dedicatedRoomName?: string;
  /** Private room members only; admission still requires server validation. */
  inviteKey?: string;
}
export interface VoiceTokenResponse {
  appId: string;
  channel: string;
  token: string;
  uid: number;
}
export function uuidToRtcUid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = (Math.imul(31, hash) + uuid.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 2000000000) + 1;
}
export interface FriendSummary {
  id: string;
  nickname: string;
  avatar?: Avatar;
  avatarUrl?: string | null;
  playerCode: string;
  status: 'pending' | 'accepted';
  isSender: boolean;
  online: boolean;
  roomId?: string | null;
  roomCode?: string | null;
}

export interface AdminOverview {
  totalUsers: number;
  todayNewUsers: number;
  activeRoomsCount: number;
  totalGames: number;
  todayGames: number;
  freeAccessMode: boolean;
  onlineConnections: number;
}

export interface AdminUserSummary {
  id: string;
  nickname: string;
  playerCode: string;
  avatar?: Avatar;
  avatarUrl?: string | null;
  isBanned: boolean;
  bannedReason?: string | null;
  vipUntil?: string | null;
  isVip: boolean;
  gamesCount: number;
  friendsCount: number;
  createdAt: string;
}

export interface AdminRoomSummary {
  id: string;
  code: string;
  hostId: string;
  hostNickname: string;
  phase: string;
  memberCount: number;
  playerCount: number;
  voiceChatEnabled: boolean;
  createdAt: string;
  offlineSince?: string | null;
}

export interface AdminGameSummary {
  id: string;
  roomId: string;
  roomCode: string;
  playerCount: number;
  winner: Team | null;
  reason: string | null;
  createdAt: string;
  endedAt?: string | null;
}

export interface RedemptionCodeItem {
  code: string;
  days: number;
  note?: string | null;
  redeemedBy?: string | null;
  redeemerNickname?: string | null;
  redeemedAt?: string | null;
  createdAt: string;
}

export interface SystemAnnouncement {
  text: string;
  enabled: boolean;
}

export interface RoomChatMessage {
  messageId: string;
  fromUserId: string;
  seat: number;
  nickname: string;
  text: string;
  timestamp: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  createdAt: string;
  isSelf?: boolean;
}

export type ServerMessage = { type: 'playerCodeChanged'; playerCode: string }
  | { type: 'snapshot'; room: RoomView }
  | { type: 'commandResult'; commandId: string; ok: boolean; error?: string }
  | { type: 'roomClosed' }
  | { type: 'error'; error: string }
  | { type: 'takenOver' }
  | { type: 'left' }
  | { type: 'roomInvitation'; fromUser: User; roomId: string; roomCode: string }
  | { type: 'systemAnnouncement'; text: string; enabled: boolean }
  | { type: 'roomChat'; messageId: string; fromUserId: string; seat: number; nickname: string; text: string; timestamp: string }
  | { type: 'directChat'; messageId: string; fromUser: User; text: string; timestamp: string };

export type LoyalGuardian = 'zhubajie' | 'shawujing' | 'bailong' | 'jingang';
export type FemaleDemon = 'spider' | 'baigu' | 'yutu' | 'laoshu';
export type Team = 'blue' | 'red';
export type GamePhase = 'dealing' | 'role_reveal' | 'proposing' | 'discussion' | 'team_vote' | 'guanyin_window' | 'mission' | 'early_window' | 'assassination' | 'finished' | 'aborted';
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
export interface GuardianClue {
  kind: LoyalGuardian;
  title: string;
  description: string;
  targetIds: string[];
}
export type HeartBellAdvice = 'protect' | 'sabotage';
export interface HeartBellMessage {
  mission: number;
  roundNumber: number;
  advice: HeartBellAdvice;
  active: boolean;
}
export interface SelfTreasures {
  enabled: boolean;
  heartBell?: {
    used: boolean;
    available: boolean;
    targetIds: string[];
    sent?: HeartBellMessage & { targetId: string };
  };
  // Only the addressee receives this field; no sender identity or role is disclosed.
  incomingHeartBell?: HeartBellMessage;
  tinStaff?: {
    used: boolean;
    available: boolean;
    result?: { targetId: string; team: Team };
  };
  guanyinMirror?: {
    used: boolean;
    available: boolean;
    result?: { targetId: string; alignment: 'pure' | 'evil' };
  };
  humanBag?: {
    used: boolean;
    available: boolean;
    targetId?: string;
  };
  jinguSeal?: {
    used: boolean;
    available: boolean;
    activatedBy?: string;
  };
  jinguAllyId?: string;
  bananaFan?: {
    used: boolean;
    armed: boolean;
    available: boolean;
  };
}
export interface GameView {
  id: string; rulesetVersion: string; phase: GamePhase; players: Player[];
  dealEndsAt?: string;
  guanyinEndsAt?: string;
  mission: number; missionSizes: number[]; failuresRequired: number; rejectionCount: number;
  captainId: string; captainOrder: string[]; rounds: RoundView[];
  draftTeam?: { playerIds: string[]; direction: RoundView['direction'] };
  teamVote?: { startedAt?: string; votedIds: string[]; ballots?: Record<string, TeamBallot> };
  progress: { confirmed: number; teamVotes: number; missionVotes: number };
  lady?: { holderId: string; holderIds: string[]; inspections: Inspection[] };
  earlyAssassination?: { used: boolean; windows: EarlyWindow[] };
  assassinationMode?: 'normal' | 'early';
  assassinId?: string;
  humanBagBannedPlayerId?: string;
  bananaFanNotice?: string;
  result?: GameResult; revealedRoles?: Record<string, Role>;
  abortPoll?: { requestedBy: string; approvals: number; required: number; voted: boolean };
  self?: { role: Role; loyalGuardian?: LoyalGuardian; femaleDemon?: FemaleDemon; team: Team; evilIds: string[]; merlinCandidates: string[]; guinevereCandidates?: string[];
    guardianClue?: GuardianClue;
    confirmed: boolean; teamVoted: boolean; missionVoted: boolean;
    inspections?: PrivateInspection[]; canInspect?: boolean; canConfirmInspection?: boolean; canDecideEarly: boolean;
    treasures?: SelfTreasures };
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
