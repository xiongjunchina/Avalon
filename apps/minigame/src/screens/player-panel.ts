import { defaultSettings, defaultAnonymousTeamVote } from '@avalon/contracts';
import { toggleSetting } from './settings.js';
import {BUILTIN_AVATARS} from '../../../web/src/avatar-catalog.js';
import type { Avatar, DirectMessage, FriendSummary, GameSummary, Replay, RoomChatMessage, ServerMessage, SettingPreset, Settings, Statistics, User } from '@avalon/contracts';
import type { ScreenModel } from '../ui/widgets.js';
import { guideScreen } from './guide.js';
import { PlayerExtras } from './player-extras.js';
import { replayScreen } from './replay.js';
import { formatRoleName } from '../../../web/src/roles.js';

type Page = 'account' | 'stats' | 'history' | 'replay' | 'presets' | 'friends' | 'direct' | 'roomchat' | 'guide';
type Input = (label: string, maxLength?: number) => Promise<string | undefined>;
type AvatarPicker = () => Promise<string>;
const avatarOrder: Avatar[] = ['leaf', 'moon', 'sun', 'mountain', 'wave', 'star'];

export class PlayerPanel {
  private friendTab: 'invite'|'friends'|'add' = 'invite';
  private friendQuery = '';
  private roomCode?: string;
  private chatDraft = '';
  private quickExpanded = false;
  private presetSettings: Settings = {...defaultSettings};
  private expanded=new Set<string>();
  private presetEditing=false;
  private presetName = '';
  private profileEditing = false;
  private profileDraft?: {nickname:string;avatar:Avatar;avatarUrl?:string|null;wechatAvatarUrl?:string|null};
  private replayBack = 'page:history';
  private page: Page = 'account';
  private stats?: Statistics;
  private games: GameSummary[] = [];
  private cursor: string | null = null;
  private favoritesOnly = false;
  private feedback = '';
  private replay?: Replay;
  private presets: SettingPreset[] = [];
  private friends: FriendSummary[] = [];
  private selectedFriend?: FriendSummary;
  private direct: DirectMessage[] = [];
  private roomMessages: RoomChatMessage[] = [];
  private chatRoomId?: string;
  private roomId?: string;
  private roomSettings?: Settings;
  private appliedSettings?: Settings;
  private canApplyPreset = false;
  private pending?: { label: string; action: () => Promise<unknown> };
  constructor(private readonly api: PlayerExtras, public user: User, private readonly avatarPicker?: AvatarPicker) {}

  setChatRoom(roomId: string, roomCode?: string) {
    if(roomCode)this.roomCode=roomCode;
    if (this.chatRoomId !== roomId) { this.roomMessages = []; this.chatRoomId = roomId; }
  }
  onRoomChat(message: RoomChatMessage) {
    if (this.roomMessages.some(item => item.messageId === message.messageId)) return;
    this.roomMessages.push(message); this.roomMessages = this.roomMessages.slice(-50);
  }
  onDirectChat(message: Extract<ServerMessage, { type: 'directChat' }>): void {
    if (this.page !== 'direct' || this.selectedFriend?.id !== message.fromUser.id) return;
    if (this.direct.some(item => item.id === message.messageId)) return;
    this.direct.push({ id: message.messageId, senderId: message.fromUser.id, receiverId: this.user.id,
      message: message.text, createdAt: message.timestamp, isSelf: false });
    this.direct = this.direct.slice(-50);
  }
  async open(page: Page, options: { roomId?: string; settings?: Settings; canApplyPreset?: boolean } = {}): Promise<void> {
    this.page = page;
    this.feedback = '';
    if (page === 'roomchat' && options.roomId) this.setChatRoom(options.roomId);
    if (page === 'friends' || page === 'account') this.roomId = options.roomId;
    else if (options.roomId !== undefined) this.roomId = options.roomId;
    if (page === 'account' && !options.roomId) {
      this.roomSettings = undefined;
      this.canApplyPreset = false;
      this.appliedSettings = undefined;
    } else {
      this.roomSettings = options.settings ?? this.roomSettings;
      this.canApplyPreset = options.canApplyPreset ?? this.canApplyPreset;
    }
    if (page === 'stats' || page === 'account') this.stats = await this.api.statistics();
    if (page === 'history') { const result = await this.api.history(undefined, this.favoritesOnly); this.games = result.games; this.cursor = result.nextCursor; }
    if (page === 'presets') this.presets = (await this.api.presets()).presets;
    if (page === 'friends') this.friends = (await this.api.friends()).friends;
  }

