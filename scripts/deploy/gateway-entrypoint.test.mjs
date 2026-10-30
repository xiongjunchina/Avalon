import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('gateway canonicalizes a matching prefix and rejects a mismatched built image before starting Caddy',t=>{
  const dir=mkdtempSync(join(tmpdir(),'avalon-gateway-check-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  mkdirSync(join(dir,'bin'));
  writeFileSync(join(dir,'bin/cat'),'#!/bin/sh\nprintf /avalon/\n',{mode:0o700});
  const script=fileURLToPath(new URL('../../deploy/gateway-entrypoint.sh',import.meta.url));
  const run=prefix=>spawnSync('sh',[script,'sh','-c','printf "%s" "$APP_BASE_PATH"'],{encoding:'utf8',env:{...process.env,APP_BASE_PATH:prefix,PATH:join(dir,'bin')+':'+process.env.PATH}});
  assert.equal(run('/avalon').stdout,'/avalon/');
  assert.equal(run('/avalon/').status,0);
  const wrong=run('/mafia/');assert.equal(wrong.status,1);assert.match(wrong.stderr,/differs from the frontend build/);assert.equal(wrong.stdout,'');
});
