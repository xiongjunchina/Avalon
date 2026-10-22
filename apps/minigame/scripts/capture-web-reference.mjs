import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultSettings } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';

const root = resolve(import.meta.dirname, '../../..');
const { chromium } = await import(process.env.MINIGAME_PLAYWRIGHT_PATH ? pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href : 'playwright');
const server = await createServer({ configFile: join(root, 'apps/web/vite.config.ts'), server: { host: '127.0.0.1', port: 6017, strictPort: true, open: false } });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.MINIGAME_CHROMIUM_PATH ? { executablePath: process.env.MINIGAME_CHROMIUM_PATH } : {}) });
const out = join(root, 'dist/web-reference');
await mkdir(out, { recursive: true });
const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '行者', playerCode: '123456', avatar: 'leaf' };
const members = Array.from({ length: 6 }, (_, index) => ({ id: index ? '00000000-0000-4000-8000-' + String(index).padStart(12, '0') : user.id, nickname: index ? '仙友' + index : user.nickname, seat: index + 1, ready: index > 0, online: true }));
const game = createGame('11111111-2222-4333-8444-555555555555', members, defaultSettings, values => [...values]);
const room = { id: '22222222-2222-4222-8222-222222222222', code: '123456', version: 1, hostId: user.id, settings: defaultSettings, acceptingNewMembers: true, members, phase: 'waiting', serverTime: new Date().toISOString() };
try {
  for (const scene of ['guest', 'entry', 'setup', 'lobby', 'game']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const activeRoom = ['lobby', 'game'].includes(scene);
    const snapshot = scene === 'game' ? { ...room, phase: 'playing', game: projectGame(game, user.id) } : room;
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let status = 200, body = {};
      if (url.pathname === '/api/system/announcement') body = { announcement: { enabled: false, text: '' }, freeAccessMode: true };
      else if (url.pathname === '/api/me') { if (scene === 'guest') { status = 401; body = { error: 'UNAUTHENTICATED' }; } else body = { user, roomId: activeRoom ? room.id : null }; }
      else if (url.pathname === '/api/friends') body = { friends: [] };
      else if (url.pathname.startsWith('/api/rooms/')) body = { room: snapshot };
      else if (url.pathname.includes('refresh')) body = { user };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.routeWebSocket('**/api/rooms/**/socket', socket => socket.send(JSON.stringify({ type: 'snapshot', room: snapshot })));
    await page.goto('http://127.0.0.1:6017', { waitUntil: 'networkidle' });
    if (scene === 'setup') await page.getByRole('button', { name: '开常规房', exact: true }).click();
    await page.locator(scene === 'guest' ? '.guest-login-card' : scene === 'setup' ? '.mp-setup-screen' : activeRoom ? '.quest-circles-row' : '.mp-medallion-stage').waitFor();
    await page.screenshot({ path: join(out, scene + '-390.png') });
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
console.log('Actual latest web reference: ' + out);
