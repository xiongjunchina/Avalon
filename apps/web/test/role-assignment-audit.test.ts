import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type Replay } from '@avalon/contracts';
import { AdminRoleAssignmentAudit } from '../src/AdminRoleAssignmentAudit';
import { ReplayView } from '../src/AccountPanel';

const replay: Replay = {
  id: 'audit-game', rulesetVersion: 'standard-no-lancelot-v3',
  startedAt: '2026-10-27T10:00:00Z', endedAt: '2026-10-27T11:00:00Z',
  playerCount: 5, self: { nickname: '测试玩家', seat: 1, role: 'merlin', team: 'blue' },
  result: { winner: null, reason: 'unanimous_abort' }, favorite: false,
  settings: { ...defaultSettings, playerCount: 5 },
  players: [{ id: 'player-one', nickname: '测试玩家', seat: 1 }],
  roles: { 'player-one': 'merlin' }, rounds: [], inspections: [], earlyWindows: [],
  roleAssignmentAudit: {
    algorithmVersion: 'test-weighted-deal-v1', weightVersion: 'test-weights-v1',
    protectionLevel: 1, playerOrder: ['player-one'], roleOrder: ['percival', 'merlin', 'loyal'],
    players: {
      'player-one': {
        preferences: ['percival', 'merlin'], recentRoles: ['loyal', 'assassin'],
        weights: { merlin: 324, percival: 648, loyal: 27 },
        protections: { visionGuaranteed: true, blueGuaranteed: false, bossCooldown: true },
        assignedRole: 'merlin',
      },
    },
    draws: [{ userId: 'player-one', totalWeight: '12345678901234567890123', ticket: '9999999999999999999999' }],
  },
};

test('admin completed replay shows a collapsed, readable deal snapshot', () => {
  const html = renderToStaticMarkup(createElement(AdminRoleAssignmentAudit, { replay }));
  assert.match(html, /<details class="admin-deal-audit"><summary>发牌依据<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*\sopen/);
  for (const expected of ['test-weighted-deal-v1', 'test-weights-v1', '1 · 放宽特殊角色冷却',
    '1号 测试玩家', '最终：孙悟空', '1. 唐三藏 / 2. 孙悟空', '取经护法 → 红孩儿',
    '最近在前', '视野角色保护、特殊角色冷却', '孙悟空 324', '唐三藏 648', '取经护法 27', '角色区间顺序', '唐三藏 → 孙悟空 → 取经护法', '票值 9999999999999999999999', '区间总权重 12345678901234567890123']) {
    assert.ok(html.includes(expected), expected);
  }
  assert.doesNotMatch(html, /<h[12]|style=/);
});

test('old replays and active games never mount admin deal evidence', () => {
  assert.equal(renderToStaticMarkup(createElement(AdminRoleAssignmentAudit, {
    replay: { ...replay, roleAssignmentAudit: undefined },
  })), '');
  assert.equal(renderToStaticMarkup(createElement(AdminRoleAssignmentAudit, {
    replay: { ...replay, endedAt: '' },
  })), '');
});

test('older audit without role interval order remains readable without an empty label', () => {
  const html = renderToStaticMarkup(createElement(AdminRoleAssignmentAudit, {
    replay: { ...replay, roleAssignmentAudit: { ...replay.roleAssignmentAudit!, roleOrder: undefined } },
  }));
  assert.match(html, /发牌依据/);
  assert.doesNotMatch(html, /角色区间顺序/);
});

test('ordinary player ReplayView ignores audit data even if mistakenly supplied', () => {
  const html = renderToStaticMarkup(createElement(ReplayView, { replay }));
  assert.match(html, /逐轮记录/);
  assert.doesNotMatch(html, /发牌依据|test-weighted-deal-v1|test-weights-v1|心仪志愿|相对权重|最近在前|视野角色保护/);
});
