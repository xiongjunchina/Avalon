import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminApi } from '../src/screens/admin/auth.js';
import { adminOverviewScreen, adminReplayScreen, adminUsersScreen } from '../src/screens/admin/views.js';
import { AdminPanel } from '../src/screens/admin/panel.js';
import { rowTone } from '../src/ui/widgets.js';

test('invalid key never authorizes a player data write', async () => {
  const calls: string[] = [];
  const admin = new AdminApi({ request: (options: any) => {
    calls.push(options.url);
    options.success({ statusCode: 401, data: { ok: false } });
  } } as any, 'https://example.com');
  await assert.rejects(admin.verify('bad-key'), /ADMIN_UNAUTHORIZED/);
  assert.throws(() => admin.banUser('user-1', true, 'test'), /ADMIN_UNAUTHORIZED/);
  assert.equal(calls.length, 1);
});

test('admin key stays in memory and clears on background or expired auth', async () => {
  const headers: Record<string, string>[] = [];
  const admin = new AdminApi({ request: (options: any) => {
    headers.push(options.header);
    options.success({ statusCode: options.url.includes('overview') ? 401 : 200, data: options.url.includes('overview') ? { error: 'ADMIN_UNAUTHORIZED' } : { ok: true } });
  } } as any, 'https://example.com');
  await admin.verify('valid-key');
  await assert.rejects(admin.overview(), /ADMIN_UNAUTHORIZED/);
  assert.equal(admin.authorized, false);
  assert.equal(headers[1]?.['x-admin-key'], 'valid-key');
  await admin.verify('valid-key');
  admin.onHide();
  assert.equal(admin.authorized, false);
});

test('destructive operations require an explicit confirmation value', async () => {
  const admin = new AdminApi({ request: (options: any) => options.success({ statusCode: 200, data: { ok: true } }) } as any, 'https://example.com');
  await admin.verify('key');
  assert.throws(() => admin.killRoom('room-1', false), /CONFIRM_REQUIRED/);
  assert.throws(() => admin.deleteUser('user-1', false), /CONFIRM_REQUIRED/);
});

test('overview and user list expose current server data as actions', () => {
  const overview = adminOverviewScreen({ totalUsers: 4, todayNewUsers: 1, activeRoomsCount: 2, totalGames: 8, todayGames: 3, freeAccessMode: true, onlineConnections: 5 });
  assert.ok(overview.rows.some(row => row.text.includes('4')));
  for (const page of ['users', 'rooms', 'games', 'codes', 'settings']) assert.ok(overview.rows.some(row => row.id === `page:${page}`));
  const users = adminUsersScreen([{ id: 'u', nickname: '甲', playerCode: '123456', isBanned: false, isVip: false, gamesCount: 0, friendsCount: 0, createdAt: '' }]);
  assert.ok(users.rows.some(row => row.id === 'user:u'));
});

test('admin can load further users and requires confirmation before batch cleanup', async () => {
  const offsets: number[] = [];
  let cleaned = 0;
  const api = {
    users: async (_query: string, offset: number) => { offsets.push(offset); return { users: Array.from({ length: offset ? 1 : 50 }, (_, index) => ({ id: `${offset + index}`, nickname: `用户${offset + index}` })), total: 51 }; },
    deleteEmptyUsers: async () => { cleaned++; return { ok: true, deletedCount: 1 }; },
  } as any;
  const panel = new AdminPanel(api);
  await panel.load('users');
  assert.ok(panel.model().rows.some(row => row.id === 'more:users'));
  await panel.handle('more:users', async () => undefined);
  assert.deepEqual(offsets, [0, 50]);
  assert.ok(panel.model().rows.some(row => row.id === 'user:50'));
  await panel.handle('cleanup', async () => undefined);
  assert.equal(cleaned, 0);
  assert.ok(panel.model().rows.some(row => row.id === 'confirm:yes'));
  await panel.handle('confirm:yes', async () => undefined);
  assert.equal(cleaned, 1);
  assert.ok(panel.model().rows.some(row => row.id === 'search'));
});

test('admin verification does not wait forever when wx.request stalls', async () => {
  const admin = new AdminApi({ request: () => {} } as any, 'https://example.com', undefined, 15);
  await assert.rejects(admin.verify('key'), /NETWORK_TIMEOUT/);
  assert.equal(admin.authorized, false);
});

