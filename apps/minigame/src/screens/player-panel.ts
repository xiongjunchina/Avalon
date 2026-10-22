import type { Avatar, DirectMessage, FriendSummary, GameSummary, Replay, RoomChatMessage, ServerMessage, SettingPreset, Settings, Statistics, User } from '@avalon/contracts';
import type { ScreenModel } from '../ui/widgets.js';
import { guideScreen } from './guide.js';
import { PlayerExtras } from './player-extras.js';
import { replayScreen } from './replay.js';

type Page = 'account' | 'stats' | 'history' | 'replay' | 'presets' | 'friends' | 'direct' | 'roomchat' | 'guide';
type Input = (label: string, maxLength?: number) => Promise<string | undefined>;
type AvatarPicker = () => Promise<string>;
const avatarOrder: Avatar[] = ['leaf', 'moon', 'sun', 'mountain', 'wave', 'star'];

export class PlayerPanel {
  private page: Page = 'account';
  private stats?: Statistics;
  private games: GameSummary[] = [];
  private cursor: string | null = null;
  private replay?: Replay;
  private presets: SettingPreset[] = [];
  private friends: FriendSummary[] = [];
  private selectedFriend?: FriendSummary;
  private direct: DirectMessage[] = [];
  private roomMessages: RoomChatMessage[] = [];
  private roomId?: string;
  private roomSettings?: Settings;
  private appliedSettings?: Settings;
  private canApplyPreset = false;
  private pending?: { label: string; action: () => Promise<unknown> };
  constructor(private readonly api: PlayerExtras, public user: User, private readonly avatarPicker?: AvatarPicker) {}

  onRoomChat(message: RoomChatMessage) { this.roomMessages.push(message); this.roomMessages = this.roomMessages.slice(-50); }
  onDirectChat(message: Extract<ServerMessage, { type: 'directChat' }>): void {
    if (this.page !== 'direct' || this.selectedFriend?.id !== message.fromUser.id) return;
    if (this.direct.some(item => item.id === message.messageId)) return;
    this.direct.push({ id: message.messageId, senderId: message.fromUser.id, receiverId: this.user.id,
      message: message.text, createdAt: message.timestamp, isSelf: false });
    this.direct = this.direct.slice(-50);
  }
  async open(page: Page, options: { roomId?: string; settings?: Settings; canApplyPreset?: boolean } = {}): Promise<void> {
    this.page = page;
    if (page === 'friends' || page === 'account') this.roomId = options.roomId;
    else if (options.roomId !== undefined) this.roomId = options.roomId;
    this.roomSettings = options.settings ?? this.roomSettings;
    this.canApplyPreset = options.canApplyPreset ?? this.canApplyPreset;
    if (page === 'stats') this.stats = await this.api.statistics();
    if (page === 'history') { const result = await this.api.history(); this.games = result.games; this.cursor = result.nextCursor; }
    if (page === 'presets') this.presets = (await this.api.presets()).presets;
    if (page === 'friends') this.friends = (await this.api.friends()).friends;
  }

