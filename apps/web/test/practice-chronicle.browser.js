// Run against `npm run dev:web`. APIs and room sockets are isolated fixtures.
async (page) => {
  const context = await page.context().browser().newContext();
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const results = [];
  try {
    for (const width of [393, 320, 430, 1280]) {
      const p = await context.newPage();
      await p.setViewportSize({ width, height: 800 });
      let room = null, socket;
      const user = { id: 'p1', nickname: '试玩检查', playerCode: '123456' }, writes = [], commands = [], errors = [];
      p.on('pageerror', error => errors.push(error.message));
      await p.route('**/api/**', route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        if (req.method() !== 'GET') writes.push(path);
        return route.fulfill({ json: path === '/api/me' ? { user, roomId: room?.id ?? null }
          : path.includes('/rooms/') ? { room, invite: '' }
          : { rooms: [], friends: [], presets: [], messages: [], freeAccessMode: true, announcement: { enabled: false, text: '' } } });
      });
      await p.routeWebSocket('**/api/rooms/*/socket', ws => {
        socket = ws;
        const snapshot = () => ws.send(JSON.stringify({ type: 'snapshot', room }));
        ws.onMessage(raw => { const c = JSON.parse(String(raw)); if (c.type === 'sync') snapshot(); else commands.push(c); });
        snapshot();
      });
      await p.goto('http://127.0.0.1:5173/');
      await p.getByRole('button', { name: '开常规房', exact: true }).waitFor();
      check(await p.locator('.practice-entry').count() === 0, 'Home still contains the practice entry');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-chronicle-home-393.png' });
      await p.getByRole('button', { name: '开常规房', exact: true }).click();
      await p.getByRole('radio', { name: '10', exact: true }).click();
      const practice = p.getByRole('button', { name: '单人试玩 · 熟悉玩法', exact: false });
      check(await practice.isVisible(), 'Practice is missing from room creation');
      const order = await practice.evaluate(el => !!(document.querySelector('.mp-setup-footer .mp-cyan-pill').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
      check(order, 'Practice does not follow the primary create-room action');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-chronicle-setup-393.png' });
      await p.locator('.room-creation-options summary').click();
      await p.getByRole('radio', { name: '设置新密码', exact: true }).check();
      await p.getByLabel('新密码（4–8位字符）', { exact: true }).fill('x');
      check(await p.getByRole('button', { name: '开启线下常规房', exact: true }).isDisabled(), 'Fixture did not block room creation with invalid password');
      check(await practice.isEnabled(), 'Practice unnecessarily requires valid room access settings');
      await practice.click();
      await p.getByRole('button', { name: '退出试玩', exact: true }).waitFor();
      check(await p.locator('.table-seats-grid [data-player-id]').count() === 10 || (await p.locator('body').innerText()).includes('仙友10号'), 'Practice did not use the selected player count');
      check(writes.length === 0, 'Practice created a room or wrote to a server');
      await p.getByRole('button', { name: '取经录', exact: true }).click();
      let log = p.getByRole('dialog', { name: '战况与提案记录', exact: true });
      await log.waitFor();
      check((await log.innerText()).includes('尚无'), 'Empty practice log has no empty state');
      await p.keyboard.press('Escape');
      await log.waitFor({ state: 'hidden' });
      check(await p.getByRole('button', { name: '取经录', exact: true }).evaluate(el => el === document.activeElement), 'Closing the log did not restore keyboard focus');
      await p.getByRole('button', { name: '退出试玩', exact: true }).click();

      room = await p.evaluate(async () => {
        const { createGame, projectGame } = await import('/@id/@avalon/game-core');
        const { defaultSettings } = await import('/@id/@avalon/contracts');
        const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: i === 1 ? '这是一个较长的玩家昵称' : `仙友${i + 1}` }));
        const settings = { ...defaultSettings, playerCount: 12, anonymousTeamVote: false };
        const state = createGame('chronicle-test', players, settings, a => a, { randomBelow: () => 0n });
        state.phase = 'proposing'; state.confirmed = players.map(p => p.id); state.mission = 3;
        state.rounds = Array.from({ length: 7 }, (_, i) => ({ number: i + 1, mission: i === 0 ? 1 : 2,
          captainId: `p${i + 1}`, team: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], direction: 'clockwise',
          vote: { approvals: 7, rejections: 4, abstentions: 1, passed: true,
            ballots: Object.fromEntries(players.map((p, j) => [p.id, j === 11 ? 'abstain' : j < 7])) },
          ...(i === 0 ? { result: { successes: 5, failures: 1, passed: false } } : {}),
        }));
        state.earlyAssassination = { windows: [{ afterMission: 1, afterProposal: 1, decision: 'skip' }] };
        return { id: 'chronicle-room', code: '654321', version: 1, hostId: 'p1', phase: 'playing', settings,
          acceptingNewMembers: false, members: players.map(p => ({ ...p, ready: true, online: true })), game: projectGame(state, 'p1') };
      });
      await p.reload();
      await p.getByRole('button', { name: '取经录', exact: true }).click();
      log = p.getByRole('dialog', { name: '战况与提案记录', exact: true });
      await log.locator('.chronicle-round').first().waitFor();
      check(await log.locator('.chronicle-round').count() === 7, 'Live log is missing proposals');
      check(await log.locator('.role-portrait').count() === 0, 'Live log reveals private character artwork');
      const layout = await log.evaluate(el => {
        const sheet = el.querySelector('.chronicle-sheet').getBoundingClientRect();
        return { fits: sheet.left >= 0 && sheet.right <= innerWidth && sheet.top >= 0 && sheet.bottom <= innerHeight,
          cardHeight: el.querySelector('.chronicle-round').getBoundingClientRect().height,
          scrollable: el.querySelector('.chronicle-scroll-body').scrollHeight > el.querySelector('.chronicle-scroll-body').clientHeight };
      });
      check(layout.fits && layout.scrollable && layout.cardHeight < 400, `Live log is clipped or too tall: ${JSON.stringify(layout)}`);
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-chronicle-log-393.png' });
      await log.locator('.chronicle-ballots summary').first().click();
      check(await log.locator('.battle-voters').first().locator(':scope > div').count() === 12, 'Public vote details omit players');
      await log.getByRole('button', { name: '最近一轮', exact: true }).click();
      check(await log.locator('.chronicle-round').count() === 7, 'Jumping to the latest proposal removes earlier records');
      const lastTop = await log.locator('.battle-round-anchor').last().evaluate(el => el.getBoundingClientRect().top);
      check(lastTop > 80 && lastTop < 500, 'Latest proposal is not reached');
      await log.getByText('轮间确认记录（1 次）', { exact: true }).click();
      check((await log.innerText()).includes('本次跳过'), 'Extension records are inaccessible');
      await log.getByRole('button', { name: '返回法坛', exact: true }).click();
      await p.getByRole('button', { name: /查看任务 2（/ }).click();
      const mission = p.getByRole('dialog', { name: '任务 2 组队与投票详情', exact: true });
      check(await mission.locator('.chronicle-round').count() === 6, 'Mission detail drops its proposals');
      await mission.locator('.mission-modal-tabs button').nth(3).click();
      const fourthMission = p.getByRole('dialog', { name: '任务 4 组队与投票详情', exact: true });
      check((await fourthMission.locator('.chronicle-mission-heading').innerText()).includes('2 张失败牌才失败'), 'Mission switch loses the two-failure requirement');
      check((await fourthMission.innerText()).includes('尚未产生组队提案记录'), 'Empty mission has no explanation');
      await p.keyboard.press('Escape');
      room = { ...room, version: 2, settings: { ...room.settings, anonymousTeamVote: true } };
      socket.send(JSON.stringify({ type: 'snapshot', room }));
      await p.getByRole('button', { name: '取经录', exact: true }).click();
      check(await log.locator('.battle-voters').count() === 0, 'Anonymous room exposes individual votes');
      check((await log.innerText()).includes('匿名组队投票'), 'Anonymous log is missing its explanation');
      check(commands.length === 0, 'Reviewing records sends gameplay commands');
      check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
      results.push({ width, practiceLocalOnly: true, selectedPlayers: 10, keyboardDismiss: true, ...layout, publicPlayers: 12, anonymousVotesProtected: true });
      await p.close();
    }
    return results;
  } finally { await context.close(); }
}
