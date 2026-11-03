import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WechatContentSafetyProvider } from '../src/content-safety-provider.js';

const config = { appId: 'wx-test', appSecret: 'server-only-secret' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const token = () => json({ access_token: 'cached-token', expires_in: 7_200 });
const decision = (suggest: string = 'pass') => json({ errcode: 0, trace_id: 'trace-1', result: { suggest } });
type Call = { url: URL; body: Record<string, unknown>; init: RequestInit };
function fixture(reply: (call: Call) => Response | Promise<Response> = () => decision()) {
  const calls: Call[] = [];
  const fetcher = (async (input, init) => {
    const call = { url: new URL(String(input)), body: JSON.parse(String(init?.body)), init: init! };
    calls.push(call);
    return call.url.pathname === '/cgi-bin/stable_token' ? token() : reply(call);
  }) as typeof fetch;
  return { provider: new WechatContentSafetyProvider(config, fetcher), calls, fetcher };
}

test('uses game v2 text scenes, verified caller identity, and stable server-only tokens', async () => {
  const { provider, calls } = fixture();
  assert.deepEqual(await provider.checkText('仙友甲', 1, 'actor-openid'), {
    decision: 'pass', traceId: 'trace-1', provider: 'wechat-minigame-v2',
  });
  await provider.checkText('请大家发言', 5, 'actor-openid');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url.href, 'https://api.weixin.qq.com/cgi-bin/stable_token');
  assert.deepEqual(calls[0].body, { grant_type: 'client_credential', appid: config.appId,
    secret: config.appSecret, force_refresh: false });
  assert.deepEqual(calls[1].body, { content: '仙友甲', scene: 1, version: 2, openid: 'actor-openid' });
  assert.equal(calls[2].body.scene, 5);
  assert.equal(calls[1].url.pathname, '/wxa/game/content_spam/msg_sec_check');
  assert.equal(calls[1].url.searchParams.get('access_token'), 'cached-token');
  for (const call of calls) {
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.method, 'POST');
    assert.ok(call.init.signal instanceof AbortSignal);
  }
});

test('uses the synchronous game image check on the supplied controlled upload URL', async () => {
  const { provider, calls } = fixture();
  await provider.checkImage('https://game.example/avalon/api/content-assets/opaque-token', 'actor-openid');
  assert.equal(calls[1].url.pathname, '/wxa/game/content_spam/media_check_sync');
  assert.deepEqual(calls[1].body, { media_url: 'https://game.example/avalon/api/content-assets/opaque-token',
    media_type: 2, scene: 1, version: 2, openid: 'actor-openid' });
});

test('preserves risky and review decisions instead of interpreting errcode zero as approval', async () => {
  for (const suggest of ['risky', 'review'] as const) {
    const { provider } = fixture(() => decision(suggest));
    assert.equal((await provider.checkText('待检测', 5, 'actor')).decision, suggest);
    assert.equal((await provider.checkImage('https://game.example/avatar.png', 'actor')).decision, suggest);
  }
});

test('missing actor identity never calls WeChat or falls back to legacy v1', async () => {
  const { provider, calls } = fixture();
  for (const id of [undefined, '', '   ']) {
    await assert.rejects(provider.checkText('玩家', 1, id), /CONTENT_IDENTITY_REQUIRED/);
    await assert.rejects(provider.checkImage('https://game.example/a.png', id), /CONTENT_IDENTITY_REQUIRED/);
  }
  assert.equal(calls.length, 0);
});

test('invalid inputs and unavailable credentials do not reach the network', async () => {
  const { provider, calls, fetcher } = fixture();
  for (const content of ['', '   ', '字'.repeat(2_501)])
    await assert.rejects(provider.checkText(content, 1, 'actor'), /INVALID_INPUT/);
  for (const url of ['not-a-url', 'http://game.example/a.png', 'https://user:secret@game.example/a.png', 'https://game.example/a.png#fragment'])
    await assert.rejects(provider.checkImage(url, 'actor'), /INVALID_INPUT/);
  await assert.rejects(new WechatContentSafetyProvider({ appId: '', appSecret: '' }, fetcher).checkText('a', 1, 'actor'), /CONTENT_CHECK_UNAVAILABLE/);
  assert.equal(calls.length, 0);
});

