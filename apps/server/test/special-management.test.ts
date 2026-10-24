import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {defaultSettings} from '@avalon/contracts';
import {headers,service,database} from './helpers.js';
import {gameFixture} from './game-helpers.js';
import {SpecialManagement} from '../src/special-management.js';
import {AdminService} from '../src/admin.js';
process.env.ADMIN_KEY ??= 'local-test-'+randomUUID();
const cookie=(token:string)=>({cookie:`avalon_session=${token}`});
const adminHeaders=()=>({...headers,'x-admin-key':process.env.ADMIN_KEY!});
const vacant=async(s:SpecialManagement,start=900000)=>{for(let n=start;n<999999;n++)if((await s.availability(String(n))).status==='available')return String(n);throw Error('no test code');};

test('fixed dedicated rooms persist configuration, enforce ownership and reopen with fresh identity',async t=>{
 const f=await database(t),s=f.store,m=new SpecialManagement(s),a=await s.createGuest('房主'),b=await s.createGuest('朋友');
 const settings={...defaultSettings,playerCount:9};
 await m.saveRoom({code:'999999',name:'朋友专属',managerId:a.user.id,settings,password:'secret'});
 const template=(await m.rooms(a.user.id))[0];assert.equal((await m.rooms(b.user.id)).length,0);assert.equal(template.hasPassword,true);
 await assert.rejects(m.saveRoom({code:'999999',name:'重复',managerId:b.user.id,settings}),/ROOM_CODE_TAKEN/);
 await assert.rejects(s.createRoom(b.user,undefined,{dedicatedRoomId:template.id}),/FORBIDDEN/);
 const room=await s.createRoom(a.user,undefined,{dedicatedRoomId:template.id});assert.equal(room.code,'999999');assert.equal(room.settings.playerCount,9);
 assert.equal((await m.rooms())[0].activeRoomId,room.id);
 await assert.rejects(m.saveRoom({code:template.code,name:'修改',managerId:a.user.id,settings},template.id),/DEDICATED_ROOM_ACTIVE/);
 const ordinary=await s.createRoom(b.user);assert.notEqual(ordinary.code,'999999');
 await s.execute(a.user.id,room.id,{commandId:randomUUID(),expectedVersion:room.version,type:'leaveRoom',payload:{}});
 const next=await s.createRoom(a.user,undefined,{dedicatedRoomId:template.id});assert.equal(next.code,room.code);assert.notEqual(next.id,room.id);assert.notEqual(next.inviteKey,room.inviteKey);assert.equal(next.hasPassword,true);
 assert.equal((await s.snapshot(room.id)),null);assert.equal((await m.rooms())[0].activeRoomId,next.id);
 await assert.rejects(new AdminService(s).deleteUser(a.user.id),/MANAGES_DEDICATED_ROOMS/);
});

test('number joins require password, opaque invites bypass it and password changes rotate invitations without ejecting members',async t=>{
 const f=await database(t),s=f.store,m=new SpecialManagement(s),a=await s.createGuest('房主'),b=await s.createGuest('朋友'),c=await s.createGuest('其他');
 await m.saveRoom({code:'888888',name:'好友桌',managerId:a.user.id,settings:defaultSettings,password:'before'});
 const d=(await m.rooms())[0];let r=await s.createRoom(a.user,undefined,{dedicatedRoomId:d.id});const originalInvite=r.inviteKey!;
 await assert.rejects(s.join(b.user,r.code),/ROOM_PASSWORD_REQUIRED/);await assert.rejects(s.join(b.user,r.code,'bad'),/ROOM_PASSWORD_INVALID/);
 assert.equal((await s.snapshot(r.id))!.members.length,1);
 r=await s.join(b.user,originalInvite);assert.equal(r.members.length,2);
 await assert.rejects(s.updateRoomPassword(b.user.id,r.id,'after',r.version),/FORBIDDEN/);
 r=await s.updateRoomPassword(a.user.id,r.id,'after',r.version);assert.notEqual(r.inviteKey,originalInvite);
 await assert.rejects(s.join(c.user,originalInvite),/ROOM_NOT_FOUND/);await assert.rejects(s.join(c.user,r.code,'before'),/ROOM_PASSWORD_INVALID/);
 assert.equal((await s.join(b.user,r.code)).id,r.id);r=await s.join(c.user,r.code,'after');assert.equal(r.members.length,3);
 const serialized=JSON.stringify(r);assert.ok(!serialized.includes('password_hash'));assert.ok(!serialized.includes('after'));assert.ok(!serialized.includes('recovery_hash'));
 await assert.rejects(s.updateRoomPassword(a.user.id,r.id,null,r.version-1),/VERSION_CONFLICT/);
 await f.pool.query("UPDATE rooms SET phase='playing' WHERE id=$1",[r.id]);await assert.rejects(s.updateRoomPassword(a.user.id,r.id,null,r.version),/GAME_IN_PROGRESS/);
 await f.pool.query("UPDATE rooms SET phase='waiting' WHERE id=$1",[r.id]);r=await s.updateRoomPassword(a.user.id,r.id,null,r.version);assert.equal(r.hasPassword,false);assert.equal((await m.rooms())[0].hasPassword,false);
});

