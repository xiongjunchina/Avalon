import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WebHandoffGate } from '../src/WebHandoffGate';
import { readWebHandoff, exchangeWebHandoff } from '../src/web-handoff';
import { RoomVoiceHint } from '../src/RoomVoiceHint';
import type { api } from '../src/api';

const ticket = 'a'.repeat(43);

test('personal handoff strips the credential while preserving the deployment path and ordinary navigation', () => {
  assert.deepEqual(readWebHandoff(`https://game.example/avalon/?from=wechat#avalon-handoff=${ticket}&section=rules`), {
    ticket, cleanUrl: '/avalon/?from=wechat#section=rules',
  });
  assert.deepEqual(readWebHandoff(`https://game.example/#avalon-handoff=${ticket}`), { ticket, cleanUrl: '/' });
});

test('ordinary old and new invitation, admin and guide links do not change the login flow', () => {
  for (const path of ['/?invite=old-room', '/avalon/?invite=new-room', '/avalon/admin', '/avalon/#admin', '/avalon/#rules']) {
    assert.equal(readWebHandoff(`https://game.example${path}`), null);
  }
});

test('malformed or duplicate handoff credentials are still scrubbed and cannot be exchanged', () => {
  for (const hash of ['avalon-handoff=', 'avalon-handoff=short', `avalon-handoff=${ticket}&avalon-handoff=${ticket}`, `avalon-handoff=${'a'.repeat(44)}`, 'avalon-handoff=%3Cscript%3E']) {
    assert.deepEqual(readWebHandoff(`https://game.example/avalon/#${hash}`), { ticket: null, cleanUrl: '/avalon/' });
  }
});

test('opening a handoff renders only a confirmation and never starts the normal game subtree', () => {
  let mounted = 0;
  function Game() { mounted++; return createElement('p', null, 'game-mounted'); }
  const html = renderToStaticMarkup(createElement(WebHandoffGate, {
    intent: { ticket, cleanUrl: '/avalon/' }, children: createElement(Game),
  }));
  assert.equal(mounted, 0);
  assert.match(html, /确认使用我的小游戏账号/);
  assert.match(html, /取消，继续使用当前网页身份/);
  assert.match(html, /仅打开此页面不会切换账号/);
  assert.doesNotMatch(html, new RegExp(ticket));
  assert.doesNotMatch(html, /game-mounted/);
});

test('ordinary web visits mount the existing app directly; invalid handoffs keep a working cancel action', () => {
  const ordinary = renderToStaticMarkup(createElement(WebHandoffGate, { intent: null, children: 'ordinary-game' }));
  assert.equal(ordinary, 'ordinary-game');
  const invalid = renderToStaticMarkup(createElement(WebHandoffGate, {
    intent: { ticket: null, cleanUrl: '/avalon/' }, children: 'ordinary-game',
  }));
  assert.match(invalid, /链接无效/);
  assert.match(invalid, /disabled=""[^>]*>确认使用我的小游戏账号/);
  assert.match(invalid, /class="secondary">取消/);
  assert.doesNotMatch(invalid, /ordinary-game/);
});

test('confirmation exchanges only the short-lived ticket in a POST body and preserves returned identity', async () => {
  const expected = { user: { id: 'same-id', nickname: '原账号', playerCode: '123456' }, roomId: 'same-room' };
  const request = (async (path: string, body?: unknown) => {
    assert.equal(path, '/sessions/web-handoff/exchange');
    assert.deepEqual(body, { ticket });
    return expected;
  }) as typeof api;
  assert.deepEqual(await exchangeWebHandoff(ticket, request), expected);
  await assert.rejects(exchangeWebHandoff(ticket, (async () => { throw Error('HANDOFF_EXPIRED'); }) as typeof api), /HANDOFF_EXPIRED/);
});

test('room guidance supports twelve players without claiming cross-client voice or requiring a microphone', () => {
  const voice = renderToStaticMarkup(createElement(RoomVoiceHint, { enabled: true }));
  const regular = renderToStaticMarkup(createElement(RoomVoiceHint, { enabled: false }));
  assert.match(voice, /5–12 人/);
  assert.match(voice, /请全员使用网页版/);
  assert.match(voice, /小游戏当前不接入此语音/);
  assert.match(regular, /不启用内置语音/);
  assert.match(regular, /网页与小游戏可同房/);
});
