import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_API_BASE_URL, normalizeServiceUrl } from './service-url.mjs';

const minigameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(minigameRoot, '../..');

async function bytesIn(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await bytesIn(path) : (await stat(path)).size;
  }
  return total;
}

export async function buildMiniGame({
  outDir = join(repoRoot, 'dist', 'minigame'),
  appId = process.env.WECHAT_MINIGAME_APP_ID,
  apiBaseUrl = process.env.WECHAT_MINIGAME_API_BASE_URL || DEFAULT_API_BASE_URL,
  voiceEnabled = process.env.WECHAT_MINIGAME_VOICE_ENABLED === 'true',
  maxBytes = 4 * 1024 * 1024,
} = {}) {
  const serviceUrl = normalizeServiceUrl(apiBaseUrl);
  const project = JSON.parse(await readFile(join(minigameRoot, 'project.config.json'), 'utf8'));
  const selectedAppId = appId || project.appid;
  if (!/^wx[0-9a-f]{16}$/.test(selectedAppId)) throw new Error('INVALID_MINIGAME_APP_ID');
  await mkdir(outDir, { recursive: true });
  await build({
    entryPoints: [join(minigameRoot, 'src', 'main.ts')],
    bundle: true,
    platform: 'neutral',
    format: 'cjs',
    target: 'es2020',
    define: { __MINIGAME_API_BASE_URL__: JSON.stringify(serviceUrl), __APP_BASE_PATH__: JSON.stringify(new URL(serviceUrl).pathname.replace(/\/?$/, '/')), __MINIGAME_VOICE_ENABLED__: JSON.stringify(voiceEnabled) },
    minify: true,
    outfile: join(outDir, 'bundle.js'),
  });
  await copyFile(join(minigameRoot, 'game.js'), join(outDir, 'game.js'));
  const gameConfig = JSON.parse(await readFile(join(minigameRoot, 'game.json'), 'utf8'));
  if (!voiceEnabled) delete gameConfig.permission?.['scope.record'];
  await writeFile(join(outDir, 'game.json'), JSON.stringify(gameConfig, null, 2));
  project.appid = selectedAppId;
  await writeFile(join(outDir, 'project.config.json'), JSON.stringify(project, null, 2));
  await mkdir(join(outDir, 'art'), { recursive: true });
  await mkdir(join(outDir, 'art', 'scenes'), { recursive: true });
  await mkdir(join(outDir, 'art', 'emblems'), { recursive: true });
  for (const name of await readdir(join(minigameRoot, 'assets/emblems'))) if (name.endsWith('.png'))
    await copyFile(join(minigameRoot, 'assets/emblems', name), join(outDir, 'art/emblems', name));
  // Remove only the two named legacy build outputs, including on incremental rebuilds.
  await rm(join(outDir, 'art/moonlit.png'), { force: true });
  await rm(join(outDir, 'art/gate.webp'), { force: true });
  await rm(join(outDir, 'art/home/duel-mobile.png'), { force: true });
  await rm(join(outDir, 'hd-art/home-duel.png'), { force: true });
  await mkdir(join(outDir, 'art/fonts'), { recursive: true });
  for (const name of await readdir(join(minigameRoot, 'assets/fonts')))
    if (name.endsWith('.ttf') || name.endsWith('-OFL.txt')) await copyFile(join(minigameRoot, 'assets/fonts', name), join(outDir, 'art/fonts', name));
  for(const folder of ['scenes','roles','avatars','home']){
    const target=join(outDir,'art',folder);await mkdir(target,{recursive:true});
    for(const name of await readdir(join(minigameRoot,'assets/compatible',folder))){
      if(!/\.(jpg|png)$/.test(name))continue;
      await copyFile(join(minigameRoot,'assets/compatible',folder,name),join(target,name));
      if(name.endsWith('.jpg'))await rm(join(target,name.replace(/\.jpg$/,'.webp')),{force:true});
    }
  }
  const existingHd=await stat(join(outDir,'hd-art')).catch(()=>undefined);
  const existingFonts=await stat(join(outDir,'web-fonts')).catch(()=>undefined);
  const size = await bytesIn(outDir)-(existingHd?await bytesIn(join(outDir,'hd-art')):0)-(existingFonts?await bytesIn(join(outDir,'web-fonts')):0);
  if (size > maxBytes) throw new Error(`PACKAGE_TOO_LARGE: ${size} > ${maxBytes}`);
  const hdRoot=join(outDir,'hd-art');await mkdir(hdRoot,{recursive:true});
  await writeFile(join(hdRoot,'game.js'),'// Local high-resolution artwork package.\n');
  for(const name of await readdir(join(minigameRoot,'assets/hd-art')))if(/\.(jpg|png)$/.test(name))await copyFile(join(minigameRoot,'assets/hd-art',name),join(hdRoot,name));
  const hdSize=await bytesIn(hdRoot);if(hdSize>4*1024*1024)throw Error('HD_PACKAGE_TOO_LARGE');
  const fontRoot=join(outDir,'web-fonts');await mkdir(fontRoot,{recursive:true});await writeFile(join(fontRoot,'game.js'),'// Actual web font weights.\n');
  for(const name of await readdir(join(minigameRoot,'assets/web-fonts')))await copyFile(join(minigameRoot,'assets/web-fonts',name),join(fontRoot,name));
  const fontSize=await bytesIn(fontRoot);if(fontSize>4*1024*1024)throw Error('FONT_PACKAGE_TOO_LARGE');
  return { outDir, size:size+hdSize+fontSize, appId: selectedAppId, apiBaseUrl:serviceUrl, voiceEnabled };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildMiniGame();
  process.stdout.write(`Mini Game built: ${result.outDir} (${result.size} bytes)\n`);
}
