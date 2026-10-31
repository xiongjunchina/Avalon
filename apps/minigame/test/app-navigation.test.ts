import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { parityFixture } from '../scripts/parity-fixture.js';
import { buildMiniGame } from '../scripts/build.mjs';

test('built client logs in, opens a clean join form and creates the selected web room configuration', async t => {
  const outDir = await mkdtemp(join(tmpdir(), 'avalon-parity-app-'));
  t.after(() => rm(outDir, { recursive: true, force: true }));
  await buildMiniGame({ outDir });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  let start: any, end: any, confirmKeyboard: any, room: any, socketMessage: any;
  const commands: any[] = [];
  const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '行者', playerCode: '123456' };
  const storage = new Map(), requests: { path: string; data: any }[] = [];
  let frame: { text: string; x: number; y: number }[] = [];
  const ctx = new Proxy({}, { get: (_target, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} })
    : key === 'measureText' ? (text: string) => ({ width: Array.from(text).reduce((sum, char) => sum + (/[^\u0020-\u007e]/.test(char) ? 1 : .6) * (Number(/([\d.]+)px/.exec(String((_target as any).font))?.[1]) || 12), 0) })
    : key === 'fillRect' ? (x: number, y: number, w: number, h: number) => { if (x === 0 && y === 0 && w === 390 && h === 844) frame = []; }
    : key === 'fillText' ? (text: string, x: number, y: number) => frame.push({ text, x, y })
    : () => {} });
  const wx = {
    createCanvas: () => ({ getContext: () => ctx }),
    getSystemInfoSync: () => ({ screenWidth: 390, screenHeight: 844, pixelRatio: 2, safeArea: { top: 44, bottom: 810 } }),
    getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key),
    login: (options: any) => options.success({ code: 'verified-on-server' }),
    request: (options: any) => {
      const path = options.url.split('/api')[1]; requests.push({ path, data: options.data });
      let data: any = {};
      if (path === '/system/announcement') data = { announcement: { enabled: false, text: '' }, freeAccessMode: true };
      else if (path === '/sessions/minigame') data = { user, token: 'test-token' };
      else if (path === '/me') data = { user, roomId: null };
      else if (path === '/rooms') { room = { id: '22222222-2222-4222-8222-222222222222', code: '123456', hostId: user.id, version: 1, phase: 'waiting', settings: options.data.settings, members: [{ ...user, seat: 1, ready: false, online: true }], acceptingNewMembers: true }; data = { room }; }
      else if (path.startsWith('/rooms/')) data = { room };
      else if (path === '/minigame/socket-ticket') data = { ticket: 'test-ticket' };
      options.success({ statusCode: 200, data });
    },
    connectSocket: () => ({ send(options: { data: string }) {
      const command = JSON.parse(options.data); commands.push(command);
      queueMicrotask(() => {
        if(command.type === 'updateTeamDraft') room.game.draftTeam = command.payload;
        if(command.type === 'proposeTeam') { room.game.phase = 'discussion'; room.game.rounds = [{number:1,mission:1,captainId:user.id,team:command.payload.playerIds,direction:command.payload.direction}]; }
        room.version++;
        socketMessage({data:JSON.stringify({type:'commandResult',commandId:command.commandId,ok:true})});
        socketMessage({data:JSON.stringify({type:'snapshot',room})});
      });
    }, close() {}, onOpen(callback: () => void) { callback(); }, onMessage(callback: any) { socketMessage = callback; }, onClose() {}, onError() {} }),
    showKeyboard() {}, hideKeyboard() {}, onKeyboardConfirm(callback: any) { confirmKeyboard = callback; }, offKeyboardConfirm() {},
    onShow() {}, onHide() {}, onShareAppMessage() {},
    onTouchStart(callback: any) { start = callback; }, onTouchEnd(callback: any) { end = callback; },
  };
  runInNewContext(await readFile(join(outDir, 'bundle.js'), 'utf8'), {
    wx, console, crypto: globalThis.crypto, clearTimeout,
    setTimeout: (callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); timers.add(timer); return timer; },
  });
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));
  async function tap(label: string) {
    // Canvas text may be painted in runs to apply letter spacing and fallback-glyph widths.
    const candidates = frame.flatMap((item, index) => {
      let text = '', right = item.x;
      for (const part of frame.slice(index)) {
        if (part.y !== item.y || part.x < right) break;
        text += part.text; right = part.x;
        if (text === label) return [{ text, x: (item.x + right) / 2, y: item.y }];
        if (!label.startsWith(text)) break;
      }
      return [];
    });
    const target = candidates.reverse().find(item => item.y >= 44 && item.y <= 800);
    assert.ok(target, 'visible control missing: ' + label);
    start({ touches: [{ clientX: target.x, clientY: target.y }] });
    end({ changedTouches: [{ clientX: target.x, clientY: target.y }] });
    await settle();
  }
  await settle(); await tap('登录 / 注册');await tap('例如：小陈、阿辉');confirmKeyboard({value:'行者'});await settle();await tap('取好昵称，继续游戏');
  assert.ok(frame.some(item => item.text === '开常规房'));
  await tap('加入房间');
  assert.ok(frame.some(item => item.text === '输入房间号或邀请链接'));
  await tap('入座取经');
  assert.ok(frame.some(item => item.text.includes('请输入房间号或邀请链接')));
  await tap('输入房间号或邀请链接');
  confirmKeyboard({ value: '654321' }); await settle();
  await tap('返回法坛'); await tap('加入房间');
  assert.ok(frame.some(item => item.text === '输入房间号或邀请链接'));
  await tap('返回法坛'); await tap('开常规房'); await tap('9');
  for (let index = 0; index < 8 && !frame.some(item => item.text === '开启线下常规房' && item.y < 790); index++) {
    start({ touches: [{ clientX: 350, clientY: 760 }] }); end({ changedTouches: [{ clientX: 350, clientY: 240 }] }); await settle();
  }
  await tap('开启线下常规房');
  assert.equal(requests.find(item => item.path === '/rooms')?.data.settings.playerCount, 9);
  assert.ok(frame.some(item => item.text.includes('房号 123456')));
  room = parityFixture().room; room.version = 2;
  socketMessage({data:JSON.stringify({type:'snapshot',room})}); await settle();
  await tap('1号'); await tap('2号');
  assert.equal(commands.filter(command => command.type === 'updateTeamDraft').length, 2);
  await tap('确认阵容 (2/2)');
  assert.deepEqual(commands.find(command => command.type === 'proposeTeam')?.payload.playerIds, room.game.players.slice(0,2).map((player: any) => player.id));
  assert.equal(room.game.phase, 'discussion');
  socketMessage({data:JSON.stringify({type:'roomChat',messageId:'public-chat',fromUserId:user.id,nickname:user.nickname,seat:1,text:'我来带队',timestamp:new Date().toISOString()})});await settle();
  assert.ok(frame.some(item=>item.text==='我来带队'),'public chat must appear over the player seat');
  await tap('结束');assert.ok(frame.some(item=>item.text==='继续游戏'));
  assert.equal(commands.filter(command=>command.type==='endGame').length,0);
  await tap('返回对局');assert.equal(commands.filter(command=>command.type==='endGame').length,0);
  room.game.abortPoll={requestedBy:room.members[1].id,approvals:0,required:1,voted:false};room.version++;
  socketMessage({data:JSON.stringify({type:'snapshot',room})});await settle();
  await tap('结束');await tap('继续游戏');
  assert.equal(commands.at(-1)?.type,'voteAbort');assert.equal(commands.at(-1)?.payload.approve,false);
});
