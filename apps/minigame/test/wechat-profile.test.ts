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
