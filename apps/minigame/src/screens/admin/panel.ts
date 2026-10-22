import type { AdminGameSummary, AdminOverview, AdminRoomSummary, AdminUserSummary, RedemptionCodeItem, Replay, SystemAnnouncement } from '@avalon/contracts';
import type { ScreenModel } from '../../ui/widgets.js';
import { AdminApi } from './auth.js';
import { adminCodesScreen, adminGamesScreen, adminOverviewScreen, adminReplayScreen, adminRoomsScreen, adminSettingsScreen, adminUserScreen, adminUsersScreen } from './views.js';

type Page = 'overview' | 'users' | 'rooms' | 'games' | 'codes' | 'settings' | 'user' | 'replay' | 'friends';
type Input = (label: string, maxLength?: number) => Promise<string | undefined>;
type Settings = { freeAccessMode: boolean; adRewardHours: number; announcement: SystemAnnouncement };

export class AdminPanel {
  private page: Page = 'overview';
  private overviewData?: AdminOverview;
  private usersData: AdminUserSummary[] = [];
  private userTotal = 0;
  private roomsData: AdminRoomSummary[] = [];
  private gamesData: AdminGameSummary[] = [];
  private moreGames = false;
  private codesData: RedemptionCodeItem[] = [];
  private settingsData?: Settings;
  private user?: AdminUserSummary;
  private replayData?: Replay;
  private friendNames: string[] = [];
  private query = '';
  private pending?: { label: string; action: () => Promise<unknown> };
  private feedback = '';
  private loadEpoch = 0;
  private codeDraft={count:'10',days:'30',note:''};
  constructor(readonly api: AdminApi, private readonly copy?: (text: string) => Promise<void>) {}

  async open(key: string) {
    try { await this.api.verify(key); await this.load('overview'); }
    catch (error) { this.onHide(); throw error; }
  }
  onHide() {
    this.loadEpoch++;
    this.api.onHide(); this.pending = undefined; this.page = 'overview'; this.overviewData = undefined;
    this.usersData = []; this.userTotal = 0; this.roomsData = []; this.gamesData = []; this.moreGames = false;
    this.codesData = []; this.settingsData = undefined; this.user = undefined; this.replayData = undefined;
    this.friendNames = []; this.query = ''; this.feedback = '';this.codeDraft={count:'10',days:'30',note:''};
  }

  model(): ScreenModel {
    const result = this.pageModel();
    result.web ??= { page:'sheet',background:'library',activeTab:'page:'+this.page,backId:this.pending?'confirm:no':'back',document:{kind:this.pending?'confirm':'admin',modal:!!this.pending} };
    if(this.page==='codes'&&!this.pending){result.rows=result.rows.filter(r=>r.id!=='generate');result.rows.splice(6,0,{id:'codeDraft:count',text:'生成数量：'+this.codeDraft.count},{id:'codeDraft:days',text:'有效天数：'+this.codeDraft.days},{id:'codeDraft:note',text:'备注：'+(this.codeDraft.note||'未填写')},{id:'generateDraft',text:'生成兑换码'});}
    return result;
  }
  private pageModel(): ScreenModel {
    if (this.pending) return { title: '确认管理操作', rows: [{ id: 'notice', text: this.pending.label }, { id: 'confirm:yes', text: '确认执行' }, { id: 'confirm:no', text: '取消' }] };
    if (this.page === 'user' && this.user) return adminUserScreen(this.user);
    if (this.page === 'replay' && this.replayData) return adminReplayScreen(this.replayData);
    if (this.page === 'friends') return { title: '用户仙友', rows: [...this.friendNames.map((name, index) => ({ id: `friend:${index}`, text: name })), { id: 'page:users', text: '返回用户列表' }] };
    if (this.page === 'overview' && this.overviewData) return adminOverviewScreen(this.overviewData);
    if (this.page === 'users') return adminUsersScreen(this.usersData, this.query, this.usersData.length < this.userTotal);
    if (this.page === 'rooms') return adminRoomsScreen(this.roomsData);
    if (this.page === 'games') return adminGamesScreen(this.gamesData, this.moreGames);
    if (this.page === 'codes') { const result = adminCodesScreen(this.codesData); if (this.feedback) { result.subtitle = this.feedback; result.rows.unshift({ id: 'guide:feedback', text: this.feedback }); } return result; }
    if (this.page === 'settings' && this.settingsData) return adminSettingsScreen(this.settingsData);
    return { title: '管理员', rows: [{ id: 'page:overview', text: '刷新管理总览' }, { id: 'back', text: '返回游戏' }] };
  }

  async load(page: Page): Promise<void> {
    const epoch = ++this.loadEpoch;
    this.page = page;
    this.feedback = '';
    if (page === 'overview') { const data = await this.api.overview(); if (epoch === this.loadEpoch) this.overviewData = data; }
    else if (page === 'users') { const result = await this.api.users(this.query, 0); if (epoch === this.loadEpoch) { this.usersData = result.users; this.userTotal = result.total; } }
    else if (page === 'rooms') { const result = await this.api.rooms(); if (epoch === this.loadEpoch) this.roomsData = result.rooms; }
    else if (page === 'games') { const result = await this.api.games(0); if (epoch === this.loadEpoch) { this.gamesData = result.games; this.moreGames = result.games.length === 20; } }
    else if (page === 'codes') { const result = await this.api.codes(); if (epoch === this.loadEpoch) this.codesData = result.codes; }
    else if (page === 'settings') { const data = await this.api.settings() as Settings; if (epoch === this.loadEpoch) this.settingsData = data; }
  }

