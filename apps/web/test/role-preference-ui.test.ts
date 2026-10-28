import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings } from '@avalon/contracts';
import { RolePreferenceModal } from '../src/RolePreferenceModal';
import { settingsText } from '../src/PresetsPanel';
import { GuideRules } from '../src/GuidePanel';

test('RolePreferenceModal: renders available roles according to player count and shows existing preferences', () => {
  // Test 6-player mode: contains Merlin, Percival, Loyal, Morgana, Assassin; excludes Mordred & Oberon
  const html6 = renderToStaticMarkup(
    createElement(RolePreferenceModal, {
      open: true,
      onClose: () => {},
      currentPreferences: ['merlin', 'percival'],
      playerCount: 6,
      onSave: async () => {},
    })
  );

  assert.match(html6, /心仪选角 · 偏好匹配/);
  assert.match(html6, /第一志愿/);
  assert.match(html6, /第二志愿/);
  assert.match(html6, /第三志愿/);
  assert.match(html6, /确认出战偏好 \(2\/3\)/);

  // Selected roles appear in slot section
  assert.match(html6, /孙悟空/);
  assert.match(html6, /唐三藏/);

  // 6-player pool has Morgana (六耳猕猴) and Assassin (红孩儿)
  assert.match(html6, /六耳猕猴/);
  assert.match(html6, /红孩儿/);

  // But NOT 8-player Mordred (黄眉老怪) or 7-player Oberon (牛魔王)
  assert.ok(!html6.includes('黄眉老怪'));
  assert.ok(!html6.includes('牛魔王'));

  // Test 8-player mode: contains Mordred (黄眉老怪)
  const html8 = renderToStaticMarkup(
    createElement(RolePreferenceModal, {
      open: true,
      onClose: () => {},
      currentPreferences: [],
      playerCount: 8,
      onSave: async () => {},
    })
  );
  assert.match(html8, /黄眉老怪/);
  assert.ok(!html8.includes('牛魔王')); // Oberon is in 7 or 10, not 8
});

test('locked role preferences explain the restriction and still allow closing the dialog', () => {
  const html = renderToStaticMarkup(createElement(RolePreferenceModal, {
    open: true, onClose: () => {}, currentPreferences: ['merlin'], playerCount: 6,
    disabled: true, disabledReason: '本局已开始，不能再修改心仪角色。', onSave: async () => {},
  }));
  assert.match(html, /role="status">本局已开始，不能再修改心仪角色。/);
  assert.match(html, /class="role-pref-submit-btn" disabled=""/);
  assert.match(html, /class="role-pref-cancel-btn">取消/);
  assert.equal(renderToStaticMarkup(createElement(RolePreferenceModal, {
    open: false, onClose: () => {}, currentPreferences: [], playerCount: 6, onSave: async () => {},
  })), '');
});

test('settingsText: displays 心仪选角 when rolePreferenceEnabled is true', () => {
  const textOff = settingsText({ ...defaultSettings, rolePreferenceEnabled: false });
  assert.ok(!textOff.includes('心仪选角'));

  const textOn = settingsText({ ...defaultSettings, rolePreferenceEnabled: true });
  assert.match(textOn, /心仪选角/);
});

test('preference dialog and rules explain weighted chances without promising priority assignment', () => {
  const modal = renderToStaticMarkup(createElement(RolePreferenceModal, {
    open: true, onClose: () => {}, currentPreferences: [], playerCount: 8, onSave: async () => {},
  }));
  const guide = renderToStaticMarkup(createElement(GuideRules));
  for (const html of [modal, guide]) {
    assert.match(html, /8 \/ 4 \/ 2 \/ 1/);
    assert.match(html, /近期重复角色会降低权重/);
    assert.match(html, /不保证命中/);
    assert.match(html, /不向其他玩家公开/);
    assert.doesNotMatch(html, /排位靠前优先满足|优先逐个满足|已被抢占|王者荣耀/);
  }
});
