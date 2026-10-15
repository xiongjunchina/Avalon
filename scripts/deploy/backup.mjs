import { createHash } from 'node:crypto';
import { createReadStream, closeSync, mkdirSync, openSync, renameSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { cli, instance, compose, sql, root } from './lib.mjs';

export async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function backup(context) {
  const directory = `${root}deploy/backups`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = `${directory}/${context.env.PROJECT}-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
  const partial = `${path}.partial`, fd = openSync(partial, 'wx', 0o600);
  try {
    await compose(context, ['exec', '-T', 'postgres', 'pg_dump', '-U', 'avalon', '-d', 'avalon', '--format=custom', '--no-owner', '--no-acl'], { stdio: ['ignore', fd, 'pipe'] });
  } catch (error) { rmSync(partial, { force: true }); throw error; }
  finally { closeSync(fd); }
  try {
    const manifest = {
      format: 1, source: context.env.PROJECT, createdAt: new Date().toISOString(),
      sha256: await digest(partial), bytes: statSync(partial).size,
      postgresVersion: await sql(context, 'SHOW server_version_num'),
      migrations: JSON.parse(await sql(context, 'SELECT coalesce(json_agg(version ORDER BY version),\'[]\'::json) FROM schema_migrations')),
      images: (await compose(context, ['images', '--format', 'json'])).toString().trim(),
    };
    renameSync(partial, path);
    writeFileSync(`${path}.json`, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return path;
  } catch (error) { rmSync(partial, { force: true }); throw error; }
}
if (process.argv[1]?.endsWith('/backup.mjs')) cli(async () => {
  console.log(`Backup and checksum manifest created: ${await backup(instance(process.argv[2]))}`);
});
