import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAvatarInput, type AvatarInputOptions, type AvatarDownloadRequest, type AvatarDownloadResponse } from '../src/avatar-input.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const jpeg = Buffer.from('ffd8ffc0000b080001000101011100ffda0008010100003f0000ffd9', 'hex');
const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
const imageUrl = 'https://thirdwx.qlogo.cn/avatar/0';
const publicAddress = { address: '8.8.8.8', family: 4 };
const dataUrl = (bytes: Buffer, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`;
function response(data = png, mime = 'image/png', headers: Record<string, string> = {}): AvatarDownloadResponse {
  return { status: 200, headers: new Headers({ 'content-type': mime, ...headers }), body: (async function* () { yield data; })() };
}
function downloadOptions(overrides: Partial<AvatarInputOptions> = {}): AvatarInputOptions {
  return { lookup: async () => [publicAddress], fetcher: async () => response(), ...overrides };
}

test('accepts bounded base64 PNG, JPEG and WebP by their bytes and retains their MIME', async () => {
  for (const [mime, data] of [['image/png', png], ['image/jpeg', jpeg], ['image/webp', webp]] as const) {
    assert.deepEqual(await parseAvatarInput(dataUrl(data, mime)), { data, mime });
  }
});

test('rejects SVG, mismatched MIME, malformed/truncated image signatures and malformed base64', async () => {
  const malformedPng = Buffer.from(png); malformedPng[0] = 0;
  const oversizedDimensions = Buffer.from(png); oversizedDimensions.writeUInt32BE(100_000, 16);
  const malformedWebp = Buffer.from(webp); malformedWebp.writeUInt32LE(10, 4);
  for (const value of [
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', dataUrl(Buffer.from('<svg></svg>')),
    dataUrl(png, 'image/jpeg'), dataUrl(malformedPng), dataUrl(oversizedDimensions),
    dataUrl(png.subarray(0, -1)), dataUrl(jpeg.subarray(0, -1), 'image/jpeg'),
    dataUrl(malformedWebp, 'image/webp'), 'data:image/png;base64,AAAA',
    dataUrl(png).replace(/=$/, ''), dataUrl(png) + '\n',
  ]) await assert.rejects(parseAvatarInput(value), { message: 'INVALID_AVATAR' });
});

test('rejects over-limit data URLs before decoding or requesting anything', async () => {
  await assert.rejects(parseAvatarInput('data:image/png;base64,' + 'A'.repeat(65_536)), { message: 'INVALID_AVATAR' });
});

test('downloads only after checking every resolved address and passes the fixed address to transport', async () => {
  let called: AvatarDownloadRequest | undefined;
  const result = await parseAvatarInput(imageUrl, downloadOptions({ fetcher: async request => { called = request; return response(); } }));
  assert.equal(called?.url.hostname, 'thirdwx.qlogo.cn');
  assert.deepEqual(called?.address, publicAddress);
  assert.deepEqual(result, { data: png, mime: 'image/png' });
  assert.ok(dataUrl(result.data, result.mime).length <= 65_536);
  assert.ok(called?.signal.aborted, 'request resources close after successful consumption');
});

test('only HTTPS official WeChat avatar hosts are accepted, without credentials, fragments or custom ports', async () => {
  let lookupCalled = false;
  for (const value of [
    'http://thirdwx.qlogo.cn/avatar', 'https://thirdwx.qlogo.cn.evil.example/avatar',
    'https://evilqlogo.cn/avatar', 'https://user:pass@thirdwx.qlogo.cn/avatar',
    'https://thirdwx.qlogo.cn:444/avatar', 'https://thirdwx.qlogo.cn/avatar#fragment',
    'https://127.0.0.1/avatar', 'https://[::1]/avatar', 'https://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd', 'https://example.com/avatar.png',
  ]) await assert.rejects(parseAvatarInput(value, downloadOptions({ lookup: async () => { lookupCalled = true; return [publicAddress]; } })), { message: 'INVALID_AVATAR' });
  assert.equal(lookupCalled, false);
  await parseAvatarInput('https://wx.qpic.cn/avatar', downloadOptions());
});

test('rejects private, loopback, link-local, reserved, mapped and tunnel IPs, even beside a valid DNS answer', async () => {
  const blocked = [
    '0.0.0.0', '10.0.0.1', '100.100.100.200', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.19.0.1',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', 'fd00::1', 'fe80::1', 'ff02::1',
    '64:ff9b::a00:1', '2001::1', '2001:2::1', '2001:20::1', '2001:db8::1', '2002:7f00:1::', '3ffe::1', '3fff::1',
  ];
  let requests = 0;
  for (const address of blocked) {
    await assert.rejects(parseAvatarInput(imageUrl, downloadOptions({
      lookup: async () => [publicAddress, { address, family: address.includes(':') ? 6 : 4 }],
      fetcher: async () => { requests++; return response(); },
    })), { message: 'INVALID_AVATAR' }, address);
  }
  assert.equal(requests, 0);
  for (const address of ['1.1.1.1', '223.5.5.5', '2606:4700:4700::1111', '240e::1']) {
    await parseAvatarInput(imageUrl, downloadOptions({ lookup: async () => [{ address, family: address.includes(':') ? 6 : 4 }] }));
  }
});

test('rejects empty or inconsistent DNS answers and classifies resolution failures as unavailable', async () => {
  for (const answers of [[], [{ address: '8.8.8.8', family: 6 }], [{ address: 'bad-ip', family: 4 }]]) {
    await assert.rejects(parseAvatarInput(imageUrl, downloadOptions({ lookup: async () => answers })), { message: 'INVALID_AVATAR' });
  }
  await assert.rejects(parseAvatarInput(imageUrl, downloadOptions({ lookup: async () => { throw Error('ENOTFOUND'); } })), { message: 'CONTENT_CHECK_UNAVAILABLE' });
});

test('does not follow redirects even when the destination is another official avatar host', async () => {
  for (const location of ['https://127.0.0.1/internal', 'https://wx.qpic.cn/avatar']) {
    let calls = 0;
    await assert.rejects(parseAvatarInput(imageUrl, downloadOptions({ fetcher: async () => {
      calls++; return { ...response(), status: 302, headers: new Headers({ location }) };
    } })), { message: 'INVALID_AVATAR' });
    assert.equal(calls, 1);
  }
});

test('rejects declared or streamed oversized images, length mismatches, unsupported encoding and non-image responses', async () => {
  const cases = [
    response(png, 'image/png', { 'content-length': '49135' }),
    response(png, 'image/png', { 'content-length': 'NaN' }),
    response(png, 'image/png', { 'content-length': String(png.length - 1) }),
    response(Buffer.alloc(49_135), 'image/png'),
    response(png, 'text/html'), response(png, 'image/jpeg'),
    response(png, 'image/png', { 'content-encoding': 'gzip' }),
    { ...response(), body: (async function* () { yield Buffer.alloc(30_000); yield Buffer.alloc(30_000); })() },
  ];
  for (const value of cases) await assert.rejects(parseAvatarInput(imageUrl, downloadOptions({ fetcher: async () => value })), { message: 'INVALID_AVATAR' });
});

test('upstream failure reports unavailable without returning the raw network error', async () => {
  await assert.rejects(parseAvatarInput(imageUrl, downloadOptions({ fetcher: async () => { throw Error('secret internal connection info'); } })), { message: 'CONTENT_CHECK_UNAVAILABLE' });
  await assert.rejects(parseAvatarInput(imageUrl, downloadOptions({ fetcher: async () => ({ ...response(), status: 503 }) })), { message: 'CONTENT_CHECK_UNAVAILABLE' });
});

test('the five-second deadline covers a stalled lookup and stops subsequent requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveLookup: (records: { address: string; family: number }[]) => void;
  let requests = 0;
  const pending = parseAvatarInput(imageUrl, downloadOptions({
    lookup: () => new Promise(resolve => { resolveLookup = resolve; }),
    fetcher: async () => { requests++; return response(); },
  }));
  const rejection = assert.rejects(pending, { message: 'CONTENT_CHECK_UNAVAILABLE' });
  t.mock.timers.tick(5_000);
  await rejection;
  resolveLookup!([publicAddress]);
  await Promise.resolve();
  assert.equal(requests, 0);
});
