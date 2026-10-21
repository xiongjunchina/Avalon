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

declare const wx: WxRuntime;

const baseUrl = 'https://avalon.ccnepower.com:8443';
const platform = new WechatPlatform(wx);
const canvas = drawShell(platform);
const api = new MiniGameApi(platform, baseUrl);
const screen = platform.screen();
const viewport = { width: screen.screenWidth, height: screen.screenHeight, top: screen.safeArea?.top ?? 0, bottom: screen.screenHeight - (screen.safeArea?.bottom ?? screen.screenHeight) };

let user: User | undefined;
let room: RoomView | undefined;
let lobby: LobbyController | undefined;
let connection: MiniGameRoomConnection | undefined;
let view: 'entry' | 'lobby' | 'game' | 'settings' = 'entry';
let status = '';
let error = '';
let rows: HitRegion[] = [];
let scroll = 0;
let editableSettings: Settings = { ...defaultSettings };
const gameUi: GameUiState = { privateRoleVisible: false, ballotVisible: false, selectedIds: [], direction: 'clockwise' };

function model(): ScreenModel {
  let result: ScreenModel;
  if (view === 'settings') result = settingsScreen(editableSettings);
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
      if (snapshot.game && snapshot.phase !== 'waiting') view = 'game';
      else if (view !== 'settings') view = 'lobby';
      render();
    },
    status: value => { status = value; render(); },
    error: value => { error = value; render(); },
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
  if (view === 'entry') {
    if (id === 'login') return run(async () => { const result = await api.login(); user = result.user; lobby = new LobbyController(api, user); const existing = await lobby.resume(); if (existing) connect(existing); else render(); });
    if (id === 'create' && lobby) return run(async () => { connect(await lobby!.create(editableSettings)); });
    if (id === 'join' && lobby) return run(async () => { const key = await askText(wx, '', 200); if (key) connect(await lobby!.join(key)); });
    if (id === 'logout') { connection?.stop(); connection = undefined; room = undefined; user = undefined; lobby = undefined; api.clearSession(); render(); return; }
    if (id === 'guide' || id === 'account' || id === 'friends' || id === 'practice' || id === 'admin') { error = '此页面正在接入，请稍后重试'; render(); return; }
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
    else if (id.startsWith('member:') && room.hostId === user?.id && id.slice(7) !== user.id) { error = '请在管理操作中确认移除玩家'; render(); }
    else if (id === 'chat' || id === 'voice') { error = '此功能正在接入'; render(); }
    return;
  }
  if (view === 'game' && room && user) {
    if (id === 'role') { gameUi.privateRoleVisible = !gameUi.privateRoleVisible; render(); return; }
    if (id === 'direction') { gameUi.direction = gameUi.direction === 'clockwise' ? 'counterclockwise' : 'clockwise'; render(); return; }
    if (id.startsWith('player:')) {
      const targetId = id.slice(7);
      if (room.game?.phase === 'proposing' && room.game.captainId === user.id) {
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
platform.onHide(() => { hideSensitiveView(gameUi); render(); });
platform.onShow(() => { connection?.resume(); render(); });
render();
if (api.session.get()) void run(async () => {
  user = await api.refresh();
  lobby = new LobbyController(api, user);
  const existing = await lobby.resume();
  if (existing) connect(existing);
});
