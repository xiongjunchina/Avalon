import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings } from '@avalon/contracts';
import { settingsText } from '../src/settings-summary';
import { GuideRules } from '../src/GuidePanel';

test('settingsText: does not display 心仪选角', () => {
  const textOff = settingsText({ ...defaultSettings, rolePreferenceEnabled: false });
  assert.ok(!textOff.includes('心仪选角'));
  const textOn = settingsText({ ...defaultSettings, rolePreferenceEnabled: true });
  assert.ok(!textOn.includes('心仪选角'));
});

test('rules and guide exclude role preference and guardian perk mentions', () => {
  const guide = renderToStaticMarkup(createElement(GuideRules));
  assert.doesNotMatch(guide, /心仪选角|8 \/ 4 \/ 2 \/ 1/);
  assert.doesNotMatch(guide, /护法天机|灵觉线索/);
});
