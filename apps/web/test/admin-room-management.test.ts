import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type DedicatedRoom } from '@avalon/contracts';
import { adminRoomPhaseLabel, closeDedicatedRoomSession } from '../src/admin-room-state';
import { DedicatedRoomCard } from '../src/SpecialAdmin';
import { describe } from '../src/api';

const dedicated: DedicatedRoom = {
  id: 'dedicated-config-id', code: '999999', name: '固定测试专属房',
  managerId: 'manager-id', managerName: '测试房主', managerCode: '123456',
  settings: { ...defaultSettings, playerCount: 12 }, hasPassword: true,
  activeRoomId: 'actual-session-room-id', activePhase: 'finished',
};

test('dedicated room card distinguishes waiting, playing and completed sessions with a close action', () => {
  for (const phase of ['waiting', 'playing', 'finished'] as const) {
    const html = renderToStaticMarkup(createElement(DedicatedRoomCard, {
      room: { ...dedicated, activePhase: phase }, busy: false, onEdit() {}, onEnd() {},
    }));
    assert.ok(html.includes(adminRoomPhaseLabel(phase)), phase);
    assert.match(html, /<button[^>]*disabled=""[^>]*>修改配置与密码<\/button>/);
    assert.match(html, /<button[^>]*class="admin-action-btn danger"[^>]*>结束本次房间<\/button>/);
    assert.doesNotMatch(html, /已开桌/);
    if (phase === 'finished') assert.match(html, /房主可返回等待区续局/);
  }
  assert.equal(adminRoomPhaseLabel('finished'), '已结束 · 待续局');
  assert.equal(adminRoomPhaseLabel(undefined), '状态待刷新');
});

test('idle dedicated rooms can be edited and have no current-session close button', () => {
  const html = renderToStaticMarkup(createElement(DedicatedRoomCard, {
    room: { ...dedicated, activeRoomId: undefined, activePhase: undefined }, busy: false, onEdit() {}, onEnd() {},
  }));
  assert.match(html, /待开桌/);
  assert.doesNotMatch(html, /disabled=|结束本次房间/);
});

test('confirmed closing targets only the active room and explicitly preserves the dedicated configuration', async () => {
  const requests: Array<{path:string;body:object}> = [];
  let prompt = '';
  assert.equal(await closeDedicatedRoomSession(dedicated, async (path, body) => { requests.push({path,body}); }, text => { prompt=text;return true; }), true);
  assert.deepEqual(requests, [{path:'/rooms/actual-session-room-id/kill',body:{}}]);
  assert.match(prompt, /999999/);
  assert.match(prompt, /专属房号、配置、密码与历史对局均保留/);
  assert.match(prompt, /本局已结束，此操作仅释放本次房间占用/);
  assert.equal(dedicated.id, 'dedicated-config-id');
  let playingPrompt = '';
  await closeDedicatedRoomSession({ ...dedicated, activePhase: 'playing' }, async () => {}, text => { playingPrompt = text; return false; });
  assert.match(playingPrompt, /当前对局仍在进行，继续将中止本局/);
});

test('cancellation or a room without a live session performs no management request', async () => {
  let requests = 0, confirmations = 0;
  const request = async () => { requests++; };
  assert.equal(await closeDedicatedRoomSession(dedicated, request, () => { confirmations++;return false; }), false);
  assert.equal(await closeDedicatedRoomSession({ ...dedicated, activeRoomId: undefined }, request, () => { confirmations++;return true; }), false);
  assert.equal(requests, 0);
  assert.equal(confirmations, 1);
});

test('failed close stays a failure and completed-game entry explains the two recovery paths', async () => {
  await assert.rejects(closeDedicatedRoomSession(dedicated, async () => { throw new Error('NETWORK_FAILED'); }, () => true), /NETWORK_FAILED/);
  const message = describe(new Error('GAME_FINISHED'));
  assert.match(message, /本局已结束/);
  assert.match(message, /房主返回等待区/);
  assert.match(message, /管理员结束本次房间后重新开桌/);
  assert.doesNotMatch(message, /本局已开始/);
});
