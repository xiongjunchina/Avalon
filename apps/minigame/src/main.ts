import { defaultSettings, type RoomView, type Settings, type User } from '@avalon/contracts';
import { WechatPlatform, type WxRuntime } from './platform/wechat.js';
import { MiniGameApi } from './net/api.js';
import { MiniGameRoomConnection } from './net/socket.js';
import { drawShell } from './ui/canvas.js';
import { hideSensitiveView, type HitRegion } from './ui/layout.js';
import { askText } from './ui/input.js';
import { hitTest, renderScreen, type ScreenModel } from './ui/widgets.js';
import { entryScreen } from './screens/entry.js';
import { LobbyController, lobbyScreen } from './screens/lobby.js';
import { settingsScreen, toggleSetting } from './screens/settings.js';
import { gameAction, gameScreen, syncGameUi, type GameUiState } from './screens/game.js';
import { AdminApi } from './screens/admin/auth.js';
import { AdminPanel } from './screens/admin/panel.js';
import { PlayerExtras } from './screens/player-extras.js';
import { PlayerPanel } from './screens/player-panel.js';
import { PracticeSession } from './screens/practice.js';
import { guideScreen } from './screens/guide.js';
import { InviteInbox } from './screens/invites.js';
import { chooseAvatar } from './platform/avatar.js';
import { createArtwork } from './ui/assets.js';

declare const wx: WxRuntime;
declare const __MINIGAME_API_BASE_URL__: string;

const baseUrl = __MINIGAME_API_BASE_URL__;
const platform = new WechatPlatform(wx);
const canvas = drawShell(platform);
const artwork = createArtwork(wx, () => render());
const api = new MiniGameApi(platform, baseUrl);
const invites = new InviteInbox();
invites.receive(wx.getLaunchOptionsSync?.().query?.invite);
const adminPanel = new AdminPanel(new AdminApi(platform, baseUrl, () => api.session.get()), text => new Promise<void>((resolve, reject) => {
  if (!wx.setClipboardData) { reject(new Error('当前设备不支持复制')); return; }
  wx.setClipboardData({ data: text, success: resolve, fail: reject });
}));
const extras = new PlayerExtras(api);
const screen = platform.screen();
const viewport = { width: screen.screenWidth, height: screen.screenHeight, top: screen.safeArea?.top ?? 0, bottom: screen.screenHeight - (screen.safeArea?.bottom ?? screen.screenHeight) };

let user: User | undefined;
let room: RoomView | undefined;
let lobby: LobbyController | undefined;
let playerPanel: PlayerPanel | undefined;
let practice: PracticeSession | undefined;
let guideRoleId: string | undefined;
let connection: MiniGameRoomConnection | undefined;
let view: 'entry' | 'lobby' | 'game' | 'settings' | 'admin' | 'player' | 'practice' | 'guide' = 'entry';
let previousView: 'entry' | 'lobby' | 'game' = 'entry';
let status = '';
let error = '';
let notice = '';
let pendingConfirm: { label: string; execute: () => void } | undefined;
let rows: HitRegion[] = [];
let scroll = 0;
let editableSettings: Settings = { ...defaultSettings };
const gameUi: GameUiState = { privateRoleVisible: false, ballotVisible: false, selectedIds: [], direction: 'clockwise' };

