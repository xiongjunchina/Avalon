import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MiniGameApi } from '../src/net/api.js';
import type { WechatPlatform, WxRequestOptions } from '../src/platform/wechat.js';

test('wx.login creates and stores a bearer session used by refresh', async () => {
  const stored = new Map<string, unknown>();
  const calls: WxRequestOptions[] = [];
  const platform = {
    login: async () => 'wechat-code',
    get: (key: string) => stored.get(key),
    set: (key: string, value: unknown) => stored.set(key, value),
    remove: (key: string) => stored.delete(key),
    request: (options: WxRequestOptions) => {
      calls.push(options);
      options.success({ statusCode: 200, data: options.url.endsWith('/sessions/minigame')
        ? { user: { id: 'u1' }, token: 'session-token' } : { user: { id: 'u1' } } });
    },
  } as unknown as WechatPlatform;
  const api = new MiniGameApi(platform, 'https://game.example/avalon/');
  const login = await api.login();
  assert.equal(login.user.id, 'u1');
  assert.deepEqual(calls[0].data, { code: 'wechat-code' });
  assert.equal(calls[0].url, 'https://game.example/avalon/api/sessions/minigame');
  assert.equal(stored.get('avalon_minigame_session'), 'session-token');
  await api.request('/sessions/refresh', {}, 'POST');
  assert.equal(calls[1].header?.Authorization, 'Bearer session-token');
  assert.equal(calls[1].url, 'https://game.example/avalon/api/sessions/refresh');
});

test('request rejects after timeout when wx never responds', async () => {
  const platform = { get: () => undefined, request: () => {} } as unknown as WechatPlatform;
  const api = new MiniGameApi(platform, 'https://avalon.example:8443', { timeoutMs: 15 });
  await assert.rejects(api.request('/health'), /NETWORK_TIMEOUT/);
});

test('logout revokes the current server session and clears local storage', async () => {
  const stored = new Map<string, unknown>([['avalon_minigame_session', 'session-token']]);
  const calls: WxRequestOptions[] = [];
  const platform = {
    get: (key: string) => stored.get(key), remove: (key: string) => stored.delete(key),
    request: (options: WxRequestOptions) => { calls.push(options); options.success({ statusCode: 200, data: { ok: true } }); },
  } as unknown as WechatPlatform;
  const api = new MiniGameApi(platform, 'https://avalon.example:8443');
  await api.logout();
  assert.equal(calls[0]?.method, 'DELETE');
  assert.equal(calls[0]?.header?.Authorization, 'Bearer session-token');
  assert.equal(stored.has('avalon_minigame_session'), false);
});

test('account switch replaces the mini-game bearer token', async () => {
  const stored = new Map<string, unknown>([['avalon_minigame_session', 'old-token']]);
  const platform = {
    get: (key: string) => stored.get(key), set: (key: string, value: unknown) => stored.set(key, value),
    request: (options: WxRequestOptions) => { assert.deepEqual(options.data,{playerCode:'123456',expectedUserId:'new-user'});options.success({ statusCode: 200, data: { user: { id: 'new-user' }, token: 'new-token' } }); },
  } as unknown as WechatPlatform;
  const api = new MiniGameApi(platform, 'https://avalon.example:8443');
  assert.equal((await api.switchAccount('123456','new-user')).id, 'new-user');
  assert.equal(stored.get('avalon_minigame_session'), 'new-token');
});
