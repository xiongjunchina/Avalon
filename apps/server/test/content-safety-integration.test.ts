import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { Command, ServerMessage, User } from '@avalon/contracts';
import { buildApp } from '../src/app.js';
import { ContentSafety } from '../src/content-safety.js';
import { createContentSafety } from '../src/content-safety-config.js';
import type { ContentSafetyProvider, SafetyDecision } from '../src/content-safety-provider.js';
import { DEAL_MS, DomainError, digest } from '../src/store.js';
import { database, headers, localSocket, origin } from './helpers.js';

type Outcome = SafetyDecision['decision'] | 'error';
class ControlledProvider implements ContentSafetyProvider {
  mode: Outcome = 'pass';
  readonly textCalls: { content: string; scene: 1 | 5; openid?: string }[] = [];
  readonly imageCalls: { url: string; openid?: string }[] = [];
  imageOperation?: () => Promise<SafetyDecision>;
  constructor(readonly provider: string) {}
  private result(): SafetyDecision {
    if (this.mode === 'error') throw new DomainError('CONTENT_CHECK_UNAVAILABLE', 503);
    return { decision: this.mode, provider: this.provider, traceId: 'test-trace' };
  }
  async checkText(content: string, scene: 1 | 5, openid?: string) {
    this.textCalls.push({ content, scene, openid });
    return this.result();
  }
  async checkImage(url: string, openid?: string) {
    this.imageCalls.push({ url, openid });
    return this.imageOperation ? this.imageOperation() : this.result();
  }
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const avatar = 'data:image/png;base64,' + png.toString('base64');
const imageId = createHash('sha256').update(png).digest('hex');
const profile = (nickname: string, avatarUrl?: string) => ({ nickname, avatar: 'leaf' as const, ...(avatarUrl ? { avatarUrl } : {}) });
const cookie = (token: string) => ({ ...headers, cookie: `avalon_session=${token}` });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const expectedError = (mode: Outcome) => mode === 'error' ? 'CONTENT_CHECK_UNAVAILABLE' : mode === 'review' ? 'CONTENT_PENDING' : 'CONTENT_REJECTED';
function environment(t: TestContext, values: Record<string, string>) {
  const prior = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
}
async function fixture(t: TestContext) {
  const cleanups: (() => Promise<void>)[] = [];
  const db = await database({ after: fn => cleanups.push(fn) });
  const web = new ControlledProvider('test-web'), wechat = new ControlledProvider('test-wechat');
  const safety = new ContentSafety(db.pool, { enabled: true, origin: 'https://game.example', basePath: '/avalon/', web, wechat });
  const { app } = await buildApp({ store: db.store, origin, maintenanceMs: 600_000, contentSafety: safety });
  await app.ready();
  const sockets: { terminate(): void }[] = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    await app.close();
    for (const cleanup of cleanups) await cleanup();
  });
  const guest = async (nickname: string) => {
    const response = await app.inject({ method: 'POST', url: '/api/sessions/guest', headers, payload: { nickname, forceNew: true } });
    assert.equal(response.statusCode, 200, response.body);
    const token = response.cookies.find(item => item.name === 'avalon_session')!.value;
    return { token, user: response.json<{ user: User }>().user };
  };
  return { ...db, app, safety, web, wechat, guest, sockets };
}

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for the observed integration event');
}

