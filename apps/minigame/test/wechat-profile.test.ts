import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseWechatProfile} from '../src/platform/wechat-profile.js';
test('WeChat profile is supplied only after tapping the native authorization button',async()=>{
 let tap:any,destroyed=false;
 const pending=chooseWechatProfile({getSystemInfoSync:()=>({screenWidth:390,screenHeight:844}),createUserInfoButton:()=>({onTap:cb=>tap=cb,destroy:()=>{destroyed=true;}})});
 assert.equal(destroyed,false);tap({userInfo:{nickName:'行者',avatarUrl:'https://thirdwx.qlogo.cn/avatar'}});
 assert.deepEqual(await pending,{nickname:'行者',avatarUrl:'https://thirdwx.qlogo.cn/avatar'});assert.equal(destroyed,true);
});
test('anonymous WeChat response is never presented as the personal profile',async()=>{
 let tap:any;
 const pending=chooseWechatProfile({getSystemInfoSync:()=>({screenWidth:390,screenHeight:844}),createUserInfoButton:()=>({onTap:cb=>tap=cb,destroy(){}})});
 tap({userInfo:{nickName:'微信用户',avatarUrl:'https://thirdwx.qlogo.cn/default'}});await assert.rejects(pending,/未提供个人头像昵称/);
});

import {WechatProfileButton} from '../src/platform/wechat-profile.js';
test('native authorization occupies the original control and is removed on scroll or close',()=>{
 let options:any,tap:any,destroyed=0,accepted:any;
 const bridge=new WechatProfileButton({getSystemInfoSync:()=>({screenWidth:390,screenHeight:844}),createUserInfoButton:o=>{options=o;return {onTap:cb=>tap=cb,destroy:()=>{destroyed++;}};}},p=>accepted=p,()=>{});
 const bounds={x:20,y:200,width:350,height:44};bridge.sync(bounds);assert.equal(options.style.top,200);assert.equal(options.text,'');
 tap({userInfo:{nickName:'行者',avatarUrl:'https://thirdwx.qlogo.cn/avatar'}});assert.equal(accepted.nickname,'行者');
 bridge.sync(bounds);assert.equal(destroyed,0);bridge.sync(undefined);assert.equal(destroyed,1);
 accepted=undefined;tap({userInfo:{nickName:'旧回调',avatarUrl:'https://thirdwx.qlogo.cn/avatar'}});assert.equal(accepted,undefined);
});

import {parityFixture} from '../scripts/parity-fixture.js';
import {gameScreen} from '../src/screens/game.js';
import {layoutWebScreen} from '../src/ui/web-layout.js';
test('game uses the logged-in profile for self while preserving other players avatars',()=>{
 const fixture=parityFixture('game');const room:import('@avalon/contracts').RoomView=fixture.room,user:import('@avalon/contracts').User=fixture.user;user.avatarUrl='https://thirdwx.qlogo.cn/self';
 room.members[0].avatarUrl=undefined;room.members[0].wechatAvatarUrl=undefined;room.members[1].avatarUrl='https://thirdwx.qlogo.cn/other';
 const model=gameScreen(room,user,{privateRoleVisible:false,ballotVisible:false});
 const nodes=layoutWebScreen(model,{width:390,height:844,top:88,bottom:34}).nodes;
 assert.equal(nodes.find(n=>n.id==='player:'+user.id)?.image,user.avatarUrl);
 assert.equal(nodes.find(n=>n.id==='player:'+room.members[1].id)?.image,room.members[1].avatarUrl);
});

import {PracticeSession} from '../src/screens/practice.js';
import {defaultSettings} from '@avalon/contracts';
test('practice keeps personal avatar and distinct bot avatars when changing perspective',()=>{
 const practice=new PracticeSession(defaultSettings,'行者',undefined,{id:'real',nickname:'行者',wechatAvatarUrl:'https://thirdwx.qlogo.cn/self'});
 const first=practice.view();assert.equal(first.members[0].wechatAvatarUrl,'https://thirdwx.qlogo.cn/self');assert.ok(first.members.slice(1).every(m=>m.avatarUrl?.startsWith('/art/avatars/')));
 practice.switchSeat(first.members[1].id);assert.equal(practice.user.avatarUrl,first.members[1].avatarUrl);assert.equal(practice.user.wechatAvatarUrl,undefined);
 practice.switchSeat(first.members[0].id);assert.equal(practice.user.wechatAvatarUrl,'https://thirdwx.qlogo.cn/self');
});

test('practice projects distinct private roles per seat and includes avatars in identity clues',()=>{
 const practice=new PracticeSession(defaultSettings,'行者');const seats=practice.perspectives();const roles=new Set<string>();
 for(const seat of seats){practice.switchSeat(seat.id);const room=practice.view();assert.equal(room.game!.self!.role,seat.role);roles.add(room.game!.self!.role);
 const model=gameScreen(room,practice.user,{privateRoleVisible:true,ballotVisible:false,overlay:'identity'});
 assert.equal(model.web!.document!.self!.role,seat.role);
 assert.ok(model.web!.document!.game!.players.every(p=>!!p.avatarUrl));
 }
 assert.ok(roles.size>1);
});
