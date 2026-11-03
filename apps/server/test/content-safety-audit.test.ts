import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Command } from '@avalon/contracts';
import { ContentSafety } from '../src/content-safety.js';
import { auditLegacy } from '../src/content-safety-audit.js';
import type { ContentSafetyProvider, SafetyDecision } from '../src/content-safety-provider.js';
import { DEAL_MS, DomainError } from '../src/store.js';
import { database } from './helpers.js';

type Outcome = SafetyDecision['decision'] | 'error';
class AuditProvider implements ContentSafetyProvider {
  mode: Outcome = 'pass';
  readonly textCalls: { content: string; scene: 1 | 5; openid?: string }[] = [];
  readonly imageCalls: { url: string; openid?: string }[] = [];
  outcomes = new Map<string, Outcome>();
  beforeImage?: () => Promise<void>;
  private result(outcome = this.mode): SafetyDecision {
    if (outcome === 'error') throw new DomainError('CONTENT_CHECK_UNAVAILABLE', 503);
    return { decision: outcome, provider: 'audit-test', traceId: 'audit-test-trace' };
  }
  async checkText(content: string, scene: 1 | 5, openid?: string) {
    this.textCalls.push({ content, scene, openid });
    return this.result(this.outcomes.get(content));
  }
  async checkImage(url: string, openid?: string) {
    this.imageCalls.push({ url, openid });
    await this.beforeImage?.();
    return this.result();
  }
}

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const builtin = '/art/avatars/wx-2.webp?v=artifact1';
async function fixture(t: TestContext) {
  const db = await database(t), provider = new AuditProvider(), wechat = new AuditProvider();
  const safety = new ContentSafety(db.pool, {
    enabled: true, origin: 'https://game.example', basePath: '/avalon/', web: provider, wechat,
  });
  await safety.initialize();
  return { ...db, safety, provider, wechat };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function finishedGame(f: Fixture) {
  const people = await Promise.all(Array.from({ length: 5 }, (_, i) => f.store.createGuest(`对局旧名${i + 1}`)));
  const room = await f.store.createRoom(people[0].user);
  const command = async (type: Command['type'], payload: Command['payload'] = {}, userId = people[0].user.id) => {
    const current = (await f.store.snapshot(room.id))!;
    await f.store.execute(userId, room.id, { commandId: randomUUID(), expectedVersion: current.version, type, payload } as Command);
  };
  await command('updateSettings', { ...room.settings, playerCount: 5 });
  for (const person of people.slice(1)) await f.store.join(person.user, room.code);
  for (const person of people) {
    await f.store.connect(person.user.id, room.id, randomUUID());
    await command('setReady', { ready: true }, person.user.id);
  }
  await command('startGame');
  f.advance(DEAL_MS);
  await f.store.releaseDeal(room.id);
  await command('endGame');
  const game = (await f.pool.query('SELECT id,state,ended_at FROM games WHERE room_id=$1', [room.id])).rows[0];
  return { people, room, game };
}

test('legacy audit restores approved names, private chat and announcements and migrates both user avatar fields without changing game history', async t => {
  const f = await fixture(t), { people, room, game } = await finishedGame(f);
  const owner = people[0].user.id, recipient = people[1].user.id;
  // Current names differ from immutable historical snapshots; both need approval.
  await f.pool.query('UPDATE users SET nickname=$1,avatar_url=$2,wechat_avatar_url=$2 WHERE id=$3', ['当前新名', image, owner]);
  await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [builtin, recipient]);
  await f.pool.query('INSERT INTO direct_messages(id,sender_id,receiver_id,message) VALUES($1,$2,$3,$4)',
    [randomUUID(), owner, recipient, '昨天的正常私聊']);
  await f.pool.query('INSERT INTO setting_presets(id,user_id,name,settings,updated_at) VALUES($1,$2,$3,$4,now())',
    [randomUUID(), owner, '好友聚会配置', room.settings]);
  await f.pool.query('INSERT INTO dedicated_rooms(id,code,name,manager_id,settings) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), '999999', '朋友常驻房间', owner, room.settings]);
  await f.pool.query('UPDATE system_settings SET value=$1 WHERE key=$2',
    [{ text: '欢迎仙友共同取经', enabled: true }, 'broadcast_announcement']);
  const originalGame = structuredClone(game.state);
  assert.equal(f.safety.sanitize({ nickname: '当前新名' }).nickname, '仙友（资料待审核）');

  const result = await auditLegacy(f.safety);
  assert.deepEqual({ rejected: result.rejected, pending: result.pending, errors: result.errors, avatarsUpdated: result.avatarsUpdated },
    { rejected: 0, pending: 0, errors: 0, avatarsUpdated: 2 });
  assert.ok(result.passed > 0);
  for (const content of ['当前新名', ...people.map(person => person.user.nickname), '好友聚会配置', '朋友常驻房间'])
    assert.ok(f.provider.textCalls.some(call => call.content === content && call.scene === 1), content);
  for (const content of ['昨天的正常私聊', '欢迎仙友共同取经'])
    assert.ok(f.provider.textCalls.some(call => call.content === content && call.scene === 5), content);
  assert.ok(f.provider.textCalls.every(call => call.openid === undefined));
  assert.ok(f.provider.imageCalls.every(call => call.openid === undefined));
  assert.equal(f.wechat.textCalls.length + f.wechat.imageCalls.length, 0, 'legacy authors must not borrow a bound WeChat identity');
  assert.equal(f.provider.imageCalls.length, 1, 'identical immutable bytes share approval');

  const user = (await f.pool.query('SELECT id,nickname,avatar_url,wechat_avatar_url FROM users WHERE id=$1', [owner])).rows[0];
  assert.equal(user.id, owner);
  assert.equal(user.nickname, '当前新名');
  assert.match(user.avatar_url, /^https:\/\/game\.example\/avalon\/api\/avatars\/[a-f0-9]{64}$/);
  assert.equal(user.wechat_avatar_url, user.avatar_url);
  assert.equal((await f.pool.query('SELECT avatar_url FROM users WHERE id=$1', [recipient])).rows[0].avatar_url, builtin);
  assert.equal((await f.pool.query('SELECT message FROM direct_messages')).rows[0].message, '昨天的正常私聊');
  const savedGame = (await f.pool.query('SELECT state,ended_at FROM games WHERE id=$1', [game.id])).rows[0];
  assert.deepEqual(savedGame.state, originalGame);
  assert.deepEqual(savedGame.ended_at, game.ended_at);
  assert.deepEqual(f.safety.sanitize(savedGame.state), originalGame, 'historical player names recover without replacing the game record');

  const cleanView = f.safety.sanitize({ nickname: user.nickname, avatarUrl: user.avatar_url, wechatAvatarUrl: user.wechat_avatar_url,
    messages: [{ senderId: owner, message: '昨天的正常私聊' }], broadcast: { text: '欢迎仙友共同取经', enabled: true } });
  assert.equal(cleanView.nickname, '当前新名');
  assert.equal(cleanView.avatarUrl, user.avatar_url);
  assert.equal(cleanView.messages[0].message, '昨天的正常私聊');
  assert.equal(cleanView.broadcast.text, '欢迎仙友共同取经');
  const restarted = new ContentSafety(f.pool, { enabled: true, origin: 'https://game.example', basePath: '/avalon/', web: f.provider });
  await restarted.initialize();
  assert.deepEqual(restarted.sanitize(cleanView), cleanView, 'approved content survives a service restart');
});

test('rejected and pending historical data stays stored and hidden while manual review retains its original text', async t => {
  const f = await fixture(t), { people, game } = await finishedGame(f);
  const owner = people[0].user.id, recipient = people[1].user.id;
  f.provider.outcomes.set(people[0].user.nickname, 'risky');
  f.provider.outcomes.set(people[1].user.nickname, 'review');
  f.provider.outcomes.set('拒绝的旧私聊', 'risky');
  f.provider.outcomes.set('待复核的旧私聊', 'review');
  // Avatars are separately pending, while all other unlisted text is allowed.
  f.provider.beforeImage = async () => { f.provider.mode = 'review'; };
  await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [image, owner]);
  for (const message of ['拒绝的旧私聊', '待复核的旧私聊'])
    await f.pool.query('INSERT INTO direct_messages(id,sender_id,receiver_id,message) VALUES($1,$2,$3,$4)', [randomUUID(), owner, recipient, message]);
  const beforeUsers = (await f.pool.query('SELECT id,nickname,avatar_url FROM users ORDER BY id')).rows;
  const beforeMessages = (await f.pool.query('SELECT id,message FROM direct_messages ORDER BY id')).rows;

  const result = await auditLegacy(f.safety);
  assert.equal(result.rejected, 2);
  assert.equal(result.pending, 3);
  assert.equal(result.errors, 0);
  assert.equal(result.avatarsUpdated, 0);
  assert.deepEqual((await f.pool.query('SELECT id,nickname,avatar_url FROM users ORDER BY id')).rows, beforeUsers);
  assert.deepEqual((await f.pool.query('SELECT id,message FROM direct_messages ORDER BY id')).rows, beforeMessages);
  assert.deepEqual((await f.pool.query('SELECT state FROM games WHERE id=$1', [game.id])).rows[0].state, game.state);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM content_safety_images WHERE approved')).rows[0].count, 0);
  const view = f.safety.sanitize({ nickname: people[0].user.nickname, avatarUrl: image,
    messages: beforeMessages.map(row => ({ ...row, senderId: owner })) });
  assert.equal(view.nickname, '仙友（资料待审核）');
  assert.equal(view.avatarUrl, undefined);
  assert.ok(view.messages.every(row => row.message === '[内容暂未通过审核]'));
  const reviews = await f.safety.reviews();
  assert.deepEqual(reviews.map(row => row.content).sort(), [people[1].user.nickname, '待复核的旧私聊', image].sort());
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 5);
});

