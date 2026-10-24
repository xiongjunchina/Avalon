import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
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
  if (args[0] === 'rev-parse') console.log('abc1234');
}
if (tool === 'flock' && process.env.MOCK_FAIL === 'lock') process.exit(1);
if (tool === 'docker') {
  if (args.includes('--environment')) process.stdout.write(fs.readFileSync('deploy/.env.ecs', 'utf8'));
  if (args.includes(process.env.MOCK_FAIL)) process.exit(1);
}
`;

function run(t, { origin = 'https://47.112.7.117', failure = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'avalon-ecs-update-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'deploy'));
  mkdirSync(join(dir, 'bin'));
  for (const tool of ['git', 'docker', 'flock']) {
    writeFileSync(join(dir, 'bin', tool), fakeTool, { mode: 0o700 });
  }
  const envFile = join(dir, 'deploy/.env.ecs');
  const original = `PROJECT=avalon-ecs\nAPP_ORIGIN=${origin}\nPUBLIC_IP=47.112.7.117\nPOSTGRES_PASSWORD=private-test-value\nIMAGE_TAG=previous\nIMAGE_TAG=duplicate\n`;
  writeFileSync(envFile, original, { mode: 0o600 });
  const log = join(dir, 'commands.jsonl');
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { ...process.env, AVALON_DIR: dir, MOCK_LOG: log, MOCK_FAIL: failure, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
  });
  const commands = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  assert.ok(!`${result.stdout}${result.stderr}`.includes('private-test-value'), 'private config must not appear in output');
  return { dir, envFile, original, result, commands };
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
    for (const command of commands.filter(c => c.tool === 'docker' && !c.args.includes('--environment'))) {
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
  });
}

for (const failure of ['lock', 'dirty', 'status', 'pull', 'rev-parse', 'build']) {
  test(`ECS update stops before publication and preserves configuration on ${failure} failure`, (t) => {
    const { envFile, original, result, commands } = run(t, { failure });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(envFile, 'utf8'), original);
    assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('up')));
    if (failure !== 'build') assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('build')));
  });
}

test('ECS update reports failed container startup without a success message', (t) => {
  const { result, commands } = run(t, { failure: 'up' });
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes('容器更新及健康等待已完成'));
  assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('ps')));
});

for (const origin of ['http://47.112.7.117', 'https://avalon.example.com/path', 'https://999.112.7.117']) {
  test(`ECS update rejects unsupported origin ${origin} before building`, (t) => {
    const { result, commands } = run(t, { origin });
    assert.notEqual(result.status, 0);
    assert.ok(!commands.some(c => c.tool === 'docker' && c.args.includes('build')));
  });
}
