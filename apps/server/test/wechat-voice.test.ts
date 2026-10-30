import {test} from 'node:test';import assert from 'node:assert/strict';
import {issueWechatVoiceTicket} from '../src/wechat-voice.js';
const cfg={appId:'wx-test',appSecret:'server-secret'};
const fetcher=(async()=>new Response(JSON.stringify({openid:'wx-user',session_key:'private-session-key'}))) as typeof fetch;
const lookup=async()=>({openid:'wx-user',playerCount:10});
test('native voice signs only a verified room member without exposing session key',async()=>{
 const ticket=await issueWechatVoiceTicket('u','room-uuid','code',cfg,lookup,fetcher);
 assert.equal(ticket.groupId,'avalon-room-uuid');assert.match(ticket.signature,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(ticket).includes('private-session-key'),false);
});
test('native voice rejects 11/12 player rooms and mismatched WeChat identity',async()=>{
 for(const playerCount of [11,12])await assert.rejects(issueWechatVoiceTicket('u','r','code',cfg,async()=>({openid:'wx-user',playerCount}),fetcher),/WECHAT_VOICE_LIMIT/);
 await assert.rejects(issueWechatVoiceTicket('u','r','code',cfg,async()=>({openid:'other',playerCount:5}),fetcher),/WECHAT_VOICE_IDENTITY/);
 await assert.rejects(issueWechatVoiceTicket('u','r','code',cfg,async()=>{throw Error('FORBIDDEN');},fetcher),/FORBIDDEN/);
});
test('native voice requires a fresh valid session key',async()=>{
 await assert.rejects(issueWechatVoiceTicket('u','r','code',cfg,lookup,(async()=>new Response(JSON.stringify({openid:'wx-user'}))) as typeof fetch),/WECHAT_VOICE_SESSION/);
});
test('membership is rechecked after WeChat exchange',async()=>{
 let calls=0;await assert.rejects(issueWechatVoiceTicket('u','r','code',cfg,async()=>{if(++calls>1)throw Error('FORBIDDEN');return {openid:'wx-user',playerCount:5};},fetcher),/FORBIDDEN/);
});
