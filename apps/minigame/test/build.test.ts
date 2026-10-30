import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
  for(const dir of ['scenes','avatars','roles'])for(const name of await readdir('apps/minigame/assets/compatible/'+dir)){if(!name.endsWith('.jpg'))continue;assert.deepEqual(await readFile(join(outDir,'art',dir,name)),await readFile('apps/minigame/assets/compatible/'+dir+'/'+name),'packaged compatible asset '+name);}
  const entries = await readdir(outDir);
  for (const name of ['game.js', 'game.json', 'project.config.json', 'art']) assert.ok(entries.includes(name), name);
  const config = JSON.parse(await readFile(join(outDir, 'project.config.json'), 'utf8'));
  assert.equal(config.appid, 'wx1111111111111111');
  const bundle = await readFile(join(outDir, 'bundle.js'), 'utf8');
  assert.doesNotMatch(bundle, /WECHAT_MINIGAME_APP_SECRET|ADMIN_KEY|server-only-secret/);
  const art = await readdir(join(outDir, 'art'));
  assert.ok(art.includes('fonts'));
  assert.ok(art.includes('scenes'));
  assert.equal(art.includes('moonlit.png'), false, 'unused legacy artwork must not consume font package budget');
  assert.ok((await readdir(join(outDir, 'art', 'roles'))).includes('merlin-160.jpg'));
});

test('default build uses the registered Mini Game AppID rather than tourist mode', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-appid-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const result = await buildMiniGame({ outDir });
  assert.equal(result.apiBaseUrl, 'https://game.ccnepower.com/avalon');
  assert.equal(result.voiceEnabled, false);
  assert.equal(JSON.parse(await readFile(join(outDir,'game.json'),'utf8')).permission?.['scope.record'], undefined);
  const bundle = await readFile(join(outDir, 'bundle.js'), 'utf8');
  assert.match(bundle, /https:\/\/game\.ccnepower\.com\/avalon/);
  assert.doesNotMatch(bundle, /avalon\.ccnepower\.com:8443|\/mafia\/api/);
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
  await buildMiniGame({outDir,apiBaseUrl:'https://game.ccnepower.com/avalon/'});
  assert.ok((await readFile(join(outDir,'bundle.js'),'utf8')).includes('https://game.ccnepower.com/avalon'));
  await assert.rejects(buildMiniGame({ outDir, appId: 'touristappid' }), /INVALID_MINIGAME_APP_ID/);
});

test('build preserves and normalizes a game prefix without admitting query, traversal or credentials', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-minigame-prefix-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  const result = await buildMiniGame({ outDir, apiBaseUrl:'https://game.example/avalon/' });
  assert.equal(result.apiBaseUrl,'https://game.example/avalon');
  assert.match(await readFile(join(outDir,'bundle.js'),'utf8'),/https:\/\/game\.example\/avalon/);
  for (const apiBaseUrl of ['https://game.example/avalon?x=1','https://user:secret@game.example/avalon','https://game.example/avalon/../mafia','https://game.example/%2e%2e/mafia'])
    await assert.rejects(buildMiniGame({outDir,apiBaseUrl}),/INVALID_API_ORIGIN/);
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
  const button = layoutWebScreen(entryScreen(), { width: 390, height: 844, top: 88, bottom: 34 }).nodes.find(node => node.id === 'practice')!;
  touchStart?.({ touches: [{ clientX: button.x + 10, clientY: button.y + 15 }] });
  touchEnd?.({ changedTouches: [{ clientX: button.x + 10, clientY: button.y + 15 }] });
  assert.ok(labels.some(label => label.includes('幻境演练')));
});


test('incremental builds remove only obsolete artwork and keep the new font budget', async t => {
  const outDir=await mkdtemp(join(tmpdir(),'avalon-minigame-incremental-'));
  t.after(()=>rm(outDir,{recursive:true,force:true}));
  await buildMiniGame({outDir});
  await writeFile(join(outDir,'art/moonlit.png'),new Uint8Array(2_080_000));
  await writeFile(join(outDir,'art/gate.webp'),new Uint8Array(130_000));
  const result=await buildMiniGame({outDir});
  assert.ok(result.size<8*1024*1024);
  const game=JSON.parse(await readFile(join(outDir,'game.json'),'utf8'));
  assert.ok(game.subpackages.some((p:any)=>p.name==='hd-art'));
  assert.deepEqual(await readFile(join(outDir,'hd-art/merlin-640.jpg')),await readFile('apps/minigame/assets/hd-art/merlin-640.jpg'));
  assert.equal((await readdir(join(outDir,'art'))).includes('moonlit.png'),false);
  assert.ok((await readFile(join(outDir,'art/fonts/calligraphy.ttf'))).length>0);
});
