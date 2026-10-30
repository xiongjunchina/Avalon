import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../update-ecs.sh', import.meta.url));
const fakeTool = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({tool, args, tag: process.env.IMAGE_TAG}) + '\\n');
if (tool === 'git') {
  if (args[0] === process.env.MOCK_FAIL) process.exit(1);
  if (args[0] === 'status' && process.env.MOCK_FAIL === 'dirty') console.log(' M apps/server/src/index.ts');
  if (args[0] === 'pull' && process.env.MOCK_FAIL === 'pull') process.exit(1);
  if (args[0] === 'diff') console.log(process.env.MOCK_CHANGED || '');
  if (args[0] === 'symbolic-ref') console.log(process.env.MOCK_BRANCH);
  if (args[0] === 'rev-parse') console.log(args.includes('--short') ? 'abc1234' : args.includes('FETCH_HEAD') ? process.env.MOCK_REMOTE : fs.readFileSync(process.env.MOCK_HEAD_FILE, 'utf8'));
  if (args[0] === 'merge' || args[0] === 'pull') fs.writeFileSync(process.env.MOCK_HEAD_FILE, process.env.MOCK_REMOTE);
}
if (tool === 'sha256sum') {
  const record = 'deploy/runtime/mafia-caddy-source.sha256';
  if (!fs.existsSync(record)) process.exit(1);
  const expected = fs.readFileSync(record,'utf8').split(' ')[0];
  const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync('deploy/Caddyfile')).digest('hex');
  process.exit(expected === actual ? 0 : 1);
}
if (tool === 'curl') { if (process.env.MOCK_FAIL === 'health') process.exit(1); console.log('{\"status\":\"ok\"}'); }
if (tool === 'flock' && process.env.MOCK_FAIL === 'lock') process.exit(1);
if (tool === 'docker') {
  if (args.includes('--environment')) {
    console.error('unknown flag: --environment');
    process.exit(1);
  }
  if (args.includes('config') && !args.includes('--quiet')) {
    const origin = fs.readFileSync('deploy/.env.ecs', 'utf8').match(/^APP_ORIGIN=(.*)$/m)[1];
    const value = (process.env.MOCK_QUOTE || '') + origin + (process.env.MOCK_QUOTE || '');
    process.stdout.write('services:\\n  gateway:\\n    environment:\\n      APP_ORIGIN: ' + value + '\\n  server:\\n    environment:\\n      APP_ORIGIN: ' + value + '\\n      PRIVATE_VALUE: private-test-value\\n');
  }
  if (args.includes(process.env.MOCK_FAIL)) process.exit(1);
}
`;

const oldRevision = '1'.repeat(40);
const newRevision = '2'.repeat(40);

function run(t, { origin = 'https://47.112.7.117', failure = '', quote = '', automatic = false, branch = 'main', head = oldRevision, remote = newRevision, deployed, ingress, portal = false, changed = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'avalon-ecs-update-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'deploy'));
  mkdirSync(join(dir, 'bin'));
  for (const tool of ['git', 'docker', 'flock', 'sha256sum', 'curl']) {
    writeFileSync(join(dir, 'bin', tool), fakeTool, { mode: 0o700 });
  }
  const envFile = join(dir, 'deploy/.env.ecs');
  const original = `PROJECT=avalon-ecs\nAPP_ORIGIN=${origin}\nPUBLIC_IP=47.112.7.117\nPOSTGRES_PASSWORD=private-test-value\nIMAGE_TAG=previous\nIMAGE_TAG=duplicate\n${portal ? 'PUBLIC_INGRESS_MODE=portal\nAPP_BASE_PATH=/avalon/\n' : ''}`;
  writeFileSync(envFile, original, { mode: 0o600 });
  const headFile = join(dir, 'head');
  writeFileSync(headFile, head);
  const stateFile = join(dir, 'deploy/runtime/last-successful-deploy');
  if (deployed) {
    mkdirSync(join(dir, 'deploy/runtime'));
    writeFileSync(stateFile, `${deployed}\n`, { mode: 0o600 });
  }
  if (ingress) {
    mkdirSync(join(dir,'deploy/runtime'),{recursive:true});
    writeFileSync(join(dir,'deploy/runtime/compose.mafia.yaml'),'services: {}');
    writeFileSync(join(dir,'deploy/Caddyfile'),'original gateway');
    if (ingress !== 'missing') writeFileSync(join(dir,'deploy/runtime/mafia-caddy-source.sha256'),createHash('sha256').update(ingress === 'changed' ? 'older gateway' : 'original gateway').digest('hex')+'  deploy/Caddyfile\n');
  }
  const log = join(dir, 'commands.jsonl');
  function execute(overrides = {}) {
    writeFileSync(log, '');
    const result = spawnSync('bash', [script, ...(automatic ? ['--if-changed'] : [])], {
      encoding: 'utf8',
      env: { ...process.env, AVALON_DIR: dir, MOCK_LOG: log, MOCK_FAIL: failure, MOCK_QUOTE: quote, MOCK_BRANCH: branch, MOCK_HEAD_FILE: headFile, MOCK_REMOTE: remote, MOCK_CHANGED: changed, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, ...overrides },
    });
    const commands = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('private-test-value'), 'private config must not appear in output');
    return { result, commands };
  }
  return { dir, envFile, original, headFile, stateFile, execute, ...execute() };
}

for (const [origin, override] of [
  ['https://47.112.7.117', 'deploy/compose.ip.example.yaml'],
  ['https://avalon.example.com', 'deploy/compose.public.example.yaml'],
]) {
  test(`ECS update selects the correct HTTPS configuration for ${origin}`, (t) => {
    const { dir, envFile, original, result, commands } = run(t, { origin });
    assert.equal(result.status, 0, result.stderr);
    const build = commands.findIndex(c => c.tool === 'docker' && c.args.includes('build'));
    const up = commands.findIndex(c => c.tool === 'docker' && c.args.includes('up'));
    assert.ok(build >= 0 && up > build);
    assert.deepEqual(commands.find(c => c.tool === 'git' && c.args[0] === 'pull').args, ['pull', '--ipv4', '--ff-only']);
    for (const command of commands.filter(c => c.tool === 'docker' && !(c.args.includes('config') && !c.args.includes('--quiet')))) {
      assert.ok(command.args.includes(override));
      assert.equal(command.tag, 'abc1234');
    }
    assert.deepEqual(commands[up].args.slice(-5), ['up', '-d', '--wait', '--wait-timeout', '180']);
    const updated = readFileSync(envFile, 'utf8');
    assert.equal(updated.match(/^IMAGE_TAG=/gm).length, 1);
    assert.ok(updated.endsWith('IMAGE_TAG=abc1234\n'));
    assert.ok(updated.includes('POSTGRES_PASSWORD=private-test-value\n'));
    assert.equal(readFileSync(join(dir, 'deploy/runtime/.env.ecs.before-update'), 'utf8'), original);
    assert.equal(statSync(envFile).mode & 0o777, 0o600);
    assert.equal(readFileSync(join(dir, 'deploy/runtime/last-successful-deploy'), 'utf8').trim(), newRevision);
  });
}

test('scheduled check skips all Docker work when the latest commit was already deployed', (t) => {
  const { result, commands } = run(t, { automatic: true, head: newRevision, deployed: newRevision });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!commands.some(c => c.tool === 'docker'));
  assert.ok(!commands.some(c => ['merge', 'pull'].includes(c.args[0])));
});

test('scheduled check fast-forwards and records a newly deployed commit', (t) => {
  const { result, commands, stateFile, headFile } = run(t, { automatic: true, deployed: oldRevision });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(headFile, 'utf8'), newRevision);
  assert.equal(readFileSync(stateFile, 'utf8').trim(), newRevision);
  assert.equal(statSync(stateFile).mode & 0o777, 0o600);
  assert.deepEqual(commands.filter(c => c.args[0] === 'fetch').map(c => c.args), [['fetch', '--ipv4', '--no-tags', 'origin', 'main']]);
  assert.ok(commands.some(c => c.args[0] === 'merge' && c.args[1] === '--ff-only' && c.args[2] === newRevision));
  assert.ok(!commands.some(c => c.args[0] === 'pull'));
});

test('first scheduled check establishes a verified deployment when no success record exists', (t) => {
  const { result, commands, stateFile } = run(t, { automatic: true, head: newRevision });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(commands.some(c => c.tool === 'docker' && c.args.includes('build')));
  assert.equal(readFileSync(stateFile, 'utf8').trim(), newRevision);
});

for (const failure of ['build', 'up']) {
  test(`scheduled check retries ${failure} failure even after HEAD was updated`, (t) => {
    const fixture = run(t, { automatic: true, deployed: oldRevision, failure });
    assert.notEqual(fixture.result.status, 0);
    assert.equal(readFileSync(fixture.headFile, 'utf8'), newRevision);
    assert.equal(readFileSync(fixture.stateFile, 'utf8').trim(), oldRevision);
    const retry = fixture.execute({ MOCK_FAIL: '' });
    assert.equal(retry.result.status, 0, retry.result.stderr);
    assert.ok(retry.commands.some(c => c.tool === 'docker' && c.args.includes('build')));
    assert.equal(readFileSync(fixture.stateFile, 'utf8').trim(), newRevision);
  });
}

for (const failure of ['fetch', 'merge-base', 'merge']) {
  test(`scheduled check preserves the last success and stops before Docker on ${failure} failure`, (t) => {
    const { result, commands, stateFile } = run(t, { automatic: true, deployed: oldRevision, failure });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(stateFile, 'utf8').trim(), oldRevision);
    assert.ok(!commands.some(c => c.tool === 'docker'));
  });
}

test('scheduled check refuses branches other than main', (t) => {
  const { result, commands } = run(t, { automatic: true, branch: 'feature' });
  assert.notEqual(result.status, 0);
  assert.ok(!commands.some(c => c.args[0] === 'fetch' || c.tool === 'docker'));
});

test('scheduled check skips a busy deployment lock without reporting failure', (t) => {
  const { result, commands } = run(t, { automatic: true, failure: 'lock' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!commands.some(c => c.tool === 'git' || c.tool === 'docker'));
});

for (const failure of ['lock', 'dirty', 'status', 'pull', 'rev-parse', 'config', 'build']) {
  test(`ECS update stops before publication and preserves configuration on ${failure} failure`, (t) => {
    const { envFile, original, result, commands } = run(t, { failure });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(envFile, 'utf8'), original);
    assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('up')));
    if (failure !== 'build') assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('build')));
    if (['config', 'build'].includes(failure)) assert.equal(result.stderr.match(/发布未完成/g)?.length, 1);
  });
}

test('ECS update reports failed container startup without a success message', (t) => {
  const { result, commands } = run(t, { failure: 'up' });
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes('容器更新及健康等待已完成'));
  assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('ps')));
  assert.equal(result.stderr.match(/发布未完成/g)?.length, 1);
});

test('ECS update supports Compose without config --environment', (t) => {
  const { result, commands } = run(t);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!commands.some(c => c.args.includes('--environment')));
});

for (const quote of ['"', "'"]) {
  test(`ECS update reads ${quote}-quoted origin from rendered Compose YAML`, (t) => {
    const { result, commands } = run(t, { origin: 'https://avalon.example.com', quote });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(commands.some(c => c.tool === 'docker' && c.args.includes('build') && c.args.includes('deploy/compose.public.example.yaml')));
  });
}

for (const origin of ['http://47.112.7.117', 'https://avalon.example.com/path', 'https://999.112.7.117']) {
  test(`ECS update rejects unsupported origin ${origin} before building`, (t) => {
    const { result, commands } = run(t, { origin });
    assert.notEqual(result.status, 0);
    assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('build')));
  });
}

test('scheduled updates with a real Git remote retry failed releases and reject local history changes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'avalon-auto-real-git-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const source = join(dir,'source'), remote = join(dir,'origin.git'), checkout = join(dir,'checkout'), bin = join(dir,'bin');
  const gitEnv = {...process.env, GIT_CONFIG_GLOBAL:'/dev/null', GIT_CONFIG_NOSYSTEM:'1'};
  function git(cwd, ...args) {
    const result = spawnSync('git', args, {cwd, encoding:'utf8', env:gitEnv});
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  function commit(cwd, message) {
    git(cwd,'add','.');
    git(cwd,'-c','user.name=Avalon test','-c','user.email=avalon-test@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-m',message);
    return git(cwd,'rev-parse','HEAD');
  }
  git(dir,'init','-b','main',source);
  mkdirSync(join(source,'scripts'));
  writeFileSync(join(source,'.gitignore'),'deploy/.env.ecs\ndeploy/runtime/\n');
  copyFileSync(script,join(source,'scripts/update-ecs.sh'));
  const first = commit(source,'initial');
  git(dir,'clone','--bare',source,remote);
  git(dir,'clone',remote,checkout);
  git(source,'remote','add','origin',remote);
  mkdirSync(join(checkout,'deploy/runtime'),{recursive:true});
  mkdirSync(bin);
  for (const tool of ['docker','flock']) writeFileSync(join(bin,tool),fakeTool,{mode:0o700});
  writeFileSync(join(checkout,'deploy/.env.ecs'),'PROJECT=avalon-ecs\nAPP_ORIGIN=https://47.112.7.117\nPUBLIC_IP=47.112.7.117\nPOSTGRES_PASSWORD=private-test-value\nIMAGE_TAG=previous\n');
  const stateFile = join(checkout,'deploy/runtime/last-successful-deploy');
  writeFileSync(stateFile,`${first}\n`);
  const log = join(dir,'commands.jsonl');
  function check(failure = '') {
    writeFileSync(log,'');
    const result = spawnSync('bash',[join(checkout,'scripts/update-ecs.sh'),'--if-changed'],{
      encoding:'utf8', env:{...gitEnv,AVALON_DIR:checkout,MOCK_LOG:log,MOCK_FAIL:failure,MOCK_QUOTE:'',PATH:`${bin}:${process.env.PATH}`},
    });
    const commands = readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.ok(!`${result.stdout}${result.stderr}`.includes('private-test-value'));
    return {result,commands};
  }
  // An application update also replaces the running script; the full release must finish.
  writeFileSync(join(source,'scripts/update-ecs.sh'),`${readFileSync(script,'utf8')}\n# Updated script in the remote commit.\n`);
  mkdirSync(join(source,'apps/server/src'),{recursive:true});
  writeFileSync(join(source,'apps/server/src/release-proof.ts'),'export const release = 2;\n');
  const second = commit(source,'update application and deployment script');
  git(source,'push','origin','main');
  const failed = check('up');
  assert.notEqual(failed.result.status,0);
  assert.equal(git(checkout,'rev-parse','HEAD'),second);
  assert.equal(readFileSync(stateFile,'utf8').trim(),first);
  const retry = check();
  assert.equal(retry.result.status,0,retry.result.stderr);
  assert.ok(retry.commands.some(c => c.tool === 'docker' && c.args.includes('build')));
  assert.equal(readFileSync(stateFile,'utf8').trim(),second);
  const unchanged = check();
  assert.equal(unchanged.result.status,0,unchanged.result.stderr);
  assert.ok(!unchanged.commands.some(c => c.tool === 'docker'));
  writeFileSync(join(source,'scripts/update-ecs.sh'),`${readFileSync(script,'utf8')}\n# Deployment-only revision.\n`);
  const third = commit(source,'update deployment tooling only');
  git(source,'push','origin','main');
  const toolingOnly = check();
  assert.equal(toolingOnly.result.status,0,toolingOnly.result.stderr);
  assert.equal(git(checkout,'rev-parse','HEAD'),third);
  assert.ok(!toolingOnly.commands.some(c => c.tool === 'docker'));
  assert.equal(readFileSync(stateFile,'utf8').trim(),second);
  writeFileSync(join(checkout,'local-change.txt'),'local commit\n');
  commit(checkout,'local-only change');
  const diverged = check();
  assert.notEqual(diverged.result.status,0);
  assert.ok(!diverged.commands.some(c => c.tool === 'docker'));
  assert.equal(readFileSync(stateFile,'utf8').trim(),second);
});


