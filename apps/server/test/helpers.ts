import { randomBytes } from 'node:crypto';
import { Socket } from 'node:net';
import { createPool, migrate } from '../src/db.js';
import { PostgresStore } from '../src/store.js';
import { buildApp } from '../src/app.js';

export const origin='http://localhost:5173';
export const headers={origin,'x-avalon-request':'1'};
export const localSocket=()=>Object.defineProperty(new Socket(),'remoteAddress',{value:'127.0.0.1'});
export async function database(t:{after:(fn:()=>Promise<void>)=>void}) {
  const schema=`avalon_test_${randomBytes(8).toString('hex')}`;
  const admin=createPool();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool=createPool(schema); await migrate(pool);
  let timestamp=Date.now();
  const store=new PostgresStore(pool,()=>timestamp);
  t.after(async()=>{
    await pool.end();
    // Only the random schema created by this fixture is removed; never public/development data.
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
  });
  return {pool,store,admin,schema,advance:(ms:number)=>{timestamp+=ms;},now:()=>timestamp};
}
export async function service(t:{after:(fn:()=>Promise<void>)=>void}) {
  // Register cleanup once, in dependency order (server before pool/schema).
  const cleanups:(()=>Promise<void>)[]=[];
  const db=await database({after:fn=>cleanups.push(fn)});
  let current=await buildApp({store:db.store,maintenanceMs:600000});await current.app.ready();
  t.after(async()=>{await current.app.close();for(const fn of cleanups)await fn();});
  return {...db,get app(){return current.app;},restart:async()=>{
    await current.app.close();current=await buildApp({store:db.store,maintenanceMs:600000});await current.app.ready();
  }};
}
