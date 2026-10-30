import type { Role, Avatar, DirectMessage, FriendSummary, GameSummary, GameView, Replay, RoomChatMessage, Settings, SettingPreset, Statistics, User } from '@avalon/contracts';
import type { RoleGalleryItem } from '../../../web/src/roles.js';

export interface WebDocument {
  kind: 'preferences' | 'identity' | 'vote' | 'treasures' | 'report' | 'history' | 'art' | 'confirm' | 'tools' | 'account' | 'presets' | 'friends' | 'chat' | 'guide' | 'guide-role' | 'admin' | 'replay' | 'settings';
  preferences?:Role[];
  preferencesDisabled?:boolean;
  modal?: boolean;
  game?: GameView;
  self?: NonNullable<GameView['self']>;
  user?: User;
  expanded?:string[];
  voteChoice?: boolean | 'abstain';
  submitted?: boolean;
  historyExpanded?: boolean;
  reportMission?: number;
  roleItem?: RoleGalleryItem;
  activeTab?: string;
  stats?: Statistics;
  games?: GameSummary[];
  presets?: SettingPreset[];
  settings?: Settings;
  presetName?: string;
  presetEditing?:boolean;
  canApplyPreset?: boolean;
  roomPreset?:boolean;
  profileEditing?: boolean;
  profileDraft?: { nickname: string; avatar: Avatar; avatarUrl?: string|null; wechatAvatarUrl?: string|null };
  friends?: FriendSummary[];
  friendTab?: 'invite' | 'friends' | 'add';
  friendQuery?: string;
  roomCode?: string;
  canInvite?: boolean;
  messages?: { id: string; text: string; name: string; self: boolean; timestamp?: string }[];
  chatDraft?: string;
  quickExpanded?: boolean;
  replay?: Replay;
}
