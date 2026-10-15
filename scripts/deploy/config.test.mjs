import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInstance, validNgrokOrigin } from './lib.mjs';

const local={PROJECT:'avalon-stage7-check',GATEWAY_PORT:'8089',COOKIE_SECURE:'false',APP_ORIGIN:'http://127.0.0.1:8089',TLS_DIRECTIVE:'',POSTGRES_PASSWORD:'a'.repeat(64)};
test('deployment preserves loopback HTTP and HTTPS configurations',()=>{
  assert.equal(validateInstance('check',local),false);
  assert.equal(validateInstance('check',{...local,APP_ORIGIN:'https://127.0.0.1:8089',COOKIE_SECURE:'true',TLS_DIRECTIVE:'tls internal'}),false);
  assert.throws(()=>validateInstance('../check',local));
  for(const change of [{GATEWAY_PORT:'65536'},{APP_ORIGIN:'http://0.0.0.0:8089'},{EXPOSURE:'internet'},{POSTGRES_PASSWORD:'bad'}])
    assert.throws(()=>validateInstance('check',{...local,...change}));
});
test('ngrok deployment requires exact HTTPS origin and Secure cookies',()=>{
  const tunnel={...local,EXPOSURE:'ngrok',APP_ORIGIN:'https://example.ngrok-free.dev',COOKIE_SECURE:'true'};
  assert.equal(validateInstance('check',tunnel),true);
  for(const origin of ['http://example.ngrok-free.dev','https://example.ngrok-free.dev/','https://example.ngrok-free.dev/path',
    'https://example.ngrok-free.dev:8443','https://example.ngrok-free.dev.attacker.com','https://user:pass@example.ngrok-free.dev',
    'https://example.ngrok-free.dev?query=1','https://example.ngrok-free.dev#hash']) {
    assert.equal(validNgrokOrigin(origin),false);
    assert.throws(()=>validateInstance('check',{...tunnel,APP_ORIGIN:origin}));
  }
  assert.throws(()=>validateInstance('check',{...tunnel,COOKIE_SECURE:'false'}));
  assert.throws(()=>validateInstance('check',{...tunnel,TLS_DIRECTIVE:'tls internal'}));
});
