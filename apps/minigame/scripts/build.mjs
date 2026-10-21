import { build } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
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
  appId = process.env.WECHAT_MINIGAME_APP_ID || 'touristappid',
  maxBytes = 4 * 1024 * 1024,
} = {}) {
  await mkdir(outDir, { recursive: true });
  await build({
    entryPoints: [join(minigameRoot, 'src', 'main.ts')],
    bundle: true,
    platform: 'neutral',
    format: 'cjs',
    target: 'es2020',
    minify: true,
    outfile: join(outDir, 'bundle.js'),
  });
  for (const name of ['game.js', 'game.json']) await copyFile(join(minigameRoot, name), join(outDir, name));
  const project = JSON.parse(await readFile(join(minigameRoot, 'project.config.json'), 'utf8'));
  project.appid = appId;
  await writeFile(join(outDir, 'project.config.json'), JSON.stringify(project, null, 2));
  await mkdir(join(outDir, 'art'), { recursive: true });
  await copyFile(join(repoRoot, 'apps', 'web', 'public', 'art', 'scenes', 'gate.webp'), join(outDir, 'art', 'gate.webp'));
  const size = await bytesIn(outDir);
  if (size > maxBytes) throw new Error(`PACKAGE_TOO_LARGE: ${size} > ${maxBytes}`);
  return { outDir, size, appId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildMiniGame();
  process.stdout.write(`Mini Game built: ${result.outDir} (${result.size} bytes)\n`);
}
