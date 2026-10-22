import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MiniGameApi } from '../src/net/api.js';
import { describeMiniGameError } from '../src/ui/messages.js';
import type { WechatPlatform, WxRequestOptions } from '../src/platform/wechat.js';
for (const [message, code] of [['request:fail url not in domain list','NETWORK_DOMAIN'],['request:fail ssl hand shake error','NETWORK_TLS'],['request:fail timeout','NETWORK_TIMEOUT']]) {
  test('classifies '+code+' without disclosing raw request data', async()=>{
    const platform={get:()=>undefined,request:(o:WxRequestOptions)=>o.fail({errMsg:message+' token=private'})} as unknown as WechatPlatform;
    await assert.rejects(new MiniGameApi(platform,'https://example.com').request('/health'),new RegExp('^Error: '+code+'$'));
    assert.doesNotMatch(describeMiniGameError(new Error(code)),/操作未完成|private/);
  });
}
test('rejects HTML interception even when proxy returns 200',async()=>{
 const platform={get:()=>undefined,request:(o:WxRequestOptions)=>o.success({statusCode:200,data:'<!DOCTYPE html><title>blocked</title>'})} as unknown as WechatPlatform;
 await assert.rejects(new MiniGameApi(platform,'https://example.com').request('/health'),/NETWORK_RESPONSE/);
});
test('server WeChat unavailable code gets an actionable login message',()=>{
 assert.match(describeMiniGameError(new Error('WECHAT_UNAVAILABLE')),/微信/);
});
import {AdminApi} from '../src/screens/admin/auth.js';
import {WechatPlatform as RuntimePlatform} from '../src/platform/wechat.js';
test('admin uses the same TLS diagnostics and rejects HTML',async()=>{
 const api=new AdminApi({request:o=>o.fail({errMsg:'request:fail ssl error'})},'https://example.com');
 await assert.rejects(api.verify('private'),/NETWORK_TLS/);
 const html=new AdminApi({request:o=>o.success({statusCode:200,data:'<html>blocked</html>'})},'https://example.com');
 await assert.rejects(html.verify('private'),/NETWORK_RESPONSE/);
});
test('wx.login failure and empty login code are reported as platform login failures',async()=>{
 const wx={login:(o:any)=>o.fail({errMsg:'login:fail timeout'})};
 await assert.rejects(new RuntimePlatform(wx as any).login(),/WECHAT_LOGIN_TIMEOUT/);
 const empty={login:(o:any)=>o.success({code:''})};
 await assert.rejects(new RuntimePlatform(empty as any).login(),/WECHAT_LOGIN_FAILED/);
});
