import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Socket } from 'node:net';
const localSocket = () => Object.defineProperty(new Socket(), 'remoteAddress', { value: '127.0.0.1' });
import type { WebSocket } from 'ws';
import { service } from './helpers.js';
import type { RoomView, ServerMessage } from '@avalon/contracts';
const origin = 'http://localhost:5173';
const headers = { origin, 'x-avalon-request': '1' };
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const { app, store } = await service(t);
  const sockets: WebSocket[] = [];
  t.after(async () => { sockets.forEach(s => s.terminate()); });
  async function guest(nickname = '朋友') {
    const r = await app.inject({ method: 'POST', url: '/api/sessions/guest', headers, payload: { nickname } });
    assert.equal(r.statusCode, 200);
    return { cookie: String(r.headers['set-cookie']).split(';')[0], user: r.json().user };
  }
  async function create(cookie: string): Promise<RoomView> {
    const r = await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...headers, cookie }, payload: {} });
    assert.equal(r.statusCode, 200); return r.json().room;
  }
  async function connect(cookie: string, roomId: string) {
    const queue: ServerMessage[] = [];
    let notify: (() => void) | undefined;
    const socket = await app.injectWS(`/api/rooms/${roomId}/socket`, { socket: localSocket(), headers: { origin, cookie } }, {
      onInit: ws => ws.on('message', raw => { queue.push(JSON.parse(raw.toString())); notify?.(); }),
    });
    sockets.push(socket);
    async function next(predicate: (m: ServerMessage) => boolean = () => true): Promise<any> {
      const find = () => { const index = queue.findIndex(predicate); if (index < 0) return; return queue.splice(index, 1)[0]; };
      const ready = find(); if (ready) return ready;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { notify = undefined; reject(new Error('No expected WebSocket message')); }, 2000);
        notify = () => { const found = find(); if (found) { clearTimeout(timer); notify = undefined; resolve(found); } };
      });
    }
    return { socket, next, send: (value: unknown) => socket.send(JSON.stringify(value)) };
  }
  return { app, store, guest, create, connect };
}

test('guest session uses HttpOnly cookie; cross-origin and missing CSRF header rejected', async t => {
  const { app, guest } = await fixture(t);
  const a = await guest('阿青');
  const me = await app.inject({ url: '/api/me', headers: { cookie: a.cookie } });
  assert.equal(me.json().user.nickname, '阿青');
  const response = await app.inject({ method: 'POST', url: '/api/sessions/guest', headers, payload: { nickname: '测试' } });
  assert.match(String(response.headers['set-cookie']), /HttpOnly/);
  assert.match(String(response.headers['set-cookie']), /SameSite=Strict/i);
  for (const h of [{ ...headers, origin: 'https://evil.example' }, { origin }]) {
    const denied = await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...h, cookie: a.cookie }, payload: {} });
    assert.equal(denied.statusCode, 403);
  }
});

test('room isolation, capacity, duplicate joins and invite privacy', async t => {
  const { app, guest, create } = await fixture(t);
  const host = await guest('房主'); const room = await create(host.cookie);
  assert.equal('invite' in room, false);
  const outsider = await guest();
  assert.equal((await app.inject({ url: `/api/rooms/${room.id}`, headers: { cookie: outsider.cookie } })).statusCode, 403);
  for (let i = 0; i < 5; i++) {
    const person = i === 0 ? outsider : await guest();
    const join = () => app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...headers, cookie: person.cookie }, payload: { key: room.code } });
    assert.equal((await join()).statusCode, 200);
    assert.equal((await join()).json().room.members.length, i + 2);
  }
  const extra = await guest();
  assert.equal((await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...headers, cookie: extra.cookie }, payload: { key: room.code } })).json().error, 'ROOM_FULL');
});

