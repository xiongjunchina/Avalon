import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultSettings } from '@avalon/contracts';
import { parityFixture, parityPlayerData } from './parity-fixture.ts';

const root = resolve(import.meta.dirname, '../../..');
const { chromium } = await import(process.env.MINIGAME_PLAYWRIGHT_PATH ? pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href : 'playwright');
const server = await createServer({ configFile: join(root, 'apps/web/vite.config.ts'), server: { host: '127.0.0.1', port: 6017, strictPort: true, open: false } });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.MINIGAME_CHROMIUM_PATH ? { executablePath: process.env.MINIGAME_CHROMIUM_PATH } : {}) });
const out = join(root, 'dist/web-reference');
await mkdir(out, { recursive: true });
const fontCss = (await Promise.all([['calligraphy','Ma Shan Zheng'],['display','ZCOOL XiaoWei'],['sans','Noto Sans SC']].map(async ([file,family]) => `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${(await readFile(join(root,'apps/minigame/assets/fonts',file+'.ttf'))).toString('base64')});font-weight:400;font-style:normal;font-display:block;}`))).join('');
const playerData=parityPlayerData();
try {
  for (const width of (process.env.PARITY_WIDTH ? [Number(process.env.PARITY_WIDTH)] : [320, 390, 430])) {
  const height = width === 320 ? 568 : width === 390 ? 844 : 932;
  for (const scene of (process.env.PARITY_SCENES?.split(',') ?? ['guest', 'entry', 'setup', 'lobby', 'game'])) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror',e=>console.error('Web render error:',e.message));
    page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
    await page.addInitScript(() => { const interval = window.setInterval; window.setInterval = (fn, delay, ...args) => interval(fn, delay === 3800 ? 3600000 : delay, ...args); });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:fontCss}));
    const {user,room}=parityFixture(scene);
    const activeRoom = ['lobby','game','identity','vote','vote-submitted','mission','mission-submitted','report','result','treasures','art','battle','friends','friends-list','friends-add'].includes(scene);
    const snapshot = activeRoom && !['lobby','friends','friends-list','friends-add'].includes(scene) ? room : { ...room, phase: 'waiting', game: undefined };
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let status = 200, body = {};
      if (url.pathname === '/api/system/announcement') body = { announcement: { enabled: false, text: '' }, freeAccessMode: true };
      else if (url.pathname === '/api/me/dedicated-rooms') body={rooms:[]};
      else if (url.pathname === '/api/me') { if (scene === 'guest') { status = 401; body = { error: 'UNAUTHENTICATED' }; } else body = { user, roomId: activeRoom ? room.id : null }; }
      else if (url.pathname === '/api/friends') body = {friends:playerData.friends};
      else if (url.pathname === '/api/me/stats') body=playerData.stats;
      else if (url.pathname === '/api/me/games') body={games:[playerData.summary],nextCursor:null};
      else if (url.pathname === '/api/me/presets') body={presets:playerData.presets};
      else if (/\/games\/[^/]+\/replay$/.test(url.pathname)) body=playerData.replay;
      else if (/\/friends\/[^/]+\/chat$/.test(url.pathname)) body={messages:[{id:'m1',senderId:playerData.friends[0].id,receiverId:user.id,message:'来开一局？',isSelf:false,createdAt:'2026-10-22T00:00:00Z'}]};
      else if (url.pathname.startsWith('/api/rooms/')) body = { room: snapshot };
      else if (url.pathname.includes('refresh')) body = { user };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.routeWebSocket('**/api/rooms/**/socket', socket => socket.send(JSON.stringify({ type: 'snapshot', room: snapshot })));
    await page.goto('http://127.0.0.1:6017', { waitUntil: 'networkidle' });
    if (scene === 'setup') await page.getByRole('button', { name: '开常规房', exact: true }).click();
    await page.locator(scene === 'guest' ? '.guest-login-card' : scene === 'setup' ? '.mp-setup-screen' : activeRoom ? '.quest-circles-row' : '.mp-medallion-stage').waitFor();
    if(['identity','art','treasures'].includes(scene)) {
      await page.getByRole('button',{name:'私下查看我的身份',exact:true}).click();
      if(scene==='art')await page.locator('.identity-card').click();
    }
    if(scene==='report')await page.locator('.quest-medallion-wrap').first().click();
    if(scene==='battle')await page.getByRole('button',{name:'取经录',exact:true}).click();
    if(['account','history','favorites','presets','replay','profile'].includes(scene)){
      await page.getByRole('button',{name:'📜 功果簿',exact:true}).click();
      if(scene==='profile')await page.locator('.profile-editor summary').click();
      if(['history','favorites','presets','replay'].includes(scene))await page.getByRole('button',{name:scene==='presets'?'常用设置':scene==='favorites'?'我的收藏':'历史对局',exact:true}).click();
      if(scene==='replay')await page.getByRole('button',{name:'复盘',exact:true}).first().click();
    }
    if(['friends','friends-list','friends-add','direct'].includes(scene)){
      await page.getByRole('button',{name:/👥 仙友/}).click();
      if(scene!=='friends')await page.getByRole('button',{name:scene==='friends-add'?/添加仙友/:/我的仙友/}).click();
    }
    if(scene==='guide'||scene==='guide-role'){
      await page.getByRole('button',{name:'📖 识妖谱',exact:true}).click();
      if(scene==='guide-role')await page.getByRole('button',{name:'角色介绍',exact:true}).click();
    }
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,8000))]);if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
    if(scene==='mission'||scene==='result')await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
    const metrics = await page.evaluate(() => [...document.querySelectorAll('button,.table-modal-sheet,.table-modal-head,.identity-body,.identity-card,.identity-knowledge,.identity-tip-capsule,.identity-treasure-row,.identity-footer,.vote-rule-prompt,.vote-result-container,.vote-captain-hero,.vote-member-card,.vote-history-accordion,.vote-option,.vote-progress-panel,.dedicated-voter-chip,.mission-card,.ended-hero-banner,.profile-bar,.account-tabs,.stat-grid,.faction-card,.role-card,.mp-logo-block,.mp-avalon-logo,.mp-avalon-sub,.lobby-free-access-banner,.mp-medallion-circle,.mp-medallion-name,.mp-medallion-motto,.mp-home-footer,.lobby-mode-switch,.room-code-badge,.quest-medallion-wrap,.quest-circle,.quest-vote-track-zone,.slim-status-banner,.slim-status-bar,.slim-game-status-bar,.table-seats-grid,.scheme-a-main-arena,.scheme-a-center-altar,.scheme-a-flank,.flank-seat,.flank-avatar-wrap,.flank-nameplate,.table-action-dock,.dock-panel,.dock-utility-row,.altar-bagua-disc,.dock-rule-hint')].map(el => { const r=el.getBoundingClientRect(),c=getComputedStyle(el); return { tag:el.tagName, class:el.className, text:el.textContent.trim().slice(0,110), x:r.x,y:r.y,width:r.width,height:r.height,font:c.font,fontWeight:c.fontWeight,fontFamily:c.fontFamily,fontSize:c.fontSize,letterSpacing:c.letterSpacing,color:c.color,background:c.background,border:c.border,shadow:c.boxShadow,padding:c.padding }; }).filter(r=>r.width>0&&r.height>0));
    if(process.env.PARITY_DEBUG) console.log(scene,await page.evaluate(()=>({fonts:[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight})),width:(()=>{const c=document.createElement('canvas').getContext('2d');c.font='700 13px "Ma Shan Zheng"';return c.measureText('五行揭帖').width;})()})));
    await writeFile(join(out, scene + '-' + width + '.json'), JSON.stringify(metrics,null,2));
    await page.screenshot({ path: join(out, scene + '-' + width + '.png') });
    await page.close();
  }
  }
} finally { await browser.close(); await server.close(); }
console.log('Actual latest web reference: ' + out);