test('Compose empty optional provider variables retain the default Aliyun endpoint and services', async t => {
  const db = await database(t);
  const services: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://green-cip.cn-shanghai.aliyuncs.com/');
    assert.equal(new Headers(options.headers).has('x-acs-security-token'), false);
    services.push(new URLSearchParams(String(options.body)).get('Service')!);
    return new Response(JSON.stringify({ Code: 200, RequestId: 'test-request', Data: { RiskLevel: 'none' } }));
  });
  const safety = createContentSafety(db.pool, 'https://game.example', {
    CONTENT_SAFETY_ENABLED: 'true', APP_BASE_PATH: '/avalon/', WECHAT_MINIGAME_APP_ID: 'wx-test',
    WECHAT_MINIGAME_APP_SECRET: 'test-only', ALIYUN_CONTENT_ACCESS_KEY_ID: 'testId', ALIYUN_CONTENT_ACCESS_KEY_SECRET: 'testSecret',
    ALIYUN_CONTENT_ENDPOINT: '', ALIYUN_CONTENT_REGION: '', ALIYUN_CONTENT_SECURITY_TOKEN: '',
    ALIYUN_CONTENT_NICKNAME_SERVICE: '', ALIYUN_CONTENT_CHAT_SERVICE: '', ALIYUN_CONTENT_IMAGE_SERVICE: '',
  });
  await safety.initialize();
  await safety.text('默认配置验收', 'profile');
  await safety.text('默认配置聊天验收', 'chat');
  await safety.avatar(avatar);
  assert.deepEqual(services, ['nickname_detection_pro', 'comment_detection_pro', 'profilePhotoCheck']);
});

test('web registration gates nicknames before inserting users, for rejection, review and unavailable checks', async t => {
  const f = await fixture(t);
  for (const mode of ['risky', 'review', 'error'] as const) {
    f.web.mode = mode;
    const response = await f.app.inject({ method: 'POST', url: '/api/sessions/guest', headers,
      payload: { nickname: `注册-${mode}`, forceNew: true } });
    assert.equal(response.statusCode, mode === 'error' ? 503 : 422);
    assert.equal(response.json().error, expectedError(mode));
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0);
  }
  assert.equal(f.wechat.textCalls.length, 0);
  f.web.mode = 'pass';
  const person = await f.guest('正常仙友');
  assert.equal(person.user.nickname, '正常仙友');
  assert.equal(f.web.textCalls.at(-1)?.scene, 1);
  assert.equal(f.web.textCalls.at(-1)?.openid, undefined);
});

test('profile rejection preserves the old nickname and avatar in the database and response reads', async t => {
  const f = await fixture(t), person = await f.guest('原昵称');
  for (const mode of ['risky', 'review', 'error'] as const) {
    f.web.mode = mode;
    const response = await f.app.inject({ method: 'PATCH', url: '/api/me', headers: cookie(person.token),
      payload: profile(`修改-${mode}`) });
    assert.equal(response.json().error, expectedError(mode));
    const row = (await f.pool.query('SELECT nickname,avatar,avatar_url FROM users WHERE id=$1', [person.user.id])).rows[0];
    assert.deepEqual(row, { nickname: '原昵称', avatar: 'leaf', avatar_url: null });
    const me = await f.app.inject({ method: 'GET', url: '/api/me', headers: cookie(person.token) });
    assert.equal(me.json().user.nickname, '原昵称');
  }
});

test('a pending image is available only through its temporary checker URL, then becomes public after pass', async t => {
  const f = await fixture(t), person = await f.guest('头像验收');
  let complete!: (result: SafetyDecision) => void;
  f.web.imageOperation = () => new Promise(resolve => { complete = resolve; });
  const submitting = f.app.inject({ method: 'PATCH', url: '/api/me', headers: cookie(person.token),
    payload: profile(person.user.nickname, avatar) }).then(response => response);
  await until(() => f.web.imageCalls.length === 1 && Boolean(complete));
  const privatePath = new URL(f.web.imageCalls[0].url).pathname.replace(/^\/avalon/, '');
  assert.match(privatePath, /^\/api\/content-safety\/media\/[A-Za-z0-9_-]{43}$/);
  assert.equal((await f.app.inject({ method: 'GET', url: '/api/avatars/' + imageId })).statusCode, 404);
  const pending = await f.app.inject({ method: 'GET', url: privatePath });
  assert.equal(pending.statusCode, 200);
  assert.deepEqual(pending.rawPayload, png);
  assert.match(String(pending.headers['content-type']), /^image\/png/);
  assert.equal(pending.headers['cache-control'], 'no-store');
  assert.equal((await f.pool.query('SELECT avatar_url FROM users WHERE id=$1', [person.user.id])).rows[0].avatar_url, null);
  complete({ decision: 'pass', provider: 'test-web', traceId: 'approved-image' });
  const response = await submitting;
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().user.avatarUrl, 'https://game.example/avalon/api/avatars/' + imageId);
  assert.equal((await f.app.inject({ method: 'GET', url: privatePath })).statusCode, 404);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM content_safety_media_tickets')).rows[0].count, 0);
  const publicImage = await f.app.inject({ method: 'GET', url: '/api/avatars/' + imageId });
  assert.equal(publicImage.statusCode, 200);
  assert.deepEqual(publicImage.rawPayload, png);
});

