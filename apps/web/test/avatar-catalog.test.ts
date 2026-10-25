import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { avatarSchema, profileSchema } from '@avalon/contracts';
import { BUILTIN_AVATARS, builtinAvatarFor, findBuiltinAvatar } from '../src/avatar-catalog.js';
import { PlayerAvatar } from '../src/Heraldry.js';

test('all twelve artifact avatars exist and can be saved through the existing profile contract', () => {
  assert.equal(BUILTIN_AVATARS.length, 12);
  assert.equal(new Set(BUILTIN_AVATARS.map(item => item.src)).size, 12);
  for (const item of BUILTIN_AVATARS) {
    assert.ok(existsSync(new URL(`../public${item.src.split('?')[0]}`, import.meta.url)), item.name);
    assert.equal(profileSchema.parse({ nickname: '仙友', avatar: 'leaf', avatarUrl: item.src }).avatarUrl, item.src);
    assert.equal(findBuiltinAvatar(item.src.split('?')[0] + '?v=old')?.name, item.name);
  }
  assert.equal(findBuiltinAvatar('https://example.com/avatar.png'), undefined);
});

test('legacy symbols display compatible artifact artwork without changing stored avatar values', () => {
  for (const avatar of avatarSchema.options) {
    const html = renderToStaticMarkup(createElement(PlayerAvatar, { avatar }));
    assert.ok(html.includes(builtinAvatarFor(avatar).src));
    assert.doesNotMatch(html, /<svg/);
  }
});

test('custom and existing photo sources retain priority over built-in fallback artwork', () => {
  const photo = 'data:image/png;base64,AAAA';
  const preset = BUILTIN_AVATARS[11].src;
  const custom = renderToStaticMarkup(createElement(PlayerAvatar, { avatar: 'leaf', avatarUrl: photo, wechatAvatarUrl: preset }));
  assert.ok(custom.includes(photo));
  assert.ok(!custom.includes(preset));
  const existing = renderToStaticMarkup(createElement(PlayerAvatar, { avatar: 'leaf', wechatAvatarUrl: preset }));
  assert.ok(existing.includes(preset));
  const anonymous = renderToStaticMarkup(createElement(PlayerAvatar, { fallbackKind: 'cards' }));
  assert.match(anonymous, /<svg/);
  assert.doesNotMatch(anonymous, /<img/);
});