test('two independent clients synchronize ready state and reject stale / unauthorized settings', async t => {
  const { app, guest, create, connect } = await fixture(t);
  const host = await guest('房主'), player = await guest('队友'); const room = await create(host.cookie);
  await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...headers, cookie: player.cookie }, payload: { key: room.code } });
  const a = await connect(host.cookie, room.id), b = await connect(player.cookie, room.id);
  const initial = (await b.next(m => m.type === 'snapshot')).room as RoomView;
  const ready = { type: 'setReady', commandId: randomUUID(), expectedVersion: initial.version, payload: { ready: true } };
  b.send(ready);
  assert.equal((await b.next(m => m.type === 'commandResult')).ok, true);
  const updated = (await a.next(m => m.type === 'snapshot' && m.room.version > initial.version)).room as RoomView;
  assert.equal(updated.members.find(m => m.id === player.user.id)?.ready, true);
  b.send(ready); // same command remains idempotent despite its now-stale version
  assert.equal((await b.next(m => m.type === 'commandResult')).ok, true);
  b.send({ ...ready, commandId: randomUUID() });
  assert.equal((await b.next(m => m.type === 'commandResult')).error, 'VERSION_CONFLICT');
  b.send({ type: 'updateSettings', commandId: randomUUID(), expectedVersion: updated.version, payload: { ...updated.settings, playerCount: 7 } });
  assert.equal((await b.next(m => m.type === 'commandResult')).error, 'FORBIDDEN');
  a.send({ type: 'updateSettings', commandId: randomUUID(), expectedVersion: updated.version, payload: { ...updated.settings, playerCount: 7 } });
  assert.equal((await a.next(m => m.type === 'commandResult')).ok, true);
  const changed = (await b.next(m => m.type === 'snapshot' && m.room.settings.playerCount === 7)).room;
  assert.equal(changed.members.every((m: { ready: boolean }) => !m.ready), true);
});

test('refresh reconnects to the same seat; latest tab takes over; invalid messages do not mutate room', async t => {
  const { guest, create, connect, store } = await fixture(t);
  const person = await guest(); const room = await create(person.cookie);
  const first = await connect(person.cookie, room.id); await first.next();
  const second = await connect(person.cookie, room.id);
  await first.next(m => m.type === 'takenOver');
  const state = (await second.next(m => m.type === 'snapshot')).room;
  assert.equal(state.members.length, 1); assert.equal(state.members[0].seat, 1);
  second.send({ type: 'startGame', payload: {} });
  assert.equal((await second.next(m => m.type === 'commandResult')).error, 'INVALID_INPUT');
  assert.equal((await store.snapshot(room.id))?.version, room.version);
  second.socket.terminate();
  const third = await connect(person.cookie, room.id);
  assert.equal((await third.next(m => m.type === 'snapshot' && m.room.members[0].online)).room.members[0].online, true);
});

test('room sync returns a fresh authenticated roster even if an earlier broadcast was missed', async t => {
  const {guest,create,connect,store}=await fixture(t);
  const host=await guest('房主'),player=await guest('道友辉');const room=await create(host.cookie);
  const connection=await connect(host.cookie,room.id);await connection.next(m=>m.type==='snapshot');
  // A committed join whose broadcast did not reach this browser.
  await store.join(player.user,room.inviteKey!);
  connection.send({type:'sync'});
  const fresh=(await connection.next(m=>m.type==='snapshot'&&m.room.members.length===2)).room as RoomView;
  assert.ok(fresh.members.some(member=>member.id===player.user.id));
  assert.ok(fresh.members.some(member=>member.id===host.user.id));
  const version=fresh.version;
  connection.send({type:'sync'});
  assert.equal((await connection.next(m=>m.type==='snapshot')).room.version,version);
});

test('host leaves and remaining player takes ownership; last departure closes room', async t => {
  const { app, guest, create, connect, store } = await fixture(t);
  const host = await guest(), player = await guest(); const room = await create(host.cookie);
  await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...headers, cookie: player.cookie }, payload: { key: room.code } });
  const a = await connect(host.cookie, room.id), b = await connect(player.cookie, room.id);
  const current = (await b.next(m => m.type === 'snapshot')).room;
  a.send({ type: 'leaveRoom', commandId: randomUUID(), expectedVersion: current.version, payload: {} });
  await a.next(m => m.type === 'left');
  const remaining = (await b.next(m => m.type === 'snapshot' && m.room.hostId === player.user.id)).room;
  b.send({ type: 'leaveRoom', commandId: randomUUID(), expectedVersion: remaining.version, payload: {} });
  await b.next(m => m.type === 'left'); assert.equal(await store.snapshot(room.id), null);
});

test('WebSocket upgrade requires membership and allowed origin', async t => {
  const { app, guest, create } = await fixture(t);
  const owner = await guest(), other = await guest(); const room = await create(owner.cookie);
  await assert.rejects(app.injectWS(`/api/rooms/${room.id}/socket`, { socket: localSocket(), headers: { cookie: other.cookie, origin } }));
  await assert.rejects(app.injectWS(`/api/rooms/${room.id}/socket`, { socket: localSocket(), headers: { cookie: owner.cookie, origin: 'https://evil.example' } }));
});

