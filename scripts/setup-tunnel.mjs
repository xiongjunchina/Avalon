import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { root, cli, validNgrokOrigin, instance } from './deploy/lib.mjs';
cli(async()=>{
  const [name,origin,port='8089']=process.argv.slice(2);
  if(!/^[a-z][a-z0-9-]{0,24}$/.test(name??'')||!validNgrokOrigin(origin)||!/^\d{4,5}$/.test(port)||+port<1024||+port>65535)
    throw new Error('Usage: npm run deploy:tunnel:setup -- <name> <https://assigned.ngrok-free.dev> [loopback-port]');
  const path=`${root}deploy/.env.${name}`;
  if(existsSync(path)) {
    const existing=instance(name);
    if(existing.env.EXPOSURE!=='ngrok'||existing.env.APP_ORIGIN!==origin||existing.env.GATEWAY_PORT!==port)
      throw new Error('Existing instance differs; preserved. Do not overwrite player credentials or data.');
    console.log(`deploy/.env.${name} already matches; preserved.`);return;
  }
  writeFileSync(path,`PROJECT=avalon-stage7-${name}\nEXPOSURE=ngrok\nAPP_ORIGIN=${origin}\nGATEWAY_PORT=${port}\nCOOKIE_SECURE=true\nTLS_DIRECTIVE=\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nIMAGE_TAG=friends-20260930\n`,{flag:'wx',mode:0o600});
  console.log(`Created private deploy/.env.${name}; independent data, Secure cookie, loopback gateway.`);
});
