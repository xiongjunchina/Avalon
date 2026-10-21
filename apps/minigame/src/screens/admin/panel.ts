import type { AdminGameSummary, AdminOverview, AdminRoomSummary, AdminUserSummary, RedemptionCodeItem, Replay, SystemAnnouncement } from '@avalon/contracts';
import type { ScreenModel } from '../../ui/widgets.js';
import { AdminApi } from './auth.js';
import { adminCodesScreen, adminGamesScreen, adminOverviewScreen, adminRoomsScreen, adminSettingsScreen, adminUserScreen, adminUsersScreen } from './views.js';

type Page = 'overview' | 'users' | 'rooms' | 'games' | 'codes' | 'settings' | 'user' | 'replay' | 'friends';
type Input = (label: string, maxLength?: number) => Promise<string | undefined>;
type Settings = { freeAccessMode: boolean; adRewardHours: number; announcement: SystemAnnouncement };

export class AdminPanel {
  private page: Page = 'overview';
  private overviewData?: AdminOverview;
  private usersData: AdminUserSummary[] = [];
  private roomsData: AdminRoomSummary[] = [];
  private gamesData: AdminGameSummary[] = [];
  private codesData: RedemptionCodeItem[] = [];
  private settingsData?: Settings;
  private user?: AdminUserSummary;
  private replayData?: Replay;
  private friendNames: string[] = [];
  private query = '';
  private pending?: { label: string; action: () => Promise<unknown> };
  constructor(readonly api: AdminApi) {}

  async open(key: string) { await this.api.verify(key); await this.load('overview'); }
  onHide() { this.api.onHide(); this.pending = undefined; }

  model(): ScreenModel {
    if (this.pending) return { title: '确认管理操作', subtitle: this.pending.label, rows: [{ id: 'confirm:yes', text: '确认执行' }, { id: 'confirm:no', text: '取消' }] };
    if (this.page === 'user' && this.user) return adminUserScreen(this.user);
    if (this.page === 'replay' && this.replayData) return { title: '对局复盘', rows: [
      { id: 'replay:result', text: `${this.replayData.playerCount}人 · ${this.replayData.result.winner ?? '中止'}` },
      ...this.replayData.players.map(player => ({ id: `replay:player:${player.id}`, text: `${player.seat}号 ${player.nickname} · ${this.replayData!.roles[player.id] ?? ''}` })),
      ...this.replayData.rounds.map(round => ({ id: `replay:round:${round.number}`, text: `第${round.number}轮 · ${round.result?.passed ? '成功' : '失败'}` })),
      { id: 'page:games', text: '返回对局记录' },
    ] };
    if (this.page === 'friends') return { title: '用户仙友', rows: [...this.friendNames.map((name, index) => ({ id: `friend:${index}`, text: name })), { id: 'page:users', text: '返回用户列表' }] };
    if (this.page === 'overview' && this.overviewData) return adminOverviewScreen(this.overviewData);
    if (this.page === 'users') return adminUsersScreen(this.usersData, this.query);
    if (this.page === 'rooms') return adminRoomsScreen(this.roomsData);
    if (this.page === 'games') return adminGamesScreen(this.gamesData);
    if (this.page === 'codes') return adminCodesScreen(this.codesData);
    if (this.page === 'settings' && this.settingsData) return adminSettingsScreen(this.settingsData);
    return { title: '管理员', rows: [{ id: 'page:overview', text: '刷新管理总览' }, { id: 'back', text: '返回游戏' }] };
  }

  async load(page: Page): Promise<void> {
    this.page = page;
    if (page === 'overview') this.overviewData = await this.api.overview();
    else if (page === 'users') this.usersData = (await this.api.users(this.query)).users;
    else if (page === 'rooms') this.roomsData = (await this.api.rooms()).rooms;
    else if (page === 'games') this.gamesData = (await this.api.games()).games;
    else if (page === 'codes') this.codesData = (await this.api.codes()).codes;
    else if (page === 'settings') this.settingsData = await this.api.settings() as Settings;
  }

  async handle(id: string, input: Input): Promise<'back' | void> {
    if (id === 'back') return 'back';
    if (id === 'confirm:no') { this.pending = undefined; return; }
    if (id === 'confirm:yes' && this.pending) { const action = this.pending.action; this.pending = undefined; await action(); await this.load(this.page); return; }
    if (id.startsWith('page:')) { await this.load(id.slice(5) as Page); return; }
    if (id === 'search') { this.query = await input('搜索用户', 40) ?? ''; await this.load('users'); return; }
    if (id.startsWith('user:')) { this.user = this.usersData.find(user => user.id === id.slice(5)); if (this.user) this.page = 'user'; return; }
    if (id.startsWith('ban:') && this.user) {
      const target = this.user, ban = !target.isBanned;
      this.pending = { label: `${ban ? '封禁' : '解封'} ${target.nickname}？`, action: () => this.api.banUser(target.id, ban, ban ? '管理员操作' : '') };
      return;
    }
    if (id.startsWith('vip:') && this.user) { const days = Number(await input('赠送 VIP 天数（1-3650）', 4)); if (Number.isInteger(days) && days >= 1 && days <= 3650) { await this.api.grantVip(this.user.id, days); await this.load('users'); } return; }
    if (id.startsWith('friends:') && this.user) {
      const response = await this.api.userFriends(this.user.id) as { friends: { nickname: string }[] };
      this.friendNames = response.friends.map(friend => friend.nickname); this.page = 'friends'; return;
    }
    if (id.startsWith('reset:') && this.user) { const target = this.user; this.pending = { label: `重置 ${target.nickname} 的资料？`, action: () => this.api.resetProfile(target.id, true, true) }; return; }
    if (id.startsWith('delete:') && this.user) { const target = this.user; this.pending = { label: `永久删除 ${target.nickname}？`, action: () => this.api.deleteUser(target.id, true) }; return; }
    if (id.startsWith('room:')) {
      const target = this.roomsData.find(room => room.id === id.slice(5));
      if (target) this.pending = { label: `强制关闭房间 ${target.code}？`, action: () => this.api.killRoom(target.id, true) };
      return;
    }
    if (id.startsWith('replay:') && !id.includes(':player:') && !id.includes(':round:')) { this.replayData = await this.api.replay(id.slice(7)); this.page = 'replay'; return; }
    if (id === 'generate') { const count = Number(await input('生成数量（1-100）', 3)); const days = Number(await input('有效天数（1-365）', 3)); if (Number.isInteger(count) && count >= 1 && count <= 100 && Number.isInteger(days) && days >= 1 && days <= 365) { await this.api.generateCodes(count, days); await this.load('codes'); } return; }
    if (id === 'mode' && this.settingsData) { const value = !this.settingsData.freeAccessMode; this.pending = { label: value ? '恢复全员免费？' : '切换商业模式？', action: () => this.api.updateSetting('free_access_mode', value) }; return; }
    if (id === 'reward' && this.settingsData) { const hours = Number(await input('广告奖励小时数', 3)); if (Number.isInteger(hours) && hours >= 1 && hours <= 720) { await this.api.updateSetting('ad_reward_hours', hours); await this.load('settings'); } return; }
    if (id === 'broadcast' && this.settingsData) { const text = await input('公告内容（留空关闭）', 200); if (text !== undefined) { await this.api.broadcast(text, Boolean(text)); await this.load('settings'); } }
  }
}
