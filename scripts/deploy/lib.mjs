import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export function validNgrokOrigin(value) {
  try { const url=new URL(value);return url.origin===value&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
    /^[a-z0-9-]+\.(?:ngrok-free\.(?:app|dev)|ngrok\.(?:app|dev))$/.test(url.hostname); }catch{return false;}
}
export function validateInstance(name,env) {
  if (!/^[a-z][a-z0-9-]{0,24}$/.test(name)) throw new Error('Invalid deployment instance name');
  const tunnel=env.EXPOSURE==='ngrok';
  const protocol=env.COOKIE_SECURE==='true'?'https':'http';
  if(env.PROJECT!==`avalon-stage7-${name}`||!/^\d{4,5}$/.test(env.GATEWAY_PORT)||+env.GATEWAY_PORT>65535||+env.GATEWAY_PORT<1024||
    !['true','false'].includes(env.COOKIE_SECURE)||!/^[a-f0-9]{64}$/.test(env.POSTGRES_PASSWORD)||
    (env.EXPOSURE!==undefined&&!tunnel)||
    (tunnel?(!validNgrokOrigin(env.APP_ORIGIN)||env.COOKIE_SECURE!=='true'||env.TLS_DIRECTIVE!==''):
      (env.APP_ORIGIN!==`${protocol}://127.0.0.1:${env.GATEWAY_PORT}`||env.TLS_DIRECTIVE!==(protocol==='https'?'tls internal':''))))
    throw new Error('Invalid deployment configuration. Use deploy:setup or deploy:tunnel:setup.');
  return tunnel;
}
export function instance(name = 'local') {
  if (!/^[a-z][a-z0-9-]{0,24}$/.test(name)) throw new Error('Invalid deployment instance name');
  const path = `${root}deploy/.env.${name}`;
  const env = parseEnv(readFileSync(path, 'utf8'));
  const tunnel=validateInstance(name,env);
  return { name, env, args: ['compose', '--env-file', path, '-f', `${root}deploy/compose.yaml`,
    ...(tunnel?['-f',`${root}deploy/compose.ngrok.yaml`]:[]), '-p', env.PROJECT] };
}
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'], env: options.env ?? process.env });
    const out = [], err = [];
    child.stdout?.on('data', chunk => out.push(chunk));
    child.stderr?.on('data', chunk => err.push(chunk));
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${command} failed (${code}). ${options.diagnostic ? Buffer.concat(err).toString().slice(-1500) : 'Check service status; no credentials printed.'}`)));
  });
}
export const compose = (context, args, options) => run('docker', [...context.args, ...args], options);
export const sql = async (context, query) => (await compose(context, ['exec', '-T', 'postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'avalon', '-d', 'avalon', '-Atc', query])).toString().trim();
export function cli(main) { main().catch(error => { console.error(error.message); process.exitCode = 1; }); }