test('reserved codes reject collisions and concurrent assignment; unused old code is released without changing identity',async t=>{
 const f=await database(t),s=f.store,m=new SpecialManagement(s),a=await s.createGuest('甲'),b=await s.createGuest('乙');const old=a.user.playerCode!,code=await vacant(m);
 await m.reserveCode(code,'内测');assert.equal((await m.availability(code)).status,'reserved');await assert.rejects(m.reserveCode(code,'重复'),/PLAYER_CODE_TAKEN/);
 assert.equal((await m.availability(old,b.user.id)).status,'occupied');await assert.rejects(m.assignCode(b.user.id,old,b.user.playerCode!),/PLAYER_CODE_TAKEN/);
 const raced=await Promise.allSettled([m.assignCode(a.user.id,code,old),m.assignCode(b.user.id,code,b.user.playerCode!)]);assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);
 const owner=(await f.pool.query('SELECT id FROM users WHERE player_code=$1',[code])).rows[0].id;const changed=owner===a.user.id?a:b,previous=changed.user.playerCode!;
 assert.equal((await m.availability(previous)).status,'available');assert.equal((await m.audit(changed.user.id))[0].retained,false);
 assert.equal((await s.authenticate(changed.token))!.id,changed.user.id);assert.equal((await s.authenticate(changed.token))!.playerCode,code);
 await assert.rejects(m.assignCode(changed.user.id,previous,previous),/PLAYER_CODE_CHANGED/);
 await assert.rejects(s.switchAccount(code),/RECOVERY_INVALID/);assert.equal((await s.switchAccount(code,changed.recoveryCode)).user.id,changed.user.id);
 const second=owner===a.user.id?b:a;await m.assignCode(second.user.id,previous,second.user.playerCode!);
 await assert.rejects(s.switchAccount(previous,changed.recoveryCode,changed.user.id),/ACCOUNT_CODE_CHANGED/);
 assert.equal((await s.switchAccount(previous,second.recoveryCode)).user.id,second.user.id);
});

test('any started game retains its old code, active game blocks renumbering and history stays on internal user ID',async t=>{
 const f=await gameFixture(t,false),s=f.store,m=new SpecialManagement(s),p=f.people[0],other=f.people[1],old=p.user.playerCode!,code=await vacant(m);
 await f.command(p.user.id,'startGame');await assert.rejects(m.assignCode(p.user.id,code,old),/USER_IN_ACTIVE_GAME/);
 await f.command(p.user.id,'endGame');const result=await m.assignCode(p.user.id,code,old);assert.equal(result.retained,true);
 assert.equal((await m.availability(old)).status,'retired');assert.equal((await m.availability(old,p.user.id)).status,'reserved');
 await assert.rejects(m.assignCode(other.user.id,old,other.user.playerCode!),/PLAYER_CODE_RETIRED/);await assert.rejects(m.releaseReservation(old),/PLAYER_CODE_RETIRED/);
 assert.ok((await f.pool.query('SELECT 1 FROM game_participants WHERE user_id=$1',[p.user.id])).rowCount);
 await m.assignCode(p.user.id,old,code);assert.equal((await s.authenticate(p.token))!.playerCode,old);assert.equal((await m.audit(p.user.id)).length,2);
});