  model(): ScreenModel {
    if (this.pending) return { title: '确认操作', subtitle: this.pending.label, rows: [{ id: 'confirm:yes', text: '确认执行' }, { id: 'confirm:no', text: '取消' }] };
    if (this.page === 'guide') return guideScreen();
    if (this.page === 'account') return { title: '我的账户', subtitle: `${this.user.nickname} · ${this.user.playerCode ?? ''}`, rows: [
      { id: 'nickname', text: `昵称：${this.user.nickname}` }, { id: 'avatar', text: this.user.avatarUrl ? '当前头像：自定义照片 · 点击改用徽章' : `头像徽章：${this.user.avatar ?? 'leaf'}` },
      { id: 'uploadAvatar', text: '上传自定义头像' },
      { id: 'redeem', text: '兑换 VIP 码' }, { id: 'page:stats', text: '战绩统计' },
      { id: 'page:history', text: '对局历史与收藏' }, { id: 'page:presets', text: '常用玩法预设' },
      { id: 'back', text: '返回' },
    ] };
    if (this.page === 'stats') return { title: '战绩统计', rows: [
      { id: 'summary', text: this.stats ? `${this.stats.completed}局 · ${this.stats.wins}胜 ${this.stats.losses}负 · 胜率${this.stats.winRate === null ? '—' : `${Math.round(this.stats.winRate * 100)}%`}` : '读取中' },
      ...Object.entries(this.stats?.byTeam ?? {}).map(([key, value]) => ({ id: `team:${key}`, text: `${key === 'blue' ? '蓝方' : '红方'} ${value.wins}胜 ${value.losses}负` })),
      ...Object.entries(this.stats?.byRole ?? {}).map(([key, value]) => ({ id: `role:${key}`, text: `${key} ${value.wins}胜 ${value.losses}负` })),
      { id: 'page:account', text: '返回账户' },
    ] };
    if (this.page === 'history') return { title: '对局历史', rows: [
      ...this.games.map(game => ({ id: `game:${game.id}`, text: `${game.playerCount}人 · ${game.self.role} · ${game.result.winner === game.self.team ? '获胜' : game.result.winner === null ? '中止' : '失败'} ${game.favorite ? '★' : ''}` })),
      ...(this.cursor ? [{ id: 'more', text: '加载更多' }] : []), { id: 'page:account', text: '返回账户' },
    ] };
    if (this.page === 'replay' && this.replay) return replayScreen(this.replay, 'page:history', true);
    if (this.page === 'presets') return { title: '常用玩法预设', rows: [
      ...(this.roomSettings ? [{ id: 'save', text: '保存当前设置为预设' }] : []),
      ...this.presets.flatMap(preset => [
        { id: `apply:${preset.id}`, text: `${preset.name} · ${preset.settings.playerCount}人${this.canApplyPreset ? ' · 点击应用' : ''}` },
        { id: `delete:${preset.id}`, text: `删除 ${preset.name}` },
      ]),
      { id: 'page:account', text: '返回账户' },
    ] };
    if (this.page === 'friends') return { title: '仙友', subtitle: `我的仙友码 ${this.user.playerCode ?? ''}`, rows: [
      { id: 'add', text: '按仙友码或昵称添加' },
      ...this.friends.map(friend => ({ id: `friend:${friend.id}`, text: `${friend.nickname} · ${friend.status === 'pending' ? '待确认' : friend.online ? '在线' : '离线'}` })),
      { id: 'back', text: '返回' },
    ] };
    if (this.page === 'direct' && this.selectedFriend) return { title: `与${this.selectedFriend.nickname}聊天`, rows: [
      ...this.direct.map(message => ({ id: `message:${message.id}`, text: `${message.isSelf ? '我' : this.selectedFriend!.nickname}：${message.message}` })),
      { id: 'send', text: '发送消息' },
      ...(this.selectedFriend.status === 'pending' && !this.selectedFriend.isSender ? [{ id: 'accept', text: '接受仙友请求' }] : []),
      ...(this.selectedFriend.status === 'accepted' && this.roomId ? [{ id: 'invite', text: '邀请加入当前房间' }] : []),
      { id: 'remove', text: '删除仙友' }, { id: 'page:friends', text: '返回仙友' },
    ] };
    if (this.page === 'roomchat') return { title: '房间聊天', rows: [
      ...this.roomMessages.map(message => ({ id: `roommessage:${message.messageId}`, text: `${message.seat}号 ${message.nickname}：${message.text}` })),
      { id: 'sendroom', text: '发送房间消息' }, { id: 'back', text: '返回房间' },
    ] };
    return { title: '玩家功能', rows: [{ id: 'back', text: '返回' }] };
  }

