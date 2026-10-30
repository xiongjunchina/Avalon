import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeWechatCode, loginWithWechatCode } from '../src/wechat-auth.js';

const config = { appId: 'wx-test-id', appSecret: 'server-only-secret' };

test('exchanges a one-time code for a server-verified WeChat identity', async () => {
  let called = '';
  const fetcher = (async (input: string | URL | Request) => {
    called = String(input);
    return new Response(JSON.stringify({ openid: 'verified-openid', unionid: 'union' }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await exchangeWechatCode('one-time-code', config, fetcher), { openid: 'verified-openid', unionid: 'union' });
  const url = new URL(called);
  assert.equal(url.hostname, 'api.weixin.qq.com');
  assert.equal(url.searchParams.get('js_code'), 'one-time-code');
  assert.equal(url.searchParams.get('appid'), config.appId);
});

test('rejects an invalid or reused code and an upstream failure', async () => {
  const invalid = (async () => new Response(JSON.stringify({ errcode: 40163, errmsg: 'code been used' }))) as typeof fetch;
  await assert.rejects(exchangeWechatCode('used', config, invalid), /WECHAT_CODE_INVALID/);
  const failed = (async () => new Response('bad gateway', { status: 502 })) as typeof fetch;
  await assert.rejects(exchangeWechatCode('code', config, failed), /WECHAT_UNAVAILABLE/);
});

test('never trusts a client-supplied OpenID when logging in', async () => {
  let seen: unknown;
  const login = async (identity: { openid: string; unionid?: string; nickname?: string }) => {
    seen = identity;
    return { user: { id: 'user' }, token: 'session-token' };
  };
  const fetcher = (async () => new Response(JSON.stringify({ openid: 'trusted-openid' }))) as typeof fetch;
  await assert.rejects(loginWithWechatCode({ code: 'code', openid: 'forged-openid' }, config, login, fetcher), /INVALID_INPUT/);
  assert.equal(seen, undefined);
  const result = await loginWithWechatCode({ code: 'code', nickname: '玩家' }, config, login, fetcher);
  assert.deepEqual(seen, { openid: 'trusted-openid', nickname: '玩家' });
  assert.equal(result.token, 'session-token');
});
test('normal login never forwards WeChat session_key into the account login callback',async()=>{
 const fetcher=(async()=>new Response(JSON.stringify({openid:'trusted',session_key:'never-export'}))) as typeof fetch;
 const result=await loginWithWechatCode({code:'code'},config,async identity=>identity,fetcher);
 assert.deepEqual(result,{openid:'trusted'});
});
