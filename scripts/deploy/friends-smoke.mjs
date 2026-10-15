// Exercises only newly created test guests/rooms through the configured public endpoint.
// No credentials, private roles or invitations are saved in the evidence report.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { cli, instance, root } from './lib.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=20000) {
  const end=Date.now()+timeout;
  while(Date.now()<end){if(check())return;await delay(50);}
  throw new Error(`Timed out: ${label}`);
}
cli(async()=>{
  const context=instance(process.argv[2]??'friends'),origin=context.env.APP_ORIGIN;
  assert.equal(context.env.EXPOSURE,'ngrok','Use a separate ngrok friends-test instance.');
  const people=[],report={startedAt:new Date().toISOString(),origin,checks:[]};
  const pass=label=>{report.checks.push(label);console.log(`PASS ${label}`);};
  async function request(path,{method='GET',body,user,headers={}}={}) {
    const response=await fetch(`${origin}${path}`,{method,signal:AbortSignal.timeout(20000),headers:{
      origin,'x-avalon-request':'1',...(body===undefined?{}:{'content-type':'application/json'}),
      ...(user?.cookie?{cookie:user.cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const cookie=response.headers.get('set-cookie');if(user&&cookie)user.cookie=cookie.split(';')[0];
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
    return {status:response.status,headers:response.headers,text,data};
  }
  async function api(path,options){const r=await request(path,options);assert.equal(r.status,200,`${path}: ${r.status} ${r.data?.error??''}`);return r.data;}
  async function connect(user,roomId) {
    const socket=new WebSocket(`${origin.replace(/^http/,'ws')}/api/rooms/${roomId}/socket`,{headers:{origin,cookie:user.cookie},handshakeTimeout:20000});
    user.socket=socket;user.messages=[];user.room=undefined;
    socket.on('message',raw=>{const m=JSON.parse(raw.toString());user.messages.push(m);if(m.type==='snapshot')user.room=m.room;});
    let failure;socket.on('error',err=>{failure=err;});
    await until(()=>{if(failure)throw failure;return !!user.room;},'WebSocket snapshot');
  }
  let active=[];
  async function command(user,type,payload={},saved) {
    const value=saved??{type,payload,commandId:randomUUID(),expectedVersion:user.room.version};
    const from=user.messages.length;user.socket.send(JSON.stringify(value));let receipt;
    await until(()=>receipt=user.messages.slice(from).find(m=>m.type==='commandResult'&&m.commandId===value.commandId),`${type} receipt`);
    assert.equal(receipt.ok,true,`${type}: ${receipt.error??''}`);
    if(type==='leaveRoom')active=active.filter(p=>p!==user);
    if(!saved)await until(()=>active.every(p=>p.room?.version>value.expectedVersion),`${type} broadcast`);
    return value;
  }
  try {
    assert.equal((await api('/api/health')).storage,'postgresql');
    const page=await request('/');assert.equal(page.status,200);assert.match(page.text,/<div id="root">/);
    assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const asset=page.text.match(/src="([^\"]+\.js)"/)[1];assert.equal((await request(asset)).status,200);
    pass('public HTTPS, PostgreSQL health, built assets and security headers');
    assert.equal((await request('/api/sessions/guest',{method:'POST',body:{nickname:'跨源测试'},headers:{origin:'https://outside.invalid'}})).status,403);
    assert.equal((await request('/api/sessions/guest',{method:'POST',body:{nickname:'缺少标识'},headers:{'x-avalon-request':''}})).status,403);
    for(let i=0;i<7;i++) {
      const user={};const r=await request('/api/sessions/guest',{method:'POST',body:{nickname:`公网验收${i+1}`},user});
      assert.equal(r.status,200);user.id=r.data.user.id;people.push(user);
      for(const pattern of [/HttpOnly/i,/SameSite=Strict/i,/; Secure/i])assert.match(r.headers.get('set-cookie'),pattern);
    }
    const host=people[0];const created=await api('/api/rooms',{method:'POST',user:host});const roomId=created.room.id;
    await connect(host,roomId);active=[host];
    await command(host,'updateSettings',{...host.room.settings,playerCount:5});
    const invitation=(await api(`/api/rooms/${roomId}`,{user:host})).invite;
    for(const p of people.slice(1,5))await api('/api/rooms/join',{method:'POST',body:{key:invitation},user:p});
    await Promise.all(people.slice(1,5).map(p=>connect(p,roomId)));active=people.slice(0,5);
    await until(()=>active.every(p=>p.room.members.filter(m=>m.online).length===5),'five online players');
    const admission=await command(host,'setAdmission',{acceptingNewMembers:false});
    const version=host.room.version;await command(host,admission.type,admission.payload,admission);assert.equal(host.room.version,version);
    assert.equal((await request('/api/rooms/join',{method:'POST',body:{key:invitation},user:people[5]})).data.error,'JOIN_DISABLED');
    const returning=people[1];returning.socket.close();
    await until(()=>host.room.members.find(p=>p.id===returning.id).online===false,'disconnect recorded');
    assert.equal((await api('/api/sessions/refresh',{method:'POST',user:returning})).user.id,returning.id);
    await api('/api/rooms/join',{method:'POST',body:{key:invitation},user:returning});await connect(returning,roomId);
    await until(()=>active.every(p=>p.room.members.every(m=>m.online)),'reconnect to admission-closed room');
    const wsStatus=await new Promise((resolve,reject)=>{
      const socket=new WebSocket(`${origin.replace(/^http/,'ws')}/api/rooms/${roomId}/socket`,{headers:{origin:'https://outside.invalid',cookie:host.cookie},handshakeTimeout:20000});
      socket.on('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);socket.terminate();});
      socket.on('error',reject);socket.on('open',()=>{socket.close();reject(new Error('Cross-origin WebSocket accepted'));});
    });assert.equal(wsStatus,403);
    pass('seven Secure guest sessions, five WSS players, invite, admission, reconnect, duplicate receipt, HTTP and WSS origin protection');
    async function start() {
      for(const p of active)await command(p,'setReady',{ready:true});
      await command(host,'startGame');
      assert.equal(host.room.game.phase,'dealing');
      assert.ok(active.every(p=>!p.room.game.self));
      const deadline=Date.parse(host.room.game.dealEndsAt),serverTime=Date.parse(host.room.serverTime);
      assert.ok(deadline-serverTime>3500&&deadline-serverTime<=5000);
      await until(()=>active.every(p=>p.room.game.phase==='role_reveal'),'five-second deal');
      assert.ok(active.every(p=>p.room.game.self&&!p.room.game.revealedRoles));
      for(const p of active)await command(p,'confirmRole');
    }
    async function mission() {
      const g=host.room.game,team=g.players.slice(0,g.missionSizes[g.mission-1]).map(p=>p.id),captain=active.find(p=>p.id===g.captainId);
      await command(captain,'proposeTeam',{playerIds:team,direction:'clockwise'});await command(captain,'startTeamVote');
      for(const p of active)await command(p,'teamVote',{approve:true});
      for(const id of team)await command(active.find(p=>p.id===id),'missionVote',{success:true});
    }
    await start();for(let i=0;i<3;i++)await mission();
    assert.equal(host.room.game.phase,'assassination');
    const assassin=active.find(p=>p.room.game.self.role==='assassin'),target=active.find(p=>p.room.game.self.team==='blue'&&p.room.game.self.role!=='merlin');
    await command(assassin,'assassinate',{targetId:target.id});
    assert.equal(host.room.game.result.reason,'merlin_survived');const firstId=host.room.game.id;
    assert.equal((await api('/api/me/stats',{user:host})).completed,1);
    assert.equal((await api(`/api/games/${firstId}/replay`,{user:host})).rounds.length,3);
    assert.equal((await request(`/api/games/${firstId}/replay`,{user:people[5]})).status,404,'Non-participant replay must conceal the game');
    pass('five-player complete game: five-second deal, private identity, three missions, assassination, statistics and private replay');
    await command(host,'returnToLobby');
    await command(host,'updateSettings',{...host.room.settings,playerCount:7,ladyEnabled:true,earlyAssassinationEnabled:true});
    await command(host,'setAdmission',{acceptingNewMembers:true});
    for(const p of people.slice(5))await api('/api/rooms/join',{method:'POST',body:{key:invitation},user:p});
    await Promise.all(people.slice(5).map(p=>connect(p,roomId)));active=people;
    await until(()=>active.every(p=>p.room.members.filter(m=>m.online).length===7),'seven online players');
    await start();await mission();await mission();
    assert.equal(host.room.game.phase,'lady');
    const inspector=active.find(p=>p.id===host.room.game.lady.holderId),inspectee=active.find(p=>!host.room.game.lady.holderIds.includes(p.id));
    await command(inspector,'inspectAlignment',{targetId:inspectee.id});
    assert.ok(inspector.room.game.self.canConfirmInspection);await command(inspector,'confirmInspection');
    assert.equal(host.room.game.phase,'early_window');
    const earlyAssassin=active.find(p=>p.room.game.self.role==='assassin'),merlin=active.find(p=>p.room.game.self.role==='merlin');
    await command(earlyAssassin,'earlyAssassinationDecision',{attempt:true});await command(earlyAssassin,'assassinate',{targetId:merlin.id});
    assert.equal(host.room.game.result.reason,'early_merlin_found');assert.equal((await api('/api/me/stats',{user:host})).completed,2);
    const replay=await api(`/api/games/${host.room.game.id}/replay`,{user:host});assert.equal(replay.inspections.length,1);
    assert.equal((await api('/api/me/games',{user:host})).games.length,2);
    pass('same-room seven-player game: Lady inspection, private acknowledgement, early assassination and two persisted histories');
    for(const p of [...active].reverse())await command(p,'leaveRoom');
    pass('test players leave; empty test room closes without changing existing rooms');
    // Use one existing test account so rate-limit probing creates no extra users.
    let limited=false;
    for(let i=0;i<17;i++) {
      const r=await request('/api/sessions/guest',{method:'POST',body:{nickname:'公网验收1'},user:host,headers:{'x-forwarded-for':`198.51.100.${i+1}`}});
      if(r.status===429){limited=true;break;}assert.equal(r.status,200);
    }
    assert.ok(limited);pass('spoofed forwarding IP cannot evade public guest rate limit');
    report.finishedAt=new Date().toISOString();mkdirSync(`${root}deploy/evidence`,{recursive:true,mode:0o700});
    const path=`${root}deploy/evidence/friends-smoke-${Date.now()}.json`;
    writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(`Report: ${path}`);
  } finally {for(const p of people)p.socket?.close();}
});
