import { closeSync, openSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { cli, instance, compose, sql } from './lib.mjs';
import { digest } from './backup.mjs';

export async function restore(context, path) {
  path = resolve(path);
  const manifest = JSON.parse(readFileSync(`${path}.json`, 'utf8'));
  if (manifest.format !== 1 || manifest.bytes !== statSync(path).size || manifest.sha256 !== await digest(path))
    throw new Error('Backup checksum or format mismatch; database untouched.');
  if (manifest.source === context.env.PROJECT) throw new Error('Restore requires a different instance; source database is protected.');
  const running = (await compose(context, ['ps', '--status', 'running', '--services'])).toString().trim().split(/\s+/);
  if (running.includes('server') || running.includes('gateway')) throw new Error('Stop target gateway/server before restoring.');
  const version = await sql(context, 'SHOW server_version_num');
  if (Math.floor(+version / 10000) !== Math.floor(+manifest.postgresVersion / 10000)) throw new Error('Restore rehearsal requires matching PostgreSQL major versions.');
  const count = await sql(context, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')");
  if (count !== '0') throw new Error('Target database is not empty; refusing to overwrite data.');
  const fd = openSync(path, 'r');
  try { await compose(context, ['exec', '-T', 'postgres', 'pg_restore', '-U', 'avalon', '-d', 'avalon', '--single-transaction', '--exit-on-error', '--no-owner', '--no-acl'], { stdio: [fd, 'pipe', 'pipe'] }); }
  finally { closeSync(fd); }
  return manifest;
}
if (process.argv[1]?.endsWith('/restore.mjs')) cli(async () => {
  const [name, path] = process.argv.slice(2);
  if (!name || !path) throw new Error('Usage: npm run deploy:restore -- <empty-target-instance> <backup.dump>');
  await restore(instance(name), path); console.log('Restore committed into the empty target. Original source preserved; run target up and verify.');
});
