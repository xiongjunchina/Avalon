import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@avalon/contracts';
import { entryRoomKey, EntrySession } from '../src/entry-session';
import { knownAccountForNickname, type KnownAccount } from '../src/known-accounts';
import type { api } from '../src/api';

const user: User = { id: 'account-id', nickname: '陈欣', playerCode: '123456', avatar: 'leaf' };
const account: KnownAccount = { id: user.id, nickname: user.nickname, playerCode: user.playerCode!, lastSeen: 1 };
const requestUsing = (handler: (path: string, body?: unknown) => Promise<unknown>) => handler as typeof api;

test('simultaneous identity submissions share one registration and retain the invitation context', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  let finish!: (value: unknown) => void;
  const session = new EntrySession({
    request: requestUsing(async (path, body) => {
      calls.push({ path, body });
      return path === '/sessions/guest' ? new Promise(resolve => { finish = resolve; }) : { user, roomId: 'room-id' };
    }),
    knownAccounts: () => [], remember: () => {}, registrationId: () => 'registration-id',
  });
  const first = session.authenticate({ nickname: ' 陈欣 ', roomKey: 'private-invite' });
  const second = session.authenticate({ nickname: '陈欣', roomKey: 'private-invite' });
  assert.equal(first, second);
  assert.deepEqual(calls, [{ path: '/sessions/guest', body: {
    nickname: '陈欣', registrationId: 'registration-id', roomKey: 'private-invite',
  } }]);
  finish({ user });
  assert.deepEqual(await first, { user, roomId: 'room-id' });
  assert.equal(calls.filter(call => call.path === '/sessions/guest').length, 1);
});

test('an uncertain registration retries with the same id instead of requesting a second account', async () => {
  let ids = 0, attempts = 0;
  const bodies: unknown[] = [];
  const session = new EntrySession({
    request: requestUsing(async (path, body) => {
      if (path === '/sessions/guest') {
        bodies.push(body);
        if (++attempts === 1) throw Error('NETWORK');
        return { user };
      }
      return { user, roomId: null };
    }),
    knownAccounts: () => [], remember: () => {}, registrationId: () => `id-${++ids}`,
  });
  await assert.rejects(session.authenticate({ nickname: '陈欣' }), /NETWORK/);
  await session.authenticate({ nickname: '陈欣' });
  assert.equal(ids, 1);
  assert.deepEqual(bodies[0], bodies[1]);
});

test('a successful registration is saved before room lookup and restored after that lookup fails', async () => {
  const events: string[] = [];
  const calls: Array<{ path: string; body?: unknown }> = [];
  let roomLookups = 0;
  const session = new EntrySession({
    request: requestUsing(async (path, body) => {
      calls.push({ path, body }); events.push(path);
      if (path !== '/me') return { user };
      if (++roomLookups === 1) throw Error('NETWORK');
      return { user, roomId: 'old-seat' };
    }),
    // Simulate storage being unavailable: the in-memory POST result must still survive the retry.
    knownAccounts: () => [], remember: saved => { assert.equal(saved.id, user.id); events.push('remember'); },
    registrationId: () => 'registration-id',
  });
  await assert.rejects(session.authenticate({ nickname: '陈欣' }), /NETWORK/);
  assert.deepEqual(events, ['/sessions/guest', 'remember', '/me']);
  assert.equal((await session.authenticate({ nickname: '陈欣' })).roomId, 'old-seat');
  assert.deepEqual(calls[2], { path: '/sessions/switch', body: { playerCode: '123456', expectedUserId: user.id } });
  assert.equal(calls.filter(call => call.path === '/sessions/guest').length, 1);
});

test('typing a locally known nickname restores its exact stored identity without creating a guest', async () => {
  const calls: Array<{ path: string; body?: unknown }> = [];
  const session = new EntrySession({
    request: requestUsing(async (path, body) => {
      calls.push({ path, body }); return path === '/me' ? { user, roomId: 'old-seat' } : { user };
    }),
    knownAccounts: () => [account], remember: () => {}, registrationId: () => { throw Error('must not register'); },
  });
  await session.authenticate({ nickname: ' 陈欣 ' });
  assert.deepEqual(calls[0], { path: '/sessions/switch', body: { playerCode: '123456', expectedUserId: user.id } });
});

test('a changed or recycled saved code fails visibly instead of silently creating or taking over an account', async () => {
  const calls: string[] = [];
  const session = new EntrySession({
    request: requestUsing(async path => { calls.push(path); throw Error('ACCOUNT_CODE_CHANGED'); }),
    knownAccounts: () => [account], remember: () => { throw Error('must not save'); }, registrationId: () => 'id',
  });
  await assert.rejects(session.authenticate({ nickname: '陈欣' }), /ACCOUNT_CODE_CHANGED/);
  assert.deepEqual(calls, ['/sessions/switch']);
});

test('known nickname matching prefers the most recently used local identity and never matches another name', () => {
  const latest = { ...account, id: 'newer', lastSeen: 2, playerCode: '654321' };
  assert.equal(knownAccountForNickname([account, latest], '陈欣'), latest);
  assert.equal(knownAccountForNickname([account], '道友辉'), undefined);
});

test('six-digit room numbers cannot create a nickname or make any registration request',async()=>{
  const session=new EntrySession({
    request:requestUsing(async()=>{throw Error('must not send a request');}),knownAccounts:()=>[],remember:()=>{},registrationId:()=>{throw Error('must not create an id');},
  });
  for(const nickname of ['999999','１２３４５６',' 9 9 9 9 9 9 ']){
    await assert.rejects(session.authenticate({nickname,roomKey:'999999'}),/NICKNAME_LOOKS_LIKE_ROOM_CODE/);
  }
});

test('a saved legacy numeric nickname still restores its exact original account',async()=>{
  const numeric={...user,nickname:'999999'},known={...account,nickname:numeric.nickname};
  const calls:Array<{path:string;body?:unknown}>=[];
  const session=new EntrySession({request:requestUsing(async(path,body)=>{
    calls.push({path,body});return path==='/me'?{user:numeric,roomId:'old-room'}:{user:numeric};
  }),knownAccounts:()=>[known],remember:()=>{},registrationId:()=>{throw Error('must not register');}});
  await session.authenticate({nickname:'999999'});
  assert.deepEqual(calls[0],{path:'/sessions/switch',body:{playerCode:'123456',expectedUserId:user.id}});
});

test('room entry accepts a room number or extracts an invitation without confusing it with a player code',()=>{
  assert.equal(entryRoomKey(' 999999 '),'999999');
  assert.equal(entryRoomKey('９９９９９９'),'999999');
  assert.equal(entryRoomKey('https://game.example/?invite=private-token&from=wechat'),'private-token');
  for(const input of ['', '小陈', 'https://game.example/', 'javascript:alert(1)', '12345']){
    assert.throws(()=>entryRoomKey(input),/INVALID_ROOM_ENTRY/);
  }
});
