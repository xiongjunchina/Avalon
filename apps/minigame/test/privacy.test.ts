import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installPrivacyAuthorization} from '../src/platform/privacy.js';
test('privacy approval requires viewing contract and explicit consent',()=>{
 let handler:any;const dialogs:any[]=[],events:string[]=[];let viewed=0;
 installPrivacyAuthorization({onNeedPrivacyAuthorization:cb=>handler=cb,showModal:o=>dialogs.push(o),openPrivacyContract:o=>{viewed++;o.success();}});
 handler((r:any)=>events.push(r.event));assert.deepEqual(events,['exposureAuthorization']);
 dialogs.shift().success({confirm:true});assert.equal(viewed,1);assert.deepEqual(events,['exposureAuthorization']);
 dialogs.shift().success({confirm:true});assert.deepEqual(events,['exposureAuthorization','agree']);
});
test('privacy refusal and contract failure never grant consent',()=>{
 for(const deny of [true,false]){let handler:any;const events:string[]=[];
 installPrivacyAuthorization({onNeedPrivacyAuthorization:cb=>handler=cb,showModal:o=>o.success({confirm:!deny}),openPrivacyContract:o=>o.fail()});handler((r:any)=>events.push(r.event));assert.deepEqual(events,['exposureAuthorization','disagree']);}
});
