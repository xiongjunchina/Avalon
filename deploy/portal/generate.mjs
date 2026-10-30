import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const reserved = new Set(['api', 'assets', 'art', 'audio', 'admin', 'healthz', 'portal-assets']);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function validateGames(games) {
  if (!Array.isArray(games) || !games.length) throw Error('A non-empty game registry is required');
  const ids = new Set();
  for (const game of games) {
    if (!/^[a-z][a-z0-9-]*$/.test(game.id) || reserved.has(game.id) || ids.has(game.id)) throw Error('Invalid or duplicate game identifier');
    ids.add(game.id);
    if (game.path !== `/${game.id}/` || !game.healthPath?.startsWith(game.path + 'api/') || /[\s{}?#]/.test(game.healthPath)) throw Error('Invalid public game path');
    if (!/^[a-z][a-z0-9-]*:[1-9][0-9]{0,4}$/.test(game.upstream) || Number(game.upstream.split(':')[1]) > 65535 || !/^[a-z][a-z0-9-]*$/.test(game.network)) throw Error('Invalid internal game service');
    for (const key of ['name', 'label', 'description', 'players', 'status']) if (typeof game[key] !== 'string' || !game[key].trim()) throw Error(`Missing game ${key}`);
  }
  if (!ids.has('avalon')) throw Error('Avalon is required for legacy URL compatibility');
  return games;
}

const art = id => id === 'avalon'
  ? '<path d="M35 110 80 25l45 85M47 110 80 48l33 62M31 115h98M73 20h14v20H73zM80 22v16M62 125h36M70 131h20"/><circle cx="80" cy="77" r="17"/><path d="M80 60v34M63 77h34"/>'
  : id === 'mafia' ? '<rect x="29" y="33" width="68" height="88" rx="8" transform="rotate(-12 63 77)"/><rect x="66" y="30" width="68" height="88" rx="8" transform="rotate(12 100 74)"/><path d="M99 49 82 73l17 24 17-24Z"/><path d="M35 130h90"/>'
    : '<rect x="31" y="27" width="98" height="98" rx="12"/><path d="M58 76h44M80 54v44"/>';

export function portalHtml(games) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>游戏大厅 · 好友桌游</title><link rel="icon" href="/portal-assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/portal-assets/portal.css"><script src="/portal-assets/portal.js" defer></script></head><body><main><header><span class="brand" aria-hidden="true">局</span><p class="eyebrow">好友桌游 · 一起入局</p></header><div class="intro"><h1>游戏大厅</h1><p>选一款喜欢的游戏，邀请朋友一起开局。</p></div><section class="games" aria-label="选择游戏">${games.map(game => `<article class="game" data-game="${game.id}"><div class="art" aria-hidden="true"><svg viewBox="0 0 160 150" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${art(game.id)}</svg></div><div class="content"><div class="meta"><span>${escapeHtml(game.label)}</span><span>${escapeHtml(game.players)}</span><span class="status">${escapeHtml(game.status)}</span></div><h2>${escapeHtml(game.name)}</h2><p class="description">${escapeHtml(game.description)}</p><a class="enter" href="${game.path}" aria-label="进入${escapeHtml(game.name)}"><span>进入游戏</span><span aria-hidden="true">→</span></a></div></article>`).join('')}</section><footer>同桌讨论，在线入座。一起寻找藏在朋友中的另一重身份。</footer></main></body></html>\n`;
}

const proxy = upstream => `reverse_proxy ${upstream} {\n        header_up X-Forwarded-For {remote_host}\n        header_up -Forwarded\n        stream_close_delay 5m\n      }`;
export function portalCaddy(games) {
  const avalon = games.find(game => game.id === 'avalon');
  return `{
  admin localhost:2019
  skip_install_trust
}
{$SITE_ADDRESS} {
  encode zstd gzip
  header {
    -Server
    X-Content-Type-Options nosniff
    Referrer-Policy no-referrer
  }
${games.map(game => `  handle /${game.id} {
    route {
      rewrite * ${game.path}
      redir {uri} 308
    }
  }
  handle ${game.path}* {
    ${proxy(game.upstream)}
  }`).join('\n')}
  @legacyApi path /api /api/* /assets/* /art/* /audio/*
  handle @legacyApi {
    rewrite * /avalon{uri}
    ${proxy(avalon.upstream)}
  }
  @legacyAdmin path /admin /admin/*
  handle @legacyAdmin {
    redir * /avalon{uri} 308
  }
  handle /healthz {
    respond "ok" 200
  }
  @portal path / /portal-assets/*
  handle @portal {
    header {
      Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      Permissions-Policy "camera=(), microphone=(), geolocation=()"
      Cache-Control "no-cache"
    }
    root * {$PORTAL_WEB_ROOT:/srv}
    file_server
  }
  handle {
    respond "Not found" 404
  }
}
`;
}

export function portalCompose(games) {
  const networks = [...new Set(games.map(game => game.network))];
  return `name: game-portal
services:
  gateway:
    image: \${CADDY_IMAGE:?Missing pinned Caddy image}
    environment:
      SITE_ADDRESS: \${APP_ORIGIN:?Missing public origin}
      PORTAL_WEB_ROOT: /opt/game-portal/public/current/www
    command: ["caddy", "run", "--config", "/opt/game-portal/public/current/Caddyfile", "--adapter", "caddyfile"]
    ports:
      - "0.0.0.0:80:80"
      - "0.0.0.0:443:443"
    volumes:
      - \${PORTAL_ROOT:?Missing portal directory}/public:/opt/game-portal/public:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
${networks.map((_, i) => `      - ingress_${i}`).join('\n')}
    restart: unless-stopped
    security_opt: [no-new-privileges:true]
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:2019/config/"]
      interval: 5s
      timeout: 3s
      retries: 20
networks:
${networks.map((network, i) => `  ingress_${i}:\n    external: true\n    name: ${network}`).join('\n')}
volumes:
  caddy_data:
    external: true
    name: \${CADDY_DATA_VOLUME:?Preserve the existing certificate volume}
  caddy_config:
    external: true
    name: \${CADDY_CONFIG_VOLUME:?Preserve the existing Caddy config volume}
`;
}

export async function generatePortal(outDir, registry = join(source, 'games.json')) {
  const games = validateGames(JSON.parse(await readFile(registry, 'utf8')));
  await mkdir(join(outDir, 'www', 'portal-assets'), {recursive: true});
  await cp(join(source, 'assets'), join(outDir, 'www', 'portal-assets'), {recursive: true});
  await writeFile(join(outDir, 'www/index.html'), portalHtml(games));
  await writeFile(join(outDir, 'Caddyfile'), portalCaddy(games));
  await writeFile(join(outDir, 'compose.yaml'), portalCompose(games));
  await writeFile(join(outDir, 'games.json'), JSON.stringify(games, null, 2) + '\n');
  return {games};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = resolve(process.argv[2] || 'dist/portal');
  await generatePortal(outDir);
  console.log(`Game portal generated: ${outDir}`);
}
