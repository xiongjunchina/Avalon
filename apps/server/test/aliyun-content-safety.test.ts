import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AliyunContentSafetyProvider, signAliyunRequest, type AliyunSafetyConfig } from '../src/aliyun-content-safety.js';

const config: AliyunSafetyConfig = { accessKeyId: 'testAccessKeyId', accessKeySecret: 'test-only-secret' };
const response = (level = 'none', extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  Code: 200, RequestId: 'request-123', Data: { RiskLevel: level, Result: [] }, ...extra,
}));
type Call = { url: URL; init: RequestInit; headers: Headers; body: URLSearchParams; parameters: Record<string, unknown> };
function fixture(reply: (call: Call) => Response | Promise<Response> = () => response(), overrides: Partial<AliyunSafetyConfig> = {}) {
  const calls: Call[] = [];
  const fetcher = (async (input, init) => {
    const body = new URLSearchParams(String(init?.body));
    const call = { url: new URL(String(input)), init: init!, headers: new Headers(init?.headers),
      body, parameters: JSON.parse(body.get('ServiceParameters')!) };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
  return { provider: new AliyunContentSafetyProvider({ ...config, ...overrides }, fetcher), calls, fetcher };
}

test('ACS3 signer matches the published Alibaba Cloud known-answer vector', () => {
  // Official verification example, not an expected value computed by our implementation:
  // https://help.aliyun.com/en/sdk/product-overview/v3-request-structure-and-signature
  const signed = signAliyunRequest({
    url: new URL('https://ecs.cn-shanghai.aliyuncs.com/?RegionId=cn-shanghai&ImageId=win2019_1809_x64_dtc_zh-cn_40G_alibase_20230811.vhd'),
    method: 'POST', body: '', accessKeyId: 'YourAccessKeyId', accessKeySecret: 'YourAccessKeySecret',
    headers: { 'x-acs-action': 'RunInstances', 'x-acs-version': '2014-05-26',
      'x-acs-date': '2023-10-26T10:22:32Z', 'x-acs-signature-nonce': '3156853299f313e23d1673dc12e1703d' },
  });
  assert.equal(signed.authorization, 'ACS3-HMAC-SHA256 Credential=YourAccessKeyId,SignedHeaders=host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version,Signature=06563a9e1b43f5dfe96b81484da74bceab24a1d853912eee15083a6f0f3283c0');
});

test('uses official RPC form encoding and nickname/public-chat services without requiring OpenID', async () => {
  const { provider, calls } = fixture();
  assert.deepEqual(await provider.checkText('仙友甲', 1), { decision: 'pass', traceId: 'request-123', provider: 'aliyun-green-20220302' });
  await provider.checkText('消息 &= +% 中文 😀', 5, 'unused-openid');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.href, 'https://green-cip.cn-shanghai.aliyuncs.com/');
  assert.equal(calls[0].body.get('Service'), 'nickname_detection_pro');
  assert.equal(calls[1].body.get('Service'), 'comment_detection_pro');
  assert.deepEqual(calls[0].parameters, { content: '仙友甲' });
  assert.deepEqual(calls[1].parameters, { content: '消息 &= +% 中文 😀' });
  for (const call of calls) {
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.redirect, 'error');
    assert.ok(call.init.signal instanceof AbortSignal);
    assert.equal(call.headers.get('content-type'), 'application/x-www-form-urlencoded');
    assert.equal(call.headers.get('x-acs-action'), 'TextModerationPlus');
    assert.equal(call.headers.get('x-acs-version'), '2022-03-02');
    assert.match(call.headers.get('x-acs-date')!, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.equal(call.headers.get('x-acs-content-sha256'), createHash('sha256').update(String(call.init.body)).digest('hex'));
    assert.match(call.headers.get('authorization')!, /SignedHeaders=content-type;host;x-acs-action;x-acs-content-sha256;x-acs-date;x-acs-signature-nonce;x-acs-version,/);
    assert.equal(String(call.init.body).includes(config.accessKeySecret), false);
    assert.equal(call.url.href.includes(config.accessKeyId), false);
  }
  assert.notEqual(calls[0].headers.get('x-acs-signature-nonce'), calls[1].headers.get('x-acs-signature-nonce'));
});

test('image checks use profilePhotoCheck with the controlled immutable HTTPS URL', async () => {
  const { provider, calls } = fixture();
  await provider.checkImage('https://game.example/avalon/api/content-assets/token?version=1');
  assert.equal(calls[0].headers.get('x-acs-action'), 'ImageModeration');
  assert.equal(calls[0].body.get('Service'), 'profilePhotoCheck');
  assert.deepEqual(calls[0].parameters, { imageUrl: 'https://game.example/avalon/api/content-assets/token?version=1' });
});

test('only no-risk content passes; low and medium require review, and high is rejected', async () => {
  for (const [level, expected] of [['none', 'pass'], ['low', 'review'], ['medium', 'review'], ['high', 'risky']]) {
    const { provider } = fixture(() => response(level));
    assert.equal((await provider.checkText('待检测', 5)).decision, expected);
    assert.equal((await provider.checkImage('https://game.example/avatar.png')).decision, expected);
  }
});

test('contradictory detail risks and outstanding manual tasks never downgrade to pass', async () => {
  for (const [data, expected] of [
    [{ RiskLevel: 'none', Result: [{ RiskLevel: 'high' }] }, 'risky'],
    [{ RiskLevel: 'none', Result: [{ RiskLevel: 'low' }] }, 'review'],
    [{ RiskLevel: 'none', ManualTaskId: 'manual-task-1' }, 'review'],
  ] as const) {
    const { provider } = fixture(() => response('none', { Data: data }));
    assert.equal((await provider.checkText('待检测', 1)).decision, expected);
  }
});

test('STS token is signed and VPC endpoints can be selected only in the configured region', async () => {
  const { provider, calls } = fixture(() => response(), { securityToken: 'server-sts-token', regionId: 'cn-shenzhen',
    endpoint: 'https://green-cip-vpc.cn-shenzhen.aliyuncs.com/', chatService: 'chat_detection_pro' });
  await provider.checkText('你好', 5);
  assert.equal(calls[0].url.hostname, 'green-cip-vpc.cn-shenzhen.aliyuncs.com');
  assert.equal(calls[0].headers.get('x-acs-security-token'), 'server-sts-token');
  assert.match(calls[0].headers.get('authorization')!, /;x-acs-security-token;/);
  assert.equal(calls[0].body.get('Service'), 'chat_detection_pro');
});

test('missing credentials and invalid config fail before transmitting content or secrets', async () => {
  const invalid: Partial<AliyunSafetyConfig>[] = [
    { accessKeyId: '' }, { accessKeySecret: '' }, { accessKeyId: undefined }, { accessKeySecret: undefined },
    { accessKeyId: 'id\nheader' }, { accessKeySecret: 'secret\nheader' },
    { securityToken: '\nheader' }, { regionId: 'us-east-1' }, { endpoint: 'https://example.com' },
    { endpoint: 'https://green-cip.cn-shanghai.aliyuncs.com.evil.example' }, { endpoint: 'http://green-cip.cn-shanghai.aliyuncs.com' },
    { endpoint: 'https://user:pass@green-cip.cn-shanghai.aliyuncs.com' }, { endpoint: 'https://green-cip.cn-shanghai.aliyuncs.com/?secret=1' },
    { endpoint: 'https://green-cip.cn-shanghai.aliyuncs.com/path' }, { endpoint: 'https://green-cip.cn-beijing.aliyuncs.com' },
    { regionId: 'cn-chengdu', endpoint: 'https://green-cip-vpc.cn-chengdu.aliyuncs.com' },
    { nicknameService: 'text_aigc_detector' },
  ];
  for (const overrides of invalid) {
    const { provider, calls } = fixture(() => response(), overrides);
    await assert.rejects(provider.checkText('hello', 1), /CONTENT_CHECK_UNAVAILABLE/);
    assert.equal(calls.length, 0);
  }
});

test('invalid content and media URLs are rejected without a paid API request', async () => {
  const { provider, calls } = fixture();
  for (const content of ['', ' ', '字'.repeat(601)])
    await assert.rejects(provider.checkText(content, 1), /INVALID_INPUT/);
  for (const url of ['wrong', 'http://game.example/a.png', 'https://x:y@game.example/a.png', 'https://game.example/a.png#hash',
    'https://game.example/' + 'a'.repeat(2048)])
    await assert.rejects(provider.checkImage(url), /INVALID_INPUT/);
  assert.equal(calls.length, 0);
});

test('unknown and missing decisions, unsuccessful codes, malformed data, HTTP failures fail closed', async () => {
  const replies = [
    () => response('unknown'), () => response('NONE'), () => response('none', { Data: {} }),
    () => response('none', { Data: { RiskLevel: 'none', Result: [{ RiskLevel: 'unknown' }] } }),
    () => response('none', { Code: '200' }), () => response('none', { Code: 408 }), () => response('none', { Code: 588 }),
    () => response('none', { RequestId: undefined }), () => new Response('not-json'),
    () => new Response(JSON.stringify({ Code: 200, Data: { RiskLevel: 'none' } }), { status: 503 }),
  ];
  for (const reply of replies) {
    const { provider } = fixture(reply);
    await assert.rejects(provider.checkText('hello', 5), /CONTENT_CHECK_UNAVAILABLE/);
  }
});

test('network errors are sanitized and not retried because charged outcome may be unknown', async () => {
  let count = 0;
  const fetcher = (async () => { count++; throw new Error('credential=' + config.accessKeySecret); }) as typeof fetch;
  const provider = new AliyunContentSafetyProvider(config, fetcher);
  await assert.rejects(provider.checkText('private message', 5), error => error instanceof Error && error.message === 'CONTENT_CHECK_UNAVAILABLE');
  assert.equal(count, 1);
});

test('a single timeout covers a hanging transport and a stalled response body', async () => {
  let firstSignal: AbortSignal | null | undefined;
  const never = (async (_input, init) => { firstSignal = init?.signal; return new Promise<Response>(() => undefined); }) as typeof fetch;
  await assert.rejects(new AliyunContentSafetyProvider({ ...config, timeoutMs: 15 }, never).checkText('hello', 5), /CONTENT_CHECK_UNAVAILABLE/);
  assert.equal(firstSignal?.aborted, true);
  const stalled = (async () => new Response(new ReadableStream({ start() {} }))) as typeof fetch;
  await assert.rejects(new AliyunContentSafetyProvider({ ...config, timeoutMs: 15 }, stalled).checkImage('https://game.example/a.png'), /CONTENT_CHECK_UNAVAILABLE/);
});

test('oversized upstream response is refused instead of buffering arbitrary content', async () => {
  const { provider } = fixture(() => new Response('a'.repeat(262_145)));
  await assert.rejects(provider.checkText('hello', 5), /CONTENT_CHECK_UNAVAILABLE/);
});
