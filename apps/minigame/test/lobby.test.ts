import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type RoomView, type User } from '@avalon/contracts';
import { LobbyController } from '../src/screens/lobby.js';
import { settingsScreen, toggleSetting } from '../src/screens/settings.js';

const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '玩家' } as User;
const room = { id: '22222222-2222-4222-8222-222222222222', code: '123456', version: 3, hostId: user.id, phase: 'waiting', settings: defaultSettings,
  members: [{ ...user, seat: 1, ready: false, online: true }], acceptingNewMembers: true } as RoomView;

test('create, join and resume use existing server routes', async () => {
  const calls: { path: string; body?: unknown }[] = [];
  const api = { request: async (path: string, body?: unknown) => { calls.push({ path, body }); return path === '/me' ? { user, roomId: room.id } : { room }; } } as any;
  const lobby = new LobbyController(api, user);
  assert.equal((await lobby.create(defaultSettings)).id, room.id);
  assert.equal((await lobby.join('123456')).code, room.code);
  assert.equal((await lobby.resume())?.id, room.id);
  assert.deepEqual(calls.map(call => call.path), ['/rooms', '/rooms/join', '/me', `/rooms/${room.id}`]);
});

test('host and member actions create versioned commands', () => {
  const sent: unknown[] = [];
  const lobby = new LobbyController({} as any, user);
  lobby.setRoom(room);
  lobby.setConnection({ send: (command: unknown) => { sent.push(command); return true; } } as any);
  assert.equal(lobby.ready(true), true);
  assert.equal(lobby.start(), true);
  assert.equal(lobby.admission(false), true);
  assert.equal(lobby.updateSettings({ ...defaultSettings, playerCount: 7 }), true);
  assert.equal(lobby.kick('33333333-3333-4333-8333-333333333333'), true);
  assert.equal(lobby.leave(), true);
  assert.deepEqual(sent.map((command: any) => command.type), ['setReady', 'startGame', 'setAdmission', 'updateSettings', 'kickMember', 'leaveRoom']);
  assert.ok(sent.every((command: any) => command.expectedVersion === 3 && /^[0-9a-f-]{36}$/.test(command.commandId)));
});

test('all web room settings are offered and toggleable', () => {
  const keys = ['playerCount', 'captainMode', 'rejectionScope', 'anonymousTeamVote', 'ladyEnabled', 'earlyAssassinationEnabled', 'guardianPerksEnabled', 'voiceChatEnabled'] as const;
  const rows = settingsScreen(defaultSettings).rows;
  for (const key of keys) {
    assert.ok(rows.some(row => row.id === key), key);
    assert.notDeepEqual(toggleSetting(defaultSettings, key), defaultSettings, key);
  }
});