function model(): ScreenModel {
  if (pendingConfirm) return { title: '确认操作', subtitle: pendingConfirm.label,
    rows: [{ id: 'confirm:yes', text: '确认执行' }, { id: 'confirm:no', text: '取消' }] };
  let result: ScreenModel;
  if (view === 'admin') result = adminPanel.model();
  else if (view === 'guide') result = guideScreen(guideRoleId);
  else if (view === 'player' && playerPanel) result = playerPanel.model();
  else if (view === 'practice' && practice) {
    const local = practice.view();
    result = gameScreen(local, practice.user, gameUi);
    result.rows.push({ id: 'bot', text: '让其他仙友继续' }, { id: 'exitPractice', text: '退出练习' });
  }
  else if (view === 'settings') result = settingsScreen(editableSettings);
  else if (room?.game && view === 'game' && user) result = gameScreen(room, user, gameUi);
  else if (room && user && view === 'lobby') result = lobbyScreen(room, user, status);
  else result = entryScreen(user, error);
  if (error && view !== 'entry') result.subtitle = error;
  if (notice) result.rows.unshift({ id: 'notice', text: notice });
  if (invites.code) result.rows.unshift({ id: 'invitation', text: invites.label()! });
  const privateSelf = gameUi.privateRoleVisible
    ? view === 'game' ? room?.game?.self : view === 'practice' ? practice?.view().game?.self : undefined
    : undefined;
  const portraitRole = privateSelf?.loyalGuardian ? `${privateSelf.loyalGuardian}-loyal`
    : privateSelf?.femaleDemon ? `minion-${privateSelf.femaleDemon}` : privateSelf?.role;
  return { ...result, scroll, scene: view === 'entry' ? 'entry' : view === 'game' || view === 'practice' ? 'game' : view === 'admin' ? 'admin' : 'standard',
    ...(portraitRole ? { portrait: `${portraitRole}-160.webp` } : view === 'guide' && guideRoleId ? { portrait: `${guideRoleId}-160.webp` } : {}) };
}
function render() { rows = renderScreen(model(), canvas, viewport, artwork); }
function navigate(next: typeof view) { view = next; scroll = 0; error = ''; notice = ''; pendingConfirm = undefined; render(); }

function connect(next: RoomView) {
  connection?.stop();
  room = next;
  syncGameUi(gameUi, next);
  lobby?.setRoom(next);
  connection = new MiniGameRoomConnection({ api, platform, roomId: next.id, baseUrl, handlers: {
    snapshot: snapshot => {
      const changedGame = snapshot.game?.id !== room?.game?.id;
      room = snapshot;
      lobby?.setRoom(snapshot);
      if (changedGame) hideSensitiveView(gameUi);
      syncGameUi(gameUi, snapshot);
      if (view !== 'player' && view !== 'admin') {
        if (snapshot.game && snapshot.phase !== 'waiting') view = 'game';
        else if (view !== 'settings') view = 'lobby';
      }
      render();
    },
    status: value => { status = value; render(); },
    error: value => { error = value; render(); },
    message: message => {
      if (message.type === 'roomChat') { playerPanel?.onRoomChat(message); if (view === 'player') render(); }
      if (message.type === 'directChat') { playerPanel?.onDirectChat(message); notice = `${message.fromUser.nickname}：${message.text}`; render(); }
      if (message.type === 'roomInvitation') { invites.receive(message.roomCode, message.fromUser.nickname); render(); }
      if (message.type === 'systemAnnouncement' && message.enabled) { notice = message.text; render(); }
    },
    ended: () => { connection = undefined; room = undefined; navigate('entry'); },
  } });
  lobby?.setConnection(connection);
  navigate(next.game ? 'game' : 'lobby');
  connection.start();
}

async function run(action: () => Promise<void>) {
  error = '';
  status = '请稍候…';
  render();
  try { await action(); }
  catch (cause) { error = cause instanceof Error ? cause.message : '操作失败'; }
  finally { status = ''; render(); }
}

