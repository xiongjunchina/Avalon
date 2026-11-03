import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const script=fileURLToPath(new URL('../install-content-safety-ecs.sh',import.meta.url));
const revision='a'.repeat(40);
const tool=`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const name=path.basename(process.argv[1]),args=process.argv.slice(2),dir=process.env.MOCK_ROOT;
const file=n=>path.join(dir,n),read=n=>JSON.parse(fs.readFileSync(file(n),'utf8')),save=(n,v)=>fs.writeFileSync(file(n),JSON.stringify(v));
fs.appendFileSync(file('commands.jsonl'),JSON.stringify({tool:name,args})+'\\n');
if(name==='git') {
 if(args[0]==='rev-parse') console.log(args[1]==='refs/remotes/origin/main'?(process.env.MOCK_ORIGIN_REVISION||process.env.MOCK_REVISION):process.env.MOCK_REVISION);
 if(args[0]==='symbolic-ref') console.log(process.env.MOCK_BRANCH||'main');
 if(args[0]==='status'&&process.env.MOCK_DIRTY==='1') console.log(' M tracked-file');
}
if(name==='systemctl') {
 const timers=read('timers.json'), key=args[1];
 if(args[0]==='is-active') {console.log(timers[key]?'active':'inactive');process.exit(timers[key]?0:3);}
 if(args[0]==='is-enabled') console.log('enabled');
 if(args[0]==='start'||args[0]==='stop'){timers[key]=args[0]==='start';save('timers.json',timers);}
}
if(name==='docker') {
 const rows=read('containers.json');
 if(args[0]==='ps') console.log(rows.map(r=>r.id).join('\\n'));
 if(args[0]==='inspect') console.log(rows.map(r=>['id','name','image','started','restarts','project','service'].map(k=>r[k]).join('\\t')).join('\\n'));
 if(args[0]==='compose') {
  if(args.includes('build')) {fs.writeFileSync(file('built'),'1');if(process.env.MOCK_FAIL==='build')process.exit(1);}
  if(args.includes('up')) {
   const rollback=args.some(a=>a.endsWith('rollback.json'));
   if(process.env.MOCK_FAIL==='up'&&!rollback)process.exit(1);
   for(const r of rows)if(r.project==='avalon-ecs'&&['server','gateway'].includes(r.service)){
    r.id=(rollback?'restored-':'new-')+r.service;r.image=rollback?'sha256:old-'+r.service:'sha256:new-'+r.service;r.started='changed';
   }
   save('containers.json',rows);
  }
 }
 if(args[0]==='exec') {
  if(args.some(a=>a.includes('SELECT count(*) FROM rooms'))) {
   console.log(process.env.MOCK_ACTIVE==='1'||(process.env.MOCK_AFTER_BUILD_ACTIVE==='1'&&fs.existsSync(file('built')))?'1':'0');
  }
  if(args.some(a=>a.includes('pg_dump')))process.stdout.write('PGDMPmock-archive');
  if(args.includes('probe')){if(process.env.MOCK_FAIL==='probe')process.exit(1);console.log('{"provider":"web","status":"passed"}\\n{"provider":"wechat","status":"passed"}');}
  if(args.includes('audit')){save('avatar.json',{value:'https://game.ccnepower.com/avalon/api/avatars/'+('a'.repeat(64))});console.log(JSON.stringify({passed:4,errors:process.env.MOCK_FAIL==='audit'?1:0}));if(process.env.MOCK_FAIL==='audit')process.exit(1);}
  if(args.some(a=>a.includes('public_base='))){const sql=fs.readFileSync(0,'utf8');if(!sql.includes('restore-approved-avatars')||process.env.MOCK_RESTORE_FAIL==='1')process.exit(1);const avatar=read('avatar.json');if(avatar.value.startsWith('https://game.ccnepower.com/avalon/api/avatars/')){avatar.value='data:image/png;base64,YXBwcm92ZWQ=';save('avatar.json',avatar);}}
  if(args.includes('inventory'))console.log('{"users":2}');
 }
}
if(name==='curl') {
 if(process.env.MOCK_FAIL==='public'&&!args.includes('--resolve'))process.exit(1);
 if(args.some(a=>a.endsWith('/api/health')))console.log(JSON.stringify({status:'ok',contentSafetyEnabled:!read('containers.json').some(r=>r.id==='restored-server')}));
 else process.stdout.write('200');
}
`;

