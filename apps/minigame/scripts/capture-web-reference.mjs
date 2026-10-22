import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultSettings } from '@avalon/contracts';
import { parityFixture } from './parity-fixture.ts';

const root = resolve(import.meta.dirname, '../../..');
const { chromium } = await import(process.env.MINIGAME_PLAYWRIGHT_PATH ? pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href : 'playwright');
const server = await createServer({ configFile: join(root, 'apps/web/vite.config.ts'), server: { host: '127.0.0.1', port: 6017, strictPort: true, open: false } });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.MINIGAME_CHROMIUM_PATH ? { executablePath: process.env.MINIGAME_CHROMIUM_PATH } : {}) });
const out = join(root, 'dist/web-reference');
await mkdir(out, { recursive: true });
const fontCss = (await Promise.all([['calligraphy','Ma Shan Zheng'],['display','ZCOOL XiaoWei'],['sans','Noto Sans SC']].map(async ([file,family]) => `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${(await readFile(join(root,'apps/minigame/assets/fonts',file+'.ttf'))).toString('base64')});font-weight:400;font-style:normal;font-display:block;}`))).join('');
const { user, room } = parityFixture();
try {
  for (const width of (process.env.PARITY_WIDTH ? [Number(process.env.PARITY_WIDTH)] : [320, 390, 430])) {
  const height = width === 320 ? 568 : width === 390 ? 844 : 932;
  for (const scene of (process.env.PARITY_SCENES?.split(',') ?? ['guest', 'entry', 'setup', 'lobby', 'game'])) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    await page.addInitScript(() => { const interval = window.setInterval; window.setInterval = (fn, delay, ...args) => interval(fn, delay === 3800 ? 3600000 : delay, ...args); });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:fontCss}));
    const activeRoom = ['lobby', 'game'].includes(scene);
    const snapshot = scene === 'game' ? room : { ...room, phase: 'waiting', game: undefined };
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
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
    const metrics = await page.evaluate(() => [...document.querySelectorAll('button,.mp-logo-block,.mp-avalon-logo,.mp-avalon-sub,.lobby-free-access-banner,.mp-medallion-circle,.mp-medallion-name,.mp-medallion-motto,.mp-home-footer,.lobby-mode-switch,.room-code-badge,.quest-medallion-wrap,.quest-circle,.quest-vote-track-zone,.slim-status-banner,.slim-status-bar,.slim-game-status-bar,.table-seats-grid,.scheme-a-main-arena,.scheme-a-center-altar,.scheme-a-flank,.flank-seat,.flank-avatar-wrap,.flank-nameplate,.table-action-dock,.dock-panel,.dock-utility-row,.altar-bagua-disc,.dock-rule-hint')].map(el => { const r=el.getBoundingClientRect(),c=getComputedStyle(el); return { tag:el.tagName, class:el.className, text:el.textContent.trim().slice(0,110), x:r.x,y:r.y,width:r.width,height:r.height,font:c.font,fontWeight:c.fontWeight,fontFamily:c.fontFamily,fontSize:c.fontSize,letterSpacing:c.letterSpacing,color:c.color,background:c.background,border:c.border,shadow:c.boxShadow,padding:c.padding }; }).filter(r=>r.width>0&&r.height>0));
    if(process.env.PARITY_DEBUG) console.log(scene,await page.evaluate(()=>({fonts:[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight})),width:(()=>{const c=document.createElement('canvas').getContext('2d');c.font='700 13px "Ma Shan Zheng"';return c.measureText('五行揭帖').width;})()})));
    await writeFile(join(out, scene + '-' + width + '.json'), JSON.stringify(metrics,null,2));
    await page.screenshot({ path: join(out, scene + '-' + width + '.png') });
    await page.close();
  }
  }
} finally { await browser.close(); await server.close(); }
console.log('Actual latest web reference: ' + out);