test('simultaneous checks share one token acquisition', async () => {
  const { provider, calls } = fixture();
  await Promise.all(Array.from({ length: 10 }, () => provider.checkText('hello', 5, 'actor')));
  assert.equal(calls.filter(call => call.url.pathname === '/cgi-bin/stable_token').length, 1);
  assert.equal(calls.filter(call => call.url.pathname.endsWith('/msg_sec_check')).length, 10);
});

test('an invalid cached token refreshes once; successful token refresh never forces global invalidation', async () => {
  let tokenCalls = 0, checkCalls = 0;
  const seen: string[] = [];
  const fetcher = (async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/cgi-bin/stable_token') {
      assert.equal(JSON.parse(String(init?.body)).force_refresh, false);
      return json({ access_token: 'token-' + ++tokenCalls, expires_in: 7_200 });
    }
    seen.push(url.searchParams.get('access_token')!);
    return ++checkCalls === 1 ? json({ errcode: 40001, errmsg: 'bad token' }) : decision();
  }) as typeof fetch;
  const provider = new WechatContentSafetyProvider(config, fetcher);
  assert.equal((await provider.checkText('hello', 5, 'actor')).decision, 'pass');
  assert.equal(tokenCalls, 2);
  assert.deepEqual(seen, ['token-1', 'token-2']);
});

test('a repeated token error stops after one retry without exposing upstream error details', async () => {
  const { provider, calls } = fixture(() => json({ errcode: 42001, errmsg: 'secret-content cached-token' }));
  await assert.rejects(provider.checkText('hello', 5, 'actor'), error =>
    error instanceof Error && error.message === 'CONTENT_CHECK_UNAVAILABLE');
  assert.equal(calls.filter(call => call.url.pathname.endsWith('/msg_sec_check')).length, 2);
});

test('invalid actor identities require identity renewal and never become pass results', async () => {
  for (const errcode of [40003, 43104]) {
    const { provider } = fixture(() => json({ errcode }));
    await assert.rejects(provider.checkText('hello', 5, 'actor'), /CONTENT_IDENTITY_REQUIRED/);
  }
});

test('missing decisions, unknown values, authorization errors, malformed JSON, and HTTP failures fail closed', async () => {
  const replies = [
    () => json({ errcode: 0 }), () => json({ result: { suggest: 'pass' } }),
    () => decision('unknown'), () => json({ errcode: 750031 }),
    () => json({ errcode: 750033 }), () => new Response('bad JSON'),
    () => json({ errcode: 0, result: { suggest: 'pass' } }, 502),
  ];
  for (const reply of replies) {
    const { provider } = fixture(reply);
    await assert.rejects(provider.checkText('hello', 5, 'actor'), /CONTENT_CHECK_UNAVAILABLE/);
  }
});

test('failed token acquisition is not cached and network exceptions do not leak credentials', async () => {
  let calls = 0;
  const fetcher = (async input => {
    if (++calls === 1) throw new Error('secret=' + config.appSecret);
    return String(input).includes('stable_token') ? token() : decision();
  }) as typeof fetch;
  const provider = new WechatContentSafetyProvider(config, fetcher);
  await assert.rejects(provider.checkText('hello', 5, 'actor'), error =>
    error instanceof Error && error.message === 'CONTENT_CHECK_UNAVAILABLE');
  assert.equal((await provider.checkText('hello', 5, 'actor')).decision, 'pass');
});

test('one deadline bounds token acquisition and content checks even when a transport ignores abort', async () => {
  const keepAlive = setTimeout(() => undefined, 200);
  try {
    const never = (async () => new Promise<Response>(() => undefined)) as typeof fetch;
    const first = new WechatContentSafetyProvider({ ...config, timeoutMs: 15 }, never);
    await assert.rejects(first.checkText('hello', 5, 'actor'), /CONTENT_CHECK_UNAVAILABLE/);
    const fetcher = (async input => String(input).includes('stable_token') ? token() :
      new Promise<Response>(() => undefined)) as typeof fetch;
    const second = new WechatContentSafetyProvider({ ...config, timeoutMs: 15 }, fetcher);
    await assert.rejects(second.checkText('hello', 5, 'actor'), /CONTENT_CHECK_UNAVAILABLE/);
  } finally { clearTimeout(keepAlive); }
});