for (const mode of ['risky', 'review', 'error'] as const) {
  test(`image ${mode} never exposes public bytes, replaces the profile, or leaves a live checker ticket`, async t => {
    const f = await fixture(t), person = await f.guest('头像保留');
    f.web.mode = mode;
    const response = await f.app.inject({ method: 'PATCH', url: '/api/me', headers: cookie(person.token),
      payload: profile(person.user.nickname, avatar) });
    assert.equal(response.json().error, expectedError(mode));
    assert.equal(f.web.imageCalls.length, 1);
    const privatePath = new URL(f.web.imageCalls[0].url).pathname.replace(/^\/avalon/, '');
    assert.equal((await f.app.inject({ method: 'GET', url: privatePath })).statusCode, 404);
    assert.equal((await f.app.inject({ method: 'GET', url: '/api/avatars/' + imageId })).statusCode, 404);
    const row = (await f.pool.query('SELECT avatar_url FROM users WHERE id=$1', [person.user.id])).rows[0];
    assert.equal(row.avatar_url, null);
    assert.equal((await f.pool.query('SELECT approved FROM content_safety_images WHERE id=$1', [imageId])).rows[0].approved, false);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM content_safety_media_tickets')).rows[0].count, 0);
    if (mode === 'error') {
      f.web.mode = 'pass';
      const retry = await f.app.inject({ method: 'PATCH', url: '/api/me', headers: cookie(person.token),
        payload: profile(person.user.nickname, avatar) });
      assert.equal(retry.statusCode, 200, retry.body);
      assert.equal(f.web.imageCalls.length, 2, 'provider errors must not poison the content cache');
    }
  });
}

test('blocked and unavailable private/room chat is neither stored nor broadcast, while approved chat still works', async t => {
  const f = await fixture(t), sender = await f.guest('发言者'), receiver = await f.guest('接收者');
  const room = await f.store.createRoom(sender.user);
  await f.store.join(receiver.user, room.code);
  const received: ServerMessage[] = [];
  const socket = await f.app.injectWS(`/api/rooms/${room.id}/socket`,
    { socket: localSocket(), headers: { origin, cookie: `avalon_session=${receiver.token}` } },
    { onInit: socket => socket.on('message', raw => received.push(JSON.parse(raw.toString()))) });
  f.sockets.push(socket);
  await until(() => received.some(message => message.type === 'snapshot'));
  const denied: string[] = [];
  for (const mode of ['risky', 'review', 'error'] as const) {
    f.web.mode = mode;
    for (const [path, prefix] of [[`/api/friends/${receiver.user.id}/chat`, '私聊'], [`/api/rooms/${room.id}/chat`, '房聊']] as const) {
      const text = `${prefix}-${mode}`; denied.push(text);
      const response = await f.app.inject({ method: 'POST', url: path, headers: cookie(sender.token), payload: { text } });
      assert.equal(response.json().error, expectedError(mode));
    }
  }
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM direct_messages')).rows[0].count, 0);
  f.web.mode = 'pass';
  for (const [path, text] of [[`/api/friends/${receiver.user.id}/chat`, '私聊已通过'], [`/api/rooms/${room.id}/chat`, '房聊已通过']] as const) {
    const response = await f.app.inject({ method: 'POST', url: path, headers: cookie(sender.token), payload: { text } });
    assert.equal(response.statusCode, 200, response.body);
  }
  await until(() => received.some(message => message.type === 'directChat' && message.text === '私聊已通过') &&
    received.some(message => message.type === 'roomChat' && message.text === '房聊已通过'));
  const chat = received.filter(message => message.type === 'directChat' || message.type === 'roomChat');
  assert.equal(chat.length, 2);
  for (const message of chat) assert.ok(!denied.includes(message.text));
  assert.deepEqual((await f.pool.query('SELECT message FROM direct_messages')).rows.map(row => row.message), ['私聊已通过']);
  assert.ok(f.web.textCalls.filter(call => call.content.includes('聊-')).every(call => call.scene === 5));
});