  model(): ScreenModel {
    const result = this.pageModel();
    result.web ??= { page: 'sheet', background: ['friends', 'direct', 'roomchat'].includes(this.page) ? 'pavilion' : 'dawn', activeTab: 'page:' + (this.page === 'account' ? 'stats' : this.page) };
    if (!['friends', 'direct', 'roomchat', 'replay', 'guide'].includes(this.page) && !this.pending) {
      const nav = [{ id: 'page:stats', text: '我的战绩' }, { id: 'page:history', text: '历史对局' }, { id: 'page:favorites', text: '我的收藏' }, { id: 'page:presets', text: '常用设置' }];
      result.rows = [...nav, ...result.rows.filter(row => !nav.some(item => item.id === row.id))];
    }
    if ((this.page === 'stats' || this.page === 'account') && !this.pending) {
      result.title = '功果簿 · ' + this.user.nickname;
      const values = [[String(this.stats?.completed ?? 0), '完成对局'], [String(this.stats?.wins ?? 0), '胜利'], [String(this.stats?.losses ?? 0), '失败'], [this.stats?.winRate == null ? '—' : Math.round(this.stats.winRate * 100) + '%', '总胜率']];
      result.rows.splice(4, 0, ...values.map(([value, label], index) => ({ id: 'metric:' + index, text: value + '|' + label })));
      result.rows.push({ id: 'copyCode', text: '#' + (this.user.playerCode ?? '') + ' · 复制仙友码' }, { id: 'page:account', text: '仙位资料与兑换' }, { id: 'admin', text: '管理员' });
    }
    const kind=this.page==='presets'?'presets':['account','stats','history'].includes(this.page)?'account':this.page==='friends'?'friends':['direct','roomchat'].includes(this.page)?'chat':this.page==='replay'?'replay':undefined;
    if(this.pending){result.web={page:'sheet',background:'dawn',backId:'confirm:no',document:{kind:'confirm',modal:true}};}
    else if(kind){
      result.web={...result.web!,backId:this.page==='direct'?'page:friends':this.page==='replay'?this.replayBack:'back',document:{kind,modal:['friends','chat'].includes(kind),
        user:this.user,expanded:[...this.expanded],activeTab:this.page==='account'||this.page==='stats'?'stats':this.page==='history'&&this.favoritesOnly?'favorites':this.page,
        stats:this.stats,games:this.games,presets:this.presets,settings:this.roomSettings??this.presetSettings,presetName:this.presetName,presetEditing:this.presetEditing,canApplyPreset:this.canApplyPreset,roomPreset:!!this.roomSettings,
        profileEditing:this.profileEditing,profileDraft:this.profileDraft,friends:this.friends,friendTab:this.friendTab,friendQuery:this.friendQuery,canInvite:!!this.roomId,roomCode:this.roomId?this.roomCode:undefined,
        chatDraft:this.chatDraft,quickExpanded:this.quickExpanded,replay:this.replay,
        messages:this.page==='direct'?this.direct.map(m=>({id:m.id,text:m.message,name:m.isSelf?'我':this.selectedFriend?.nickname??'',self:Boolean(m.isSelf),timestamp:m.createdAt})):this.roomMessages.map(m=>({id:m.messageId,text:m.text,name:m.seat+'号 '+m.nickname,self:m.fromUserId===this.user.id,timestamp:m.timestamp}))}};
      if(['direct','roomchat'].includes(this.page))result.rows.push(...(this.page==='direct'?['来开一局？','马上上线！','稍等我两分钟','今晚几点开战？','速来，三缺一！','上局打得漂亮！']:['我是取经好人','建议本轮流局','队长选我，必是红心','我看见假猴了！','刺客别急，听我一言','全票准行，即刻出征','有人在浑水摸鱼','这局必须查验他！','平票也算流局，谨慎投！','相信我，我带飞']).map((text,i)=>({id:'quick:'+i,text})));
    }
    if(this.profileEditing&&result.web?.document&&!this.pending){
      const underlay={...result,web:{...result.web,document:{...result.web.document,profileEditing:false}}};
      result.web={...result.web,underlay,backId:'profileToggle',document:{...result.web.document,modal:true}};
    }
    if(this.presetEditing&&result.web?.document&&!this.pending){const underlay={...result,web:{...result.web,document:{...result.web.document,presetEditing:false}}};result.web={...result.web,underlay,backId:'preset:cancel',document:{...result.web.document,modal:true}};}
    return result;
  }
  async openReplay(id:string, backId='page:history') {this.replay=await this.api.replay(id);this.replayBack=backId;this.page='replay';}
  setRoomCode(code:string){this.roomCode=code;}
  private pageModel(): ScreenModel {
    if (this.pending) return { title: '确认操作', rows: [{ id: 'notice', text: this.pending.label }, { id: 'confirm:yes', text: '确认执行' }, { id: 'confirm:no', text: '取消' }] };
    if (this.page === 'guide') return guideScreen();
    if (this.page === 'account') return { title: '我的账户', subtitle: `${this.user.nickname} · ${this.user.playerCode ?? ''}`, rows: [
      ...(this.feedback ? [{ id: 'notice', text: this.feedback }] : []),
      { id: 'stats:vip', text: this.user.isVip ? `VIP 有效期至 ${this.user.vipUntil ?? '长期有效'}` : '当前账户未开通 VIP' },
      { id: 'nickname', text: `昵称：${this.user.nickname}` }, { id: 'avatar', text: this.user.avatarUrl ? '当前头像：自定义照片 · 点击改用徽章' : `头像徽章：${this.user.avatar ?? 'leaf'}` },
      { id: 'uploadAvatar', text: '上传自定义头像' },
      { id: 'redeem', text: '兑换 VIP 码' }, { id: 'page:stats', text: '战绩统计' },
      { id: 'page:history', text: '对局历史与收藏' }, { id: 'page:presets', text: '常用玩法预设' },
      { id: 'back', text: '返回' },
    ] };
    if (this.page === 'stats') return { title: '战绩统计', rows: [
      { id: 'summary', text: this.stats ? `${this.stats.completed}局 · ${this.stats.wins}胜 ${this.stats.losses}负 · 胜率${this.stats.winRate === null ? '—' : `${Math.round(this.stats.winRate * 100)}%`}` : '读取中' },
      ...Object.entries(this.stats?.byTeam ?? {}).map(([key, value]) => ({ id: `team:${key}`, text: `${key === 'blue' ? '蓝方' : '红方'} ${value.wins}胜 ${value.losses}负` })),
      ...Object.entries(this.stats?.byRole ?? {}).map(([key, value]) => ({ id: `role:${key}`, text: `${formatRoleName(key as Parameters<typeof formatRoleName>[0])} ${value.wins}胜 ${value.losses}负` })),
      { id: 'page:account', text: '返回账户' },
    ] };
    if (this.page === 'history') return { title: this.favoritesOnly ? '我的收藏' : '对局历史', rows: [
      { id: 'favorites', text: this.favoritesOnly ? '切换到全部对局' : '只看收藏的对局' },
      ...(!this.games.length ? [{ id: 'empty', text: this.favoritesOnly ? '暂无收藏，可在复盘中收藏对局' : '暂无已完成的对局' }] : []),
      ...this.games.map(game => ({ id: `game:${game.id}`, text: `${game.playerCount}人 · ${formatRoleName(game.self.role)} · ${game.result.winner === game.self.team ? '获胜' : game.result.winner === null ? '中止' : '失败'} ${game.favorite ? '★' : ''}` })),
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
      { id: 'refresh:friends', text: '刷新仙友与申请' },
      ...this.friends.map(friend => ({ id: `friend:${friend.id}`, text: `${friend.nickname} · ${friend.status === 'pending' ? '待确认' : friend.online ? '在线' : '离线'}` })),
      { id: 'back', text: '返回' },
    ] };
    if (this.page === 'direct' && this.selectedFriend) return { title: `与${this.selectedFriend.nickname}聊天`, rows: [
      ...(this.feedback ? [{ id: 'notice', text: this.feedback }] : []),
      ...this.direct.map(message => ({ id: `message:${message.id}`, text: `${message.isSelf ? '我' : this.selectedFriend!.nickname}：${message.message}` })),
      { id: 'send', text: '发送消息' },
      ...(this.selectedFriend.status === 'pending' && !this.selectedFriend.isSender ? [{ id: 'accept', text: '接受仙友请求' }] : []),
      ...(this.selectedFriend.status === 'accepted' && this.roomId ? [{ id: 'invite', text: '邀请加入当前房间' }] : []),
      { id: 'remove', text: '删除仙友' }, { id: 'page:friends', text: '返回仙友' },
    ] };
    if (this.page === 'roomchat') return { title: '房间聊天', rows: [
      ...(!this.roomMessages.length ? [{ id: 'empty', text: '暂无消息。这里只显示本次连接收到的房间消息。' }] : []),
      ...this.roomMessages.map(message => ({ id: `roommessage:${message.messageId}`, text: `${message.seat}号 ${message.nickname}：${message.text}` })),
      { id: 'sendroom', text: '发送房间消息' }, { id: 'back', text: '返回房间' },
    ] };
    return { title: '玩家功能', rows: [{ id: 'back', text: '返回' }] };
  }