test('approved shared ingress is preserved through every deployment Compose operation', t => {
  const {result,commands}=run(t,{ingress:'valid'});
  assert.equal(result.status,0,result.stderr);
  for(const command of commands.filter(c=>c.tool==='docker'&&!(c.args.includes('config')&&!c.args.includes('--quiet'))))assert.ok(command.args.includes('deploy/runtime/compose.mafia.yaml'));
});
for(const ingress of ['changed','missing'])test(`shared ingress stops before building when its Caddy baseline is ${ingress}`,t=>{
  const {result,commands,envFile,original}=run(t,{ingress});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Caddy/);
  assert.ok(!commands.some(c=>c.tool==='docker'&&(c.args.includes('build')||c.args.includes('up'))));
  assert.equal(readFileSync(envFile,'utf8'),original);
});

test('portal-only changes skip Avalon images and preserve the actual deployed revision', t => {
  const {result,commands,stateFile}=run(t,{automatic:true,deployed:oldRevision,changed:'deploy/portal/games.json\ndeploy/portal/assets/portal.css\nscripts/deploy/portal-runtime.test.py\nscripts/update-ecs.sh\nscripts/deploy/update-ecs.test.mjs'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(stateFile,'utf8').trim(),oldRevision);
  assert.ok(!commands.some(c=>c.tool==='docker'));
});

test('portal mode deploys only Avalon services and bypasses the retired shared overlay', t => {
  const {result,commands}=run(t,{portal:true,ingress:'changed',origin:'https://game.ccnepower.com'});
  assert.equal(result.status,0,result.stderr);
  const up=commands.find(c=>c.tool==='docker'&&c.args.includes('up'));
  assert.deepEqual(up.args.slice(-2),['server','gateway']);
  assert.ok(up.args.includes('--no-deps'));
  assert.ok(up.args.includes('deploy/compose.portal.yaml'));
  assert.ok(!up.args.includes('deploy/runtime/compose.mafia.yaml'));
  assert.ok(commands.some(c=>c.tool==='curl'&&c.args.includes('https://game.ccnepower.com/avalon/api/health')));
  const health=commands.find(c=>c.tool==='curl');
  assert.ok(health.args.includes('game.ccnepower.com:443:127.0.0.1'));
  assert.ok(health.args.includes('--noproxy'));
  assert.ok(!health.args.includes('-k')&&!health.args.includes('--insecure'));
});

test('portal mode restores the previous private configuration after failed public health', t => {
  const {result,commands,envFile,original}=run(t,{portal:true,failure:'health'});
  assert.notEqual(result.status,0);
  assert.equal(readFileSync(envFile,'utf8'),original);
  const up=commands.filter(c=>c.tool==='docker'&&c.args.includes('up'));
  assert.equal(up.length,2);
  assert.ok(up[1].args.includes('--no-build'));
  assert.deepEqual(up[1].args.slice(-2),['server','gateway']);
});