test('verified WeChat operator identity survives account switching and never changes to the target account OpenID', async t => {
  environment(t, { WECHAT_MINIGAME_APP_ID: 'wx-test-safety', WECHAT_MINIGAME_APP_SECRET: 'only-for-tests' });
  const f = await fixture(t);
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    assert.equal(new URL(String(input)).pathname, '/sns/jscode2session');
    return new Response(JSON.stringify({ openid: 'verified-operator' }));
  });
  const login = await f.app.inject({ method: 'POST', url: '/api/sessions/minigame',
    payload: { code: 'valid-once', nickname: '微信操作者' } });
  assert.equal(login.statusCode, 200, login.body);
  const { token } = login.json<{ token: string }>();
  assert.equal(f.wechat.textCalls[0].openid, 'verified-operator');
  assert.equal((await f.pool.query('SELECT wechat_actor_openid FROM sessions WHERE token_hash=$1', [digest(token)])).rows[0].wechat_actor_openid, 'verified-operator');
  const target = await f.store.loginWechat({ openid: 'different-account-owner', nickname: '另一个账号' });
  const switched = await f.app.inject({ method: 'POST', url: '/api/sessions/switch', headers: bearer(token),
    payload: { playerCode: target.user.playerCode } });
  assert.equal(switched.statusCode, 200, switched.body);
  const switchedToken = switched.json<{ token: string }>().token;
  assert.deepEqual(await f.safety.actor(switchedToken), { userId: target.user.id, openid: 'verified-operator' });
  const update = await f.app.inject({ method: 'PATCH', url: '/api/me', headers: bearer(switchedToken), payload: profile('切换后新昵称') });
  assert.equal(update.statusCode, 200, update.body);
  assert.equal(f.wechat.textCalls.at(-1)?.openid, 'verified-operator');
  assert.ok(f.wechat.textCalls.every(call => call.openid !== 'different-account-owner'));
  assert.equal((await f.pool.query('SELECT wechat_openid FROM users WHERE id=$1', [target.user.id])).rows[0].wechat_openid, 'different-account-owner');

  // A web recovery session has no right to borrow the recovered account's bound identity.
  const webSwitch = await f.app.inject({ method: 'POST', url: '/api/sessions/switch', headers,
    payload: { playerCode: target.user.playerCode } });
  const webToken = webSwitch.cookies.find(item => item.name === 'avalon_session')!.value;
  assert.deepEqual(await f.safety.actor(webToken), { userId: target.user.id });
  const webUpdate = await f.app.inject({ method: 'PATCH', url: '/api/me', headers: cookie(webToken), payload: profile('网页身份修改') });
  assert.equal(webUpdate.statusCode, 200, webUpdate.body);
  assert.equal(f.web.textCalls.at(-1)?.content, '网页身份修改');
  assert.equal(f.web.textCalls.at(-1)?.openid, undefined);

  await f.pool.query("UPDATE sessions SET wechat_actor_verified_at=now()-interval '3 hours' WHERE token_hash=$1", [digest(switchedToken)]);
  assert.deepEqual(await f.safety.actor(switchedToken), { userId: target.user.id });
});

