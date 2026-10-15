import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingEndpoint, waitForEndpoint } from './tunnel-runtime.mjs';

const expected = ['avalon-friends', 'https://friends.ngrok-free.dev', 'http://127.0.0.1:8089'];
const endpoint = { name: expected[0], url: expected[1], upstream: {url: expected[2]}, inspect: false };
test('startup waits for its exact endpoint, ignoring unrelated endpoints', async()=>{
  const unrelated = {...endpoint,name:'other-app'};
  let polls=0;
  const found=await waitForEndpoint(async()=>++polls<3?[unrelated]:[unrelated,endpoint],expected,{pause:async()=>{}});
  assert.equal(found,endpoint);
  assert.equal(polls,3);
});
test('startup times out instead of claiming a failed agent is ready', async()=>{
  let polls=0;
  await assert.rejects(waitForEndpoint(async()=>{polls++;return [];},expected,{attempts:3,pause:async()=>{}}),/did not become ready/);
  assert.equal(polls,3);
});
test('same-name conflicts and malformed agent responses fail closed', async()=>{
  for(const change of [{url:'https://other.ngrok-free.dev'},{upstream:{url:'http://127.0.0.1:9999'}},{inspect:true}]){
    await assert.rejects(waitForEndpoint(async()=>[{...endpoint,...change}],expected,{pause:async()=>{throw new Error('must not retry conflict');}}),/differs/);
  }
  assert.throws(()=>matchingEndpoint({},...expected),/Unexpected/);
  assert.equal(matchingEndpoint([{...endpoint,name:'other-app'}],...expected),undefined);
});