  async handle(id: string, input: Input): Promise<'back' | void> {
    if (id === 'back') return 'back';
    if (id === 'confirm:no') { this.pending = undefined; return; }
    if (id === 'confirm:yes' && this.pending) { const action = this.pending.action; this.pending = undefined; await action(); await this.open(this.page === 'direct' ? 'friends' : this.page, { roomId: this.roomId }); return; }
    if (id.startsWith('page:')) { await this.open(id.slice(5) as Page, { roomId: this.roomId }); return; }
    if (id === 'nickname') { const nickname = await input('新昵称', 20); if (nickname) this.user = (await this.api.updateProfile({ nickname, avatar: this.user.avatar ?? 'leaf', avatarUrl: this.user.avatarUrl ?? null, wechatAvatarUrl: this.user.wechatAvatarUrl ?? null })).user; return; }
    if (id === 'avatar') { const next = avatarOrder[(avatarOrder.indexOf(this.user.avatar ?? 'leaf') + 1) % avatarOrder.length]!; this.user = (await this.api.updateProfile({ nickname: this.user.nickname, avatar: next, avatarUrl: null, wechatAvatarUrl: null })).user; return; }
    if (id === 'uploadAvatar') { if (!this.avatarPicker) throw new Error('当前微信版本不支持上传头像'); const avatarUrl = await this.avatarPicker(); this.user = (await this.api.updateProfile({ nickname: this.user.nickname, avatar: this.user.avatar ?? 'leaf', avatarUrl, wechatAvatarUrl: null })).user; return; }
    if (id === 'redeem') { const code = await input('兑换码', 64); if (code) await this.api.redeem(code); return; }
    if (id === 'more' && this.cursor) { const result = await this.api.history(this.cursor); this.games.push(...result.games); this.cursor = result.nextCursor; return; }
    if (id.startsWith('game:')) { this.replay = await this.api.replay(id.slice(5)); this.page = 'replay'; return; }
    if (id === 'favorite' && this.replay) { const value = !this.replay.favorite; await this.api.favorite(this.replay.id, value); this.replay.favorite = value; return; }
    if (id === 'save' && this.roomSettings) { const name = await input('预设名称', 24); if (name) { await this.api.savePreset(name, this.roomSettings); await this.open('presets'); } return; }
    if (id.startsWith('apply:')) { const preset = this.presets.find(item => item.id === id.slice(6)); if (preset && this.canApplyPreset) this.appliedSettings = preset.settings; return; }
    if (id.startsWith('delete:')) { const preset = this.presets.find(item => item.id === id.slice(7)); if (preset) this.pending = { label: `删除预设 ${preset.name}？`, action: () => this.api.deletePreset(preset.id) }; return; }
    if (id === 'add') { const query = await input('仙友码或昵称', 50); if (query) { await this.api.requestFriend(query); await this.open('friends', { roomId: this.roomId }); } return; }
    if (id.startsWith('friend:')) { this.selectedFriend = this.friends.find(friend => friend.id === id.slice(7)); if (this.selectedFriend) { this.direct = (await this.api.directChat(this.selectedFriend.id)).messages; this.page = 'direct'; } return; }
    if (id === 'send' && this.selectedFriend) { const text = await input('私聊消息', 500); if (text) { await this.api.sendDirect(this.selectedFriend.id, text); this.direct = (await this.api.directChat(this.selectedFriend.id)).messages; } return; }
    if (id === 'accept' && this.selectedFriend) { await this.api.acceptFriend(this.selectedFriend.id); await this.open('friends', { roomId: this.roomId }); return; }
    if (id === 'invite' && this.selectedFriend && this.roomId) { await this.api.invite(this.roomId, this.selectedFriend.id); return; }
    if (id === 'remove' && this.selectedFriend) { const friend = this.selectedFriend; this.pending = { label: `删除仙友 ${friend.nickname}？`, action: () => this.api.removeFriend(friend.id) }; return; }
    if (id === 'sendroom' && this.roomId) { const text = await input('房间消息', 200); if (text) await this.api.roomChat(this.roomId, text); }
  }
  takeAppliedSettings() { const settings = this.appliedSettings; this.appliedSettings = undefined; return settings; }
}
