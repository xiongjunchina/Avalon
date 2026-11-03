import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installPrivacyAuthorization} from '../src/platform/privacy.js';
test('privacy approval requires viewing contract and explicit consent',()=>{
 let handler:any;const dialogs:any[]=[],events:string[]=[];let viewed=0;
 installPrivacyAuthorization({onNeedPrivacyAuthorization:cb=>handler=cb,showModal:o=>dialogs.push(o),openPrivacyContract:o=>{viewed++;o.success();}});
 handler((r:any)=>events.push(r.event));assert.deepEqual(events,['exposureAuthorization']);
 dialogs.shift().success({confirm:true});assert.equal(viewed,1);assert.deepEqual(events,['exposureAuthorization']);
 const consent=dialogs.shift();
 for(const disclosure of ['昵称','自定义头像','文字消息','微信或阿里云','检测不当内容'])assert.ok(consent.content.includes(disclosure));
 consent.success({confirm:true});assert.deepEqual(events,['exposureAuthorization','agree']);
});
test('privacy refusal and contract failure never grant consent',()=>{
 for(const deny of [true,false]){let handler:any;const events:string[]=[];
 installPrivacyAuthorization({onNeedPrivacyAuthorization:cb=>handler=cb,showModal:o=>o.success({confirm:!deny}),openPrivacyContract:o=>o.fail()});handler((r:any)=>events.push(r.event));assert.deepEqual(events,['exposureAuthorization','disagree']);}
});
