import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  apiBaseUrl = process.env.WECHAT_MINIGAME_API_BASE_URL || 'https://avalon.ccnepower.com:8443',
  maxBytes = 4 * 1024 * 1024,
} = {}) {
  let url;
  try { url = new URL(apiBaseUrl); } catch { throw new Error('INVALID_API_ORIGIN'); }
  if (url.protocol !== 'https:' || !url.hostname || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw new Error('INVALID_API_ORIGIN');
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
    define: { __MINIGAME_API_BASE_URL__: JSON.stringify(url.origin) },
    minify: true,
    outfile: join(outDir, 'bundle.js'),
  });
  for (const name of ['game.js', 'game.json']) await copyFile(join(minigameRoot, name), join(outDir, name));
  project.appid = selectedAppId;
  await writeFile(join(outDir, 'project.config.json'), JSON.stringify(project, null, 2));
  await mkdir(join(outDir, 'art'), { recursive: true });
  await mkdir(join(outDir, 'art', 'scenes'), { recursive: true });
  await mkdir(join(outDir, 'art', 'emblems'), { recursive: true });
  for (const name of await readdir(join(minigameRoot, 'assets/emblems'))) if (name.endsWith('.png'))
    await copyFile(join(minigameRoot, 'assets/emblems', name), join(outDir, 'art/emblems', name));
  for (const name of ['gate', 'sword', 'pavilion', 'library', 'mirror', 'dawn'])
    await copyFile(join(repoRoot, 'apps/web/public/art/scenes', name + '.webp'), join(outDir, 'art/scenes', name + '.webp'));
  // Remove only the two named legacy build outputs, including on incremental rebuilds.
  await rm(join(outDir, 'art/moonlit.png'), { force: true });
  await rm(join(outDir, 'art/gate.webp'), { force: true });
  await mkdir(join(outDir, 'art/fonts'), { recursive: true });
  for (const name of await readdir(join(minigameRoot, 'assets/fonts')))
    if (name.endsWith('.ttf') || name.endsWith('-OFL.txt')) await copyFile(join(minigameRoot, 'assets/fonts', name), join(outDir, 'art/fonts', name));
  const rolesRoot = join(repoRoot, 'apps', 'web', 'public', 'art', 'roles');
  await mkdir(join(outDir, 'art', 'roles'), { recursive: true });
  for (const name of await readdir(rolesRoot)) {
    if (name.endsWith('-160.webp')) await copyFile(join(rolesRoot, name), join(outDir, 'art', 'roles', name));
  }
  const size = await bytesIn(outDir);
  if (size > maxBytes) throw new Error(`PACKAGE_TOO_LARGE: ${size} > ${maxBytes}`);
  return { outDir, size, appId: selectedAppId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildMiniGame();
  process.stdout.write(`Mini Game built: ${result.outDir} (${result.size} bytes)\n`);
}
