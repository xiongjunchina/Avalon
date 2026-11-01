import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameFixture } from './game-helpers.js';
import { headers } from './helpers.js';

function enableVoice(t: { after: (fn: () => void) => void }) {
  const values = {
    WECHAT_MINIGAME_VOICE_ENABLED: 'true',
    WECHAT_MINIGAME_APP_ID: 'wx-enabled-test',
    WECHAT_MINIGAME_APP_SECRET: 'test-only-secret',
  };
  const originals = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
}

test('enabled voice requires bearer and matching WeChat identity before signing; web voice stays available', async t => {
  enableVoice(t);
  const f = await gameFixture(t, false, { voiceChatEnabled: true });
  const member = f.people[0];
  const url = `/api/rooms/${f.room.id}/wechat-voice-ticket`;
  const auth = { authorization: `Bearer ${member.token}` };
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    exchanges++;
    return new Response(JSON.stringify({ openid: 'wechat-enabled-member', session_key: 'test-session-key' }));
  });
  const cookieOnly = await f.app.inject({ method: 'POST', url, headers: { ...headers, cookie: `avalon_session=${member.token}` }, payload: { code: 'test' } });
  assert.equal(cookieOnly.statusCode, 401);
  const unbound = await f.app.inject({ method: 'POST', url, headers: auth, payload: { code: 'test' } });
  assert.equal(unbound.statusCode, 403);
  assert.equal(unbound.json().error, 'WECHAT_VOICE_IDENTITY');
  assert.equal(exchanges, 0);
  await f.pool.query('UPDATE users SET wechat_openid=$1 WHERE id=$2', ['wechat-enabled-member', member.user.id]);
  const signed = await f.app.inject({ method: 'POST', url, headers: auth, payload: { code: 'test' } });
  assert.equal(signed.statusCode, 200);
  assert.equal(signed.headers['cache-control'], 'no-store');
  assert.match(signed.json().signature, /^[a-f0-9]{64}$/);
  assert.equal(signed.json().groupId, `avalon-${f.room.id}`);
  assert.doesNotMatch(signed.body, /test-session-key|test-only-secret/);
  assert.equal(exchanges, 1);
  const web = await f.app.inject({ method: 'GET', url: `/api/rooms/${f.room.id}/voice-token`, headers: { cookie: `avalon_session=${member.token}` } });
  assert.equal(web.statusCode, 200);
  assert.equal(web.json().channel, `avalon-${f.room.id}`);
  await f.command(member.user.id, 'startGame');
  await f.finishDeal();
  assert.equal((await f.state()).phase, 'playing');
});

test('enabled native voice rejects twelve-player voice but keeps web voice and twelve-player game', async t => {
  enableVoice(t);
  const f = await gameFixture(t, false, { playerCount: 12, voiceChatEnabled: true });
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', async () => { exchanges++; throw Error('must not exchange'); });
  const voice = await f.app.inject({ method: 'POST', url: `/api/rooms/${f.room.id}/wechat-voice-ticket`, headers: { authorization: `Bearer ${f.people[0].token}` }, payload: { code: 'test' } });
  assert.equal(voice.statusCode, 409);
  assert.equal(voice.json().error, 'WECHAT_VOICE_LIMIT');
  assert.equal(exchanges, 0);
  const web = await f.app.inject({ method: 'GET', url: `/api/rooms/${f.room.id}/voice-token`, headers: { cookie: `avalon_session=${f.people[0].token}` } });
  assert.equal(web.statusCode, 200);
  await f.command(f.people[0].user.id, 'startGame');
  await f.finishDeal();
  assert.equal((await f.state()).game!.players.length, 12);
  assert.equal((await f.state()).phase, 'playing');
});
