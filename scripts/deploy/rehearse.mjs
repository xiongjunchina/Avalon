// Destructive actions are limited to restoring an empty, separately named database.
// Guest credentials live only in this process; reports contain no tokens or roles.
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, copyFileSync, appendFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { cli, instance, compose, sql, root } from './lib.mjs';
import { backup } from './backup.mjs';
import { restore } from './restore.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function eventually(fn) {
  let last;
  for(let i=0;i<80;i++) { try { return await fn(); } catch(error) { last=error; await delay(250); } }
  throw last;
}
async function transport(context) {
  let ca;
  if(context.env.COOKIE_SECURE==='true') {
    ca=await eventually(()=>compose(context,['exec','-T','gateway','cat','/data/caddy/pki/authorities/local/root.crt']));
    mkdirSync(`${root}deploy/certs`,{recursive:true,mode:0o700});
    writeFileSync(`${root}deploy/certs/${context.name}-root.crt`,ca,{mode:0o600});
  }
  async function request(path,{method='GET',body,user,headers={}}={}) {
    const url=new URL(path,context.env.APP_ORIGIN), raw=body===undefined?undefined:JSON.stringify(body);
    return new Promise((resolve,reject)=>{
      const req=(url.protocol==='https:'?https:http).request(url,{method,ca,headers:{
        origin:context.env.APP_ORIGIN,'x-avalon-request':'1',...(raw?{'content-type':'application/json'}:{}),
        ...(user?.cookie?{cookie:user.cookie}:{}),...headers,
      }},res=>{
        const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
          const text=Buffer.concat(chunks).toString();let data;try{data=JSON.parse(text);}catch{}
          if(user && res.headers['set-cookie'])user.cookie=res.headers['set-cookie'][0].split(';')[0];
          resolve({status:res.statusCode,headers:res.headers,text,data});
        });
      });
      req.on('error',reject);req.setTimeout(8000,()=>req.destroy(new Error('HTTP timeout')));req.end(raw);
    });
  }
  async function api(path,options) {const res=await request(path,options);assert.equal(res.status,200,`${options?.method??'GET'} ${path}: ${res.status} ${res.data?.error??''}`);return res.data;}
  async function connect(user,roomId) {
    const socket=new WebSocket(`${context.env.APP_ORIGIN.replace(/^http/,'ws')}/api/rooms/${roomId}/socket`,{ca,headers:{origin:context.env.APP_ORIGIN,cookie:user.cookie}});
    const messages=[];socket.on('message',raw=>messages.push(JSON.parse(raw.toString())));
    let failure;socket.on('error',error=>{failure=error;});
    await eventually(async()=>{if(failure)throw failure;assert.ok(messages.some(m=>m.type==='snapshot'));});
    user.socket=socket;user.messages=messages;
  }
  return {request,api,connect};
}

