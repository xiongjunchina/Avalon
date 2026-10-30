import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMiniGame } from './build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const version = process.argv.find(value => value.startsWith('--version='))?.slice(10) || '0.1.0';
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('VERSION_MUST_BE_X_Y_Z');
const runNode = args => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
runNode(['node_modules/typescript/bin/tsc', '--noEmit']);
const tests = (await readdir(join(root, 'apps/minigame/test'))).filter(name => name.endsWith('.test.ts'));
runNode(['--import', 'tsx', '--test', ...tests.map(name => `apps/minigame/test/${name}`)]);
const releases = join(root, 'dist/releases');
await mkdir(releases, { recursive: true });
// Each release gets a new directory, so old files or private local configs cannot enter the package.
const releaseRoot = await mkdtemp(join(releases, `minigame-${version}-`));
const project = join(releaseRoot, 'project');
const result = await buildMiniGame({ outDir: project });
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const files = {};
async function record(dir, prefix = '') {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix + item.name;
    if (item.isDirectory()) await record(join(dir, item.name), relative + '/');
    else files[relative] = createHash('sha256').update(await readFile(join(dir, item.name))).digest('hex');
  }
}
await record(project);
const manifest = { version, revision: git(['rev-parse', 'HEAD']), sourceDirty: Boolean(git(['status', '--porcelain'])),
  appId: result.appId, apiOrigin: process.env.WECHAT_MINIGAME_API_BASE_URL || 'https://avalon.ccnepower.com:8443',
  voiceEnabled: true, voiceProvider: 'wechat-native', voiceMaxPlayers: 10, bytes: result.size, files };
await writeFile(join(releaseRoot, 'release.json'), JSON.stringify(manifest, null, 2));
await writeFile(join(releaseRoot, 'README.txt'), `微信开发者工具选择小游戏，导入本目录下 project 文件夹。\n版本 ${version}\nAppID ${result.appId}\n服务地址 ${manifest.apiOrigin}\n真实登录、同房对局及上传回执需在发布前另行验收。本命令不会上传或发布。\n`);
if (process.platform === 'win32') {
  // Windows ships bsdtar. Direct arguments avoid shell quoting and PowerShell module dependencies.
  execFileSync('tar.exe', ['-a', '-c', '-f', releaseRoot + '.zip', '-C', releaseRoot, 'project', 'release.json', 'README.txt'],
    { stdio: 'inherit', windowsHide: true });
}
console.log(JSON.stringify({ releaseRoot, project, version, bytes: result.size, sourceDirty: manifest.sourceDirty }, null, 2));