test('legacy read sanitization leaves original profile, messages and finished game outcomes intact', async t => {
  const f = await fixture(t);
  // Seed pre-moderation records through storage to reproduce data from older releases.
  const people = await Promise.all(Array.from({ length: 5 }, (_, index) => f.store.createGuest(`旧昵称${index + 1}`)));
  await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [avatar, people[0].user.id]);
  await f.pool.query('INSERT INTO direct_messages(id,sender_id,receiver_id,message,created_at) VALUES($1,$2,$3,$4,now())',
    [randomUUID(), people[0].user.id, people[1].user.id, '旧私聊原文']);
  const room = await f.store.createRoom(people[0].user);
  for (const person of people.slice(1)) await f.store.join(person.user, room.code);
  const command = async (userId: string, type: Command['type'], payload: Command['payload'] = {}) => {
    const current = (await f.store.snapshot(room.id))!;
    await f.store.execute(userId, room.id, { commandId: randomUUID(), expectedVersion: current.version, type, payload } as Command);
  };
  await command(people[0].user.id, 'updateSettings', { ...room.settings, playerCount: 5 });
  for (const person of people) {
    await f.store.connect(person.user.id, room.id, randomUUID());
    await command(person.user.id, 'setReady', { ready: true });
  }
  await command(people[0].user.id, 'startGame');
  f.advance(DEAL_MS); await f.store.releaseDeal(room.id);
  const snapshot = await f.app.inject({ method: 'GET', url: `/api/rooms/${room.id}`, headers: cookie(people[0].token) });
  assert.equal(snapshot.statusCode, 200, snapshot.body);
  assert.doesNotMatch(snapshot.body, /旧昵称[1-5]|data:image/);
  await command(people[0].user.id, 'endGame');
  const game = (await f.pool.query('SELECT id,state FROM games WHERE room_id=$1', [room.id])).rows[0];
  const before = structuredClone(game.state);
  const me = await f.app.inject({ method: 'GET', url: '/api/me', headers: cookie(people[0].token) });
  // Only the owner retains their editable draft; shared room/replay fields stay sanitized.
  assert.equal(me.json().user.nickname, '旧昵称1');
  assert.equal(me.json().user.avatarUrl, avatar);
  const messages = await f.app.inject({ method: 'GET', url: `/api/friends/${people[1].user.id}/chat`, headers: cookie(people[0].token) });
  assert.equal(messages.json().messages[0].message, '[内容暂未通过审核]');
  const replay = await f.app.inject({ method: 'GET', url: `/api/games/${game.id}/replay`, headers: cookie(people[0].token) });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.deepEqual(replay.json().result, before.result);
  assert.deepEqual(replay.json().roles, before.roles);
  assert.deepEqual((await f.pool.query('SELECT state FROM games WHERE id=$1', [game.id])).rows[0].state, before);
  assert.deepEqual((await f.pool.query('SELECT nickname,avatar_url FROM users WHERE id=$1', [people[0].user.id])).rows[0],
    { nickname: '旧昵称1', avatar_url: avatar });
  assert.equal((await f.pool.query('SELECT message FROM direct_messages')).rows[0].message, '旧私聊原文');
});

test('only an administrator may resolve a pending review; approval permits an explicit retry without rechecking', async t => {
  environment(t, { ADMIN_KEY: 'content-safety-test-admin' });
  const f = await fixture(t), person = await f.guest('人工复核玩家');
  f.web.mode = 'review';
  const update = () => f.app.inject({ method: 'PATCH', url: '/api/me', headers: cookie(person.token), payload: profile('等待人工确认') });
  assert.equal((await update()).json().error, 'CONTENT_PENDING');
  assert.equal((await update()).json().error, 'CONTENT_PENDING');
  const adminHeaders = { ...headers, 'x-admin-key': 'content-safety-test-admin' };
  assert.equal((await f.app.inject({ method: 'GET', url: '/api/admin/content-safety/reviews' })).statusCode, 401);
  const list = await f.app.inject({ method: 'GET', url: '/api/admin/content-safety/reviews', headers: adminHeaders });
  const reviews = list.json<{ reviews: { id: string; content: string }[] }>().reviews;
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].content, '等待人工确认');
  const url = '/api/admin/content-safety/reviews/' + reviews[0].id;
  const payload = { decision: 'pass', note: '测试管理员确认内容正常' };
  assert.equal((await f.app.inject({ method: 'POST', url, headers: cookie(person.token), payload })).statusCode, 401);
  assert.equal((await f.app.inject({ method: 'POST', url, headers: adminHeaders, payload })).statusCode, 200);
  assert.equal((await f.pool.query('SELECT nickname FROM users WHERE id=$1', [person.user.id])).rows[0].nickname, '人工复核玩家');
  const checkedCount = f.web.textCalls.length;
  const retried = await update();
  assert.equal(retried.statusCode, 200, retried.body);
  assert.equal(retried.json().user.nickname, '等待人工确认');
  assert.equal(f.web.textCalls.length, checkedCount);
  assert.equal((await f.app.inject({ method: 'POST', url, headers: adminHeaders, payload })).statusCode, 404);
});

