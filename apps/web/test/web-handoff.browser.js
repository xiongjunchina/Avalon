// Run with browser_run_code_unsafe against APP_BASE_PATH=/avalon/ npm run dev:web -- --port 5175.
// Every API/socket is isolated in a fresh browser context; no ECS or real account is used.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 393, height: 800 } });
  const check = (value, message) => { if (!value) throw Error(message); };
  const origin = 'http://127.0.0.1:5175';
  const ticket = 't'.repeat(43);
  const oldUser = { id: 'old-web-user', nickname: '原网页玩家', playerCode: '123456' };
  const user = { id: 'mini-user', nickname: '小游戏玩家', playerCode: '234567' };
  const settings = { playerCount: 12, captainMode: 'seat_order', anonymousTeamVote: false, rejectionScope: 'game', earlyAssassinationEnabled: false, voiceChatEnabled: true };
  const room = { id: 'same-room', code: '654321', hostId: user.id, version: 1, phase: 'waiting', acceptingNewMembers: true, settings,
    inviteKey: 'room-invite', members: [{ ...user, seat: 1, online: true, ready: false }] };
  let exchanged = false, failExchange = false;
  const calls = [];
  try {
    const p = await context.newPage();
    await p.addInitScript(() => { window.__microphoneCalls = 0; navigator.mediaDevices.getUserMedia = async () => { window.__microphoneCalls++; throw Error('test microphone must not be opened automatically'); }; });
    await p.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname.replace('/avalon/api', '');
      calls.push({ path, method: req.method(), body: req.postDataJSON() });
      if (path === '/sessions/web-handoff/exchange') {
        check(req.method() === 'POST' && req.postDataJSON().ticket === ticket, 'wrong exchange request');
        if (failExchange) return route.fulfill({ status: 401, json: { error: 'HANDOFF_EXPIRED' } });
        exchanged = true;
        return route.fulfill({ json: { user, roomId: room.id } });
      }
      if (path === '/me') return route.fulfill({ json: { user: exchanged ? user : oldUser, roomId: exchanged ? room.id : null } });
      if (path === '/rooms/same-room') return route.fulfill({ json: { room, invite: room.inviteKey } });
      return route.fulfill({ json: { friends: [], rooms: [], messages: [], presets: [], freeAccessMode: false, announcement: { enabled: false, text: '' } } });
    });
    await p.routeWebSocket('**/api/rooms/*/socket', ws => {
      ws.send(JSON.stringify({ type: 'snapshot', room }));
      ws.onMessage(raw => { if (JSON.parse(String(raw)).type === 'sync') ws.send(JSON.stringify({ type: 'snapshot', room })); });
    });
    const results = [];
    for (const width of [320, 393, 430, 1280]) {
      await p.setViewportSize({ width, height: 800 });
      const before = calls.length;
      await p.goto(`${origin}/avalon/#avalon-handoff=${ticket}`);
      await p.getByRole('button', { name: '确认使用我的小游戏账号', exact: true }).waitFor();
      check(p.url() === `${origin}/avalon/`, 'ticket remained in browser URL');
      check(calls.length === before, 'game API ran before confirmation');
      check(!(await p.locator('body').textContent()).includes(ticket), 'ticket is rendered');
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-web-handoff-393.png', fullPage: true });
      results.push({ width, consentBeforeApi: true, fits: true });
    }
    await p.getByRole('button', { name: '取消，继续使用当前网页身份', exact: true }).click();
    await p.getByRole('button', { name: '个人中心', exact: true }).waitFor();
    check((await p.locator('body').textContent()).includes(oldUser.nickname), 'cancel changed original account');
    check(!calls.some(call => call.path === '/sessions/web-handoff/exchange'), 'cancel exchanged a credential');

    failExchange = true;
    await p.goto(`${origin}/avalon/#avalon-handoff=${ticket}`);
    const failedStart = calls.length;
    await p.getByRole('button', { name: '确认使用我的小游戏账号', exact: true }).click();
    await p.getByRole('alert').filter({ hasText: '接续链接已过期' }).waitFor();
    check(calls.slice(failedStart).every(call => call.path === '/sessions/web-handoff/exchange'), 'failed exchange mounted the game');

    failExchange = false;
    await p.goto(`${origin}/avalon/#avalon-handoff=${ticket}`);
    const successStart = calls.length;
    await p.getByRole('button', { name: '确认使用我的小游戏账号', exact: true }).evaluate(button => {
      button.click(); button.click();
    });
    await p.getByRole('button', { name: /房号 654321/ }).waitFor();
    check((await p.locator('body').textContent()).includes(user.nickname), 'original mini account not restored');
    check(calls.slice(successStart).filter(call => call.path === '/sessions/web-handoff/exchange').length === 1, 'multiple exchanges');
    check(!calls.some(call => call.path === '/sessions/guest' || call.path.includes('voice-token')), 'handoff created a guest or started voice');
    check(await p.evaluate(() => window.__microphoneCalls) === 0, 'handoff requested microphone permission');
    check(!await p.evaluate(token => Object.values(localStorage).concat(Object.values(sessionStorage)).some(value => value.includes(token)), ticket), 'handoff ticket persisted');
    results.push({ cancelPreservesIdentity: true, failureDoesNotConnect: true, sameAccountAndRoom: true, doubleClickExchangesOnce: true, noAutomaticVoice: true });
    return results;
  } finally { await context.close(); }
}
