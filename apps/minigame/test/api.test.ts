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
  const api = new MiniGameApi(platform, 'https://avalon.example:8443');
  const login = await api.login();
  assert.equal(login.user.id, 'u1');
  assert.deepEqual(calls[0].data, { code: 'wechat-code' });
  assert.equal(stored.get('avalon_minigame_session'), 'session-token');
  await api.request('/sessions/refresh', {}, 'POST');
  assert.equal(calls[1].header?.Authorization, 'Bearer session-token');
});

test('request rejects after timeout when wx never responds', async () => {
  const platform = { get: () => undefined, request: () => {} } as unknown as WechatPlatform;
  const api = new MiniGameApi(platform, 'https://avalon.example:8443', { timeoutMs: 15 });
  await assert.rejects(api.request('/health'), /NETWORK_TIMEOUT/);
});