test('generated codes retain their note and can be copied with unused inventory', async () => {
  const generated: unknown[] = [];
  const copied: string[] = [];
  const api = {
    codes: async () => ({ codes: [
      { code: 'FREE-ONE', days: 7, note: '社群', redeemedAt: null },
      { code: 'USED-TWO', days: 3, note: '活动', redeemedAt: '2026-01-01' },
    ] }),
    generateCodes: async (...args: unknown[]) => { generated.push(args); return { codes: ['NEW-ONE'] }; },
  } as any;
  const panel = new AdminPanel(api, value => { copied.push(value); return Promise.resolve(); });
  await panel.load('codes');
  assert.ok(panel.model().rows.some(row => row.id === 'copy:unused'));
  await panel.handle('copy:unused', async () => undefined);
  assert.deepEqual(copied, ['FREE-ONE (7天 - 社群)']);
  const answers = ['2', '30', '秋季活动'];
  await panel.handle('generate', async () => answers.shift());
  assert.deepEqual(generated, [[2, 30, '秋季活动']]);
});

test('backgrounding clears cached administrator data and pending actions', async () => {
  const api = { onHide() {}, overview: async () => ({ totalUsers: 42, todayNewUsers: 0, activeRoomsCount: 0, totalGames: 0, todayGames: 0, freeAccessMode: true, onlineConnections: 0 }) } as any;
  const panel = new AdminPanel(api);
  await panel.load('overview');
  assert.ok(panel.model().rows.some(row => row.text.includes('42')));
  panel.onHide();
  assert.ok(!panel.model().rows.some(row => row.text.includes('42')));
});

test('admin replay includes team, vote, mission and inspection without individual mission cards', () => {
  const replay = {
    id: 'game-1', playerCount: 2, rulesetVersion: 'v1', startedAt: '2026-01-01', endedAt: '2026-01-01',
    result: { winner: 'blue', reason: 'merlin_survived' }, settings: { anonymousTeamVote: true },
    players: [{ id: 'u1', seat: 1, nickname: '甲' }, { id: 'u2', seat: 2, nickname: '乙' }], roles: { u1: 'merlin', u2: 'assassin' },
    rounds: [{ number: 1, mission: 1, captainId: 'u1', team: ['u1', 'u2'], direction: 'clockwise',
      vote: { approvals: 2, rejections: 0, passed: true, ballots: { u1: 'approve', u2: 'approve' } },
      result: { successes: 2, failures: 0, passed: true } }],
    inspections: [{ afterMission: 1, inspectorId: 'u1', targetId: 'u2' }], earlyWindows: [],
  } as any;
  const screen = adminReplayScreen(replay);
  const labels = screen.rows.map(row => row.text).join(' ');
  assert.match(labels, /甲.*乙/);
  assert.match(labels, /赞成2.*反对0/);
  assert.match(labels, /任务.*成功2.*失败0/);
  assert.match(labels, /宝镜.*甲.*乙/);
  assert.doesNotMatch(labels, /approve/);
});

test('admin response arriving after background does not restore cached data', async () => {
  let respond!: (value: any) => void;
  const api = { onHide() {}, overview: () => new Promise(resolve => { respond = resolve; }) } as any;
  const panel = new AdminPanel(api);
  const loading = panel.load('overview');
  panel.onHide();
  respond({ totalUsers: 99, todayNewUsers: 0, activeRoomsCount: 0, totalGames: 0, todayGames: 0, freeAccessMode: true, onlineConnections: 0 });
  await loading;
  assert.ok(!panel.model().rows.some(row => row.text.includes('99')));
});

test('failed admin opening discards the verified key and cached page', async () => {
  let cleared = false;
  const api = { verify: async () => {}, overview: async () => { throw new Error('NETWORK'); }, onHide: () => { cleared = true; } } as any;
  const panel = new AdminPanel(api);
  await assert.rejects(panel.open('key'), /NETWORK/);
  assert.equal(cleared, true);
  assert.equal(panel.model().title, '管理员');
});

test('administrator destructive actions and read-only metrics have distinct visual tones', () => {
  for (const id of ['cleanup', 'ban:u', 'delete:u', 'room:r', 'reset:u']) assert.equal(rowTone(id), 'danger');
  for (const id of ['stats:users', 'replay:mission:1']) assert.equal(rowTone(id), 'info');
  assert.equal(rowTone('generate'), 'primary');
});

test('admin friend inspection shows player codes and relationship status', async () => {
  const api = { userFriends: async () => ({ friends: [{ id: 'f', nickname: '乙', player_code: '123456', status: 'accepted' }] }) } as any;
  const panel = new AdminPanel(api);
  (panel as any).user = { id: 'u', nickname: '甲' };
  await panel.handle('friends:u', async () => undefined);
  const text = panel.model().rows.map(row => row.text).join(' ');
  assert.match(text, /乙.*123456.*已互关/);
});


test('code generator starts with the same five-code default as the web and never writes on opening', async () => {
  const calls: unknown[]=[];
  const panel=new AdminPanel({codes:async()=>({codes:[]}),generateCodes:async(...args:unknown[])=>{calls.push(args);return {codes:[]};}} as any);
  await panel.load('codes');
  assert.equal(panel.model().web?.document?.adminCodeDraft?.count,'5');
  assert.deepEqual(calls,[]);
});