  async handle(id: string, input: Input): Promise<'back' | void> {
    if (id === 'back') return 'back';
    if (id === 'confirm:no') { this.pending = undefined; return; }
    if (id === 'confirm:yes' && this.pending) { const action = this.pending.action; this.pending = undefined; await action(); this.user = undefined; await this.load(this.page === 'user' ? 'users' : this.page); return; }
    if (id === 'more:users' && this.page === 'users' && this.usersData.length < this.userTotal) { const epoch = this.loadEpoch; const result = await this.api.users(this.query, this.usersData.length); if (epoch === this.loadEpoch) { this.usersData.push(...result.users); this.userTotal = result.total; } return; }
    if (id === 'more:games' && this.page === 'games' && this.moreGames) { const epoch = this.loadEpoch; const result = await this.api.games(this.gamesData.length); if (epoch === this.loadEpoch) { this.gamesData.push(...result.games); this.moreGames = result.games.length === 20; } return; }
    if (id === 'cleanup' && this.page === 'users') { this.pending = { label: '清理所有无对局的空账户？', action: () => this.api.deleteEmptyUsers(true) }; return; }
    if (id === 'copy:unused' && this.page === 'codes') {
      const unused = this.codesData.filter(code => !code.redeemedAt).map(code => `${code.code} (${code.days}天 - ${code.note || '无备注'})`);
      if (!unused.length) { this.feedback = '当前没有未使用兑换码'; return; }
      if (!this.copy) { this.feedback = '当前设备不支持复制'; return; }
      await this.copy(unused.join('\n')); this.feedback = `已复制 ${unused.length} 个未使用兑换码`; return;
    }
    if (id.startsWith('code:') && this.page === 'codes') {
      const code = this.codesData.find(item => item.code === id.slice(5));
      if (code) this.feedback = `${code.code} · ${code.days}天 · ${code.note || '无备注'} · ${code.redeemerNickname || '未兑换'}`;
      return;
    }
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
      const epoch = this.loadEpoch;
      const response = await this.api.userFriends(this.user.id) as { friends: { nickname: string; player_code: string; status: string }[] };
      if (epoch === this.loadEpoch) {
        this.friendNames = response.friends.map(friend => `${friend.nickname} (${friend.player_code}) · ${friend.status === 'accepted' ? '已互关' : '申请中'}`);
        this.page = 'friends';
      }
      return;
    }
    if (id.startsWith('reset:') && this.user) { const target = this.user; this.pending = { label: `重置 ${target.nickname} 的资料？`, action: () => this.api.resetProfile(target.id, true, true) }; return; }
    if (id.startsWith('delete:') && this.user) { const target = this.user; this.pending = { label: `永久删除 ${target.nickname}？`, action: () => this.api.deleteUser(target.id, true) }; return; }
    if (id.startsWith('room:')) {
      const target = this.roomsData.find(room => room.id === id.slice(5));
      if (target) this.pending = { label: `强制关闭房间 ${target.code}？`, action: () => this.api.killRoom(target.id, true) };
      return;
    }
    if (this.page === 'games' && id.startsWith('replay:')) { const epoch = this.loadEpoch; const result = await this.api.replay(id.slice(7)); if (epoch === this.loadEpoch) { this.replayData = result; this.page = 'replay'; } return; }
    if(id.startsWith('codeDraft:')){const key=id.slice(10) as keyof typeof this.codeDraft;if(['count','days','note'].includes(key)){const value=await input(key==='note'?'兑换码备注':key==='count'?'生成数量（1-100）':'有效天数（1-365）',key==='note'?100:3);if(value!==undefined)this.codeDraft[key]=value;}return;}
    if(id==='generateDraft'){const count=Number(this.codeDraft.count),days=Number(this.codeDraft.days);if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(days)||days<1||days>365){this.feedback='数量或天数超出范围';return;}const result=await this.api.generateCodes(count,days,this.codeDraft.note.trim()||undefined);await this.load('codes');this.feedback=`已生成 ${result.codes.length} 个兑换码`;return;}
    if (id === 'generate') {
      const countInput = await input('生成数量（1-100）', 3); if (countInput === undefined) return;
      const daysInput = await input('有效天数（1-365）', 3); if (daysInput === undefined) return;
      const count = Number(countInput), days = Number(daysInput);
      if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(days) || days < 1 || days > 365) { this.feedback = '数量或天数超出范围'; return; }
      const note = await input('备注（可留空）', 100); if (note === undefined) return;
      const result = await this.api.generateCodes(count, days, note.trim() || undefined);
      await this.load('codes'); this.feedback = `已生成 ${result.codes.length} 个兑换码`; return;
    }
    if (id === 'mode' && this.settingsData) { const value = !this.settingsData.freeAccessMode; this.pending = { label: value ? '恢复全员免费？' : '切换商业模式？', action: () => this.api.updateSetting('free_access_mode', value) }; return; }
    if (id === 'reward' && this.settingsData) { const hours = Number(await input('广告奖励小时数', 3)); if (Number.isInteger(hours) && hours >= 1 && hours <= 720) { await this.api.updateSetting('ad_reward_hours', hours); await this.load('settings'); } return; }
    if (id === 'broadcast' && this.settingsData) { const text = await input('公告内容（留空关闭）', 200); if (text !== undefined) { await this.api.broadcast(text, Boolean(text)); await this.load('settings'); } }
  }
}
