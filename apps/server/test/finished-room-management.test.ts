import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defaultSettings, type AdminRoomSummary, type Command } from '@avalon/contracts';
import { DEAL_MS } from '../src/store.js';
import { SpecialManagement } from '../src/special-management.js';
import { headers, service } from './helpers.js';

test('finished dedicated rooms remain manageable after host handover and can reopen without losing history or credentials', async t => {
  const f = await service(t), store = f.store, special = new SpecialManagement(store);
  const people = await Promise.all(Array.from({ length: 5 }, (_, index) => store.createGuest(`朋友${index + 1}`)));
  const manager = people[0], newcomer = await store.createGuest('新朋友');
  const settings = { ...defaultSettings, playerCount: 5, voiceChatEnabled: true };
  await special.saveRoom({ code: '999999', name: '朋友专属', managerId: manager.user.id, settings, password: '5678' });
  const dedicated = (await special.rooms(manager.user.id))[0];
  const room = await store.createRoom(manager.user, undefined, { dedicatedRoomId: dedicated.id });
  const state = async (userId?: string) => (await store.snapshot(room.id, userId))!;
  const command = async (userId: string, type: Command['type'], payload: Command['payload'] = {}) => {
    await store.execute(userId, room.id, { commandId: randomUUID(), expectedVersion: (await state()).version, type, payload } as Command);
  };
  for (const person of people.slice(1)) await store.join(person.user, room.inviteKey!);
  for (const person of people) {
    await store.connect(person.user.id, room.id, randomUUID());
    await command(person.user.id, 'setReady', { ready: true });
  }
  await command(manager.user.id, 'startGame');
  const join = (key: string, password?: string) => f.app.inject({ method: 'POST', url: '/api/rooms/join',
    headers: { ...headers, cookie: `avalon_session=${newcomer.token}` }, payload: { key, ...(password ? { password } : {}) } });
  const blockedLive = await join(room.inviteKey!);
  assert.equal(blockedLive.statusCode, 409); assert.equal(blockedLive.json().error, 'GAME_IN_PROGRESS');
  f.advance(DEAL_MS); await store.releaseDeal(room.id);
  for (const person of people) await command(person.user.id, 'confirmRole');
  // Complete a normal game: three successful missions followed by a missed assassination.
  for (let mission = 0; mission < 3; mission++) {
    const game = (await state()).game!, team = game.players.slice(0, game.missionSizes[game.mission - 1]).map(player => player.id);
    await command(game.captainId, 'proposeTeam', { playerIds: team, direction: 'clockwise' });
    await command(game.captainId, 'startTeamVote');
    for (const person of people) await command(person.user.id, 'teamVote', { approve: true });
    for (const userId of team) await command(userId, 'missionVote', { success: true });
  }
  const perspectives = await Promise.all(people.map(person => state(person.user.id)));
  const assassin = people[perspectives.findIndex(snapshot => snapshot.game!.self!.role === 'assassin')];
  const wrongTarget = people[perspectives.findIndex(snapshot => snapshot.game!.self!.role === 'percival')];
  await command(assassin.user.id, 'assassinate', { targetId: wrongTarget.user.id });
  const finished = await state(); assert.equal(finished.phase, 'finished');
  assert.equal((await store.join(manager.user, room.code)).phase, 'finished', 'existing members may reconnect without resetting the result');
  const blockedFinished = await join(room.code, '5678');
  assert.equal(blockedFinished.statusCode, 409); assert.equal(blockedFinished.json().error, 'GAME_FINISHED');
  const gameId = finished.game!.id;
  const beforeGame = (await f.pool.query('SELECT state,ended_at FROM games WHERE id=$1', [gameId])).rows[0];
  const beforeTemplate = (await f.pool.query('SELECT settings,password_hash,manager_id FROM dedicated_rooms WHERE id=$1', [dedicated.id])).rows[0];
  // The dedicated manager can leave the completed table; another member becomes its current host.
  await command(manager.user.id, 'leaveRoom');
  const handedOver = await state(); assert.notEqual(handedOver.hostId, manager.user.id);
  assert.equal((await special.rooms(manager.user.id))[0].activePhase, 'finished');
  await assert.rejects(store.createRoom(manager.user, undefined, { dedicatedRoomId: dedicated.id }), /DEDICATED_ROOM_ACTIVE/);
  const adminHeaders = { ...headers, 'x-admin-key': process.env.ADMIN_KEY! };
  const active = await f.app.inject({ url: '/api/admin/rooms', headers: adminHeaders });
  const activeRooms = active.json().rooms as AdminRoomSummary[];
  assert.equal(active.statusCode, 200); assert.equal(activeRooms.length, 1);
  assert.equal(activeRooms[0].id, room.id); assert.equal(activeRooms[0].phase, 'finished');
  assert.equal(activeRooms[0].hostId, handedOver.hostId);
  const overview = await f.app.inject({ url: '/api/admin/overview', headers: adminHeaders });
  assert.equal(overview.json().activeRoomsCount, 1);
  const killed = await f.app.inject({ method: 'POST', url: `/api/admin/rooms/${room.id}/kill`, headers: adminHeaders, payload: {} });
  assert.equal(killed.statusCode, 200, killed.body);
  assert.equal(await store.snapshot(room.id), null);
  assert.equal((await f.app.inject({ url: '/api/admin/rooms', headers: adminHeaders })).json().rooms.length, 0);
  assert.equal((await f.app.inject({ url: '/api/admin/overview', headers: adminHeaders })).json().activeRoomsCount, 0);
  assert.equal((await special.rooms(manager.user.id))[0].activeRoomId, undefined);
  assert.equal(await store.currentRoom(people[1].user.id), null);
  assert.deepEqual((await f.pool.query('SELECT state,ended_at FROM games WHERE id=$1', [gameId])).rows[0], beforeGame);
  assert.deepEqual((await f.pool.query('SELECT settings,password_hash,manager_id FROM dedicated_rooms WHERE id=$1', [dedicated.id])).rows[0], beforeTemplate);
  const history = await f.app.inject({ url: '/api/me/games', headers: { cookie: `avalon_session=${manager.token}` } });
  assert.equal(history.statusCode, 200); assert.equal(history.json().games[0].id, gameId);
  const reopened = await store.createRoom(manager.user, undefined, { dedicatedRoomId: dedicated.id });
  assert.equal(reopened.code, '999999'); assert.notEqual(reopened.id, room.id); assert.notEqual(reopened.inviteKey, room.inviteKey);
  assert.equal(reopened.hasPassword, true); assert.deepEqual(reopened.settings, settings);
  const wrongPassword = await join(reopened.code, '0000');
  assert.equal(wrongPassword.statusCode, 403); assert.equal(wrongPassword.json().error, 'ROOM_PASSWORD_INVALID');
  const joined = await join(reopened.code, '5678');
  assert.equal(joined.statusCode, 200); assert.equal(joined.json().room.id, reopened.id);
});
