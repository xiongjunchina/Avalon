import {ServerClock} from './net/server-clock.js';
import {abortConfirmation} from './screens/abort-confirm.js';
import {RoomBubbles} from './screens/room-bubbles.js';
import {configureDocumentMetrics,setBackdropCanvasFactory} from './ui/web-render.js';
import {invitationUrl} from './net/urls.js';
import {RolePreferenceDraft} from './screens/role-preferences.js';
import type {Role} from '@avalon/contracts';
import {commandId} from './screens/lobby.js';
import { attachTouchNavigation } from './ui/touch.js';
import { defaultSettings, defaultAnonymousTeamVote, type RoomView, type Settings, type User, type DedicatedRoom } from '@avalon/contracts';
import { WechatPlatform, type WxRuntime } from './platform/wechat.js';
import { MiniGameApi } from './net/api.js';
import { MiniGameRoomConnection } from './net/socket.js';
import { drawShell } from './ui/canvas.js';
import { hideSensitiveView, clampScroll, type HitRegion } from './ui/layout.js';
import { askText, cancelTextInput } from './ui/input.js';
import { hitTest, renderScreen, type ScreenModel } from './ui/widgets.js';
import { entryScreen } from './screens/entry.js';
import { LobbyController, lobbyScreen, readyReminder } from './screens/lobby.js';
import { settingsScreen, toggleSetting, SettingsChoice } from './screens/settings.js';
import { gameAction, gameScreen, handleGameOverlay, syncGameUi, type GameUiState } from './screens/game.js';
import { layoutWebScreen } from './ui/web-layout.js';
import { ALL_GALLERY_ROLES, formatRoleName } from '../../web/src/roles.js';
import { AdminApi } from './screens/admin/auth.js';
import { AdminPanel } from './screens/admin/panel.js';
import { PlayerExtras } from './screens/player-extras.js';
import { PlayerPanel, playerPanelScroll } from './screens/player-panel.js';
import { PracticeSession } from './screens/practice.js';
import { guideScreen } from './screens/guide.js';
import { InviteInbox } from './screens/invites.js';
import { chooseAvatar } from './platform/avatar.js';
import { createArtwork } from './ui/assets.js';
import { describeMiniGameError } from './ui/messages.js';
import { MiniGameSound } from './platform/sound.js';
import { installWebFonts } from './platform/fonts.js';
import { NativeVoice, type VoiceTicket } from './platform/native-voice.js';
import { MINI_GAME_VOICE_ENABLED } from './features.js';
import { KnownAccounts } from './net/known-accounts.js';
import { copyWebEntry, roomVoiceGuidance, webHandoffScreen } from './screens/web-handoff.js';

declare const wx: WxRuntime;
declare const __MINIGAME_API_BASE_URL__: string;

const baseUrl = __MINIGAME_API_BASE_URL__;
const retryWebFonts=installWebFonts(wx,()=>{setTimeout(render,0);});
const platform = new WechatPlatform(wx);
const canvas = drawShell(platform);
setBackdropCanvasFactory(()=>wx.createCanvas() as unknown as HTMLCanvasElement);
const artwork = createArtwork(wx, () => render(), baseUrl);
const api = new MiniGameApi(platform, baseUrl);
const nativeVoice = new NativeVoice(wx, async roomId => api.request<VoiceTicket>(`/rooms/${roomId}/wechat-voice-ticket`, { code: await platform.login() }), () => render(), MINI_GAME_VOICE_ENABLED);
const knownAccounts = new KnownAccounts(platform);
const sound = new MiniGameSound(platform, baseUrl, text => { notice = text; render(); });
const invites = new InviteInbox();
invites.receive(wx.getLaunchOptionsSync?.().query?.invite);
const adminPanel = new AdminPanel(new AdminApi(platform, baseUrl, () => api.session.get()), text => new Promise<void>((resolve, reject) => {
  if (!wx.setClipboardData) { reject(new Error('当前设备不支持复制')); return; }
  wx.setClipboardData({ data: text, success: resolve, fail: reject });
}));
const extras = new PlayerExtras(api);
const viewport = platform.viewport();

let user: User | undefined;
let room: RoomView | undefined;
let lobby: LobbyController | undefined;
let playerPanel: PlayerPanel | undefined;
let practice: PracticeSession | undefined;
let guideRoleId: string | undefined;
let guideSection: 'rules'|'roles'|'config' = 'rules';
let guideArt = false;
let guideGalleryScroll = 0;
let guideChaptersOpen=false;
const overlayScrolls: Record<string,number> = {};
let connection: MiniGameRoomConnection | undefined;
let view: 'entry' | 'lobby' | 'game' | 'settings' | 'admin' | 'player' | 'practice' | 'guide' = 'entry';
let previousView: 'entry' | 'lobby' | 'game' = 'entry';
let status = '';
let connectionStatus = '';
let error = '';
let notice = '';
let announcement = '';
let pendingConfirm: { label: string; execute: () => void; cancelExecute?:()=>void; screen?:ScreenModel; underlay?:ScreenModel } | undefined;
let rows: HitRegion[] = [];
let scroll = 0;
let countdownTimer: ReturnType<typeof setTimeout> | undefined;
let suspended = false;
let busy = false;
let commandBusy = false;
let roleIndex = 0;
let horizontalScroll=0, horizontalContext="", roomChatScrollKey="";
let activeRound:number|undefined;
let setupAccessExpanded=false;
let nickname = '';
let switchCode = '';
let guestHomeVisible=true;let authIntent:'create'|'join'|undefined;
let authMode: 'create' | 'switch' = 'create';
const rolePreferenceDraft=new RolePreferenceDraft();
let waitingMissionsExpanded=false;
let auxiliary: 'preferences' | 'dedicated' | 'roomTools' | 'practiceSeats' | 'sound' | 'switchAccount' | 'join' | 'webHandoff' | undefined;
let joinKey = '';
let dedicatedRooms: DedicatedRoom[] = [];
let creationAccess: {dedicatedRoomId?:string;password?:string|null} = {};
let selectedDedicated: DedicatedRoom | undefined;
let reminderDismissed = '';
let guideReturn: 'entry' | 'lobby' | 'game' | 'practice' | 'settings' = 'entry';
let freeAccess = true;
let setupIntent: 'room' | 'practice' = 'room';
let editableSettings: Settings = { ...defaultSettings, captainMode: 'random_order', anonymousTeamVote: true, earlyAssassinationEnabled: true };
const serverClock=new ServerClock();
const gameUi: GameUiState = { privateRoleVisible: false, ballotVisible: false, selectedIds: [], direction: 'clockwise' };

