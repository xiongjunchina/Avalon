import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { Pool } from 'pg';

export function loadEnvironment() { if (existsSync('.env')) loadEnvFile('.env'); }
export function createPool(schema?: string) {
  loadEnvironment();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; run npm run setup:local.');
  if (schema && !/^avalon_test_[a-f0-9]+$/.test(schema)) throw new Error('Invalid test schema');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL,
    options: schema ? `-c search_path=${schema}` : undefined,
    max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000,
    statement_timeout: 5000, application_name: schema ?? 'avalon',
  });
  pool.on('error', () => { /* request failures surface as SERVICE_UNAVAILABLE; never log credentials */ });
  return pool;
}
export async function migrate(pool: Pool, options: { exclusive?: boolean } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (options.exclusive) {
      const lock=await client.query("SELECT pg_try_advisory_xact_lock(hashtext(current_schema() || ':server')) AS acquired");
      if (!lock.rows[0].acquired) throw new Error('Stop the active server before applying migrations.');
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [file]);
      if (!done.rowCount) {
        await client.query(readFileSync(new URL(file, directory), 'utf8'));
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
      }
    }
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; }
  finally { client.release(); }
}