test('host can kick another member in waiting room, closing their socket and freeing their seat', async t => {
  const { app, guest, create, connect } = await fixture(t);
  const host = await guest('房主'), player = await guest('卡死玩家'), replacement = await guest('替补玩家');
  const room = await create(host.cookie);
  await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...headers, cookie: player.cookie }, payload: { key: room.code } });
  const a = await connect(host.cookie, room.id), b = await connect(player.cookie, room.id);
  const current = (await b.next(m => m.type === 'snapshot')).room as RoomView;
  // Non-host cannot kick
  b.send({ type: 'kickMember', commandId: randomUUID(), expectedVersion: current.version, payload: { userId: host.user.id } });
  assert.equal((await b.next(m => m.type === 'commandResult')).error, 'FORBIDDEN');
  // Host cannot kick self
  a.send({ type: 'kickMember', commandId: randomUUID(), expectedVersion: current.version, payload: { userId: host.user.id } });
  assert.equal((await a.next(m => m.type === 'commandResult')).error, 'INVALID_TARGET');
  // Host kicks player
  a.send({ type: 'kickMember', commandId: randomUUID(), expectedVersion: current.version, payload: { userId: player.user.id } });
  assert.equal((await a.next(m => m.type === 'commandResult')).ok, true);
  await b.next(m => m.type === 'left');
  const afterKick = (await a.next(m => m.type === 'snapshot' && m.room.members.length === 1)).room as RoomView;
  assert.equal(afterKick.members.length, 1);
  // Replacement player can now join and take seat 2
  const joined = await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...headers, cookie: replacement.cookie }, payload: { key: room.code } });
  assert.equal(joined.statusCode, 200);
  assert.equal(joined.json().room.members.find((m: { id: string }) => m.id === replacement.user.id).seat, 2);
});

test('host can directly shrink room player count after member leaves, auto-compacting overflow seats', async t => {
  const { store, guest, create } = await fixture(t);
  const host = await guest('房主');
  const room = await create(host.cookie);
  const snap0 = (await store.snapshot(room.id))!;
  await store.execute(host.user.id, room.id, { expectedVersion: snap0.version, type: 'updateSettings', commandId: randomUUID(), payload: { ...snap0.settings, playerCount: 11 } });

  const players = [];
  for (let i = 2; i <= 11; i++) {
    const p = await guest(`玩家${i}`);
    players.push(p);
    await store.join(p.user, room.code);
  }
  let snap = (await store.snapshot(room.id))!;
  assert.equal(snap.members.length, 11);

  // Trying to shrink to 10 when 11 players are present throws SEATS_OCCUPIED
  await assert.rejects(
    store.execute(host.user.id, room.id, { expectedVersion: snap.version, type: 'updateSettings', commandId: randomUUID(), payload: { ...snap.settings, playerCount: 10 } }),
    { code: 'SEATS_OCCUPIED' }
  );

  // Player at seat 4 leaves
  const leaver = players[2];
  snap = (await store.snapshot(room.id))!;
  await store.execute(leaver.user.id, room.id, { expectedVersion: snap.version, type: 'leaveRoom', commandId: randomUUID(), payload: {} });

  snap = (await store.snapshot(room.id))!;
  assert.equal(snap.members.length, 10);
  const player11 = players[9];
  assert.equal(snap.members.find(m => m.id === player11.user.id)?.seat, 11);

  // Host shrinks room to 10 players!
  await store.execute(host.user.id, room.id, { expectedVersion: snap.version, type: 'updateSettings', commandId: randomUUID(), payload: { ...snap.settings, playerCount: 10 } });

  const updatedSnap = (await store.snapshot(room.id))!;
  assert.equal(updatedSnap.settings.playerCount, 10);
  assert.equal(updatedSnap.members.length, 10);
  assert.equal(updatedSnap.members.find(m => m.id === player11.user.id)?.seat, 4);
  assert.ok(updatedSnap.members.every(m => m.seat >= 1 && m.seat <= 10));
});

test('host can toggle autoRevealRoleEnabled in room settings', async t => {
  const { app, guest, create, store } = await fixture(t);
  const host = await guest();
  const room = await create(host.cookie);
  const initial = (await store.snapshot(room.id))!;
  assert.equal(initial.settings.autoRevealRoleEnabled, false);

  await store.execute(host.user.id, room.id, {
    expectedVersion: initial.version,
    type: 'updateSettings',
    commandId: randomUUID(),
    payload: { ...initial.settings, autoRevealRoleEnabled: true },
  });

  const updated = (await store.snapshot(room.id))!;
  assert.equal(updated.settings.autoRevealRoleEnabled, true);
});

