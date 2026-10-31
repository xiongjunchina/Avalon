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
export { parityFixture, parityPlayerData, parityAdminData } from './apps/minigame/scripts/parity-fixture.ts';
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
const packageRoot=join(root,'dist/minigame');
for(const folder of ['scenes','roles','avatars'])for(const name of await readdir(join(packageRoot,'art',folder))){
 if(!name.endsWith('.jpg'))continue;
 const logical=folder+'/'+name.replace(/\.jpg$/,'.webp'),data='data:image/jpeg;base64,'+(await readFile(join(packageRoot,'art',folder,name))).toString('base64');assets[logical]=data;
 if(folder==='avatars'){assets['/art/'+logical+'?v=artifact1']=data;const i=Number(/wx-(\d+)/.exec(name)?.[1])-1,legacy=['leaf','moon','sun','mountain','wave','star'][i];if(legacy)assets['emblems/'+legacy+'.png']=data;}
}
for(const name of await readdir(join(packageRoot,'hd-art')))if(name.endsWith('.jpg')){const data='data:image/jpeg;base64,'+(await readFile(join(packageRoot,'hd-art',name))).toString('base64');if(name.startsWith('scene-'))assets['scenes/'+name.slice(6).replace('.jpg','.webp')]=data;else{assets['/art/roles/'+name.replace('.jpg','.webp')]=data;assets['roles/'+name.replace('-640.jpg','-160.webp')]=data;}}
for(const name of await readdir(join(packageRoot,'art/emblems')))if(name.endsWith('.png')&&!assets['emblems/'+name])assets['emblems/'+name]='data:image/png;base64,'+(await readFile(join(packageRoot,'art/emblems',name))).toString('base64');
assets['home/duel-mobile.jpg']='data:image/jpeg;base64,'+(await readFile(join(packageRoot,'hd-art/home-duel.jpg'))).toString('base64');
for(const name of await readdir(join(packageRoot,'art/emblems')))if(name.endsWith('.png'))assets['symbols/'+name]='data:image/png;base64,'+(await readFile(join(packageRoot,'art/emblems',name))).toString('base64');
const fonts = Object.fromEntries(await Promise.all(['calligraphy','display','sans','sans500','sans600','sans700','homeInterface'].map(async name => [name,'data:font/ttf;base64,'+(await readFile(join(packageRoot,(/sans[567]00/.test(name)||name==='homeInterface'||name==='display')?'web-fonts':'art/fonts',name+'.ttf'))).toString('base64')])));
const dpr=Number(process.env.PARITY_DPR??1);
const playerCount=Number(process.env.PARITY_PLAYERS??6);
const captureSuffix=process.env.PARITY_BOTTOM==='1'?'-bottom':'';
const out = join(root, (dpr===1?'dist/minigame-preview':'dist/minigame-preview-dpr'+dpr)+(playerCount===6?'':'-'+playerCount)+captureSuffix);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.MINIGAME_CHROMIUM_PATH ? { executablePath: process.env.MINIGAME_CHROMIUM_PATH } : {}) });
try {
  for (const width of (process.env.PARITY_WIDTH?[Number(process.env.PARITY_WIDTH)]:[320,390,430])) {
    const height = width === 320 ? 568 : width === 390 ? 844 : 932;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
    await page.setContent('<style>body{margin:0;background:#0a1024}</style><canvas id="preview"></canvas>');
    await page.evaluate(async fonts => { for (const [name,source] of Object.entries(fonts)) { const family = {calligraphy:'Ma Shan Zheng',display:'ZCOOL XiaoWei',sans:'Noto Sans SC',sans500:'Noto Sans SC',sans600:'Noto Sans SC',sans700:'Noto Sans SC',homeInterface:'Home Interface'}[name]; const font=new FontFace(family, 'url('+source+')',{weight:/sans[567]00/.test(name)?name.slice(4):'400'}); document.fonts.add(await font.load()); } }, fonts);
    await page.addScriptTag({ content: result.outputFiles[0].text });
    for (const captureScene of (process.env.PARITY_SCENES?.split(',')??['entry','setup','game','identity','vote','vote-submitted','mission','report','result','account','profile','history','favorites','presets','friends','friends-list','friends-add','guide','guide-role'])) {
      const scene=captureScene.startsWith('treasures-')?'treasures':({'preset-editor':'presets','profile-vip':'profile','history-expanded':'history','replay-expanded':'replay','admin-special-editor':'admin-special','admin-code-editor':'admin-users','admin-friends':'admin-users'})[captureScene]??captureScene.replace('-populated','');
      const layout = await page.evaluate(async ({ width, height, scene, assets, dpr,playerCount,captureScene,bottomCapture }) => {
        const app = globalThis.AvalonPreview;
        const canvas = document.getElementById('preview'); canvas.width = width*dpr; canvas.height = height*dpr;canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.getContext('2d').scale(dpr,dpr);
        const cache = new Map(); await Promise.all(Object.entries(assets).map(async ([name, url]) => { const img = new Image(); img.src = url; await img.decode(); cache.set(name, img); }));
        const { user, room: parityRoom } = app.parityFixture(captureScene,playerCount);
        const room = { id: 'r', code: '123456', hostId: 'u', settings: app.defaultSettings, acceptingNewMembers: true,
          members: Array.from({ length: 6 }, (_, index) => ({ id: index ? 'u' + index : 'u', seat: index + 1, nickname: index ? '仙友' + index : '行者', ready: index > 0, online: true })) };
        let model;
        if (scene === 'guest') {model=app.entryScreen(undefined,undefined,true);model.web.authIntent='create';}
        if (scene === 'setup') model = { ...app.settingsScreen(app.defaultSettings), web: { page: 'setup', settings: app.defaultSettings } };
        if (scene === 'entry') model = { ...app.entryScreen(user),web:{...app.entryScreen(user).web,friendRequests:1}, scene: 'entry' };
        if (scene === 'lobby') model = { ...app.lobbyScreen({...parityRoom,game:undefined,phase:'waiting'}, user, '已连接'), scene: 'game' };
        if (['game','identity','vote','vote-submitted','mission','mission-submitted','report','result','art','treasures','battle'].includes(scene)) {
          const overlay=['identity','art','treasures'].includes(scene)?scene:scene.startsWith('vote')?'vote':scene==='report'?'report':scene==='battle'?'history':undefined;
          model=app.gameScreen(parityRoom,user,{privateRoleVisible:['identity','art','treasures'].includes(scene),ballotVisible:false,overlay,reportMission:1,overlayReturn:['art','treasures'].includes(scene)?'identity':undefined});
        }
        if(scene==='setup')model={...app.settingsScreen(app.defaultSettings),rows:[{id:'chooseDedicated',text:'普通房 · 随机房号'},{id:'creationPassword',text:'入房密码：不设置'},{id:'createRoom',text:'创建房间'},{id:'startPractice',text:'演练'}],web:{page:'setup',settings:app.defaultSettings,document:{kind:'settings',activeTab:'setup',settings:app.defaultSettings}}};
        if(['account','profile','history','favorites','presets','friends','friends-list','friends-add','replay','direct'].includes(scene)){
          const d=app.parityPlayerData(), api={statistics:async()=>d.stats,history:async()=>({games:[d.summary],nextCursor:null}),presets:async()=>({presets:d.presets}),friends:async()=>({friends:d.friends}),directChat:async()=>({messages:[{id:'m1',senderId:d.friends[0].id,receiverId:user.id,message:'来开一局？',isSelf:false,createdAt:'2026-10-22T00:00:00Z'}]}),replay:async()=>d.replay};
          const panel=new app.PlayerPanel(api,user);await panel.open(scene.startsWith('friends')||scene==='direct'?'friends':scene==='profile'?'account':scene==='favorites'||scene==='replay'?'history':scene,scene.startsWith('friends')?{roomId:parityRoom.id,roomMemberIds:parityRoom.members.map(m=>m.id)}:{});if(scene.startsWith('friends'))panel.setRoomCode(parityRoom.code);
          if(scene==='profile')await panel.handle('profileToggle',async()=>undefined);
          if(scene==='favorites')await panel.handle('page:favorites',async()=>undefined);
          if(scene==='direct')await panel.handle('friend:'+d.friends[0].id,async()=>undefined);
          if(scene==='friends-list')await panel.handle('friendTab:friends',async()=>undefined);
          if(scene==='friends-add')await panel.handle('friendTab:add',async()=>undefined);
          if(scene==='replay')await panel.openReplay(d.replay.id,'page:history');
          if(captureScene==='preset-editor')await panel.handle('preset:new',async()=>undefined);
          if(captureScene==='profile-vip')await panel.handle('details:profile-vip',async()=>undefined);
          if(captureScene==='history-expanded')await panel.handle('details:'+d.summary.id,async()=>undefined);
          if(captureScene==='replay-expanded'){await panel.handle('details:metadata',async()=>undefined);await panel.handle('details:identities',async()=>undefined);}
          model=panel.model();if(scene.startsWith('friends'))model.web.underlay=app.lobbyScreen({...parityRoom,game:undefined,phase:'waiting'},user,'已连接');
        }
        if(scene==='preferences')model={title:'心仪选角',rows:[],web:{page:'sheet',backId:'auxiliaryClose',background:'library',document:{kind:'preferences',modal:true,settings:parityRoom.settings,preferences:[]},underlay:app.lobbyScreen({...parityRoom,game:undefined,phase:'waiting'},user,'已连接')}};
        if(scene==='sound')model={title:'声音设置',rows:[],web:{page:'sheet',backId:'auxiliaryClose',background:'library',document:{kind:'sound',modal:true,soundPreferences:{music:false,effects:false}},underlay:app.entryScreen(user)}};
        if (scene === 'guide') model = app.guideScreen();
        if (scene === 'guide-role') model = app.guideScreen(undefined,'roles');
        if(scene.startsWith('admin')){const d=app.parityAdminData(),populated=captureScene.endsWith('-populated')||['admin-code-editor','admin-friends'].includes(captureScene);const panel=new app.AdminPanel({verify:async()=>{},overview:async()=>({totalUsers:128,todayNewUsers:8,activeRoomsCount:3,onlineConnections:24,totalGames:456,todayGames:12,freeAccessMode:true}),userFriends:async()=>({friends:app.parityPlayerData().friends.map(f=>({nickname:f.nickname,player_code:f.playerCode,status:f.status}))}),users:async()=>({users:populated?d.users:[],total:populated?d.users.length:0}),rooms:async()=>({rooms:populated?d.rooms:[]}),games:async()=>({games:populated?d.games:[]}),codes:async()=>({codes:populated?d.codes:[]}),settings:async()=>({freeAccessMode:true,adRewardHours:24,announcement:{enabled:false,text:''}}),special:async path=>path.includes('history')?{history:[],nextCursor:null}:path.includes('player-codes')?{codes:[]}:{rooms:[]}});await panel.open('mock-only');if(scene!=='admin')await panel.handle('page:'+scene.slice(6),async()=>undefined);if(captureScene==='admin-friends'){await panel.handle('user:'+d.users[0].id,async()=>undefined);await panel.handle('friends:'+d.users[0].id,async()=>undefined);}if(captureScene==='admin-code-editor')await panel.handle('userAction:playerCode:'+d.users[0].id,async()=>undefined);if(captureScene==='admin-special-editor')await panel.handle('special:new',async()=>undefined);model=panel.model();}
        if(scene==='chat'){const panel=new app.PlayerPanel({},user);await panel.open('roomchat',{roomId:parityRoom.id});panel.onRoomChat({messageId:'m1',fromUserId:parityRoom.members[1].id,nickname:'仙友1',seat:2,text:'这局我来当队长',timestamp:'2026-10-22T00:00:00Z'});model=panel.model();model.web.underlay=app.gameScreen(parityRoom,user,{privateRoleVisible:false,ballotVisible:false});}

        if(bottomCapture||scene==='mission'||scene==='result')model.scroll=app.layoutWebScreen(model,{width,height,top:0,bottom:0}).maxScroll;
        if(model.web)model.web.freeAccess=true;
        app.renderScreen(model, canvas, { width, height, top: 0, bottom: 0 }, { get: name => cache.get(name) });
        return app.layoutWebScreen(model,{width,height,top:0,bottom:0});
      }, { width, height, scene, assets, dpr,playerCount,captureScene,bottomCapture:process.env.PARITY_BOTTOM==='1' });
      await writeFile(join(out, `${captureScene}-${width}.json`), JSON.stringify(layout,null,2));
      await page.screenshot({ path: join(out, `${captureScene}-${width}.png`) });
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log('Headless Canvas previews: ' + out);