cli(async()=>{
  const [sourceName='tls',targetName='recovery']=process.argv.slice(2),source=instance(sourceName),target=instance(targetName);
  assert.notEqual(source.env.PROJECT,target.env.PROJECT);
  assert.equal(await sql(source,'SELECT count(*) FROM users'),'0','Rehearsal source must be empty; use a new instance, never existing players.');
  const report={startedAt:new Date().toISOString(),source:source.env.PROJECT,target:target.env.PROJECT,checks:[]};
  const pass=name=>{report.checks.push(name);console.log(`PASS ${name}`);};
  const a=await transport(source),people=[];
  try {
    const page=await a.request('/');assert.equal(page.status,200);assert.match(page.text,/<div id="root">/);assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
    const asset=page.text.match(/src="([^\"]+\.js)"/)[1];assert.equal((await a.request(asset)).status,200);
    assert.equal((await a.request('/api/not-found')).status,404);
    pass('production static assets, security headers and API routing');
    const bad=await a.request('/api/sessions/guest',{method:'POST',body:{nickname:'外站'},headers:{origin:'https://outside.invalid'}});assert.equal(bad.status,403);
    const csrf=await a.request('/api/sessions/guest',{method:'POST',body:{nickname:'缺少标识'},headers:{'x-avalon-request':''}});assert.equal(csrf.status,403);
    for(let i=0;i<5;i++) {
      const person={};const response=await a.request('/api/sessions/guest',{method:'POST',body:{nickname:`部署验收${i+1}`},user:person});
      assert.equal(response.status,200);person.id=response.data.user.id;people.push(person);
      assert.match(response.headers['set-cookie'][0],/HttpOnly/i);assert.match(response.headers['set-cookie'][0],/SameSite=Strict/i);
      assert.equal(/; Secure/i.test(response.headers['set-cookie'][0]),source.env.COOKIE_SECURE==='true');
    }
    const host=people[0],room=(await a.api('/api/rooms',{method:'POST',user:host})).room,roomPath=`/api/rooms/${room.id}`;
    for(const person of people.slice(1))await a.api('/api/rooms/join',{method:'POST',body:{key:room.code},user:person});
    await Promise.all(people.map(p=>a.connect(p,room.id)));
    const state=async(client=a,user=host)=>(await client.api(roomPath,{user})).room;
    async function command(user,type,payload={},client=a,saved) {
      const value=saved??{type,payload,commandId:randomUUID(),expectedVersion:(await state(client,user)).version};
      const from=user.messages.length;user.socket.send(JSON.stringify(value));
      const receipt=await eventually(async()=>{
        const message=user.messages.slice(from).find(m=>m.type==='commandResult'&&m.commandId===value.commandId);
        assert.ok(message,`No matching ${type} receipt; events: ${user.messages.slice(from).map(m=>m.type+(m.error?`:${m.error}`:'')).join(',')}`);return message;
      });
      assert.equal(receipt.ok,true,`${type}: ${receipt.error??''}`);return value;
    }
    const settings={...(await state()).settings,playerCount:5,anonymousTeamVote:true};
    await command(host,'updateSettings',settings);
    const admission=await command(host,'setAdmission',{acceptingNewMembers:false});
    const version=(await state()).version;await command(host,admission.type,admission.payload,a,admission);assert.equal((await state()).version,version);
    const fresh={};await a.api('/api/sessions/guest',{method:'POST',body:{nickname:'新访客'},user:fresh});
    assert.equal((await a.request('/api/rooms/join',{method:'POST',body:{key:room.code},user:fresh})).data.error,'JOIN_DISABLED');
    await a.api('/api/rooms/join',{method:'POST',body:{key:room.code},user:host});
    pass('five WebSocket players, admission, guest cookie, CSRF and duplicate receipts');
    for(const p of people)await command(p,'setReady',{ready:true});
    await command(host,'startGame');await eventually(async()=>assert.equal((await state()).game.phase,'role_reveal'));for(const p of people)await command(p,'confirmRole');
    for(let i=0;i<5;i++) {
      const g=(await state()).game,captain=people.find(p=>p.id===g.captainId);
      await command(captain,'proposeTeam',{playerIds:g.players.slice(0,2).map(p=>p.id),direction:'clockwise'});
      await command(captain,'startTeamVote');for(const p of people)await command(p,'teamVote',{approve:false});
    }
    const ended=(await state()).game;assert.equal(ended.result.reason,'five_rejections');
    await a.api(`/api/me/favorites/${ended.id}`,{method:'PUT',user:host});
    await a.api('/api/me/presets',{method:'POST',user:host,body:{name:'部署恢复预设',settings}});
    await a.api('/api/me',{method:'PATCH',user:host,body:{nickname:'恢复后的房主',avatar:'moon'}});
    const stats=await a.api('/api/me/stats',{user:host});assert.equal(stats.completed,1);
    const replay=await a.api(`/api/games/${ended.id}/replay`,{user:host});assert.equal(replay.rounds.length,5);
    pass('completed game, statistics, private replay, favorite and preset');
    await command(host,'returnToLobby');for(const p of people)await command(p,'setReady',{ready:true});
    await command(host,'startGame');await eventually(async()=>assert.equal((await state()).game.phase,'role_reveal'));for(const p of people)await command(p,'confirmRole');
    const g=(await state()).game,captain=people.find(p=>p.id===g.captainId);
    await command(captain,'proposeTeam',{playerIds:g.players.slice(0,2).map(p=>p.id),direction:'clockwise'});
    await command(captain,'startTeamVote');const ballot=await command(host,'teamVote',{approve:true});
    const before=await state();
    const selfBefore=await Promise.all(people.map(p=>state(a,p).then(r=>r.game.self)));
    await compose(source,['restart','server']);
    await eventually(()=>a.api('/api/health'));
    await Promise.all(people.map(p=>a.connect(p,room.id)));
    assert.equal((await state()).game.progress.teamVotes,1);
    for(let i=0;i<5;i++)assert.deepEqual((await state(a,people[i])).game.self,selfBefore[i]);
    await command(host,ballot.type,ballot.payload,a,ballot);assert.equal((await state()).game.progress.teamVotes,1);
    pass('container restart preserves identities, roles, settings and submitted ballot');
    await compose(source,['stop','gateway','server']);
    const path=await backup(source);report.backup=path.replace(root,'');
    await compose(target,['up','-d','--wait','postgres']);
    // Integrity refusal happens before any target SQL mutation.
    const damaged=`${path}.damaged`;copyFileSync(path,damaged);copyFileSync(`${path}.json`,`${damaged}.json`);appendFileSync(damaged,'corruption');
    await assert.rejects(restore(target,damaged),/checksum/);
    await assert.rejects(restore(source,path),/different instance/);
    const tables=['users','sessions','rooms','room_members','games','game_participants','favorites','setting_presets','command_receipts','schema_migrations'];
    const fingerprint=async ctx=>Promise.all(tables.map(async table=>({table,count:await sql(ctx,`SELECT count(*) FROM ${table}`),hash:await sql(ctx,`SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text),'')) FROM ${table} t`)})));
    const expected=await fingerprint(source);
    await restore(target,path);
    assert.deepEqual(await fingerprint(target),expected);
    await assert.rejects(restore(target,path),/not empty/);
    report.tables=expected.map(({table,count})=>({table,count:Number(count)}));
    pass('checksum guard, source protection, empty-target guard and ten-table exact restore');
    await compose(target,['up','-d','--wait','--wait-timeout','120']);
    const b=await transport(target);await eventually(()=>b.api('/api/health'));
    assert.equal((await b.api('/api/me',{user:host})).user.nickname,'恢复后的房主');
    assert.deepEqual(await b.api('/api/me/stats',{user:host}),stats);
    assert.deepEqual(await b.api(`/api/games/${ended.id}/replay`,{user:host}),replay);
    assert.equal((await b.api('/api/me/games?favorites=true',{user:host})).games[0].id,ended.id);
    assert.equal((await b.api('/api/me/presets',{user:host})).presets[0].name,'部署恢复预设');
    await Promise.all(people.map(p=>b.connect(p,room.id)));
    const after=await state(b);assert.deepEqual(after.settings,before.settings);assert.equal(after.acceptingNewMembers,false);
    assert.deepEqual(after.members.map(p=>[p.id,p.seat,p.ready]),before.members.map(p=>[p.id,p.seat,p.ready]));
    for(let i=0;i<5;i++)assert.deepEqual((await state(b,people[i])).game.self,selfBefore[i]);
    await command(host,ballot.type,ballot.payload,b,ballot);assert.equal((await state(b)).game.progress.teamVotes,1);
    for(const p of people.slice(1))await command(p,'teamVote',{approve:true},b);
    assert.equal((await state(b)).game.phase,'mission');
    pass('restored cookies, seats, history and receipts; unfinished game continues');
    // Forging a fresh X-Forwarded-For must not buy a new rate-limit bucket.
    let limited=false;
    for(let i=0;i<17;i++) {
      const r=await b.request('/api/sessions/guest',{method:'POST',user:host,body:{nickname:'恢复后的房主'},headers:{'x-forwarded-for':`198.51.100.${i+1}`}});
      if(r.status===429){limited=true;break;}assert.equal(r.status,200);
    }
    assert.ok(limited);pass('gateway overwrites spoofed forwarding headers; rate limit holds');
    await compose(source,['up','-d','--wait','--wait-timeout','120']);
    report.finishedAt=new Date().toISOString();
    mkdirSync(`${root}deploy/evidence`,{recursive:true,mode:0o700});
    writeFileSync(`${root}deploy/evidence/rehearsal-${sourceName}.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(`Rehearsal passed; ${report.checks.length} groups. Both databases retained; no host CA installed.`);
  } finally {for(const p of people)p.socket?.close();}
});
