import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultSettings } from '@avalon/contracts';
import { parityFixture, parityPlayerData, parityAdminData } from './parity-fixture.ts';

const root = resolve(import.meta.dirname, '../../..');
const { chromium } = await import(process.env.MINIGAME_PLAYWRIGHT_PATH ? pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href : 'playwright');
const server = await createServer({ configFile: join(root, 'apps/web/vite.config.ts'), server: { host: '127.0.0.1', port: 6017, strictPort: true, open: false } });
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.MINIGAME_CHROMIUM_PATH ? { executablePath: process.env.MINIGAME_CHROMIUM_PATH } : {}) });
const playerCount=Number(process.env.PARITY_PLAYERS??6);
const captureSuffix=process.env.PARITY_BOTTOM==='1'?'-bottom':'';
const out = join(root, 'dist/web-reference'+(playerCount===6?'':'-'+playerCount)+captureSuffix);
await mkdir(out, { recursive: true });
let fontCss = (await Promise.all([['calligraphy','Ma Shan Zheng'],['display','ZCOOL XiaoWei'],['sans','Noto Sans SC']].map(async ([file,family]) => `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${(await readFile(join(root,'apps/minigame/assets/fonts',file+'.ttf'))).toString('base64')});font-weight:400;font-style:normal;font-display:block;}`))).join('');
for(const weight of [500,600,700])fontCss+=`@font-face{font-family:"Noto Sans SC";src:url(data:font/ttf;base64,${(await readFile(join(root,'apps/minigame/assets/web-fonts/sans'+weight+'.ttf'))).toString('base64')});font-weight:${weight};font-style:normal;font-display:block;}`;
const playerData=parityPlayerData(),adminData=parityAdminData();
try {
  for (const width of (process.env.PARITY_WIDTH ? [Number(process.env.PARITY_WIDTH)] : [320, 390, 430])) {
  const height = width === 320 ? 568 : width === 390 ? 844 : 932;
  for (const captureScene of (process.env.PARITY_SCENES?.split(',') ?? ['guest', 'entry', 'setup', 'lobby', 'game'])) {
    const scene=({'preset-editor':'presets','profile-vip':'profile','history-expanded':'history','replay-expanded':'replay','admin-special-editor':'admin-special','admin-code-editor':'admin-users'})[captureScene]??captureScene.replace('-populated','');
    const populated=captureScene.endsWith('-populated')||captureScene==='admin-code-editor';
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror',e=>console.error('Web render error:',e.message));
    page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(15000);
    await page.addInitScript(() => { const interval = window.setInterval; window.setInterval = (fn, delay, ...args) => interval(fn, delay === 3800 ? 3600000 : delay, ...args); });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:fontCss}));
    const {user,room}=parityFixture(scene,playerCount);
    if(scene.startsWith('admin'))await page.addInitScript(()=>sessionStorage.setItem('avalon_admin_key','mock-only'));
    const activeRoom = ['lobby','game','identity','vote','vote-submitted','mission','mission-submitted','report','result','treasures','art','battle','friends','friends-list','friends-add','preferences'].includes(scene);
    const snapshot = activeRoom && !['lobby','friends','friends-list','friends-add','preferences'].includes(scene) ? room : { ...room, phase: 'waiting', game: undefined };
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let status = 200, body = {};
      if(url.pathname==='/api/admin/overview')body={totalUsers:128,todayNewUsers:8,activeRoomsCount:3,onlineConnections:24,totalGames:456,todayGames:12,freeAccessMode:true};
      else if(url.pathname==='/api/admin/settings')body={freeAccessMode:true,adRewardHours:24,announcement:{enabled:false,text:''}};
      else if(url.pathname==='/api/admin/users')body={users:populated?adminData.users:[],total:populated?adminData.users.length:0};
      else if(url.pathname==='/api/admin/rooms')body={rooms:populated?adminData.rooms:[]};
      else if(url.pathname==='/api/admin/games')body={games:populated?adminData.games:[]};
      else if(url.pathname==='/api/admin/redemption-codes')body={codes:populated?adminData.codes:[]};
      else if(url.pathname==='/api/admin/dedicated-rooms')body={rooms:[]};
      else if(url.pathname==='/api/admin/player-codes')body={codes:[]};
      else if(url.pathname.endsWith('/player-code-history'))body={history:[]};
      else if(url.pathname==='/api/admin/player-codes/check')body={code:adminData.users[0].playerCode,status:'current'};
      else if(url.pathname==='/api/admin/player-codes/history')body={history:[],nextCursor:null};
      else if (url.pathname === '/api/system/announcement') body = { announcement: { enabled: false, text: '' }, freeAccessMode: true };
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
    await page.goto('http://127.0.0.1:6017'+(scene.startsWith('admin')?'/?admin':''), { waitUntil: 'networkidle' });
    if(scene.startsWith('admin-')){const labels={users:/仙友用户/,rooms:/法坛对局/,codes:/兑换码/,settings:/运营策略/,special:/专属房与靓号/};await page.locator('.admin-nav-bar').getByRole('button',{name:labels[scene.slice(6)]}).click();}
    if(scene==='guest')await page.getByRole('button',{name:'开常规房',exact:true}).click();
    if (scene === 'setup') await page.getByRole('button', { name: '开常规房', exact: true }).click();
    await page.locator(scene.startsWith('admin')?'.admin-viewport':scene === 'guest' ? '.guest-login-card' : scene === 'setup' ? '.mp-setup-screen' : activeRoom ? '.room-table-screen' : '.mp-medallion-stage').waitFor();
    if(scene==='preferences')await page.getByRole('button',{name:/心仪角色/}).click();
    if(scene==='sound')await page.getByRole('button',{name:'声音设置',exact:true}).click();
    if(captureScene==='admin-code-editor'){await page.getByRole('button',{name:'改仙友码',exact:true}).first().click();await page.getByText('这是玩家当前号码。',{exact:true}).waitFor();}
    if(captureScene==='admin-special-editor')await page.getByRole('button',{name:'新建专属房',exact:true}).click();
    if(['identity','art','treasures'].includes(scene)) {
      await page.getByRole('button',{name:'私下查看我的身份',exact:true}).click();
      if(scene==='art')await page.locator('.identity-card').click();
      if(scene==='treasures')await page.getByRole('button',{name:/本命法宝/}).click();
    }
    if(scene==='report')await page.locator('.quest-medallion-wrap').first().click();
    if(scene==='battle')await page.getByRole('button',{name:'取经录',exact:true}).click();
    if(['account','history','favorites','presets','replay','profile'].includes(scene)){
      await page.getByRole('button',{name:'📜 功果簿',exact:true}).click();
      if(scene==='profile')await page.getByRole('button',{name:'修改昵称与头像',exact:true}).click();
      if(['history','favorites','presets','replay'].includes(scene))await page.getByRole('button',{name:scene==='presets'?'常用设置':scene==='favorites'?'我的收藏':'历史对局',exact:true}).click();
      if(scene==='replay')await page.getByRole('button',{name:/查看复盘/}).first().click();
    }
    if(['friends','friends-list','friends-add','direct'].includes(scene)){
      await page.getByRole('button',{name:/👥 仙友/}).click();
      if(scene!=='friends')await page.getByRole('button',{name:scene==='friends-add'?/添加仙友/:/我的仙友/}).click();
    }
    if(scene==='direct')await page.getByRole('button',{name:/密札/}).first().click();
    if(scene==='guide'||scene==='guide-role'){
      await page.getByRole('button',{name:'玩法与角色',exact:true}).click();
      if(scene==='guide-role')await page.getByRole('button',{name:'角色介绍',exact:true}).click();
    }
    if(captureScene==='preset-editor')await page.getByRole('button',{name:'新建常用设置',exact:true}).click();
    if(captureScene==='profile-vip')await page.getByText('VIP 兑换与权益',{exact:true}).click();
    if(captureScene==='history-expanded')await page.locator('summary').filter({hasText:'对局信息'}).click();
    if(captureScene==='replay-expanded'){await page.locator('summary').filter({hasText:'时间、编号与规则配置'}).click();await page.locator('summary').filter({hasText:'全员最终身份'}).click();}
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.race([Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,8000))]);if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
    if(scene==='mission'||scene==='result')await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    if(process.env.PARITY_BOTTOM==='1')await page.evaluate(()=>{const sheet=document.querySelector('.table-modal-sheet,.profile-editor,.modal-card');if(sheet){for(const el of [sheet,...sheet.querySelectorAll('*')])if(el instanceof HTMLElement&&el.scrollHeight>el.clientHeight+5&&/auto|scroll/.test(getComputedStyle(el).overflowY))el.scrollTop=el.scrollHeight;}else window.scrollTo(0,document.body.scrollHeight);});
    await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));
    const metrics = await page.evaluate(() => [...document.querySelectorAll('p,h1,h2,h3,strong,small,summary,.faction-card *,.role-card *,button,.table-modal-sheet,.table-modal-head,.identity-body,.identity-card,.identity-knowledge,.identity-tip-capsule,.identity-treasure-row,.identity-footer,.vote-rule-prompt,.vote-result-container,.vote-captain-hero,.vote-member-card,.vote-history-accordion,.vote-option,.vote-progress-panel,.dedicated-voter-chip,.mission-card,.ended-hero-banner,.profile-bar,.account-tabs,.stat-grid,.faction-card,.role-card,.mp-logo-block,.mp-avalon-logo,.mp-avalon-sub,.lobby-free-access-banner,.mp-medallion-circle,.mp-medallion-name,.mp-medallion-motto,.mp-home-footer,.lobby-mode-switch,.room-code-badge,.quest-medallion-wrap,.quest-circle,.quest-vote-track-zone,.slim-status-banner,.slim-status-bar,.slim-game-status-bar,.table-seats-grid,.scheme-a-main-arena,.scheme-a-center-altar,.scheme-a-flank,.flank-seat,.flank-avatar-wrap,.flank-nameplate,.table-action-dock,.dock-panel,.dock-utility-row,.altar-bagua-disc,.dock-rule-hint')].map(el => { const r=el.getBoundingClientRect(),c=getComputedStyle(el); return { tag:el.tagName, class:el.className, text:el.textContent.trim().slice(0,110), x:r.x,y:r.y,width:r.width,height:r.height,font:c.font,fontWeight:c.fontWeight,fontFamily:c.fontFamily,fontSize:c.fontSize,lineHeight:c.lineHeight,borderRadius:c.borderRadius,margin:c.margin,opacity:c.opacity,letterSpacing:c.letterSpacing,color:c.color,background:c.background,border:c.border,shadow:c.boxShadow,padding:c.padding }; }).filter(r=>r.width>0&&r.height>0));
    if(process.env.PARITY_DEBUG) console.log(scene,await page.evaluate(()=>({fonts:[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight})),width:(()=>{const c=document.createElement('canvas').getContext('2d');c.font='700 13px "Ma Shan Zheng"';return c.measureText('五行揭帖').width;})()})));
    await writeFile(join(out,captureScene+'-'+width+'.dom.html'),await page.content());
    await writeFile(join(out, captureScene + '-' + width + '.json'), JSON.stringify(metrics,null,2));
    await page.screenshot({ path: join(out, captureScene + '-' + width + '.png') });
    await page.close();
  }
  }
} finally { await browser.close(); await server.close(); }
console.log('Actual latest web reference: ' + out);