function feedback(result: ScreenModel): ScreenModel {
  result = { ...result, rows: [...result.rows], scroll };
  if (error) result.rows.unshift({ id: 'error', text: error });
  if (busy) result.rows.unshift({ id: 'status', text: status || '正在处理，请稍候…' });
  if (notice) result.rows.unshift({ id: 'notice', text: notice });
  if (announcement) result.rows.unshift({ id: 'announcement', text: announcement });
  if (invites.code) result.rows.unshift({ id: 'invitation', text: invites.label()! });
  return result;
}

const settingsChoice = new SettingsChoice();
const roomBubbles = new RoomBubbles();
function model(): ScreenModel {
  if(pendingConfirm?.screen)return feedback(pendingConfirm.screen);
  if (pendingConfirm) return feedback({ title: '确认操作',
    rows: [{ id: 'notice', text: pendingConfirm.label }, { id: 'confirm:yes', text: '确认执行' }, { id: 'confirm:no', text: '取消' }], web: { page: 'sheet', background:'sword',backId:'confirm:no',document:{kind:'confirm',modal:true},underlay:pendingConfirm.underlay } });
  let result: ScreenModel;
  if (view === 'lobby' && room && user && !auxiliary && reminderDismissed !== room.id && readyReminder(room, user.id)) return feedback({
    title: '大家都在等你', rows: [{ id: 'guide:ready', text: '其他玩家均已准备，只差你一位。' }, { id: 'ready', text: '我已准备' }, { id: 'readyLater', text: '稍后准备' }],
    web: { page: 'sheet', sheet: 'ready', background: 'pavilion', backId: 'readyLater',document:{kind:'tools',modal:true},underlay:lobbyScreen(room,user) },
  });
  if(auxiliary==='preferences'&&room)return feedback(rolePreferenceDraft.model(room));
  if (auxiliary === 'join') return feedback({ title: '加入朋友的房间', rows: [
    { id: 'input:join', text: joinKey || '输入房间号或邀请链接' },
    { id: 'guide:join', text: '请向朋友索取房间号或邀请链接。每次打开此页均为空，不会填入历史邀请。' },
    { id: 'joinSubmit', text: '入座取经' },
  ], web: { page: 'sheet', background: 'gate', backId: 'auxiliaryClose',document:{kind:'tools',modal:true},underlay:entryScreen(user) } });
  if(auxiliary==='dedicated')return feedback({title:'选择开桌方式',rows:[{id:'dedicated:normal',text:'普通房 · 随机房号'},...dedicatedRooms.map(r=>({id:'dedicated:'+r.id,text:r.code+' · '+r.name+(r.activeRoomId?'（已开桌）':''),disabled:!!r.activeRoomId}))],web:{page:'sheet',background:'library',backId:'auxiliaryClose',document:{kind:'tools',modal:true}}});
  if (auxiliary === 'switchAccount') return feedback({ ...entryScreen(undefined,undefined,true), web: {...entryScreen(undefined,undefined,true).web!, authMode, nickname, switchCode, knownAccounts: knownAccounts.list(), backId: 'auxiliaryClose' } });
  if (auxiliary === 'webHandoff' && room && user) return feedback(webHandoffScreen(room, user));
  if (auxiliary === 'sound') return feedback({ title: '声音设置', rows: [
    { id: 'sound:music', text: '背景音乐：' + (sound.preferences.music ? '开' : '关') },
    { id: 'sound:effects', text: '游戏音效：' + (sound.preferences.effects ? '开' : '关') },
    ...nativeVoice.rows(),
    ...(room && user ? [{ id: 'guide:web-voice', text: roomVoiceGuidance(room) }, { id: 'web:open', text: '转到网页版' }] : []),
  ], web: { page: 'sheet', background: 'library', backId: 'auxiliaryClose',document:{kind:'sound',modal:true,soundPreferences:sound.preferences},underlay:view==='practice'&&practice?gameScreen(practice.view(),practice.user,{privateRoleVisible:false,ballotVisible:false}):room&&user?(room.game?gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false}):lobbyScreen(room,user)):entryScreen(user,'',false) } });
  if (auxiliary === 'practiceSeats' && practice) return feedback({ title: '选择演练视角', rows: practice.perspectives().map(player => ({ id: 'practiceSeat:' + player.id, text: `${player.seat}号 · ${player.nickname} · ${formatRoleName(player.role)}` })), web: { page: 'sheet', background: 'sword', backId: 'auxiliaryClose',document:{kind:'tools',modal:true},underlay:gameScreen(practice.view(),practice.user,{privateRoleVisible:false,ballotVisible:false}) } });
  if (auxiliary === 'roomTools' && room && user) return feedback({ ...lobbyScreen(room, user), title: '房间工具', web: { page: 'sheet', backId: 'auxiliaryClose', background: 'pavilion',document:{kind:'tools',modal:true},underlay:lobbyScreen(room,user) } });
  if (view === 'admin') result = adminPanel.model();
  else if (view === 'guide') result = guideScreen(guideRoleId,guideSection,guideArt,guideChaptersOpen,guideGalleryScroll);
  else if (view === 'player' && playerPanel) {result = playerPanel.model();if(result.web?.document?.modal&&!result.web.underlay&&room&&user)result.web.underlay=room.game?gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false}):lobbyScreen(room,user);}
  else if (view === 'practice' && practice) {
    const local = practice.view();
    result = gameScreen(local, practice.user, gameUi);
    result.rows = result.rows.filter(row => row.id !== 'chat');
    result.rows.push({ id: 'bot', text: '电脑代操下一步' }, { id: 'rematch', text: '重新演练' }, { id: 'exitPractice', text: '退出练习' });
    if (result.web) result.web.practice = true;
  }
  else if (view === 'settings') {
    result = settingsScreen(editableSettings);
    result.web = {page:'setup',setupAccessExpanded,settings:editableSettings,background:'library',backId:'cancelSettings',document:{kind:'settings',settings:editableSettings,activeTab:!room||setupIntent==='practice'?'setup':'room',modal:!!room&&setupIntent==='room'},underlay:room&&user?lobbyScreen(room,user):undefined};
    if (!room && setupIntent==='room')result.rows.unshift({id:'chooseDedicated',text:selectedDedicated?selectedDedicated.code+' · '+selectedDedicated.name:'普通房 · 选择专属房'},{id:'creationPassword',text:creationAccess.password===null?'入房密码：不设置':typeof creationAccess.password==='string'?'入房密码：已设置':selectedDedicated?'入房密码：沿用已保存设置':'入房密码：不设置'});
    if (!room || setupIntent === 'practice') result.rows = result.rows.filter(row => row.id !== 'apply').concat([...(setupIntent === 'room' ? [{ id: 'createRoom', text: '敕令开坛 · 创建房间' }] : []), { id: 'startPractice', text: '幻化分身试玩此板子' }]);
  }
  else if (room?.game && view === 'game' && user) result = gameScreen(room, user, gameUi,serverClock.now());
  else if (room && user && view === 'lobby') result = lobbyScreen(room, user, connectionStatus);
  else {result = entryScreen(user, error,!guestHomeVisible);if(!user&&guestHomeVisible)result.web={page:'home',guestHome:true};}
  if (result.web?.page === 'home') Object.assign(result.web, { roleIndex, nickname, switchCode, authMode, authIntent, freeAccess, friendRequests:playerPanel?.incomingFriendRequests??0, knownAccounts: knownAccounts.list() });
  result.web ??= { page: 'sheet', background: view === 'player' ? 'dawn' : 'library' };
  if(result.web.document)result.web.document.settingChoice=settingsChoice.current;
  result.web.friendRequests=playerPanel?.incomingFriendRequests??0;
  if(view==='game'||view==='lobby')result.web.chatBubbles=roomBubbles.snapshot();
  result.web.freeAccess=freeAccess;
  result.web.waitingMissionsExpanded=waitingMissionsExpanded;
  result = feedback(result);
  const privateSelf = gameUi.privateRoleVisible
    ? view === 'game' ? room?.game?.self : view === 'practice' ? practice?.view().game?.self : undefined
    : undefined;
  const portraitRole = privateSelf?.loyalGuardian ? `${privateSelf.loyalGuardian}-loyal`
    : privateSelf?.femaleDemon ? `minion-${privateSelf.femaleDemon}` : privateSelf?.role;
  const nextHorizontalContext=[view,auxiliary,result.web?.document?.kind,result.web?.document?.activeTab,result.web?.document?.replay?.id].join('|');
  if(nextHorizontalContext!==horizontalContext){horizontalContext=nextHorizontalContext;horizontalScroll=0;activeRound=undefined;}
  const chatDoc=result.web?.document,chatKey=chatDoc?.kind==='chat'&&chatDoc.activeTab!=='direct'?nextHorizontalContext+'|'+(chatDoc.messages?.at(-1)?.id??'empty'):'';
  if(chatKey!==roomChatScrollKey){roomChatScrollKey=chatKey;if(chatKey)scroll=Number.MAX_SAFE_INTEGER;}
  return { ...result, scroll, horizontalScroll, activeRound, scene: view === 'entry' ? 'entry' : view === 'game' || view === 'practice' || view === 'lobby' ? 'game' : view === 'admin' ? 'admin' : 'standard',
    ...(portraitRole ? { portrait: `${portraitRole}-160.webp` } : view === 'guide' && guideRoleId ? { portrait: `${guideRoleId}-160.webp` } : {}) };
}
function render() {
  retryWebFonts();
  clearTimeout(countdownTimer);
  sound.update(view === 'practice' ? practice?.view().game : view === 'game' ? room?.game : undefined, !suspended && (view === 'practice' || view === 'game' && connectionStatus === '已连接'));
  configureDocumentMetrics(canvas);
  const current = model();
  const layout = current.web ? layoutWebScreen(current, viewport) : undefined;
  scroll = layout ? Math.max(0, Math.min(scroll, layout.maxScroll)) : clampScroll(current.rows, viewport, scroll, current.scene);
  rows = renderScreen({ ...current, scroll }, canvas, viewport, artwork, layout);
  // Static duel artwork needs no idle animation timer.
  if (!suspended && view === 'game' && ['dealing','guanyin_window'].includes(room?.game?.phase??'')) countdownTimer = setTimeout(render, 1_000);
}
function refreshHomeFriends(){const panel=playerPanel;if(panel)void panel.refreshFriends().then(()=>{if(playerPanel===panel)render();}).catch(()=>{});}
function navigate(next: typeof view) { settingsChoice.close();view = next;if(next==='entry')refreshHomeFriends(); auxiliary = undefined; scroll = 0; error = ''; notice = ''; pendingConfirm = undefined; render(); }

