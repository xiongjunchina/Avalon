import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {defaultSettings} from '@avalon/contracts';
import {headers,service} from './helpers.js';
import {SpecialManagement} from '../src/special-management.js';

test('concurrent first registration and lost-cookie retries create one identity and one seat',async t=>{
  const f=await service(t),registrationId=randomUUID();
  const register=()=>f.app.inject({method:'POST',url:'/api/sessions/guest',headers,payload:{nickname:'陈欣',registrationId}});
  const responses=await Promise.all([register(),register(),register()]);
  assert.ok(responses.every(response=>response.statusCode===200));
  const ids=responses.map(response=>response.json().user.id);
  assert.equal(new Set(ids).size,1);
  assert.equal((await f.pool.query('SELECT count(*) FROM users')).rows[0].count,'1');
  const auth={...headers,cookie:String(responses[0].headers['set-cookie']).split(';')[0]};
  const room=(await f.app.inject({method:'POST',url:'/api/rooms',headers:auth,payload:{}})).json().room;
  const retried=await register();assert.equal(retried.json().user.id,ids[0]);
  const cookie=String(retried.headers['set-cookie']).split(';')[0];
  for(let i=0;i<2;i++){
    const joined=await f.app.inject({method:'POST',url:'/api/rooms/join',headers:{...headers,cookie},payload:{key:room.inviteKey}});
    assert.equal(joined.statusCode,200);assert.equal(joined.json().room.members.length,1);
  }
  assert.equal((await f.pool.query('SELECT count(*) FROM room_members')).rows[0].count,'1');
  assert.ok(!retried.body.includes('guest_registration_id'));
});

test('999999 invitation warns before registering a second same-name account; original code restores its seat',async t=>{
  const f=await service(t),s=f.store,special=new SpecialManagement(s);
  const host=await s.createGuest('军哥'),player=await s.createGuest('陈欣');
  await special.saveRoom({code:'999999',name:'内测专属房',managerId:host.user.id,settings:{...defaultSettings,playerCount:12}});
  const template=(await special.rooms(host.user.id))[0];
  const room=await s.createRoom(host.user,undefined,{dedicatedRoomId:template.id});
  await s.join(player.user,room.inviteKey!);
  const duplicate=await f.app.inject({method:'POST',url:'/api/sessions/guest',headers,
    payload:{nickname:'陈欣',registrationId:randomUUID(),roomKey:room.inviteKey}});
  assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().error,'NICKNAME_ALREADY_IN_ROOM');
  assert.equal((await f.pool.query('SELECT count(*) FROM users')).rows[0].count,'2');
  assert.equal((await s.snapshot(room.id))!.members.length,2);
  const restored=await f.app.inject({method:'POST',url:'/api/sessions/switch',headers,payload:{playerCode:player.user.playerCode}});
  const cookie=String(restored.headers['set-cookie']).split(';')[0];
  const me=(await f.app.inject({url:'/api/me',headers:{cookie}})).json();
  assert.equal(me.user.id,player.user.id);assert.equal(me.roomId,room.id);
  assert.equal((await s.join(me.user,room.code)).members.length,2);
  const newcomer=await f.app.inject({method:'POST',url:'/api/sessions/guest',headers,
    payload:{nickname:'道友辉',registrationId:randomUUID(),roomKey:room.inviteKey}});
  assert.equal(newcomer.statusCode,200);
  const joined=await s.join(newcomer.json().user,room.inviteKey!);
  assert.ok(joined.members.some(member=>member.id===newcomer.json().user.id));
});

test('room name collision checks respect password privacy and do not override a valid session',async t=>{
  const f=await service(t),s=f.store,host=await s.createGuest('陈欣');
  const room=await s.createRoom(host.user,undefined,{password:'safe'});
  const register=(roomKey:string,cookie?:string)=>f.app.inject({method:'POST',url:'/api/sessions/guest',headers:{...headers,...(cookie?{cookie}:{})},
    payload:{nickname:'陈欣',registrationId:randomUUID(),roomKey}});
  assert.equal((await register(room.code)).statusCode,200); // Code alone cannot inspect a protected room.
  assert.equal((await register('invalid-invite')).statusCode,200);
  assert.equal((await register(room.inviteKey!)).json().error,'NICKNAME_ALREADY_IN_ROOM');
  const reused=await register(room.inviteKey!,`avalon_session=${host.token}`);
  assert.equal(reused.statusCode,200);assert.equal(reused.json().user.id,host.user.id);
});

test('idempotent retries restore current profile and still enforce account bans',async t=>{
  const f=await service(t),registrationId=randomUUID();
  const first=await f.store.createGuest('陈欣',{registrationId});
  await f.pool.query("UPDATE users SET nickname='新昵称',avatar='moon' WHERE id=$1",[first.user.id]);
  const retry=await f.store.createGuest('陈欣',{registrationId});
  assert.equal(retry.user.id,first.user.id);assert.equal(retry.user.nickname,'新昵称');assert.equal(retry.user.avatar,'moon');
  await f.pool.query('INSERT INTO user_memberships(user_id,is_banned) VALUES($1,true)',[first.user.id]);
  await assert.rejects(f.store.createGuest('陈欣',{registrationId}),/USER_BANNED/);
});