async function select(id: string) {
  if (pendingConfirm) {
    const pending = pendingConfirm;
    pendingConfirm = undefined;
    if (id === 'confirm:yes') pending.execute();
    render(); return;
  }
  if (id === 'invitation') {
    if (room) { error = room.game && !['finished', 'aborted'].includes(room.game.phase) ? '当前牌局结束后再加入邀请' : '请先离开当前房间'; render(); return; }
    if (!lobby) { error = '请先微信登录，再点击邀请'; render(); return; }
    return run(async () => { const code = invites.code; if (code) { connect(await lobby!.join(code)); invites.take(); } });
  }
  if (view === 'practice' && practice) {
    if (id === 'exitPractice') { practice = undefined; navigate('entry'); return; }
    if (id === 'bot') { practice.stepBot(); syncGameUi(gameUi, practice.view()); render(); return; }
    if (id === 'role') { gameUi.privateRoleVisible = !gameUi.privateRoleVisible; render(); return; }
    if (id === 'direction') { gameUi.direction = gameUi.direction === 'clockwise' ? 'counterclockwise' : 'clockwise'; render(); return; }
    if (id.startsWith('player:')) {
      const targetId = id.slice(7);
      if (practice.view().game?.phase === 'proposing') {
        const selected = gameUi.selectedIds ?? [];
        gameUi.selectedIds = selected.includes(targetId) ? selected.filter(value => value !== targetId) : [...selected, targetId];
      } else gameUi.targetId = targetId;
      render(); return;
    }
    if (id === 'rematch') { practice = new PracticeSession(practice.settings, user?.nickname ?? '我'); syncGameUi(gameUi, practice.view()); render(); return; }
    const command = gameAction(practice.view(), practice.user, id, gameUi);
    if (command) { try { practice.act(command); syncGameUi(gameUi, practice.view()); } catch (cause) { error = cause instanceof Error ? cause.message : '练习操作失败'; } render(); }
    return;
  }
  if (view === 'player' && playerPanel) return run(async () => {
    const outcome = await playerPanel!.handle(id, async (label, maxLength) => { status = label; render(); return askText(wx, '', maxLength ?? 200); });
    user = playerPanel!.user;
    const applied = playerPanel!.takeAppliedSettings();
    if (applied && room?.hostId === user.id) lobby?.updateSettings(applied);
    if (outcome === 'back') navigate(previousView);
  });
  if (view === 'admin') return run(async () => {
    try {
      const outcome = await adminPanel.handle(id, async (label, maxLength) => { status = label; render(); return askText(wx, '', maxLength ?? 200); });
      if (outcome === 'back') { adminPanel.onHide(); navigate('entry'); }
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'ADMIN_UNAUTHORIZED') { adminPanel.onHide(); navigate('entry'); }
      throw cause;
    }
  });
  if (view === 'guide') {
    if (id === 'back') { guideRoleId = undefined; navigate('entry'); }
    else if (id === 'guide:roles') { guideRoleId = undefined; scroll = 0; render(); }
    else if (id.startsWith('guide-role:')) { guideRoleId = id.slice('guide-role:'.length); scroll = 0; render(); }
    return;
  }
  if (view === 'entry') {
    if (id === 'guide') { navigate('guide'); return; }
    if (id === 'practice') { practice = new PracticeSession(editableSettings, user?.nickname ?? '我'); syncGameUi(gameUi, practice.view()); navigate('practice'); return; }
    if (id === 'login') return run(async () => { const result = await api.login(); user = result.user; lobby = new LobbyController(api, user); playerPanel = new PlayerPanel(extras, user, () => chooseAvatar(wx)); const existing = await lobby.resume(); if (existing) connect(existing); else if (invites.code) { connect(await lobby.join(invites.code)); invites.take(); } else render(); });
    if (id === 'create' && lobby) return run(async () => { connect(await lobby!.create(editableSettings)); });
    if (id === 'join' && lobby) return run(async () => { const key = await askText(wx, '', 200); if (key) connect(await lobby!.join(key)); });
    if (id === 'switch') return run(async () => { const code = await askText(wx, '', 6); if (!code) return; connection?.stop(); connection = undefined; room = undefined; user = await api.switchAccount(code); lobby = new LobbyController(api, user); playerPanel = new PlayerPanel(extras, user, () => chooseAvatar(wx)); const existing = await lobby.resume(); if (existing) connect(existing); });
    if (id === 'logout') return run(async () => { connection?.stop(); connection = undefined; room = undefined; user = undefined; lobby = undefined; playerPanel = undefined; await api.logout(); render(); });
    if (id === 'admin') return run(async () => { const key = await askText(wx, '', 256); if (!key) return; await adminPanel.open(key); navigate('admin'); });
    if ((id === 'account' || id === 'friends') && playerPanel) return run(async () => { previousView = 'entry'; await playerPanel!.open(id); navigate('player'); });
  }
  if (view === 'settings') {
    if (id === 'apply') { if (room && lobby) lobby.updateSettings(editableSettings); navigate(room?.game ? 'game' : room ? 'lobby' : 'entry'); return; }
    editableSettings = toggleSetting(editableSettings, id as keyof Settings);
    render(); return;
  }
  if (view === 'lobby' && room && lobby) {
    if (id === 'ready') lobby.ready(!room.members.find(member => member.id === user?.id)?.ready);
    else if (id === 'start') lobby.start();
    else if (id === 'admission') lobby.admission(!room.acceptingNewMembers);
    else if (id === 'settings') { editableSettings = { ...room.settings }; navigate('settings'); }
    else if (id === 'leave') lobby.leave();
    else if (id === 'share') { if (wx.shareAppMessage) wx.shareAppMessage({ title: `来嘻游 · 真假猴王房间 ${room.code} 一起论剑`, query: `invite=${encodeURIComponent(room.code)}` }); else { error = `请告知好友房间号 ${room.code}`; render(); } }
    else if (id.startsWith('member:') && room.hostId === user?.id && id.slice(7) !== user.id) {
      const targetId = id.slice(7), member = room.members.find(item => item.id === targetId);
      if (member) { pendingConfirm = { label: `移除 ${member.nickname}？`, execute: () => { if (room?.hostId === user?.id) lobby?.kick(targetId); } }; render(); }
    }
    else if (id === 'chat' && playerPanel) return run(async () => { previousView = 'lobby'; await playerPanel!.open('roomchat', { roomId: room!.id }); navigate('player'); });
    else if (id === 'voice') { error = '语音功能正在接入'; render(); }
    return;
  }
  if (view === 'game' && room && user) {
    if (id === 'role') { gameUi.privateRoleVisible = !gameUi.privateRoleVisible; render(); return; }
    if (id === 'direction') { gameUi.direction = gameUi.direction === 'clockwise' ? 'counterclockwise' : 'clockwise'; render(); return; }
    if (id.startsWith('player:')) {
      const targetId = id.slice(7);
      if (['proposing', 'discussion'].includes(room.game?.phase ?? '') && room.game?.captainId === user.id) {
        const selected = gameUi.selectedIds ?? [];
        gameUi.selectedIds = selected.includes(targetId) ? selected.filter(value => value !== targetId) : [...selected, targetId];
      } else gameUi.targetId = targetId;
      render(); return;
    }
    const command = gameAction(room, user, id, gameUi);
    if (command && ['endGame', 'voteAbort'].includes(command.type)) {
      pendingConfirm = { label: command.type === 'endGame' ? '结束游戏并关闭房间？' : '确认处理结束申请？',
        execute: () => { if (room && user) { const fresh = gameAction(room, user, id, gameUi); if (fresh && !connection?.send(fresh)) { error = '正在等待上一操作确认'; } } } };
      render(); return;
    }
    if (command && !connection?.send(command)) { error = '正在等待上一操作确认'; render(); }
  }
}