function connect(next: RoomView) {
  roomBubbles.sync(next.id);
  connection?.stop();
  nativeVoice.syncRoom(next.id, next.settings.playerCount);
  room = next;serverClock.accept(next.serverTime);
  playerPanel?.setChatRoom(next.id,next.code);
  syncGameUi(gameUi, next, !suspended, user?.id);
  lobby?.setRoom(next);
  connection = new MiniGameRoomConnection({ api, platform, roomId: next.id, baseUrl, handlers: {
    snapshot: snapshot => {
      const changedGame = snapshot.game?.id !== room?.game?.id;
      nativeVoice.syncRoom(snapshot.id, snapshot.settings.playerCount);
      room = snapshot;serverClock.accept(snapshot.serverTime);
      sound.update(snapshot.game, connectionStatus === '已连接');
      lobby?.setRoom(snapshot);
      if (changedGame) hideSensitiveView(gameUi);
      syncGameUi(gameUi, snapshot, !suspended, user?.id);
      if (suspended) hideSensitiveView(gameUi);
      if (view === 'entry' || view === 'lobby' || view === 'game') {
        if (snapshot.game && snapshot.phase !== 'waiting') view = 'game';
        else view = 'lobby';
      }
      render();
    },
    status: value => { if (value !== '已连接') void nativeVoice.leave(); connectionStatus = value; if (value !== '已连接') hideSensitiveView(gameUi); render(); },
    busy: value => { commandBusy = value; render(); },
    error: value => { error = describeMiniGameError(new Error(value)); render(); },
    message: message => {
      if(message.type==='playerCodeChanged'&&user){user={...user,playerCode:message.playerCode};knownAccounts.remember(user);if(playerPanel)playerPanel.user=user;notice='管理员已更新你的仙友码';render();}
      if (message.type === 'roomChat') { playerPanel?.onRoomChat(message);roomBubbles.receive(message.fromUserId,message.text);render();setTimeout(()=>{if(!suspended)render();},3800); }
      if (message.type === 'directChat') { playerPanel?.onDirectChat(message); notice = `${message.fromUser.nickname}：${message.text}`; render(); }
      if (message.type === 'roomInvitation') { invites.receive(message.roomCode, message.fromUser.nickname); render(); }
      if (message.type === 'systemAnnouncement') { announcement = message.enabled ? message.text : ''; render(); }
    },
    ended: () => { nativeVoice.syncRoom(undefined, 0); connection = undefined; room = undefined; navigate('entry'); },
  } });
  lobby?.setConnection(connection);
  navigate(next.game ? 'game' : 'lobby');
  connection.start();
}

