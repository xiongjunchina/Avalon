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
  appId: result.appId, apiOrigin: new URL(result.apiBaseUrl).origin, apiBaseUrl: result.apiBaseUrl,
  webEntryUrl: result.apiBaseUrl + '/',
  releasePurpose: result.perfHud ? 'performance-device-test' : result.voiceEnabled ? 'wechat-voice-device-test' : 'minigame-candidate',
  perfHud:result.perfHud,
  voiceEnabled: result.voiceEnabled, ...(result.voiceEnabled ? {voiceProvider:'wechat-native',voiceMaxPlayers:10,voiceInteroperability:'minigame-only',realDeviceVoiceVerified:false} : {}), bytes: result.size, files };
await writeFile(join(releaseRoot, 'release.json'), JSON.stringify(manifest, null, 2));
await writeFile(join(releaseRoot, 'README.txt'), `微信开发者工具选择小游戏，导入本目录下 project 文件夹。\n版本 ${version}\nAppID ${result.appId}\n服务地址 ${manifest.apiBaseUrl}\n${result.voiceEnabled ? [
  '用途：微信原生语音体验版候选包，供真机联调；尚未完成真机通话验收。',
  '仅同房小游戏玩家互通，最多10人；与网页声网语音不互通。11–12人需要内置语音时请全员使用网页版。',
  'ECS 服务端必须同时启用 WECHAT_MINIGAME_VOICE_ENABLED=true，并配置正确的 AppID/AppSecret；AppSecret 仅留在服务端，不放入本工程。',
  '合作伙伴需核对微信实时语音能力权限与隐私指引中的麦克风用途声明。',
  '使用当前微信绑定的游戏账号进入5–10人房，点击房内“开启语音”并授权后加入通话；麦克风开启，可通过房内按钮静音。',
  '至少两台手机验证双向通话、静音和恢复、拒绝授权、退后台再进入、断线和退房；语音失败不应妨碍准备与对局。',
].join('\n') : '当前版本不含实时语音。'}\n真实登录、同房对局及上传回执需在发布前另行验收。本命令不会上传、提审或发布。\n`);
if (process.platform === 'win32') {
  // Windows ships bsdtar. Direct arguments avoid shell quoting and PowerShell module dependencies.
  execFileSync('tar.exe', ['-a', '-c', '-f', releaseRoot + '.zip', '-C', releaseRoot, 'project', 'release.json', 'README.txt'],
    { stdio: 'inherit', windowsHide: true });
}
console.log(JSON.stringify({ releaseRoot, project, version, bytes: result.size, sourceDirty: manifest.sourceDirty }, null, 2));