let touchY = 0;
wx.onTouchStart?.(event => { touchY = event.touches[0]?.clientY ?? 0; });
wx.onTouchEnd?.(event => {
  const point = event.changedTouches[0];
  if (!point) return;
  const delta = point.clientY - touchY;
  if (Math.abs(delta) > 15) { scroll = Math.max(0, scroll - delta); render(); }
  else { const row = hitTest(rows, point.clientX, point.clientY); if (row) void select(row.id); }
});
platform.onHide(() => { hideSensitiveView(gameUi); pendingConfirm = undefined; adminPanel.onHide(); if (view === 'admin') view = 'entry'; render(); });
platform.onShow(options => { invites.receive(options?.query?.invite); connection?.resume(); render(); });
render();
if (api.session.get()) void run(async () => {
  user = await api.refresh();
  lobby = new LobbyController(api, user);
  playerPanel = new PlayerPanel(extras, user, () => chooseAvatar(wx));
  const existing = await lobby.resume();
  if (existing) connect(existing);
  else if (invites.code) { connect(await lobby.join(invites.code)); invites.take(); }
});
wx.onShareAppMessage?.(() => ({ title: room ? `来嘻游 · 真假猴王房间 ${room.code} 一起论剑` : '嘻游 · 真假猴王', ...(room ? { query: `invite=${encodeURIComponent(room.code)}` } : {}) }));
