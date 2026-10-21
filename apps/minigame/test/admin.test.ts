import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminApi } from '../src/screens/admin/auth.js';
import { adminOverviewScreen, adminUsersScreen } from '../src/screens/admin/views.js';

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