test('provider failures are counted without destructive updates and a later audit can recover the same content', async t => {
  const f = await fixture(t), a = await f.store.createGuest('待重试仙友'), b = await f.store.createGuest('正常账号');
  await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [image, a.user.id]);
  await f.pool.query('INSERT INTO direct_messages(id,sender_id,receiver_id,message) VALUES($1,$2,$3,$4)',
    [randomUUID(), a.user.id, b.user.id, '可以重新审核的历史消息']);
  const before = (await f.pool.query('SELECT id,nickname,avatar_url FROM users ORDER BY id')).rows;
  f.provider.mode = 'error';
  const result = await auditLegacy(f.safety);
  assert.equal(result.errors, 4);
  assert.equal(result.passed + result.rejected + result.pending + result.avatarsUpdated, 0);
  assert.deepEqual((await f.pool.query('SELECT id,nickname,avatar_url FROM users ORDER BY id')).rows, before);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM direct_messages')).rows[0].count, 1);
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM content_safety_media_tickets')).rows[0].count, 0);
  assert.equal(f.safety.sanitize({ nickname: a.user.nickname }).nickname, '仙友（资料待审核）');
  f.provider.mode = 'pass';
  const retried = await auditLegacy(f.safety);
  assert.deepEqual(retried, { passed: 4, rejected: 0, pending: 0, errors: 0, avatarsUpdated: 1 });
  assert.equal(f.safety.sanitize({ nickname: a.user.nickname }).nickname, a.user.nickname);
  assert.equal(f.provider.imageCalls.length, 2);
});