  async handle(id: string, input: Input): Promise<'back' | void> {
    if(id.startsWith('details:')){const key=id.slice(8);if(this.expanded.has(key))this.expanded.delete(key);else this.expanded.add(key);return;}
    if(id==='dismissFeedback'){this.feedback='';return;}
    if(id.startsWith('friendTab:')){this.friendTab=id.slice(10) as typeof this.friendTab;return;}
    if(id==='input:friend'){const text=await input('仙友码或尊号',50);if(text!==undefined)this.friendQuery=text;return;}
    if(id==='friend:add'){if(!this.friendQuery.trim())return;await this.api.requestFriend(this.friendQuery.trim());this.feedback='仙友申请已发送';this.friendQuery='';this.friends=(await this.api.friends()).friends;return;}
    if(id==='profileToggle'){this.profileEditing=!this.profileEditing;if(!this.profileDraft)this.profileDraft={nickname:this.user.nickname,avatar:this.user.avatar??'leaf',avatarUrl:this.user.avatarUrl,wechatAvatarUrl:this.user.wechatAvatarUrl};return;}
    if(id==='profile:nickname'){const text=await input('尊号',20);if(text!==undefined&&this.profileDraft)this.profileDraft.nickname=text;return;}
    if(id.startsWith('profile:builtin:')&&this.profileDraft){const item=BUILTIN_AVATARS[Number(id.slice(16))];if(item){this.profileDraft.avatarUrl=item.src;this.profileDraft.wechatAvatarUrl=null;}return;}
    if(id.startsWith('profile:avatar:')&&this.profileDraft){const avatar=id.slice(15) as Avatar;if(avatarOrder.includes(avatar)){this.profileDraft.avatar=avatar;this.profileDraft.avatarUrl=null;this.profileDraft.wechatAvatarUrl=null;}return;}
    if(id==='profile:wechat'&&this.profileDraft){const idx=Number(/wx-(\d+)/.exec(this.profileDraft.wechatAvatarUrl??'')?.[1]??0)%12+1;this.profileDraft.wechatAvatarUrl='/art/avatars/wx-'+idx+'.webp?v=artifact1';this.profileDraft.avatarUrl=null;return;}
    if(id==='profile:save'&&this.profileDraft){if(!this.profileDraft.nickname.trim())throw new Error('请填写尊号');this.user=(await this.api.updateProfile(this.profileDraft)).user;this.profileDraft=undefined;this.profileEditing=false;this.feedback='资料已保存';return;}
    if(id==='uploadAvatar'&&this.profileEditing&&this.profileDraft){if(!this.avatarPicker)throw new Error('当前微信版本不支持上传头像');this.profileDraft.avatarUrl=await this.avatarPicker();this.profileDraft.wechatAvatarUrl=null;return;}
    if(id.startsWith('acceptFriend:')){await this.api.acceptFriend(id.slice(13));await this.open('friends',{roomId:this.roomId});return;}
    if(id.startsWith('inviteFriend:')&&this.roomId){const friend=this.friends.find(f=>f.id===id.slice(13)&&f.status==='accepted');if(friend){const result=await this.api.invite(this.roomId,friend.id);this.feedback=result.online?'邀请已发送':'仙友暂不在线，可通过微信分享房间号';}return;}
    if(id.startsWith('removeFriend:')){const friend=this.friends.find(f=>f.id===id.slice(13));if(friend)this.pending={label:'删除仙友 '+friend.nickname+'？',action:()=>this.api.removeFriend(friend.id)};return;}
    if(id==='quickToggle'){this.quickExpanded=!this.quickExpanded;return;}
    if(id.startsWith('quick:')){const text=this.model().rows.find(r=>r.id===id)?.text;if(text)this.chatDraft=text;return;}
    if(id==='chat:input'){const text=await input('写下你要说的话',this.page==='direct'?500:200);if(text!==undefined)this.chatDraft=text;return;}
    if(id==='chat:send'&&this.selectedFriend){if(!this.chatDraft.trim())return;await this.api.sendDirect(this.selectedFriend.id,this.chatDraft.trim());this.chatDraft='';this.direct=(await this.api.directChat(this.selectedFriend.id)).messages;return;}
    if(id==='chat:sendroom'&&this.chatRoomId){if(!this.chatDraft.trim())return;await this.api.roomChat(this.chatRoomId,this.chatDraft.trim());this.chatDraft='';return 'back';}
    if(id==='preset:new'){this.presetEditing=true;this.presetName='';this.presetSettings={...defaultSettings};return;}
    if(id==='preset:cancel'){this.presetEditing=false;return;}
    if(id==='preset:name'){const text=await input('预设名称',24);if(text!==undefined)this.presetName=text;return;}
    if(id.startsWith('preset:count:')){const count=Number(id.slice(13));if(count>=5&&count<=12)this.presetSettings={...this.presetSettings,playerCount:count,anonymousTeamVote:defaultAnonymousTeamVote(count)};return;}
    if(id==='preset:save'){if(!this.presetName.trim())return;await this.api.savePreset(this.presetName.trim(),this.roomSettings??this.presetSettings);this.presetName='';this.presets=(await this.api.presets()).presets;this.feedback='预设已保存';this.presetEditing=false;return;}
    if(id.startsWith('preset:')){this.presetSettings=toggleSetting(this.presetSettings,id.slice(7) as keyof Settings);return;}
    if (id === 'page:favorites') { this.favoritesOnly = true; await this.open('history'); return; }
    if (id === 'page:history') this.favoritesOnly = false;
    if (id === 'back') return 'back';
    if (id === 'confirm:no') { this.pending = undefined; return; }
    if (id === 'confirm:yes' && this.pending) { const action = this.pending.action; this.pending = undefined; await action(); await this.open(this.page === 'direct' ? 'friends' : this.page, { roomId: this.roomId }); return; }
    if (id.startsWith('page:')) { await this.open(id.slice(5) as Page, { roomId: this.roomId }); return; }
    if (id === 'nickname') { const nickname = await input('新昵称', 20); if (nickname) this.user = (await this.api.updateProfile({ nickname, avatar: this.user.avatar ?? 'leaf', avatarUrl: this.user.avatarUrl ?? null, wechatAvatarUrl: this.user.wechatAvatarUrl ?? null })).user; return; }
    if (id === 'avatar') { const next = avatarOrder[(avatarOrder.indexOf(this.user.avatar ?? 'leaf') + 1) % avatarOrder.length]!; this.user = (await this.api.updateProfile({ nickname: this.user.nickname, avatar: next, avatarUrl: null, wechatAvatarUrl: null })).user; return; }
    if (id === 'uploadAvatar') { if (!this.avatarPicker) throw new Error('当前微信版本不支持上传头像'); const avatarUrl = await this.avatarPicker(); this.user = (await this.api.updateProfile({ nickname: this.user.nickname, avatar: this.user.avatar ?? 'leaf', avatarUrl, wechatAvatarUrl: null })).user; return; }
    if (id === 'redeem') { const code = await input('兑换码', 64); if (code) { const result = await this.api.redeem(code); this.user = { ...this.user, isVip: true, vipUntil: result.vipUntil }; this.feedback = `兑换成功，增加 ${result.days} 天 VIP`; } return; }
    if (id === 'favorites') { this.favoritesOnly = !this.favoritesOnly; await this.open('history'); return; }
    if (id === 'more' && this.cursor) { const result = await this.api.history(this.cursor, this.favoritesOnly); this.games.push(...result.games.filter(game => !this.games.some(existing => existing.id === game.id))); this.cursor = result.nextCursor; return; }
    if (id.startsWith('game:')) { await this.openReplay(id.slice(5)); return; }
    if (id === 'favorite' && this.replay) { const value = !this.replay.favorite; await this.api.favorite(this.replay.id, value); this.replay.favorite = value; return; }
    if (id === 'save' && this.roomSettings) { const name = await input('预设名称', 24); if (name) { await this.api.savePreset(name, this.roomSettings); await this.open('presets'); } return; }
    if (id.startsWith('apply:')) { const preset = this.presets.find(item => item.id === id.slice(6)); if (preset && this.canApplyPreset) this.appliedSettings = preset.settings;else if(preset&&!this.roomSettings){this.presetEditing=true;this.presetName=preset.name;this.presetSettings={...preset.settings};this.feedback='正在编辑“'+preset.name+'”，保存后生效。';} return; }
    if (id.startsWith('delete:')) { const preset = this.presets.find(item => item.id === id.slice(7)); if (preset) this.pending = { label: `删除预设 ${preset.name}？`, action: () => this.api.deletePreset(preset.id) }; return; }
    if (id === 'add') { const query = await input('仙友码或昵称', 50); if (query) { await this.api.requestFriend(query); await this.open('friends', { roomId: this.roomId }); } return; }
    if (id.startsWith('friend:')) { this.selectedFriend = this.friends.find(friend => friend.id === id.slice(7)); if (this.selectedFriend) { this.direct = (await this.api.directChat(this.selectedFriend.id)).messages; this.page = 'direct'; this.chatDraft='';this.quickExpanded=false; } return; }
    if (id === 'send' && this.selectedFriend) { const text = await input('私聊消息', 500); if (text) { await this.api.sendDirect(this.selectedFriend.id, text); this.direct = (await this.api.directChat(this.selectedFriend.id)).messages; } return; }
    if (id === 'accept' && this.selectedFriend) { await this.api.acceptFriend(this.selectedFriend.id); await this.open('friends', { roomId: this.roomId }); return; }
    if (id === 'refresh:friends') { await this.open('friends', { roomId: this.roomId }); return; }
    if (id === 'invite' && this.selectedFriend && this.roomId) { const result = await this.api.invite(this.roomId, this.selectedFriend.id); this.feedback = result.online ? '邀请已发送' : '仙友暂不在线，可通过微信分享房间号'; return; }
    if (id === 'remove' && this.selectedFriend) { const friend = this.selectedFriend; this.pending = { label: `删除仙友 ${friend.nickname}？`, action: () => this.api.removeFriend(friend.id) }; return; }
    if (id === 'sendroom' && this.roomId) { const text = await input('房间消息', 200); if (text) await this.api.roomChat(this.roomId, text); }
  }
  takeAppliedSettings() { const settings = this.appliedSettings; this.appliedSettings = undefined; return settings; }
}

// A newly opened sheet owns a new scroll surface, independent of the list below it.
export function playerPanelScroll(before:ScreenModel,after:ScreenModel,scroll:number):number {
  return before.title!==after.title||Boolean(before.web?.document?.modal)!==Boolean(after.web?.document?.modal)||before.web?.backId!==after.web?.backId?0:scroll;
}
