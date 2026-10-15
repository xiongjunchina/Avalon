import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { root, cli } from './deploy/lib.mjs';
cli(async () => {
  const [name = 'local', mode = 'http', port = mode === 'https' ? '8443' : '8088'] = process.argv.slice(2);
  if (!/^[a-z][a-z0-9-]{0,24}$/.test(name) || !['http', 'https'].includes(mode) || !/^\d{4,5}$/.test(port) || +port < 1024 || +port > 65535)
    throw new Error('Usage: npm run deploy:setup -- <name> <http|https> <port 1024..65535>');
  const path = `${root}deploy/.env.${name}`;
  if (existsSync(path)) { console.log(`deploy/.env.${name} already exists; preserved.`); return; }
  writeFileSync(path, `PROJECT=avalon-stage7-${name}\nAPP_ORIGIN=${mode}://127.0.0.1:${port}\nGATEWAY_PORT=${port}\nCOOKIE_SECURE=${mode === 'https'}\nTLS_DIRECTIVE=${mode === 'https' ? 'tls internal' : ''}\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nIMAGE_TAG=stage7\nNODE_IMAGE=node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43\nCADDY_IMAGE=caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b\nPOSTGRES_IMAGE=postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Created private deploy/.env.${name}; loopback only, independent data volume.`);
});
