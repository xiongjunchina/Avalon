import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfig } from '../src/config.js';
import { buildApp } from '../src/app.js';
import { database, headers } from './helpers.js';
import { migrate } from '../src/db.js';

test('deployment configuration fails closed on invalid origin, insecure cookies and proxy settings', () => {
  assert.deepEqual(runtimeConfig({}), {origin:'http://localhost:5173',secure:false,trustProxy:false,host:'127.0.0.1',port:3001});
  assert.equal(runtimeConfig({NODE_ENV:'production',APP_ORIGIN:'https://game.example',COOKIE_SECURE:'true',TRUST_PROXY:'true'}).trustProxy,true);
  for (const env of [
    {NODE_ENV:'production'}, {APP_ORIGIN:'https://game.example'}, {COOKIE_SECURE:'yes'}, {TRUST_PROXY:'1'},
    {APP_ORIGIN:'http://localhost:5173/'}, {APP_ORIGIN:'http://user:secret@localhost:5173'},
    {APP_ORIGIN:'file:///tmp'}, {NODE_ENV:'production',APP_ORIGIN:'http://game.example'},
    {PORT:'0'}, {PORT:'NaN'}, {PORT:'65536'}, {COOKIE_SECURE:'true'},
  ]) assert.throws(()=>runtimeConfig(env));
});

test('deployment migrations cannot run under an active server; pause releases the lock', async t => {
  const cleanups:(()=>Promise<void>)[]=[];
  const f=await database({after:fn=>cleanups.push(fn)});
  const {app}=await buildApp({store:f.store});
  t.after(async()=>{await app.close();for(const fn of cleanups)await fn();});
  const applied=await f.pool.query('SELECT version FROM schema_migrations ORDER BY version');
  await assert.rejects(migrate(f.pool,{exclusive:true}),/Stop the active server/);
  assert.deepEqual((await f.pool.query('SELECT version FROM schema_migrations ORDER BY version')).rows,applied.rows);
  await app.close();await migrate(f.pool,{exclusive:true});
});

test('one-hop proxy uses nearest forwarded address only; direct development ignores spoofed headers', async t => {
  for (const trustProxy of [false,true]) {
    const cleanups:(()=>Promise<void>)[]=[];
    const f=await database({after:fn=>cleanups.push(fn)});
    const {app}=await buildApp({store:f.store,trustProxy});
    t.after(async()=>{await app.close();for(const fn of cleanups)await fn();});
    app.get('/test-client-address',async req=>({ip:req.ip}));
    const result=await app.inject({url:'/test-client-address',remoteAddress:'172.22.0.4',headers:{'x-forwarded-for':'1.1.1.1, 192.0.2.20'}});
    assert.equal(result.json().ip,trustProxy?'192.0.2.20':'172.22.0.4');
    // Proxy settings never replace exact-origin or CSRF checks.
    const rejected=await app.inject({method:'POST',url:'/api/sessions/guest',headers:{...headers,origin:'https://evil.example','x-forwarded-host':'localhost:5173'},payload:{nickname:'访客'}});
    assert.equal(rejected.statusCode,403);
  }
});
