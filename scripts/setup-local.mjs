import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
if (existsSync('.env')) console.log('.env already exists; left unchanged.');
else {
  const password = randomBytes(24).toString('hex');
  writeFileSync('.env', `POSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://avalon:${password}@127.0.0.1:55433/avalon\nHOST=127.0.0.1\nPORT=3001\nAPP_ORIGIN=http://localhost:5173\nCOOKIE_SECURE=false\n`, { mode: 0o600, flag: 'wx' });
  console.log('Created ignored .env with a random local-only database password.');
}
