import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';

export async function lockPlayerCodes(c: PoolClient) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext('avalon:player-codes'))");
}
export async function allocatePlayerCode(c: PoolClient): Promise<string> {
  await lockPlayerCodes(c);
  for (;;) {
    const code = String(randomInt(100000, 1000000));
    const used = await c.query('SELECT 1 FROM users WHERE player_code=$1 UNION ALL SELECT 1 FROM player_code_reservations WHERE code=$1', [code]);
    if (!used.rowCount) return code;
  }
}
