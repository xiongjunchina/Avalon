import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { root, run } from './lib.mjs';

export function matchingEndpoint(endpoints, name, origin, upstream) {
  if (!Array.isArray(endpoints)) throw new Error('Unexpected local ngrok response.');
  const endpoint = endpoints.find(e => e.name === name);
  if (endpoint && (endpoint.url !== origin || endpoint.upstream?.url !== upstream || endpoint.inspect !== false))
    throw new Error('Named endpoint differs from this instance; preserved.');
  return endpoint;
}

export async function waitForEndpoint(read, expected, { attempts = 30, pause = () => delay(500) } = {}) {
  for (let i = 0; i < attempts; i++) {
    const endpoint = matchingEndpoint(await read(), ...expected);
    if (endpoint) return endpoint;
    if (i + 1 < attempts) await pause();
  }
  throw new Error('ngrok did not become ready. No successful start confirmed; inspect deploy/runtime logs.');
}

// launchd owns the process, so closing a terminal/tool session cannot terminate it.
// The plist lives in the project, not Library/LaunchAgents: no login/boot autostart.
export async function startMacAgent(context) {
  const label = `com.avalon.tunnel.${context.name}`;
  const directory = `${root}deploy/runtime`;
  const plist = `${directory}/${context.name}-ngrok.plist`;
  const log = `${directory}/${context.name}-ngrok.log`;
  const target = `gui/${process.getuid()}/${label}`;
  const program = (await run('/usr/bin/which', ['ngrok'])).toString().trim();
  if (!program.startsWith('/')) throw new Error('Cannot resolve the installed ngrok executable.');
  const config = {
    Label: label,
    ProgramArguments: [program, 'http', `http://127.0.0.1:${context.env.GATEWAY_PORT}`,
      '--url', context.env.APP_ORIGIN, '--inspect=false', '--name', `avalon-${context.name}`],
    RunAtLoad: true, KeepAlive: false,
    StandardOutPath: log, StandardErrorPath: log,
  };
  let loaded;
  try { loaded = (await run('/bin/launchctl', ['print', target])).toString(); } catch { /* Not loaded. Bootstrap still validates permissions. */ }
  if (loaded) {
    if (!loaded.includes(`path = ${plist}\n`)) throw new Error('Existing launchd job is not managed by this project; preserved.');
    const saved = JSON.parse((await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist])).toString());
    if (!isDeepStrictEqual(saved, config)) throw new Error('Existing launchd configuration differs; preserved.');
    if (!loaded.includes('state = running')) await run('/bin/launchctl', ['kickstart', target]);
    return;
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  writeFileSync(log, '', { flag: 'a', mode: 0o600 });
  chmodSync(log, 0o600);
  writeFileSync(plist, JSON.stringify(config), { mode: 0o600 });
  chmodSync(plist, 0o600);
  await run('/usr/bin/plutil', ['-convert', 'xml1', plist]);
  await run('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, plist]);
}
