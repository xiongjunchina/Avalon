import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WechatPlatform } from '../src/platform/wechat.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';
import { entryScreen } from '../src/screens/entry.js';

test('top controls avoid the native WeChat capsule below the status bar', () => {
  const runtime = { getSystemInfoSync: () => ({ screenWidth: 390, screenHeight: 844, pixelRatio: 3, safeArea: { top: 47, bottom: 810 } }), getMenuButtonBoundingClientRect: () => ({ top: 51, bottom: 83 }) };
  const viewport = new WechatPlatform(runtime as any).viewport();
  const model = entryScreen({ id: 'self', nickname: '行者' } as any);
  const layout = layoutWebScreen(model, viewport);
  assert.ok(layout.nodes.filter(n => n.fixed).every(n => n.y >= 91));
  assert.equal(viewport.bottom, 34);
});

test('missing or unusable capsule geometry retains a conservative top reserve', () => {
  for (const capsule of [undefined, () => ({bottom: 0}), () => { throw new Error('unavailable'); }]) {
    const runtime = { getSystemInfoSync: () => ({screenWidth:390,screenHeight:844,pixelRatio:3,safeArea:{top:47,bottom:810}}), getMenuButtonBoundingClientRect:capsule };
    assert.equal(new WechatPlatform(runtime as any).viewport().top, 91);
  }
});
