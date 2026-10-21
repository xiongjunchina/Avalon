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
import { gameAction, gameScreen, type GameUiState } from './screens/game.js';
import { AdminApi } from './screens/admin/auth.js';
import { AdminPanel } from './screens/admin/panel.js';
import { PlayerExtras } from './screens/player-extras.js';
import { PlayerPanel } from './screens/player-panel.js';
import { PracticeSession } from './screens/practice.js';
import { guideScreen } from './screens/guide.js';

declare const wx: WxRuntime;
declare const __MINIGAME_API_BASE_URL__: string;

const baseUrl = __MINIGAME_API_BASE_URL__;
const platform = new WechatPlatform(wx);
const canvas = drawShell(platform);
const api = new MiniGameApi(platform, baseUrl);
const launchInvite = wx.getLaunchOptionsSync?.().query?.invite;
const adminPanel = new AdminPanel(new AdminApi(platform, baseUrl, () => api.session.get()));
const extras = new PlayerExtras(api);
const screen = platform.screen();
const viewport = { width: screen.screenWidth, height: screen.screenHeight, top: screen.safeArea?.top ?? 0, bottom: screen.screenHeight - (screen.safeArea?.bottom ?? screen.screenHeight) };

let user: User | undefined;
let room: RoomView | undefined;
let lobby: LobbyController | undefined;
let playerPanel: PlayerPanel | undefined;
let practice: PracticeSession | undefined;
let connection: MiniGameRoomConnection | undefined;
let view: 'entry' | 'lobby' | 'game' | 'settings' | 'admin' | 'player' | 'practice' | 'guide' = 'entry';
let previousView: 'entry' | 'lobby' | 'game' = 'entry';
let status = '';
let error = '';
let rows: HitRegion[] = [];
let scroll = 0;
let editableSettings: Settings = { ...defaultSettings };
const gameUi: GameUiState = { privateRoleVisible: false, ballotVisible: false, selectedIds: [], direction: 'clockwise' };

function model(): ScreenModel {
  let result: ScreenModel;
  if (view === 'admin') result = adminPanel.model();
  else if (view === 'guide') result = guideScreen();
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
  return { ...result, scroll };
}
function render() { rows = renderScreen(model(), canvas, viewport); }
function navigate(next: typeof view) { view = next; scroll = 0; error = ''; render(); }

function connect(next: RoomView) {
  connection?.stop();
  room = next;
  lobby?.setRoom(next);
  connection = new MiniGameRoomConnection({ api, platform, roomId: next.id, baseUrl, handlers: {
    snapshot: snapshot => {
      const changedGame = snapshot.game?.id !== room?.game?.id;
      room = snapshot;
      lobby?.setRoom(snapshot);
      if (changedGame) hideSensitiveView(gameUi);
      if (view !== 'player' && view !== 'admin') {
        if (snapshot.game && snapshot.phase !== 'waiting') view = 'game';
        else if (view !== 'settings') view = 'lobby';
      }
      render();
    },
    status: value => { status = value; render(); },
    error: value => { error = value; render(); },
    message: message => { if (message.type === 'roomChat') { playerPanel?.onRoomChat(message); if (view === 'player') render(); } },
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
  if (view === 'practice' && practice) {
    if (id === 'exitPractice') { practice = undefined; navigate('entry'); return; }
    if (id === 'bot') { practice.stepBot(); render(); return; }
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
    if (id === 'rematch') { practice = new PracticeSession(practice.settings, user?.nickname ?? '我'); hideSensitiveView(gameUi); render(); return; }
    const command = gameAction(practice.view(), practice.user, id, gameUi);
    if (command) { try { practice.act(command); } catch (cause) { error = cause instanceof Error ? cause.message : '练习操作失败'; } render(); }
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
    const outcome = await adminPanel.handle(id, async (label, maxLength) => { status = label; render(); return askText(wx, '', maxLength ?? 200); });
    if (outcome === 'back') navigate('entry');
  });
  if (view === 'guide') { if (id === 'back') navigate('entry'); return; }
  if (view === 'entry') {
    if (id === 'guide') { navigate('guide'); return; }
    if (id === 'practice') { practice = new PracticeSession(editableSettings, user?.nickname ?? '我'); hideSensitiveView(gameUi); navigate('practice'); return; }
    if (id === 'login') return run(async () => { const result = await api.login(); user = result.user; lobby = new LobbyController(api, user); playerPanel = new PlayerPanel(extras, user); const existing = await lobby.resume(); if (existing) connect(existing); else if (launchInvite) connect(await lobby.join(launchInvite)); else render(); });
    if (id === 'create' && lobby) return run(async () => { connect(await lobby!.create(editableSettings)); });
    if (id === 'join' && lobby) return run(async () => { const key = await askText(wx, '', 200); if (key) connect(await lobby!.join(key)); });
    if (id === 'switch') return run(async () => { const code = await askText(wx, '', 6); if (!code) return; connection?.stop(); connection = undefined; room = undefined; user = await api.switchAccount(code); lobby = new LobbyController(api, user); playerPanel = new PlayerPanel(extras, user); const existing = await lobby.resume(); if (existing) connect(existing); });
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
    else if (id.startsWith('member:') && room.hostId === user?.id && id.slice(7) !== user.id) { error = '请在管理操作中确认移除玩家'; render(); }
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
platform.onHide(() => { hideSensitiveView(gameUi); adminPanel.onHide(); if (view === 'admin') view = 'entry'; render(); });
platform.onShow(() => { connection?.resume(); render(); });
render();
if (api.session.get()) void run(async () => {
  user = await api.refresh();
  lobby = new LobbyController(api, user);
  playerPanel = new PlayerPanel(extras, user);
  const existing = await lobby.resume();
  if (existing) connect(existing);
  else if (launchInvite) connect(await lobby.join(launchInvite));
});
wx.onShareAppMessage?.(() => ({ title: room ? `来嘻游 · 真假猴王房间 ${room.code} 一起论剑` : '嘻游 · 真假猴王', ...(room ? { query: `invite=${encodeURIComponent(room.code)}` } : {}) }));
