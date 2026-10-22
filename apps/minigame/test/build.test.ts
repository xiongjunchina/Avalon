import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMiniGame } from '../scripts/build.mjs';

test('builds an importable project without server or admin secrets', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir, appId: 'wx-test-appid' });
  const entries = await readdir(outDir);
  for (const name of ['game.js', 'game.json', 'project.config.json', 'art']) assert.ok(entries.includes(name), name);
  const config = JSON.parse(await readFile(join(outDir, 'project.config.json'), 'utf8'));
  assert.equal(config.appid, 'wx-test-appid');
  const bundle = await readFile(join(outDir, 'bundle.js'), 'utf8');
  assert.doesNotMatch(bundle, /WECHAT_MINIGAME_APP_SECRET|ADMIN_KEY|server-only-secret/);
  const art = await readdir(join(outDir, 'art'));
  assert.ok(art.includes('moonlit.png'));
  assert.ok((await readdir(join(outDir, 'art', 'roles'))).includes('merlin-160.webp'));
});

test('build embeds the configured HTTPS API origin only', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-origin-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir, appId: 'wx-test-appid', apiBaseUrl: 'https://avalon.example:8443' });
  assert.match(await readFile(join(outDir, 'bundle.js'), 'utf8'), /https:\/\/avalon\.example:8443/);
  await assert.rejects(buildMiniGame({ outDir, appId: 'wx-test-appid', apiBaseUrl: 'http://avalon.example' }), /INVALID_API_ORIGIN/);
});

test('rejects a package that exceeds its declared limit', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-small-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await assert.rejects(buildMiniGame({ outDir, appId: 'wx-test-appid', maxBytes: 10 }), /PACKAGE_TOO_LARGE/);
});
