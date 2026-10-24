import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('gateway permits the Web RTC SDK signalling endpoints over HTTPS and WSS', () => {
  const caddy = readFileSync(new URL('../../deploy/Caddyfile', import.meta.url), 'utf8');
  const connect = caddy.match(/connect-src ([^;]+)/)?.[1].split(/\s+/) ?? [];
  // Agora Web 4.24.5+ also uses rtnsvc/rtesvc signalling, not only the legacy hosts.
  for (const host of ['web-1.ap.agora.io', 'web-1.ap.sd-rtn.com', 'web-1.ap.rtnsvc.com', 'web-1.ap.rtesvc.com']) {
    for (const protocol of ['https:', 'wss:']) {
      for (const port of ['', '443', '4706', '4715', '6443']) {
      assert.ok(connect.some(source => {
        if (source === "'self'") return false;
        const wildcardPort = source.endsWith(':*');
        const allowed = new URL(wildcardPort ? source.slice(0,-2) : source);
        return allowed.protocol === protocol && allowed.hostname.startsWith('*.') && host.endsWith(allowed.hostname.slice(1))
          && (wildcardPort || allowed.port === (port === '443' ? '' : port));
      }), `blocked RTC endpoint: ${protocol}//${host}${port ? `:${port}` : ''}`);
      }
    }
  }
  assert.ok(!connect.includes('*') && !connect.includes('https:') && !connect.includes('wss:'));
});