test('manual image approval keeps bytes private until the user retries applying the avatar', async t => {
  const f = await fixture(t), person = await f.guest('头像人工复核');
  f.web.mode = 'review';
  const update = () => f.app.inject({ method: 'PATCH', url: '/api/me', headers: cookie(person.token), payload: profile(person.user.nickname, avatar) });
  assert.equal((await update()).json().error, 'CONTENT_PENDING');
  const review = (await f.safety.reviews())[0];
  assert.equal(review.kind, 'image');
  await f.safety.resolveReview(review.id, 'pass', '测试确认头像正常');
  assert.equal((await f.app.inject({ method: 'GET', url: '/api/avatars/' + imageId })).statusCode, 404);
  const retried = await update();
  assert.equal(retried.statusCode, 200, retried.body);
  assert.equal(f.web.imageCalls.length, 1);
  assert.equal((await f.app.inject({ method: 'GET', url: '/api/avatars/' + imageId })).statusCode, 200);
});

test('both administrator announcement entries validate and check content before persistence', async t => {
  environment(t, { ADMIN_KEY: 'safety-announcement-test' });
  const f = await fixture(t);
  const adminHeaders = { ...headers, 'x-admin-key': 'safety-announcement-test' };
  const malformed = await f.app.inject({ method: 'POST', url: '/api/admin/settings', headers: adminHeaders,
    payload: { key: 'broadcast_announcement', value: { text: { invalid: true }, enabled: true } } });
  assert.equal(malformed.statusCode, 400);
  f.web.mode = 'risky';
  for (const [url, payload] of [
    ['/api/admin/settings', { key: 'broadcast_announcement', value: { text: '测试待拦截广播一', enabled: true } }],
    ['/api/admin/broadcast', { text: '测试待拦截广播二', enabled: true }],
  ] as const) {
    const response = await f.app.inject({ method: 'POST', url, headers: adminHeaders, payload });
    assert.equal(response.json().error, 'CONTENT_REJECTED');
  }
  const settings = await f.app.inject({ url: '/api/admin/settings', headers: adminHeaders });
  assert.equal(settings.statusCode, 200);
  assert.doesNotMatch(settings.body, /测试待拦截广播/);
});

test('release maintenance blocks player operations while the private checker can still read a pending image', async t => {
  environment(t, { CONTENT_SAFETY_MAINTENANCE: 'true' });
  const f = await fixture(t);
  const health = await f.app.inject({ url: '/api/health' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().contentSafetyEnabled, true);
  const register = await f.app.inject({ method: 'POST', url: '/api/sessions/guest', headers,
    payload: { nickname: '维护时禁止注册', forceNew: true } });
  assert.equal(register.statusCode, 503);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0);
  f.web.imageOperation = async () => {
    const path = new URL(f.web.imageCalls.at(-1)!.url).pathname.replace(/^\/avalon/, '');
    const image = await f.app.inject({ url: path });
    assert.equal(image.statusCode, 200);
    assert.deepEqual(image.rawPayload, png);
    return { decision: 'pass', provider: 'test-web' };
  };
  await f.safety.avatar(avatar);
  assert.equal((await f.app.inject({ url: '/api/avatars/' + imageId })).statusCode, 200);
});
