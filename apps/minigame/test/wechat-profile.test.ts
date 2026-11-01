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
