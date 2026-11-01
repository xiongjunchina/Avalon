import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../src/app.js';
import {DomainError,type PostgresStore} from '../src/store.js';

test('voice identity endpoint requires a room member bearer and returns only scoped identities',async t=>{
 const old=process.env.WECHAT_MINIGAME_VOICE_ENABLED;process.env.WECHAT_MINIGAME_VOICE_ENABLED='true';
 t.after(()=>{if(old===undefined)delete process.env.WECHAT_MINIGAME_VOICE_ENABLED;else process.env.WECHAT_MINIGAME_VOICE_ENABLED=old;});
 const uid='11111111-1111-4111-8111-111111111111',friend='22222222-2222-4222-8222-222222222222',room='33333333-3333-4333-8333-333333333333';let queries=0;
 const store={now:()=>Date.now(),pool:{connect:async()=>({query:async()=>({rows:[{acquired:true}]}),on(){},release(){}}),query:async(sql:string,params:unknown[])=>{queries++;assert.match(sql,/WHERE id=ANY\(\$1::uuid\[\]\)/);assert.deepEqual(params,[[uid,friend]]);return {rows:[{id:uid,wechat_openid:'wx-self'},{id:friend,wechat_openid:'wx-friend'}]};}},pendingDeals:async()=>[],recoverPresence:async()=>{},maintain:async()=>[],authenticate:async(token:string)=>{if(!token)throw new DomainError('UNAUTHENTICATED',401);return {id:token==='valid'?uid:'outsider'};},roomFor:async(id:string)=>{if(id!==uid)throw new DomainError('FORBIDDEN',403);return {room:{members:[{id:uid},{id:friend}]}};}} as unknown as PostgresStore;
 const {app}=await buildApp({store,maintenanceMs:600000});t.after(()=>app.close());
 const url=`/api/rooms/${room}/wechat-voice-members`;
 for(const headers of [{},{cookie:'avalon_session=valid'}])assert.equal((await app.inject({method:'GET',url,headers})).statusCode,401);
 assert.equal((await app.inject({method:'GET',url,headers:{authorization:'Bearer outsider'}})).statusCode,403);
 assert.equal(queries,0);
 const res=await app.inject({method:'GET',url,headers:{authorization:'Bearer valid'}});assert.equal(res.statusCode,200);assert.equal(res.headers['cache-control'],'no-store');assert.deepEqual(res.json(),{members:{'wx-self':uid,'wx-friend':friend}});
});