test('an in-flight legacy avatar audit does not overwrite a newer user edit', async t => {
  const f = await fixture(t), person = await f.store.createGuest('同时编辑头像');
  await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [image, person.user.id]);
  f.provider.beforeImage = async () => {
    await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [builtin, person.user.id]);
  };
  const result = await auditLegacy(f.safety);
  assert.equal(result.errors, 0);
  assert.equal(result.avatarsUpdated, 0);
  assert.equal((await f.pool.query('SELECT avatar_url FROM users WHERE id=$1', [person.user.id])).rows[0].avatar_url, builtin);
});

test('legacy audit refuses to silently succeed while the moderation gate is disabled', async t => {
  const f = await fixture(t);
  const disabled = new ContentSafety(f.pool, { enabled: false, origin: 'https://game.example', basePath: '/avalon/', web: f.provider });
  await assert.rejects(auditLegacy(disabled), /CONTENT_SAFETY_ENABLED must be true/);
  assert.equal(f.provider.textCalls.length + f.provider.imageCalls.length, 0);
});

const rollbackBase = 'https://game.ccnepower.com/avalon';
const rollbackSource = readFileSync(new URL('../../../scripts/deploy/restore-content-safety-avatars.sql', import.meta.url), 'utf8');
async function restoreAvatars(f: Fixture) {
  // The only psql substitution is an SQL-quoted literal; execute the actual transaction on PostgreSQL.
  assert.equal(rollbackSource.split(":'public_base'").length, 2);
  const sql = rollbackSource.replace(":'public_base'", "'" + rollbackBase.replace(/'/g, "''") + "'");
  const client = await f.pool.connect();
  try { await client.query(sql); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

test('rollback restores both managed avatar fields losslessly as bounded newline-free PNG/JPEG/WebP data URLs', async t => {
  const f = await fixture(t), a = await f.store.createGuest('回滚头像甲'), b = await f.store.createGuest('回滚头像乙');
  const samples = [
    { mime: 'image/png', bytes: Buffer.from(image.split(',')[1], 'base64') },
    { mime: 'image/jpeg', bytes: Buffer.from('ffd8ffc0000b080001000101011100ffda0008010100003f0000ffd9', 'hex') },
    { mime: 'image/webp', bytes: Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64') },
    // Maximum accepted storage size exercises PostgreSQL's wrapped base64 output.
    { mime: 'image/jpeg', bytes: Buffer.alloc(49_134, 0x5a) },
  ].map(sample => ({ ...sample, id: createHash('sha256').update(sample.bytes).digest('hex') }));
  for (const sample of samples) await f.pool.query('INSERT INTO content_safety_images(id,mime,data,approved) VALUES($1,$2,$3,true)',
    [sample.id, sample.mime, sample.bytes]);
  const url = (index: number) => rollbackBase + '/api/avatars/' + samples[index].id;
  await f.pool.query('UPDATE users SET avatar_url=$1,wechat_avatar_url=$2 WHERE id=$3', [url(0), url(1), a.user.id]);
  await f.pool.query('UPDATE users SET avatar_url=$1,wechat_avatar_url=$2 WHERE id=$3', [url(2), url(3), b.user.id]);
  const originals = (await f.pool.query('SELECT id,nickname,player_code FROM users ORDER BY id')).rows;
  await restoreAvatars(f);
  assert.deepEqual((await f.pool.query('SELECT id,nickname,player_code FROM users ORDER BY id')).rows, originals);
  const rows = (await f.pool.query('SELECT id,avatar_url,wechat_avatar_url FROM users WHERE id=ANY($1)', [[a.user.id, b.user.id]])).rows;
  const first = rows.find(row => row.id === a.user.id)!, second = rows.find(row => row.id === b.user.id)!;
  for (const [value, sample] of [first.avatar_url, first.wechat_avatar_url, second.avatar_url, second.wechat_avatar_url].map((value, index) => [value as string, samples[index]] as const)) {
    assert.equal(value, `data:${sample.mime};base64,${sample.bytes.toString('base64')}`);
    assert.ok(value.length <= 65_536);
    assert.doesNotMatch(value, /[\r\n]/);
    assert.deepEqual(Buffer.from(value.split(',')[1], 'base64'), sample.bytes);
  }
  assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM content_safety_images WHERE approved')).rows[0].count, 4);
});

test('rollback leaves original avatar URLs, existing data URLs and another game origin untouched', async t => {
  const f = await fixture(t);
  const values = ['https://thirdwx.qlogo.cn/avatar/0', image, builtin,
    'https://different.example/avalon/api/avatars/' + 'a'.repeat(64)];
  const people = await Promise.all(values.map((_, index) => f.store.createGuest(`保留头像${index}`)));
  for (const [index, person] of people.entries()) await f.pool.query('UPDATE users SET avatar_url=$1,wechat_avatar_url=$1 WHERE id=$2', [values[index], person.user.id]);
  const before = (await f.pool.query('SELECT * FROM users ORDER BY id')).rows;
  await restoreAvatars(f);
  assert.deepEqual((await f.pool.query('SELECT * FROM users ORDER BY id')).rows, before);
});

test('rollback is a no-op when the content-safety image table was never created', async t => {
  const f = await fixture(t), person = await f.store.createGuest('迁移前账号');
  await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [image, person.user.id]);
  const before = (await f.pool.query('SELECT * FROM users ORDER BY id')).rows;
  // Drop only fixture-owned moderation tables to reproduce an atomic startup-migration failure.
  await f.pool.query('DROP TABLE content_safety_media_tickets');
  await f.pool.query('DROP TABLE content_safety_images');
  await restoreAvatars(f);
  assert.deepEqual((await f.pool.query('SELECT * FROM users ORDER BY id')).rows, before);
});

for (const variant of ['missing', 'pending'] as const) {
  test(`rollback rejects a ${variant} managed avatar without partially changing an approved avatar`, async t => {
    const f = await fixture(t), a = await f.store.createGuest('可还原头像'), b = await f.store.createGuest('未知头像');
    const bytes = Buffer.from(image.split(',')[1], 'base64'), id = createHash('sha256').update(bytes).digest('hex');
    await f.pool.query('INSERT INTO content_safety_images(id,mime,data,approved) VALUES($1,$2,$3,true)', [id, 'image/png', bytes]);
    const otherId = 'b'.repeat(64);
    if (variant === 'pending') await f.pool.query('INSERT INTO content_safety_images(id,mime,data,approved) VALUES($1,$2,$3,false)', [otherId, 'image/png', bytes]);
    await f.pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [rollbackBase + '/api/avatars/' + id, a.user.id]);
    await f.pool.query('UPDATE users SET wechat_avatar_url=$1 WHERE id=$2', [rollbackBase + '/api/avatars/' + otherId, b.user.id]);
    const before = (await f.pool.query('SELECT * FROM users ORDER BY id')).rows;
    await assert.rejects(restoreAvatars(f), /Managed avatar cannot be restored safely/);
    assert.deepEqual((await f.pool.query('SELECT * FROM users ORDER BY id')).rows, before);
  });
}