function fixture(t,{active=true,mafiaActive=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'avalon-content-release-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(join(dir,'deploy'));mkdirSync(join(dir,'bin'));
 mkdirSync(join(dir,'scripts/deploy'),{recursive:true});writeFileSync(join(dir,'scripts/deploy/restore-content-safety-avatars.sql'),'-- restore-approved-avatars');
 for(const name of ['docker','git','systemctl','curl'])writeFileSync(join(dir,'bin',name),tool,{mode:0o700});
 const original='PROJECT=avalon-ecs\nAPP_ORIGIN=https://game.ccnepower.com\nAPP_BASE_PATH=/avalon/\nPUBLIC_INGRESS_MODE=portal\nIMAGE_TAG=old\nWECHAT_MINIGAME_APP_ID=wxdb4e422c14adab3f\nWECHAT_MINIGAME_APP_SECRET=private-wx-secret\nWECHAT_MINIGAME_VOICE_ENABLED=true\nAGORA_TEST_PRIVATE=keep-agora-unchanged\n';
 writeFileSync(join(dir,'deploy/.env.ecs'),original,{mode:0o600});
 for(const name of ['compose.yaml','compose.portal.yaml'])writeFileSync(join(dir,'deploy',name),'services: {}\n');
 const rows=[['avalon-ecs','server'],['avalon-ecs','gateway'],['avalon-ecs','postgres'],['mafia','server'],['mafia','postgres'],['game-portal','gateway'],['xiongqc-ecs','gateway']].map(([project,service])=>({
  id:project+'-'+service,name:'/'+project+'-'+service+'-1',image:'sha256:old-'+service,started:'original',restarts:'0',project,service}));
 writeFileSync(join(dir,'containers.json'),JSON.stringify(rows));
 writeFileSync(join(dir,'avatar.json'),JSON.stringify({value:'data:image/png;base64,YXBwcm92ZWQ='}));
 writeFileSync(join(dir,'timers.json'),JSON.stringify({'avalon-auto-update.timer':active,'mafia-auto-update.timer':mafiaActive}));
 writeFileSync(join(dir,'commands.jsonl'),'');
 const credentials=join(dir,'credentials.json');writeFileSync(credentials,JSON.stringify({ALIYUN_CONTENT_ACCESS_KEY_ID:'testOnlyId',ALIYUN_CONTENT_ACCESS_KEY_SECRET:'private-ali-secret'}),{mode:0o600});
 const execute=(phase,overrides={},extra=[])=>{
  const args=['--root',dir,phase,...(phase==='prepare'?['--config-file',credentials]:phase==='cutover'?['--revision',revision,'--test-player-code','123456']:[]),...extra];
  const result=spawnSync('bash',[script,...args],{encoding:'utf8',env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH,MOCK_ROOT:dir,MOCK_REVISION:revision,...overrides}});
  for(const secret of ['private-wx-secret','private-ali-secret','keep-agora-unchanged'])assert.ok(!String(result.stdout+result.stderr).includes(secret),'secret must not reach terminal');
  return result;
 };
 const commands=()=>readFileSync(join(dir,'commands.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const stateDir=()=>readFileSync(join(dir,'deploy/runtime/content-safety-current'),'utf8').trim();
 const state=()=>JSON.parse(readFileSync(join(stateDir(),'state.json'),'utf8'));
 const timers=()=>JSON.parse(readFileSync(join(dir,'timers.json'),'utf8'));
 return{dir,original,execute,commands,stateDir,state,timers,rows};
}

test('prepare works without new server source, keeps private config and does not stop containers',t=>{
 const f=fixture(t);const result=f.execute('prepare');assert.equal(result.status,0,result.stderr);
 assert.equal(readFileSync(join(f.dir,'deploy/.env.ecs'),'utf8'),f.original);
 assert.equal(f.state().phase,'prepared');assert.equal(statSync(f.stateDir()).mode&0o777,0o700);
 for(const name of ['.env.backup','.env.next','state.json'])assert.equal(statSync(join(f.stateDir(),name)).mode&0o777,0o600);
 assert.deepEqual(f.timers(),{'avalon-auto-update.timer':false,'mafia-auto-update.timer':false});
 assert.ok(!f.commands().some(c=>c.tool==='docker'&&(c.args.includes('up')||c.args.includes('stop')||c.args.includes('build'))));
 const again=f.execute('prepare');assert.notEqual(again.status,0);assert.equal(f.state().phase,'prepared','second prepare must not destroy original baseline');
});

test('an active game prevents preparation without stopping or rebuilding any container',t=>{
 const f=fixture(t),result=f.execute('prepare',{MOCK_ACTIVE:'1'});assert.notEqual(result.status,0);assert.match(result.stderr,/进行中对局/);
 assert.ok(!f.commands().some(c=>c.tool==='docker'&&c.args[0]==='compose'));
 assert.equal(f.timers()['avalon-auto-update.timer'],false);assert.equal(f.timers()['mafia-auto-update.timer'],true);
});

test('a game started during image build prevents the maintenance switch',t=>{
 const f=fixture(t);assert.equal(f.execute('prepare').status,0);
 const result=f.execute('cutover',{MOCK_AFTER_BUILD_ACTIVE:'1'});assert.notEqual(result.status,0);assert.match(result.stderr,/进行中对局/);
 assert.ok(f.commands().some(c=>c.args.includes('build')));
 assert.ok(!f.commands().some(c=>c.tool==='docker'&&c.args[0]==='compose'&&(c.args.includes('stop')||c.args.includes('up'))));
 assert.equal(readFileSync(join(f.dir,'deploy/.env.ecs'),'utf8'),f.original);
});

for(const failure of ['up','probe','audit','public'])test('cutover '+failure+' failure restores old images/config, leaves Avalon timer paused and preserves data',t=>{
 const f=fixture(t);assert.equal(f.execute('prepare').status,0);
 const result=f.execute('cutover',{MOCK_FAIL:failure});assert.notEqual(result.status,0);assert.match(result.stderr,/已恢复原 Avalon/);
 assert.equal(readFileSync(join(f.dir,'deploy/.env.ecs'),'utf8'),f.original);
 assert.deepEqual(f.timers(),{'avalon-auto-update.timer':false,'mafia-auto-update.timer':true});
 const rollback=f.commands().find(c=>c.tool==='docker'&&c.args.some(a=>a.endsWith('rollback.json')));
 assert.ok(rollback);assert.ok(rollback.args.includes('--no-build'));assert.ok(rollback.args.includes('--no-deps'));assert.deepEqual(rollback.args.slice(-2),['server','gateway']);
 assert.equal(f.state().phase,'failed');
 assert.equal(JSON.parse(readFileSync(join(f.dir,'avatar.json'),'utf8')).value,'data:image/png;base64,YXBwcm92ZWQ=','the same approved image remains readable by the old server after partial audit or post-audit failure');
 const restoreIndex=f.commands().findIndex(c=>c.args.some(a=>a.includes('public_base=')));
 assert.ok(restoreIndex>=0);assert.ok(f.commands().findIndex(c=>c.args.some(a=>a.endsWith('rollback.json')))>restoreIndex);
 assert.ok(!f.commands().some(c=>c.args.some(a=>/^(down|rm|prune|DROP)$/.test(a))));
});

test('failed avatar compatibility restore never starts the old server or claims successful rollback',t=>{
 const f=fixture(t);assert.equal(f.execute('prepare').status,0);
 const result=f.execute('cutover',{MOCK_FAIL:'audit',MOCK_RESTORE_FAIL:'1'});assert.notEqual(result.status,0);
 assert.match(result.stderr,/自动回滚未验证成功/);assert.doesNotMatch(result.stderr,/已恢复原 Avalon/);
 assert.ok(!f.commands().some(c=>c.args.some(a=>a.endsWith('rollback.json'))));
 assert.deepEqual(f.timers(),{'avalon-auto-update.timer':false,'mafia-auto-update.timer':true});
});

test('successful release backs up both databases, isolates all mutations and preserves voice configuration',t=>{
 const f=fixture(t,{mafiaActive:false});assert.equal(f.execute('prepare').status,0);
 const result=f.execute('cutover');assert.equal(result.status,0,result.stderr);
 assert.equal(f.state().phase,'complete');assert.equal(readFileSync(join(f.dir,'deploy/runtime/last-successful-deploy'),'utf8').trim(),revision);
 assert.deepEqual(f.timers(),{'avalon-auto-update.timer':true,'mafia-auto-update.timer':false});
 const environment=readFileSync(join(f.dir,'deploy/.env.ecs'),'utf8');
 assert.match(environment,/WECHAT_MINIGAME_VOICE_ENABLED=true/);assert.match(environment,/AGORA_TEST_PRIVATE=keep-agora-unchanged/);
 assert.match(environment,/CONTENT_SAFETY_ENABLED='true'/);assert.match(environment,/CONTENT_SAFETY_MAINTENANCE='false'/);
 for(const name of ['avalon.dump','mafia.dump'])assert.equal(readFileSync(join(f.stateDir(),name)).subarray(0,5).toString(),'PGDMP');
 const commands=f.commands();
 for(const c of commands.filter(c=>c.tool==='docker'&&c.args[0]==='compose'&&c.args.some(a=>['up','stop','build'].includes(a)))){
  assert.equal(c.args[c.args.indexOf('--project-name')+1],'avalon-ecs');assert.deepEqual(c.args.slice(-2),['server','gateway']);
  if(c.args.includes('up'))assert.ok(c.args.includes('--no-deps'));
 }
 const now=JSON.parse(readFileSync(join(f.dir,'containers.json'),'utf8'));
 for(const old of f.rows.filter(r=>r.project!=='avalon-ecs'||r.service==='postgres'))assert.deepEqual(now.find(r=>r.id===old.id),old);
 assert.ok(commands.some(c=>c.tool==='curl'&&!c.args.includes('--resolve')&&c.args.includes('https://game.ccnepower.com/avalon/api/health')));
 assert.ok(!commands.some(c=>c.tool==='git'&&['pull','fetch','reset','checkout'].includes(c.args[0])));
 assert.equal(JSON.parse(readFileSync(join(f.stateDir(),'verification.json'),'utf8')).realDeviceAndVoice,'NOT_TESTED');
 assert.equal(f.execute('verify').status,0);
});

test('revision mismatch stops before any deployment and does not consume prepared state',t=>{
 const f=fixture(t);assert.equal(f.execute('prepare').status,0);
 const result=f.execute('cutover',{MOCK_REVISION:'b'.repeat(40)});assert.notEqual(result.status,0);assert.equal(f.state().phase,'prepared');
 assert.ok(!f.commands().some(c=>c.tool==='docker'&&c.args.includes('build')));
});

for(const [name,environment] of [['feature branch',{MOCK_BRANCH:'codex/content-safety-review'}],['unmerged main',{MOCK_ORIGIN_REVISION:'b'.repeat(40)}]])
test(name+' cannot deploy or restore the update timer prematurely',t=>{
 const f=fixture(t);assert.equal(f.execute('prepare').status,0);
 const result=f.execute('cutover',environment);assert.notEqual(result.status,0);assert.equal(f.state().phase,'prepared');
 assert.ok(!f.commands().some(c=>c.tool==='docker'&&c.args.includes('build')));
 assert.equal(f.timers()['avalon-auto-update.timer'],false);
});
