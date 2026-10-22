import { build } from 'esbuild';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { chromium } = await import(process.env.MINIGAME_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href : 'playwright');
const result = await build({ stdin: { contents: `
export { renderScreen } from './apps/minigame/src/ui/widgets.ts';
export { entryScreen } from './apps/minigame/src/screens/entry.ts';
export { lobbyScreen } from './apps/minigame/src/screens/lobby.ts';
export { guideScreen } from './apps/minigame/src/screens/guide.ts';
export { gameScreen } from './apps/minigame/src/screens/game.ts';
export { adminOverviewScreen } from './apps/minigame/src/screens/admin/views.ts';
export { PracticeSession } from './apps/minigame/src/screens/practice.ts';
export { settingsScreen } from './apps/minigame/src/screens/settings.ts';
export { defaultSettings } from './packages/contracts/src/index.ts';
`, resolveDir: root }, bundle: true, format: 'iife', globalName: 'AvalonPreview', write: false });
const assets = {};
for (const scene of ['gate', 'pavilion', 'sword', 'library', 'mirror', 'dawn']) assets['scenes/' + scene + '.webp'] = 'data:image/webp;base64,' + (await readFile(join(root, 'apps/web/public/art/scenes', scene + '.webp'))).toString('base64');
for (const name of await readdir(join(root, 'apps/web/public/art/roles'))) if (name.endsWith('-160.webp')) assets['roles/' + name] = 'data:image/webp;base64,' + (await readFile(join(root, 'apps/web/public/art/roles', name))).toString('base64');
for (const name of await readdir(join(root, 'apps/minigame/assets/emblems'))) if (name.endsWith('.png')) assets['emblems/' + name] = 'data:image/png;base64,' + (await readFile(join(root, 'apps/minigame/assets/emblems', name))).toString('base64');
const out = join(root, 'dist/minigame-preview');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.MINIGAME_CHROMIUM_PATH ? { executablePath: process.env.MINIGAME_CHROMIUM_PATH } : {}) });
try {
  for (const width of [320, 390, 430]) {
    const height = width === 320 ? 568 : width === 390 ? 844 : 932;
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent('<style>body{margin:0;background:#0a1024}</style><canvas id="preview"></canvas>');
    await page.addScriptTag({ content: result.outputFiles[0].text });
    for (const scene of ['entry', 'guest', 'setup', 'lobby', 'game', 'game12', 'identity', 'vote', 'mission', 'guide', 'admin']) {
      await page.evaluate(async ({ width, height, scene, assets }) => {
        const app = globalThis.AvalonPreview;
        const canvas = document.getElementById('preview'); canvas.width = width; canvas.height = height;
        const cache = new Map(); await Promise.all(Object.entries(assets).map(async ([name, url]) => { const img = new Image(); img.src = url; await img.decode(); cache.set(name, img); }));
        const user = { id: 'u', nickname: '行者', playerCode: '123456' };
        const room = { id: 'r', code: '123456', hostId: 'u', settings: app.defaultSettings, acceptingNewMembers: true,
          members: Array.from({ length: 6 }, (_, index) => ({ id: index ? 'u' + index : 'u', seat: index + 1, nickname: index ? '仙友' + index : '行者', ready: index > 0, online: true })) };
        let model;
        if (scene === 'guest') model = app.entryScreen();
        if (scene === 'setup') model = { ...app.settingsScreen(app.defaultSettings), web: { page: 'setup', settings: app.defaultSettings } };
        if (scene === 'entry') model = { ...app.entryScreen(user), scene: 'entry' };
        if (scene === 'lobby') model = { ...app.lobbyScreen(room, user, '已连接'), scene: 'game' };
        if (['game', 'game12', 'identity', 'vote', 'mission'].includes(scene)) {
          const practice = new app.PracticeSession({ ...app.defaultSettings, playerCount: scene === 'game12' ? 12 : 6 }, '行者');
          const local = practice.view(); local.code = '123456';
          if (scene === 'vote') { local.game.phase = 'team_vote'; local.game.rounds = [{ number: 1, mission: 1, captainId: local.game.captainId, team: local.game.players.slice(0, 3).map(p => p.id), direction: 'clockwise' }]; }
          if (scene === 'mission') { local.game.phase = 'mission'; local.game.rounds = [{ number: 1, mission: 1, captainId: local.game.captainId, team: local.game.players.slice(0, 3).map(p => p.id), direction: 'clockwise' }]; }
          model = app.gameScreen(local, practice.user, { privateRoleVisible: scene === 'identity', ballotVisible: false, overlay: ['game', 'game12'].includes(scene) ? undefined : scene });
        }
        if (scene === 'guide') model = app.guideScreen('merlin');
        if (scene === 'admin') model = { ...app.adminOverviewScreen({ totalUsers: 128, todayNewUsers: 8, activeRoomsCount: 3, onlineConnections: 24, totalGames: 456, todayGames: 12, freeAccessMode: true }), scene: 'admin', web: { page: 'sheet', background: 'library' } };
        app.renderScreen(model, canvas, { width, height, top: 32, bottom: 20 }, { get: name => cache.get(name) });
      }, { width, height, scene, assets });
      await page.screenshot({ path: join(out, `${scene}-${width}.png`) });
    }
    await page.close();
  }
} finally { await browser.close(); }
console.log('Headless Canvas previews: ' + out);
