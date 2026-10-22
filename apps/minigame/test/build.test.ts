import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildMiniGame } from '../scripts/build.mjs';
import { layoutWebScreen } from '../src/ui/web-layout.js';
import { entryScreen } from '../src/screens/entry.js';

test('builds an importable project without server or admin secrets', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir, appId: 'wx1111111111111111' });
  const entries = await readdir(outDir);
  for (const name of ['game.js', 'game.json', 'project.config.json', 'art']) assert.ok(entries.includes(name), name);
  const config = JSON.parse(await readFile(join(outDir, 'project.config.json'), 'utf8'));
  assert.equal(config.appid, 'wx1111111111111111');
  const bundle = await readFile(join(outDir, 'bundle.js'), 'utf8');
  assert.doesNotMatch(bundle, /WECHAT_MINIGAME_APP_SECRET|ADMIN_KEY|server-only-secret/);
  const art = await readdir(join(outDir, 'art'));
  assert.ok(art.includes('moonlit.png'));
  assert.ok((await readdir(join(outDir, 'art', 'roles'))).includes('merlin-160.webp'));
});

test('default build uses the registered Mini Game AppID rather than tourist mode', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-appid-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir });
  const config = JSON.parse(await readFile(join(outDir, 'project.config.json'), 'utf8'));
  assert.equal(config.appid, 'wxdb4e422c14adab3f');
  assert.equal(config.compileType, 'game');
  assert.equal(config.setting.urlCheck, true);
});

test('build embeds the configured HTTPS API origin only', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-origin-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir, appId: 'wx1111111111111111', apiBaseUrl: 'https://avalon.example:8443' });
  assert.match(await readFile(join(outDir, 'bundle.js'), 'utf8'), /https:\/\/avalon\.example:8443/);
  await assert.rejects(buildMiniGame({ outDir, appId: 'wx1111111111111111', apiBaseUrl: 'http://avalon.example' }), /INVALID_API_ORIGIN/);
  await assert.rejects(buildMiniGame({ outDir, appId: 'touristappid' }), /INVALID_MINIGAME_APP_ID/);
});

test('rejects a package that exceeds its declared limit', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-small-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await assert.rejects(buildMiniGame({ outDir, appId: 'wx1111111111111111', maxBytes: 10 }), /PACKAGE_TOO_LARGE/);
});

test('built bundle starts with only WeChat Mini Game APIs available', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-runtime-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir });
  const calls: string[] = [];
  const labels: string[] = [];
  let touchStart: ((event: any) => void) | undefined;
  let touchEnd: ((event: any) => void) | undefined;
  const ctx = new Proxy({}, { get: (_target, name) => name === 'createLinearGradient'
    ? () => ({ addColorStop() {} })
    : name === 'measureText' ? (value: string) => ({ width: value.length * 12 })
      : (...args: unknown[]) => { calls.push(String(name)); if (name === 'fillText') labels.push(String(args[0])); } });
  const wx = {
    createCanvas: () => ({ width: 390, height: 844, getContext: () => ctx }),
    getSystemInfoSync: () => ({ screenWidth: 390, screenHeight: 844, pixelRatio: 2, safeArea: { top: 44, bottom: 810 } }),
    getStorageSync: () => undefined,
    onShow() {}, onHide() {}, onTouchStart(callback: typeof touchStart) { touchStart = callback; },
    onTouchEnd(callback: typeof touchEnd) { touchEnd = callback; }, onShareAppMessage() {},
  };
  const bundle = await readFile(join(outDir, 'bundle.js'), 'utf8');
  assert.doesNotThrow(() => runInNewContext(bundle, { wx, console, setTimeout, clearTimeout, crypto: globalThis.crypto }));
  assert.ok(calls.includes('fillText'));
  assert.ok(labels.some(label => label.includes('幻境单人试玩')));
  const button = layoutWebScreen(entryScreen(), { width: 390, height: 844, top: 44, bottom: 34 }).nodes.find(node => node.id === 'practice')!;
  touchStart?.({ touches: [{ clientX: button.x + 10, clientY: button.y + 15 }] });
  touchEnd?.({ changedTouches: [{ clientX: button.x + 10, clientY: button.y + 15 }] });
  assert.ok(labels.some(label => label.includes('幻境演练')));
});
