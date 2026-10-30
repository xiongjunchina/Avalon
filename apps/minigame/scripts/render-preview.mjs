import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { chromium } = await import(process.env.MINIGAME_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href : 'playwright');
const result = await build({ stdin: { contents: `
export { layoutWebScreen } from './apps/minigame/src/ui/web-layout.ts';
export { PlayerPanel } from './apps/minigame/src/screens/player-panel.ts';
export { parityFixture, parityPlayerData } from './apps/minigame/scripts/parity-fixture.ts';
export { renderScreen } from './apps/minigame/src/ui/widgets.ts';
export { entryScreen } from './apps/minigame/src/screens/entry.ts';
export { lobbyScreen } from './apps/minigame/src/screens/lobby.ts';
export { guideScreen } from './apps/minigame/src/screens/guide.ts';
export { gameScreen } from './apps/minigame/src/screens/game.ts';
export { AdminPanel } from './apps/minigame/src/screens/admin/panel.ts';
export { adminOverviewScreen } from './apps/minigame/src/screens/admin/views.ts';
export { PracticeSession } from './apps/minigame/src/screens/practice.ts';
export { settingsScreen } from './apps/minigame/src/screens/settings.ts';
export { defaultSettings } from './packages/contracts/src/index.ts';
`, resolveDir: root }, bundle: true, format: 'iife', globalName: 'AvalonPreview', write: false });
const assets = {};
for (const scene of ['gate', 'pavilion', 'sword', 'library', 'mirror', 'dawn']) assets['scenes/' + scene + '.webp'] = 'data:image/webp;base64,' + (await readFile(join(root, 'apps/web/public/art/scenes', scene + '.webp'))).toString('base64');
for (const name of await readdir(join(root, 'apps/web/public/art/roles'))) if (name.endsWith('.webp')) assets[(name.endsWith('-640.webp')?'/art/roles/':'roles/') + name] = 'data:image/webp;base64,' + (await readFile(join(root, 'apps/web/public/art/roles', name))).toString('base64');
for (const name of await readdir(join(root, 'apps/minigame/assets/emblems'))) if (name.endsWith('.png')) assets['emblems/' + name] = 'data:image/png;base64,' + (await readFile(join(root, 'apps/minigame/assets/emblems', name))).toString('base64');
for(const name of await readdir(join(root,'apps/web/public/art/avatars'))){const data='data:image/webp;base64,'+(await readFile(join(root,'apps/web/public/art/avatars',name))).toString('base64');assets['/art/avatars/'+name+'?v=artifact1']=data;assets['avatars/'+name]=data;const i=Number(/wx-(\d+)/.exec(name)?.[1])-1;const legacy=['leaf','moon','sun','mountain','wave','star'][i];if(legacy)assets['emblems/'+legacy+'.png']=data;}
const fonts = Object.fromEntries(await Promise.all(['calligraphy','display','sans'].map(async name => [name,'data:font/ttf;base64,'+(await readFile(join(root,'apps/minigame/assets/fonts',name+'.ttf'))).toString('base64')])));
const out = join(root, 'dist/minigame-preview');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.MINIGAME_CHROMIUM_PATH ? { executablePath: process.env.MINIGAME_CHROMIUM_PATH } : {}) });
try {
  for (const width of (process.env.PARITY_WIDTH?[Number(process.env.PARITY_WIDTH)]:[320,390,430])) {
    const height = width === 320 ? 568 : width === 390 ? 844 : 932;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent('<style>body{margin:0;background:#0a1024}</style><canvas id="preview"></canvas>');
    await page.evaluate(async fonts => { for (const [name,source] of Object.entries(fonts)) { const family = {calligraphy:'Ma Shan Zheng',display:'ZCOOL XiaoWei',sans:'Noto Sans SC'}[name]; const font=new FontFace(family, 'url('+source+')'); document.fonts.add(await font.load()); } }, fonts);
    await page.addScriptTag({ content: result.outputFiles[0].text });
    for (const scene of (process.env.PARITY_SCENES?.split(',')??['entry','setup','game','identity','vote','vote-submitted','mission','report','result','account','profile','history','favorites','presets','friends','friends-list','friends-add','guide','guide-role'])) {
      const layout = await page.evaluate(async ({ width, height, scene, assets }) => {
        const app = globalThis.AvalonPreview;
        const canvas = document.getElementById('preview'); canvas.width = width; canvas.height = height;
        const cache = new Map(); await Promise.all(Object.entries(assets).map(async ([name, url]) => { const img = new Image(); img.src = url; await img.decode(); cache.set(name, img); }));
        const { user, room: parityRoom } = app.parityFixture(scene);
        const room = { id: 'r', code: '123456', hostId: 'u', settings: app.defaultSettings, acceptingNewMembers: true,
          members: Array.from({ length: 6 }, (_, index) => ({ id: index ? 'u' + index : 'u', seat: index + 1, nickname: index ? '仙友' + index : '行者', ready: index > 0, online: true })) };
        let model;
        if (scene === 'guest') model = app.entryScreen();
        if (scene === 'setup') model = { ...app.settingsScreen(app.defaultSettings), web: { page: 'setup', settings: app.defaultSettings } };
        if (scene === 'entry') model = { ...app.entryScreen(user), scene: 'entry' };
        if (scene === 'lobby') model = { ...app.lobbyScreen({...parityRoom,game:undefined,phase:'waiting'}, user, '已连接'), scene: 'game' };
        if (['game','identity','vote','vote-submitted','mission','mission-submitted','report','result','art','treasures','battle'].includes(scene)) {
          const overlay=['identity','art','treasures'].includes(scene)?scene:scene.startsWith('vote')?'vote':scene==='report'?'report':scene==='battle'?'history':undefined;
          model=app.gameScreen(parityRoom,user,{privateRoleVisible:['identity','art','treasures'].includes(scene),ballotVisible:false,overlay,reportMission:1,overlayReturn:scene==='art'?'identity':undefined});
        }
        if(scene==='setup')model={...app.settingsScreen(app.defaultSettings),rows:[{id:'createRoom',text:'创建房间'},{id:'startPractice',text:'演练'}],web:{page:'setup',settings:app.defaultSettings,document:{kind:'settings',activeTab:'setup',settings:app.defaultSettings}}};
        if(['account','profile','history','favorites','presets','friends','friends-list','friends-add','replay'].includes(scene)){
          const d=app.parityPlayerData(), api={statistics:async()=>d.stats,history:async()=>({games:[d.summary],nextCursor:null}),presets:async()=>({presets:d.presets}),friends:async()=>({friends:d.friends}),replay:async()=>d.replay};
          const panel=new app.PlayerPanel(api,user);await panel.open(scene.startsWith('friends')?'friends':scene==='profile'?'account':scene==='favorites'||scene==='replay'?'history':scene);
          if(scene==='profile')await panel.handle('profileToggle',async()=>undefined);
          if(scene==='favorites')await panel.handle('page:favorites',async()=>undefined);
          if(scene==='friends-list')await panel.handle('friendTab:friends',async()=>undefined);
          if(scene==='friends-add')await panel.handle('friendTab:add',async()=>undefined);
          if(scene==='replay')await panel.openReplay(d.replay.id,'page:history');
          model=panel.model();
        }
        if (scene === 'guide') model = app.guideScreen();
        if (scene === 'guide-role') model = app.guideScreen(undefined,'roles');
        if(scene.startsWith('admin')){const panel=new app.AdminPanel({verify:async()=>{},overview:async()=>({totalUsers:128,todayNewUsers:8,activeRoomsCount:3,onlineConnections:24,totalGames:456,todayGames:12,freeAccessMode:true}),users:async()=>({users:[],total:0}),codes:async()=>({codes:[]}),settings:async()=>({freeAccessMode:true,adRewardHours:24,announcement:{enabled:false,text:''}})});await panel.open('mock-only');if(scene!=='admin')await panel.handle('page:'+scene.slice(6),async()=>undefined);model=panel.model();}
        if(scene==='chat'){const panel=new app.PlayerPanel({},user);await panel.open('roomchat',{roomId:parityRoom.id});panel.onRoomChat({messageId:'m1',fromUserId:parityRoom.members[1].id,nickname:'仙友1',seat:2,text:'这局我来当队长',timestamp:'2026-10-22T00:00:00Z'});model=panel.model();model.web.underlay=app.gameScreen(parityRoom,user,{privateRoleVisible:false,ballotVisible:false});}

        if(scene==='mission'||scene==='result')model.scroll=app.layoutWebScreen(model,{width,height,top:0,bottom:0}).maxScroll;
        app.renderScreen(model, canvas, { width, height, top: 0, bottom: 0 }, { get: name => cache.get(name) });
        return app.layoutWebScreen(model,{width,height,top:0,bottom:0});
      }, { width, height, scene, assets });
      await writeFile(join(out, `${scene}-${width}.json`), JSON.stringify(layout,null,2));
      await page.screenshot({ path: join(out, `${scene}-${width}.png`) });
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log('Headless Canvas previews: ' + out);