test('admin endpoints require configured key, validate input, return no hashes and support recovery for legacy accounts',async t=>{
 const f=await service(t),admin=new AdminService(f.store),key=process.env.ADMIN_KEY!;
 delete process.env.ADMIN_KEY;assert.equal(admin.verifyKey(key),false);process.env.ADMIN_KEY=key;
 assert.equal(admin.verifyKey(key),true);assert.equal(admin.verifyKey(key.toUpperCase()),false);assert.equal(admin.verifyKey(),false);
 assert.equal((await f.app.inject({url:'/api/admin/dedicated-rooms'})).statusCode,401);
 const p=await f.store.createGuest('管理对象');const ah=adminHeaders();
 const create=await f.app.inject({method:'POST',url:'/api/admin/dedicated-rooms',headers:ah,payload:{code:'777777',name:'内测',managerId:p.user.id,settings:defaultSettings,password:'safe'}});assert.equal(create.statusCode,200,create.body);
 const list=await f.app.inject({url:'/api/admin/dedicated-rooms',headers:ah});assert.equal(list.json().rooms.length,1);assert.ok(!list.body.includes('hash'));assert.ok(!list.body.includes('safe'));
 assert.equal((await f.app.inject({method:'POST',url:'/api/admin/player-codes',headers:ah,payload:{code:'012345'}})).statusCode,400);
 const guest=await f.app.inject({method:'POST',url:'/api/sessions/guest',headers,payload:{nickname:'新朋友'}});assert.equal(typeof guest.json().recoveryCode,'string');assert.ok(!guest.body.includes('recovery_hash'));
 const existing=await f.app.inject({method:'POST',url:'/api/sessions/guest',headers:{...headers,...cookie(p.token)},payload:{nickname:'原设备'}});assert.equal(existing.json().recoveryCode,undefined);
 await f.pool.query('UPDATE users SET recovery_hash=NULL WHERE id=$1',[p.user.id]);
 const missing=await f.app.inject({method:'POST',url:'/api/sessions/switch',headers,payload:{playerCode:p.user.playerCode}});assert.equal(missing.json().error,'RECOVERY_REQUIRED');
 const reset=await f.app.inject({method:'POST',url:`/api/admin/users/${p.user.id}/recovery-code`,headers:ah,payload:{}});assert.equal(reset.statusCode,200);
 const recovered=await f.app.inject({method:'POST',url:'/api/sessions/switch',headers,payload:{playerCode:p.user.playerCode,recoveryCode:reset.json().recoveryCode,expectedUserId:p.user.id}});assert.equal(recovered.statusCode,200,recovered.body);
 const bad=await f.app.inject({method:'POST',url:'/api/sessions/switch',headers,payload:{playerCode:p.user.playerCode,recoveryCode:p.recoveryCode}});assert.equal(bad.statusCode,403);
 const fresh=await f.app.inject({method:'POST',url:'/api/me/recovery-code',headers:{...headers,...cookie(p.token)},payload:{}});assert.equal(fresh.statusCode,200);
 await assert.rejects(f.store.switchAccount(p.user.playerCode!,reset.json().recoveryCode),/RECOVERY_INVALID/);
});

test('HTTP room access validates passwords and administrator renumbering returns explicit collision errors',async t=>{
 const f=await service(t),a=await f.store.createGuest('密码房主'),b=await f.store.createGuest('受邀玩家');
 const call=(token:string,url:string,payload:Record<string,unknown>)=>f.app.inject({method:'POST',url,headers:{...headers,...cookie(token)},payload});
 const created=await call(a.token,'/api/rooms',{password:'door-code'});assert.equal(created.statusCode,200,created.body);const r=created.json().room;
 assert.equal((await call(b.token,'/api/rooms/join',{key:r.code})).json().error,'ROOM_PASSWORD_REQUIRED');
 assert.equal((await call(b.token,'/api/rooms/join',{key:r.code,password:'wrong'})).json().error,'ROOM_PASSWORD_INVALID');
 assert.equal((await call(b.token,'/api/rooms/join',{key:r.inviteKey})).statusCode,200);
 const status=(await f.app.inject({url:`/api/rooms/${r.id}`,headers:cookie(a.token)})).json().room;
 assert.equal((await call(b.token,`/api/rooms/${r.id}/password`,{password:null,expectedVersion:status.version})).statusCode,403);
 assert.equal((await call(a.token,`/api/rooms/${r.id}/password`,{password:null,expectedVersion:status.version})).statusCode,200);
 const conflict=await f.app.inject({method:'POST',url:`/api/admin/users/${b.user.id}/player-code`,headers:adminHeaders(),payload:{playerCode:a.user.playerCode,expectedCode:b.user.playerCode}});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error,'PLAYER_CODE_TAKEN');
});

test('renumbering and starting a game serialize without losing history or entering a deadlock',async t=>{
 const f=await gameFixture(t,false),m=new SpecialManagement(f.store),p=f.people[0],old=p.user.playerCode!,code=await vacant(m);
 const results=await Promise.allSettled([m.assignCode(p.user.id,code,old),f.command(p.user.id,'startGame')]);
 assert.equal(results[1].status,'fulfilled');
 if(results[0].status==='rejected')assert.match(results[0].reason.message,/USER_IN_ACTIVE_GAME/);
 assert.equal((await f.state()).phase,'playing');
 assert.ok((await f.pool.query('SELECT 1 FROM game_participants WHERE user_id=$1',[p.user.id])).rowCount);
});
