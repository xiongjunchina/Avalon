import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {FriendSummary, ServerMessage, VoiceTokenResponse} from '@avalon/contracts';
import {gameFixture} from './game-helpers';
import {localSocket, origin} from './helpers';

test('voice token generation returns valid Agora config and deterministic rtcUid for room members', async t => {
  const f = await gameFixture(t);
  const user = f.people[0];

  const res = await f.app.inject({
    method: 'GET',
    url: `/api/rooms/${f.room.id}/voice-token`,
    headers: {cookie: `avalon_session=${user.token}`},
  });
  assert.equal(res.statusCode, 200);
  const data = res.json<VoiceTokenResponse>();
  assert.equal(data.appId, 'c07ff7d2dd764f5da6c86e914f8c0acc');
  assert.equal(data.channel, `avalon-${f.room.id}`);
  assert.ok(typeof data.token === 'string' && data.token.length > 20);
  assert.ok(data.uid > 0 && data.uid <= 2000000000);

  // Non-member access is forbidden
  const outsideUser = await f.store.createGuest('outsider');
  const forbiddenRes = await f.app.inject({
    method: 'GET',
    url: `/api/rooms/${f.room.id}/voice-token`,
    headers: {cookie: `avalon_session=${outsideUser.token}`},
  });
  assert.equal(forbiddenRes.statusCode, 403);
});

test('friends lifecycle: search by playerCode, request, list, accept, delete, and invite notification', async t => {
  const f = await gameFixture(t);
  const userA = f.people[0];
  const userB = f.people[1];

  // Fetch me to get userB's playerCode
  const meBRes = await f.app.inject({
    method: 'GET',
    url: '/api/me',
    headers: {cookie: `avalon_session=${userB.token}`},
  });
  const meB = meBRes.json<{user: {id: string; playerCode?: string}}>();
  assert.ok(meB.user.playerCode, 'userB should have a playerCode');

  // User A sends friend request to User B by playerCode
  const reqRes = await f.app.inject({
    method: 'POST',
    url: '/api/friends/request',
    headers: {cookie: `avalon_session=${userA.token}`, origin, 'x-avalon-request': '1'},
    payload: {query: meB.user.playerCode},
  });
  assert.equal(reqRes.statusCode, 200);
  const reqBody = reqRes.json<{success: boolean; status: string}>();
  assert.equal(reqBody.success, true);
  assert.equal(reqBody.status, 'pending');

  // User B lists friends, should see User A as incoming pending request
  const listBRes = await f.app.inject({
    method: 'GET',
    url: '/api/friends',
    headers: {cookie: `avalon_session=${userB.token}`},
  });
  assert.equal(listBRes.statusCode, 200);
  const friendsB = listBRes.json<{friends: FriendSummary[]}>().friends;
  const pendingA = friendsB.find(friend => friend.id === userA.user.id);
  assert.ok(pendingA, 'User B should see User A in friends list');
  assert.equal(pendingA?.status, 'pending');
  assert.equal(pendingA?.isSender, false);

  // User B accepts friend request
  const acceptRes = await f.app.inject({
    method: 'POST',
    url: `/api/friends/${userA.user.id}/accept`,
    headers: {cookie: `avalon_session=${userB.token}`, origin, 'x-avalon-request': '1'},
  });
  assert.equal(acceptRes.statusCode, 200);

  // Now both have accepted status
  const listARes = await f.app.inject({
    method: 'GET',
    url: '/api/friends',
    headers: {cookie: `avalon_session=${userA.token}`},
  });
  const friendsA = listARes.json<{friends: FriendSummary[]}>().friends;
  const acceptedB = friendsA.find(friend => friend.id === userB.user.id);
  assert.ok(acceptedB);
  assert.equal(acceptedB?.status, 'accepted');

  // WebSocket invite push test:
  // User B connects to a WebSocket
  const messagesB: ServerMessage[] = [];
  const wsB = await f.app.injectWS(
    `/api/rooms/${f.room.id}/socket`,
    {socket: localSocket(), headers: {origin, cookie: `avalon_session=${userB.token}`}},
    {onInit: s => s.on('message', raw => messagesB.push(JSON.parse(raw.toString())))}
  );
  t.after(async () => {
    wsB.terminate();
  });

  const until = async (check: () => boolean) => {
    for (let n = 0; n < 100; n++) {
      if (check()) return;
      await new Promise(r => setTimeout(r, 20));
    }
    assert.fail('timeout waiting for condition');
  };
  await until(() => messagesB.some(m => m.type === 'snapshot'));

  // User A sends invite to User B
  const inviteRes = await f.app.inject({
    method: 'POST',
    url: `/api/rooms/${f.room.id}/invite`,
    headers: {cookie: `avalon_session=${userA.token}`, origin, 'x-avalon-request': '1'},
    payload: {targetUserId: userB.user.id},
  });
  assert.equal(inviteRes.statusCode, 200);
  assert.deepEqual(inviteRes.json(), {sent: true, online: true});

  // Verify User B received roomInvitation message
  await until(() => messagesB.some(m => m.type === 'roomInvitation'));
  const invitation = messagesB.find(m => m.type === 'roomInvitation') as Extract<ServerMessage, {type: 'roomInvitation'}>;
  assert.equal(invitation.roomId, f.room.id);
  assert.equal(invitation.roomCode, f.room.code);
  assert.equal(invitation.fromUser.id, userA.user.id);

  // Delete friend
  const deleteRes = await f.app.inject({
    method: 'DELETE',
    url: `/api/friends/${userB.user.id}`,
    headers: {cookie: `avalon_session=${userA.token}`, origin, 'x-avalon-request': '1'},
  });
  assert.equal(deleteRes.statusCode, 200);

  const finalListRes = await f.app.inject({
    method: 'GET',
    url: '/api/friends',
    headers: {cookie: `avalon_session=${userA.token}`},
  });
  assert.equal(finalListRes.json<{friends: FriendSummary[]}>().friends.length, 0);
});
