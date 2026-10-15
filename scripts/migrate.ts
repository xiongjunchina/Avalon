import { createPool, migrate } from '../apps/server/src/db.js';
const pool = createPool();
try { await migrate(pool,{exclusive:true}); console.log('Database migrations applied.'); }
catch { console.error('Database migration failed. Verify local database availability and configuration.'); process.exitCode = 1; }
finally { await pool.end(); }
