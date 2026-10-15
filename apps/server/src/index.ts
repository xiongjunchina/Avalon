import { buildApp } from './app.js';
import { createPool, migrate } from './db.js';
import { PostgresStore } from './store.js';
import { runtimeConfig } from './config.js';
const pool=createPool();
try {
  const config=runtimeConfig(process.env);
  await migrate(pool,{exclusive:true});
  const {app}=await buildApp({store:new PostgresStore(pool),...config});
  await app.listen({host:config.host,port:config.port});
  console.log('Avalon ready: PostgreSQL persistence enabled.');
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{
    if(stopping)return;stopping=true;await app.close();await pool.end();process.exit(0);
  });
}catch{console.error('Avalon startup failed. Check origin/cookie/proxy configuration, database, migrations, server ownership and port.');await pool.end();process.exitCode=1;}
