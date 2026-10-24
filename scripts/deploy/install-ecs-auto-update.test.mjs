import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const installer = join(root, 'scripts/install-ecs-auto-update.sh');
const fakeTool = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const tool = path.basename(process.argv[1]), args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({tool,args}) + '\\n');
if (process.env.MOCK_FAIL === tool) process.exit(1);
if (tool === 'id') console.log('0');
if (tool === 'git' && args[0] === 'symbolic-ref') console.log('main');
if (tool === 'install') {
  const destination = path.join(process.env.MOCK_DEST, args[3]);
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  fs.copyFileSync(args[2], destination);
  fs.chmodSync(destination, parseInt(args[1], 8));
}
`;

function install(t, failure = '') {
  const dir = mkdtempSync(join(tmpdir(), 'avalon-auto-install-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  for (const part of ['scripts', 'deploy/systemd', 'deploy/runtime', 'bin', 'installed']) mkdirSync(join(dir, part), {recursive:true});
  for (const file of ['scripts/update-ecs.sh', 'scripts/ecs-launcher.sh', 'deploy/systemd/avalon-auto-update.service', 'deploy/systemd/avalon-auto-update.timer']) copyFileSync(join(root, file), join(dir, file));
  for (const tool of ['id', 'git', 'flock', 'install', 'systemctl', 'systemd-analyze']) writeFileSync(join(dir, 'bin', tool), fakeTool, {mode:0o700});
  writeFileSync(join(dir, 'deploy/.env.ecs'), 'private-existing-config\n');
  writeFileSync(join(dir, 'deploy/runtime/last-successful-deploy'), 'existing-success\n');
  const log = join(dir, 'commands.jsonl');
  const environment = {...process.env, AVALON_DIR:dir, MOCK_LOG:log, MOCK_DEST:join(dir,'installed'), MOCK_FAIL:failure, PATH:`${join(dir,'bin')}:${process.env.PATH}`};
  const result = spawnSync('bash', [installer], {encoding:'utf8', env:environment});
  const commands = existsSync(log) ? readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  return {dir, result, commands, environment};
}

test('installer enables the timer, preserves deployment state, and installs a current-code launcher', (t) => {
  const {dir, result, commands, environment} = install(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(dir,'deploy/.env.ecs'),'utf8'), 'private-existing-config\n');
  assert.equal(readFileSync(join(dir,'deploy/runtime/last-successful-deploy'),'utf8'), 'existing-success\n');
  const launcher = join(dir,'installed/root/update-avalon.sh');
  assert.equal(statSync(launcher).mode & 0o777, 0o700);
  for (const extension of ['service','timer']) assert.equal(statSync(join(dir,`installed/etc/systemd/system/avalon-auto-update.${extension}`)).mode & 0o777, 0o644);
  const systemctl = commands.filter(c => c.tool === 'systemctl').map(c => c.args);
  assert.deepEqual(systemctl, [
    ['daemon-reload'], ['enable','avalon-auto-update.timer'], ['restart','avalon-auto-update.timer'], ['list-timers','--all','avalon-auto-update.timer'],
  ]);
  assert.ok(commands.findIndex(c => c.tool === 'systemd-analyze') < commands.findIndex(c => c.tool === 'systemctl'));
  for (const version of ['first','updated']) {
    writeFileSync(join(dir,'scripts/update-ecs.sh'), `#!/usr/bin/env bash\nprintf '${version}:%s\\n' "$1"\n`);
    const invocation = spawnSync('bash', [launcher, '--if-changed'], {encoding:'utf8', env:environment});
    assert.equal(invocation.status, 0, invocation.stderr);
    assert.equal(invocation.stdout.trim(), `${version}:--if-changed`);
  }
});

for (const failure of ['flock', 'systemd-analyze']) {
  test(`installer does not enable a timer after ${failure} failure`, (t) => {
    const {result, commands} = install(t, failure);
    assert.notEqual(result.status, 0);
    assert.ok(!commands.some(c => c.tool === 'systemctl' && ['enable','restart'].includes(c.args[0])));
  });
}