async function joinWithPassword(key:string):Promise<RoomView>{
  try{return await lobby!.join(key);}catch(cause){if(!(cause instanceof Error)||!['ROOM_PASSWORD_REQUIRED','ROOM_PASSWORD_INVALID'].includes(cause.message))throw cause;status='请输入房间密码';render();const password=await askText(wx,'',64);if(password===undefined)throw Error('已取消入房');return lobby!.join(key,password);}
}

async function run(action: () => Promise<void>) {
  if (busy) return;
  busy = true;
  error = '';
  status = '请稍候…';
  render();
  try { await action(); }
  catch (cause) { error = describeMiniGameError(cause); }
  finally { busy = false; status = ''; render(); }
}

async function select(id: string) {
  if(id==='noop')return;
  if (busy || commandBusy) return;
  if (id === 'web:open' && room && user) { auxiliary = 'webHandoff'; scroll = 0; render(); return; }
  if ((id === 'web:copyPersonal' || id === 'web:copyInvite') && room && user) return run(async () => {
    await copyWebEntry(id === 'web:copyPersonal' ? 'personal' : 'invite', api, wx, baseUrl, room!);
    notice = id === 'web:copyPersonal' ? '本人接续链接已复制，5分钟内在系统浏览器打开；请勿群发。' : '房间邀请链接已复制，可发给朋友。';
  });
  if(id==='settingChoice:close'){settingsChoice.close();render();return;}
  if(id.startsWith('settingChoice:value:')){const selected=settingsChoice.choose(id.slice(20));if(!selected){render();return;}id=selected;}
  else {const settings=model().web?.document?.settings;if(settings&&settingsChoice.open(id,settings)){render();return;}settingsChoice.close();}
  if(id==='rolePreferences'&&room){rolePreferenceDraft.open(room);auxiliary='preferences';scroll=0;render();return;}
  if(auxiliary==='preferences'&&room){
    if(id.startsWith('pref:'))return run(async()=>{rolePreferenceDraft.toggle(id.slice(5) as Role,room!);});
    if(id==='prefClear'){rolePreferenceDraft.selected=[];render();return;}
    if(id==='prefSave')return run(async()=>{if(!connection||room!.phase!=='waiting'||!room!.settings.rolePreferenceEnabled)throw Error('当前无法保存心仪志愿');rolePreferenceDraft.sync(room!);await connection.sendConfirmed({type:'setRolePreferences',payload:{preferences:rolePreferenceDraft.selected},commandId:commandId(),expectedVersion:room!.version});auxiliary=undefined;notice='心仪志愿已保存';});
  }
  if (id === 'readyLater') { reminderDismissed = room?.id ?? ''; render(); return; }
  if (id === 'leave' && view === 'game' && ['finished', 'aborted'].includes(room?.game?.phase ?? '')) { lobby?.leave(); return; }
  if (id === 'leave' && view === 'game') id = room?.hostId === user?.id ? 'endGame' : 'requestAbort';
  if (id === 'admin') return run(async () => { const key = await askText(wx, '', 256); if (!key) return; await adminPanel.open(key); navigate('admin'); });
  if(id==='openReplay'&&room?.game&&playerPanel)return run(async()=>{previousView='game';await playerPanel!.openReplay(room!.game!.id,'back');navigate('player');});
  if(id==='switch'&&view==='player'){authMode='switch';switchCode='';navigate('entry');auxiliary='switchAccount';render();return;}
  if(id==='roomPassword'&&room&&room.hostId===user?.id&&room.phase==='waiting')return run(async()=>{status='输入新密码（4–8位字符），留空则关闭密码';render();const password=await askText(wx,'',8);if(password===undefined)return;if(password&&(password.length<4||password.length>8))throw Error('密码需为4–8位字符');const r=await api.request<{room:RoomView}>(`/rooms/${room!.id}/password`,{password:password||null,expectedVersion:room!.version});room=r.room;lobby?.setRoom(room);notice='密码已更新，旧邀请链接已失效，请重新分享';});
  if(id==='chooseDedicated')return run(async()=>{dedicatedRooms=(await api.request<{rooms:DedicatedRoom[]}>('/me/dedicated-rooms')).rooms;auxiliary='dedicated';scroll=0;});
  if(id.startsWith('dedicated:')){const selected=dedicatedRooms.find(r=>r.id===id.slice(10));if(selected?.activeRoomId)return;selectedDedicated=selected;creationAccess=selected?{dedicatedRoomId:selected.id}:{};if(selected)editableSettings={...selected.settings};auxiliary=undefined;render();return;}
  if(id==='creationPassword')return run(async()=>{status='输入入房密码（4–8位字符），留空则不设置';render();const password=await askText(wx,'',8);if(password===undefined)return;if(password&&(password.length<4||password.length>8))throw Error('密码需为4–8位字符');creationAccess={...creationAccess,password:password||null};});
  if (id === 'copyCode' && user?.playerCode && wx.setClipboardData) { wx.setClipboardData({ data: user.playerCode, success: () => { notice = '仙友码已复制'; render(); }, fail: () => { error = '复制失败，请重试'; render(); } }); return; }
  sound.activate(); sound.effect('tap'); platform.vibrate('light');
  if(id==='share'&&room){if(wx.shareAppMessage)wx.shareAppMessage({title:`来嘻游 · 真假猴王房间 ${room.code} 一起论剑`,query:`invite=${encodeURIComponent(room.inviteKey??room.code)}`});else{notice=`请告知好友房间号 ${room.code}`;render();}return;}
  if(id==='copyRoomCode'&&room&&wx.setClipboardData){wx.setClipboardData({data:room.code,success:()=>{notice='房间号已复制';render();},fail:()=>{error='复制失败，请重试';render();}});return;}
  if (id === 'copyRoom' && room && wx.setClipboardData) { wx.setClipboardData({ data: invitationUrl(baseUrl,room.inviteKey??room.code), success: () => { notice = '房间邀请链接已复制'; render(); }, fail: () => { error = '复制失败，请重试'; render(); } }); return; }
  if (id === 'mode:voice') { notice = MINI_GAME_VOICE_ENABLED ? '创建或加入房间后，点顶部声音按钮加入微信语音；最多10人，与网页语音独立。' : '当前版本不支持实时语音；网页语音能力保持可用。'; render(); return; }
  if (id.startsWith('voice:')) return run(async () => { if(id==='voice:join') await nativeVoice.join(); else if(id==='voice:leave') await nativeVoice.leave(); else if(id==='voice:microphone') await nativeVoice.toggleMicrophone(); else if(id==='voice:speaker') await nativeVoice.toggleSpeaker(); });
  if(id==='waiting:missions'){waitingMissionsExpanded=!waitingMissionsExpanded;render();return;}
  if (id === 'sound') { auxiliary = 'sound'; scroll = 0; render(); return; }
  if (id.startsWith('sound:')) { const key = id.slice(6) as 'music' | 'effects'; sound.configure(key, !sound.preferences[key]); render(); return; }
  if (id.startsWith('known:')) return run(async () => { await nativeVoice.leave(); const account=knownAccounts.list().find(a=>a.playerCode===id.slice(6));if (!api.session.get()) await api.login(); user = await api.switchAccount(id.slice(6),account?.id); knownAccounts.remember(user); lobby = new LobbyController(api, user); playerPanel = new PlayerPanel(extras, user, () => chooseAvatar(wx));refreshHomeFriends(); const existing = await lobby.resume(); if (existing) connect(existing); else navigate('entry'); });
  if (id === 'notice' || id === 'error') { notice = ''; error = ''; render(); return; }
  if (id === 'announcement') { announcement = ''; render(); return; }
  if (id === 'auxiliaryClose') { auxiliary = undefined; scroll = 0; render(); return; }
  if (id === 'input:join') return run(async () => { const value = await askText(wx, joinKey, 200); if (value !== undefined) joinKey = value; });
  if (id === 'joinSubmit' && lobby) return run(async () => { const encoded = /(?:\?|&)invite=([^&#]+)/.exec(joinKey)?.[1]; const key = encoded ? decodeURIComponent(encoded) : joinKey.trim(); if (!key) throw new Error('请输入房间号或邀请链接'); connect(await joinWithPassword(key)); });
  if (id === 'practiceSeats' && practice) { auxiliary = 'practiceSeats'; scroll = 0; render(); return; }
  if (id.startsWith('practiceSeat:') && practice) { practice.switchSeat(id.slice(13)); hideSensitiveView(gameUi); gameUi.snapshotKey = undefined; syncGameUi(gameUi, practice.view(), false, practice.user.id); auxiliary = undefined; scroll = 0; render(); return; }
  if ((view === 'game' || view === 'practice' || view === 'lobby' || view === 'settings') && id === 'guide') { guideReturn = view; navigate('guide'); return; }
  if(id.startsWith('round-jump:')&&['replay','history'].includes(model().web?.document?.kind??'')){const l=layoutWebScreen({...model(),scroll:0},viewport),n=l.nodes.find(n=>n.id==='round:'+id.slice(11));if(n){activeRound=Number(id.slice(11));scroll=Math.min(l.maxScroll,Math.max(0,n.y-l.contentTop-(model().web?.document?.kind==='replay'&&!model().web?.document?.adminReplay?136:62)));}render();return;}
  const activeRoom = view === 'practice' ? practice?.view() : view === 'game' ? room : undefined;
  const priorOverlay=gameUi.overlay;
  if (activeRoom && handleGameOverlay(gameUi, activeRoom, id)) { overlayScrolls[priorOverlay??'table']=scroll;scroll=priorOverlay===gameUi.overlay?scroll:overlayScrolls[gameUi.overlay??'table']??0;render();return; }
  if (id === 'back' && (view === 'practice' || view === 'game')) { gameUi.overlay = undefined; hideSensitiveView(gameUi); render(); return; }
  if (pendingConfirm) {
    const pending = pendingConfirm;
    pendingConfirm = undefined;
    if (id === 'confirm:yes') pending.execute();
    else if(id==='confirm:no')pending.cancelExecute?.();
    render(); return;
  }
  if (id === 'invitation') {
    if (room) { error = room.game && !['finished', 'aborted'].includes(room.game.phase) ? '当前牌局结束后再加入邀请' : '请先离开当前房间'; render(); return; }
    if (!lobby) { guestHomeVisible=false;authMode='create';authIntent='join';render();return; }
    return run(async () => { const code = invites.code; if (code) { connect(await joinWithPassword(code)); invites.take(); } });
  }
  if (view === 'practice' && practice) {
    if (id === 'exitPractice') { practice = undefined; navigate(room ? room.game ? 'game' : 'lobby' : 'entry'); return; }
    if (id === 'practiceSettings') { setupIntent = 'practice'; navigate('settings'); return; }
    if (id === 'bot') { practice.stepBot(true); syncGameUi(gameUi, practice.view(), true, practice.user.id); render(); return; }
    if (id === 'role') { gameUi.privateRoleVisible = !gameUi.privateRoleVisible; render(); return; }
    if (id === 'direction') { gameUi.direction = gameUi.direction === 'clockwise' ? 'counterclockwise' : 'clockwise'; const draft = gameAction(practice.view(), practice.user, 'draft', gameUi); if (draft) practice.act(draft); render(); return; }
    if (id.startsWith('player:')) {
      const targetId = id.slice(7);
      if (['proposing', 'discussion'].includes(practice.view().game?.phase ?? '') && gameUi.overlay !== 'treasures') {
        const selected = gameUi.selectedIds ?? [];
        const limit = practice.view().game!.missionSizes[practice.view().game!.mission - 1]!;
        gameUi.selectedIds = selected.includes(targetId) ? selected.filter(value => value !== targetId) : selected.length < limit ? [...selected, targetId] : selected;
        const draft = gameAction(practice.view(), practice.user, 'draft', gameUi);
        if (draft) practice.act(draft);
      } else gameUi.targetId = targetId;
      render(); return;
    }
    if (id === 'rematch') { practice = new PracticeSession(practice.settings, user?.nickname ?? '我', practice); syncGameUi(gameUi, practice.view()); render(); return; }
    const command = gameAction(practice.view(), practice.user, id, gameUi);
    if (command) { try { practice.act(command); if (command.type === 'useTreasure') gameUi.targetId = undefined; syncGameUi(gameUi, practice.view()); } catch (cause) { error = cause instanceof Error ? cause.message : '练习操作失败'; } render(); }
    else if (['treasure:heartProtect','treasure:heartSabotage','treasure:guanyinSkip','treasure:tinStaff', 'treasure:guanyinMirror', 'treasure:humanBag', 'treasure:jinguSeal', 'treasure:bananaFan'].includes(id)) { error = '当前法宝不可用，或所选目标不符合条件'; render(); }
    return;
  }
  if (view === 'player' && playerPanel) return run(async () => {
    const before = playerPanel!.model();
    const outcome = await playerPanel!.handle(id, async (label, maxLength) => { status = label; render(); return askText(wx, '', maxLength ?? 200); });
    scroll = playerPanelScroll(before,playerPanel!.model(),scroll);
    user = playerPanel!.user;
    const applied = playerPanel!.takeAppliedSettings();
    if (applied && room?.hostId === user.id) lobby?.updateSettings(applied);
    if (outcome === 'back') navigate(previousView);
    else if(outcome&&typeof outcome==='object')connect(await joinWithPassword(outcome.joinCode));
  });
  if (view === 'admin') return run(async () => {
    try {
      const title = adminPanel.model().title;
      const outcome = await adminPanel.handle(id, async (label, maxLength) => { status = label; render(); return askText(wx, adminPanel.inputValue(id), maxLength ?? 200); });
      if (title !== adminPanel.model().title) scroll = 0;
      if (outcome === 'back') { adminPanel.onHide(); navigate('entry'); }
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'ADMIN_UNAUTHORIZED') { adminPanel.onHide(); navigate('entry'); }
      throw cause;
    }
  });
  if (view === 'guide') {
    if (id === 'back') { guideRoleId=undefined;guideArt=false;guideChaptersOpen=false;navigate(guideReturn); }
    else if(id==='guide:chapters'){guideChaptersOpen=!guideChaptersOpen;render();}
    else if(id==='guide:directory'||id.startsWith('guide-jump:')){guideChaptersOpen=false;const target=id==='guide:directory'?'guide-directory':id.slice('guide-jump:'.length);const layout=layoutWebScreen({...model(),scroll:0},viewport),node=layout.nodes.find(n=>n.id===target);if(node)scroll=Math.max(0,node.y-viewport.top-76);render();}
    else if (id==='guideArt'){guideGalleryScroll=scroll;guideArt=true;scroll=0;render();}
    else if(id==='guideArtClose'){guideArt=false;guideRoleId=undefined;scroll=guideGalleryScroll;render();}
    else if(id==='guide:rules'||id==='guide:config'){guideChaptersOpen=false;guideSection=id==='guide:rules'?'rules':'config';guideRoleId=undefined;scroll=0;render();}
    else if (id === 'guide:roles') { guideChaptersOpen=false;guideRoleId=undefined;guideArt=false;guideSection='roles';scroll=0;render(); }
    else if (id.startsWith('guide-role:')) { guideGalleryScroll=scroll;guideRoleId = id.slice('guide-role:'.length);guideArt=true;scroll = 0; render(); }
    else if(id==='guideArtPrev'||id==='guideArtNext'){const i=ALL_GALLERY_ROLES.findIndex(r=>r.id===guideRoleId);guideRoleId=ALL_GALLERY_ROLES[(i+(id==='guideArtNext'?1:-1)+ALL_GALLERY_ROLES.length)%ALL_GALLERY_ROLES.length]!.id;scroll=0;render();}
    return;
  }
  if (view === 'entry') {
    if(id==='authClose'){guestHomeVisible=true;authIntent=undefined;render();return;}
    if(!lobby&&['create','join','loginOpen'].includes(id)){authMode='create';guestHomeVisible=false;authIntent=id==='create'?'create':id==='join'?'join':undefined;render();return;}
    if (id === 'guide') { guideReturn = 'entry'; navigate('guide'); return; }
    if (id.startsWith('auth:')) { authMode = id === 'auth:switch' ? 'switch' : 'create'; render(); return; }
    if (id === 'input:nickname' || id === 'input:switch') return run(async () => { const text = await askText(wx, id === 'input:nickname' ? nickname : switchCode, id === 'input:nickname' ? 20 : 6); if (text !== undefined) { if (id === 'input:nickname') nickname = text; else switchCode = text.replace(/\D/g, '').slice(0, 6); } });
    if (id === 'practice') { practice = new PracticeSession(editableSettings, user?.nickname ?? '我'); syncGameUi(gameUi, practice.view()); navigate('practice'); return; }
    if (id === 'login') return run(async () => { await nativeVoice.leave(); if (authMode === 'switch' && !/^\d{6}$/.test(switchCode)) throw new Error('INVALID_PLAYER_CODE'); const result = await api.login(nickname || undefined); user = authMode === 'switch' ? await api.switchAccount(switchCode) : result.user; knownAccounts.remember(user); auxiliary = undefined; lobby = new LobbyController(api, user); playerPanel = new PlayerPanel(extras, user, () => chooseAvatar(wx));refreshHomeFriends(); const existing = await lobby.resume(); if (existing) connect(existing); else if (invites.code) { connect(await joinWithPassword(invites.code)); invites.take(); } else if(authIntent==='create'){authIntent=undefined;creationAccess={};selectedDedicated=undefined;setupIntent='room';navigate('settings');}else if(authIntent==='join'){authIntent=undefined;joinKey='';auxiliary='join';render();}else render(); });
    if (id === 'create' && lobby) { creationAccess={};selectedDedicated=undefined;setupIntent = 'room'; navigate('settings'); return; }
    if (id === 'join' && lobby) { joinKey = ''; auxiliary = 'join'; scroll = 0; render(); return; }
    if (id === 'switch') { authMode = 'switch'; switchCode = ''; auxiliary = 'switchAccount'; scroll = 0; render(); return; }
    if (id === 'logout') return run(async () => { nativeVoice.syncRoom(undefined,0); await nativeVoice.leave(); connection?.stop(); connection = undefined; room = undefined; user = undefined; lobby = undefined; playerPanel = undefined; await api.logout(); render(); });
    if (id === 'admin') return run(async () => { const key = await askText(wx, '', 256); if (!key) return; await adminPanel.open(key); navigate('admin'); });
    if ((id === 'account' || id === 'friends') && playerPanel) return run(async () => { previousView = 'entry'; await playerPanel!.open(id); navigate('player'); });
  }
  if (view === 'settings') {
    if (id === 'setup:offline' || id === 'setup:web') { editableSettings = { ...editableSettings, voiceChatEnabled: id === 'setup:web' }; render(); return; }
    if(id==='setupAccessToggle'){setupAccessExpanded=!setupAccessExpanded;render();return;}
    if (id.startsWith('setupRole:')) { guideReturn='settings'; guideRoleId=id.slice(10); guideSection='roles'; guideArt=false; navigate('guide'); return; }
    if (id === 'cancelSettings') { navigate(setupIntent === 'practice' && practice ? 'practice' : room ? 'lobby' : 'entry'); return; }
    if (id.startsWith('count:')) { const count = Number(id.slice(6)); if (count >= 5 && count <= 12) editableSettings = { ...editableSettings, playerCount: count, anonymousTeamVote: defaultAnonymousTeamVote(count) }; render(); return; }
    if (id === 'createRoom' && lobby) return run(async () => { connect(await lobby!.create(editableSettings,creationAccess)); });
    if (id === 'startPractice') { practice = new PracticeSession(editableSettings, user?.nickname ?? '我'); syncGameUi(gameUi, practice.view(), true, practice.user.id); navigate('practice'); return; }
    if (id === 'apply') { if (room && lobby) lobby.updateSettings(editableSettings); navigate(room?.game ? 'game' : room ? 'lobby' : 'entry'); return; }
    editableSettings = toggleSetting(editableSettings, id as keyof Settings);
    render(); return;
  }
  if (view === 'lobby' && room && lobby) {
    if (id === 'practice') { practice = new PracticeSession(room.settings, user?.nickname ?? '我'); syncGameUi(gameUi, practice.view(), true, practice.user.id); navigate('practice'); return; }
    if (id === 'more') { auxiliary = 'roomTools'; scroll = 0; render(); return; }
    if (id==='waiting:lady'||id==='waiting:early') { if(room.hostId===user?.id) lobby.updateSettings({...room.settings,...(id==='waiting:lady'?{ladyEnabled:!room.settings.ladyEnabled}:{earlyAssassinationEnabled:!room.settings.earlyAssassinationEnabled})}); return; }
    if (id === 'ready') lobby.ready(!room.members.find(member => member.id === user?.id)?.ready);
    else if (id === 'start') lobby.start();
    else if (id === 'admission') lobby.admission(!room.acceptingNewMembers);
    else if (id === 'settings') { setupIntent = 'room'; editableSettings = { ...room.settings }; navigate('settings'); }
    else if (id === 'leave') lobby.leave();
    else if (id === 'share') { if (wx.shareAppMessage) wx.shareAppMessage({ title: `来嘻游 · 真假猴王房间 ${room.code} 一起论剑`, query: `invite=${encodeURIComponent(room.inviteKey??room.code)}` }); else { error = `请告知好友房间号 ${room.code}`; render(); } }
    else if (id === 'friends' && playerPanel) return run(async () => { previousView = 'lobby'; await playerPanel!.open('friends', { roomId: room!.id,roomMemberIds:room!.members.map(m=>m.id) }); navigate('player'); });
    else if (id === 'presets' && playerPanel && room.hostId === user?.id) return run(async () => { previousView = 'lobby'; await playerPanel!.open('presets', { roomId: room!.id, settings: room!.settings, canApplyPreset: true }); navigate('player'); });
    else if (id.startsWith('member:') && room.hostId === user?.id && id.slice(7) !== user.id) {
      const targetId = id.slice(7), member = room.members.find(item => item.id === targetId);
      if (member) { pendingConfirm = { underlay:model(),label: `移除 ${member.nickname}？`, execute: () => { if (room?.hostId === user?.id) lobby?.kick(targetId); } }; render(); }
    }
    else if (id === 'chat' && playerPanel) return run(async () => { previousView = 'lobby'; await playerPanel!.open('roomchat', { roomId: room!.id }); navigate('player'); });
    return;
  }
  if (view === 'game' && room && user) {
    if (id === 'chat' && playerPanel) return run(async () => { previousView = 'game'; await playerPanel!.open('roomchat', { roomId: room!.id }); navigate('player'); });
    if (id === 'role') { gameUi.privateRoleVisible = !gameUi.privateRoleVisible; render(); return; }
    if (id === 'direction') { gameUi.direction = gameUi.direction === 'clockwise' ? 'counterclockwise' : 'clockwise'; const draft = gameAction(room, user, 'draft', gameUi); if (draft) connection?.send(draft); render(); return; }
    if (id.startsWith('player:')) {
      const targetId = id.slice(7);
      if (['proposing', 'discussion'].includes(room.game?.phase ?? '') && room.game?.captainId === user.id && gameUi.overlay !== 'treasures') {
        const selected = gameUi.selectedIds ?? [];
        const limit = room.game!.missionSizes[room.game!.mission - 1]!;
        gameUi.selectedIds = selected.includes(targetId) ? selected.filter(value => value !== targetId) : selected.length < limit ? [...selected, targetId] : selected;
        const draft = gameAction(room, user, 'draft', gameUi);
        if (draft) connection?.send(draft);
      } else gameUi.targetId = targetId;
      render(); return;
    }
    const command = gameAction(room, user, id, gameUi);
    if (!command && ['treasure:heartProtect','treasure:heartSabotage','treasure:guanyinSkip','treasure:tinStaff', 'treasure:guanyinMirror', 'treasure:humanBag', 'treasure:jinguSeal', 'treasure:bananaFan'].includes(id)) {
      error = '当前法宝不可用，或所选目标不符合条件'; render(); return;
    }
    if (command && (['endGame','requestAbort','assassinate'].includes(command.type) || command.type==='voteAbort'&&command.payload.approve || id === 'earlyAttempt')) {
      const abort=['endGame','requestAbort','voteAbort'].includes(command.type);
      pendingConfirm = { screen:abort?abortConfirmation(room,user,model()):undefined,cancelExecute:abort&&room.game?.abortPoll?()=>{if(room&&user){const decline=gameAction(room,user,'rejectAbort',gameUi);if(decline)connection?.send(decline);}}:undefined,underlay:model(),label: command.type === 'endGame' ? '结束游戏并关闭房间？' : command.type === 'assassinate' ? '确认刺杀所选目标？提交后不可撤回。' : id === 'earlyAttempt' ? '确认启用提前刺杀？刺错将立即判负。' : '确认处理结束申请？',
        execute: () => { if (room && user) { const fresh = gameAction(room, user, id, gameUi); if (fresh && !connection?.send(fresh)) { error = '正在等待上一操作确认'; } } } };
      render(); return;
    }
    if (command && !connection?.send(command)) { error = '正在等待上一操作确认'; render(); }
    else if (command) { platform.vibrate('medium'); if (command.type === 'useTreasure') { gameUi.targetId = undefined; render(); } }
  }
}

let renderFrame: any = 0;
function scheduleRender() {
  const raf = wx.requestAnimationFrame ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : undefined);
  if (!raf) { render(); return; }
  if (renderFrame) return;
  renderFrame = raf(() => {
    renderFrame = 0;
    render();
  });
}

attachTouchNavigation(wx, {
  scrollBy(delta) { scroll = Math.max(0, scroll + delta); scheduleRender(); },
  canScrollHorizontal(x,y){return rows.some(r=>r.scrollMaxX!==undefined&&x>=(r.clipLeft??0)&&x<=(r.clipRight??viewport.width)&&y>=r.y&&y<=r.y+r.height);},
  scrollHorizontal(delta){const max=rows.find(r=>r.scrollMaxX!==undefined)?.scrollMaxX??0;horizontalScroll=Math.max(0,Math.min(max,horizontalScroll+delta));scheduleRender();},
  tap(x,y) { const row=hitTest(rows,x,y); if(row) void select(row.id); },
});
platform.onHide(() => { roomBubbles.clear();settingsChoice.close();void nativeVoice.leave(); suspended = true; sound.foreground(false); cancelTextInput(); hideSensitiveView(gameUi); pendingConfirm = undefined; adminPanel.onHide(); if (view === 'admin') view = 'entry'; render(); });
platform.onShow(options => { suspended = false;retryWebFonts();refreshHomeFriends(); sound.foreground(true); hideSensitiveView(gameUi); invites.receive(options?.query?.invite); connection?.resume(); render(); });
render();
if (typeof wx.request === 'function') void extras.announcement().then(result => {
  announcement = result.announcement.enabled ? result.announcement.text : '';
  freeAccess = result.freeAccessMode;
  render();
}).catch(() => { /* The public notice must not block login or offline practice. */ });
if (api.session.get()) void run(async () => {
  user = await api.refresh();
  knownAccounts.remember(user);
  lobby = new LobbyController(api, user);
  playerPanel = new PlayerPanel(extras, user, () => chooseAvatar(wx));refreshHomeFriends();
  const existing = await lobby.resume();
  if (existing) connect(existing);
  else if (invites.code) { connect(await joinWithPassword(invites.code)); invites.take(); }
});
wx.onShareAppMessage?.(() => ({ title: room ? `来嘻游 · 真假猴王房间 ${room.code} 一起论剑` : '嘻游 · 真假猴王', ...(room ? { query: `invite=${encodeURIComponent(room.inviteKey??room.code)}` } : {}) }));
