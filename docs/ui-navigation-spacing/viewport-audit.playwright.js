// Run against the Vite preview with browser_run_code_unsafe(filename=...).
// All API and WebSocket traffic is mocked; no room is created on the ECS server.
async (page) => {
  const fixtures = await page.evaluate(async () => {
    const { createGame, projectGame, transition, MISSION_SIZES } = await import('/@id/@avalon/game-core');
    const { defaultSettings } = await import('/@id/@avalon/contracts');
    return [5, 8, 12].map(count => {
      const players = Array.from({ length: count }, (_, i) => ({ id: `review-${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}号` }));
      let game = createGame(`review-game-${count}`, players, { ...defaultSettings, playerCount: count, anonymousTeamVote: count < 8 }, a => a);
      game.phase = 'proposing';
      const captainId = game.captainOrder[game.captainIndex];
      const user = players.find(p => p.id === captainId);
      const team = players.slice(0, MISSION_SIZES[count][0]).map(p => p.id);
      const action = { playerIds: team, direction: 'clockwise' };
      game = transition(game, captainId, { type: 'updateTeamDraft', payload: action }, players.map(p => p.id));
      const room = { id: `review-room-${count}`, code: '394998', hostId: user.id, version: 1, phase: 'waiting', settings: game.settings, acceptingNewMembers: true, members: [{ ...user, ready: true, online: true }] };
      const proposing = { ...room, phase: 'playing', members: players.map(p => ({ ...p, ready: true, online: true })), game: projectGame(game, captainId) };
      game = transition(game, captainId, { type: 'proposeTeam', payload: action }, players.map(p => p.id));
      return { user, waiting: room, proposing, discussion: { ...proposing, game: projectGame(game, captainId) }, teamSize: team.length };
    });
  });
  let current = fixtures[0], stage = 'waiting';
  await page.unrouteAll({ behavior: 'wait' });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = path === '/api/me' ? { user: current.user, roomId: current[stage].id }
      : path.includes('/rooms/') ? { room: current[stage], invite: '' }
      : path.endsWith('/friends') ? { friends: [] }
      : { announcement: { enabled: false, text: '' }, freeAccessMode: true };
    return route.fulfill({ json });
  });
  await page.routeWebSocket('**/api/rooms/*/socket', ws => ws.onMessage(() => {}));
  const viewports = [{ width: 320, height: 568 }, { width: 375, height: 553 }, { width: 390, height: 844 }, { width: 430, height: 716 }, { width: 640, height: 900 }];
  const tables = [], guides = [];
  const check = (condition, message, data) => { if (!condition) throw new Error(`${message}: ${JSON.stringify(data)}`); };
  const settle = () => page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  for (current of fixtures) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const pair = [];
      for (stage of ['waiting', 'proposing', 'discussion']) {
        await page.reload();
        await page.locator(stage === 'waiting' ? '.waiting-settings-summary' : `[data-phase="${stage}"]`).waitFor();
        await settle();
        if (stage !== 'waiting') {
          const label = stage === 'proposing' ? `预选阵容 (${current.teamSize}/${current.teamSize})` : '已确认阵容 · 开启投票';
          await page.getByRole('button', { name: label, exact: true }).waitFor();
          check(await page.getByRole('button', { name: label, exact: true }).count() === 1, 'Wrong stage label', { stage, label });
        }
        const metrics = await page.evaluate(stage => {
          const box = s => document.querySelector(s).getBoundingClientRect();
          const header = box('.room-top-bar');
          const summary = box(stage === 'waiting' ? '.waiting-settings-summary' : '.game-current-summary');
          const ribbon = box('.scheme3-middle-zone');
          return { top: header.top, gaps: [summary.top - header.bottom, ribbon.top - summary.bottom], overflow: document.documentElement.scrollWidth > innerWidth, seats: document.querySelectorAll('.table-seat-card').length };
        }, stage);
        const expectedGap = viewport.width <= 600 ? 4 : 8;
        check(metrics.top <= 6 && metrics.top >= 0 && !metrics.overflow && metrics.gaps.every(gap => Math.abs(gap - expectedGap) < 1), 'Unexpected table spacing', { count: current.waiting.settings.playerCount, viewport, stage, ...metrics });
        pair.push({ stage, ...metrics });
        if (current.waiting.settings.playerCount === 12 && viewport.width === 430 && stage !== 'discussion') {
          await page.screenshot({ path: `docs/ui-navigation-spacing/${stage}-430.png` });
        }
      }
      tables.push({ count: current.waiting.settings.playerCount, viewport, stages: pair });
    }
  }
  stage = 'waiting';
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.locator('.room-top-right button').filter({ hasText: '规则' }).click();
    for (const category of ['游戏规则', '角色介绍']) {
      await page.getByRole('button', { name: category, exact: true }).click();
      await settle();
      const buttons = page.locator('.guide-index button');
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        await buttons.nth(i).click();
        const metrics = await page.evaluate(({ category, i }) => {
          const nav = document.querySelector('.guide-navigation').getBoundingClientRect();
          const targets = category === '游戏规则' ? [...document.querySelectorAll('.guide-section')]
            : [...document.querySelectorAll('.guide-index button')].map(b => [...document.querySelectorAll('.guide-role')].find(r => r.querySelector('h3')?.textContent.includes(b.textContent)));
          const target = targets[i]?.getBoundingClientRect();
          return { navTop: nav.top, navBottom: nav.bottom, targetTop: target?.top, visibleButtons: [...document.querySelectorAll('.guide-navigation button')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), overflow: document.documentElement.scrollWidth > innerWidth };
        }, { category, i });
        check(metrics.visibleButtons && !metrics.overflow && metrics.targetTop >= metrics.navBottom - 1 && metrics.targetTop < viewport.height, 'Chapter hidden by navigation', { viewport, category, i, ...metrics });
      }
      if (category === '游戏规则') {
        check(await page.locator('.guide-config').count() === 8 && await page.locator('.guide-rules details').count() === 0, 'Configuration is hidden');
        await page.getByRole('button', { name: '房主设置', exact: true }).click();
      }
      if (viewport.width === 430) await page.screenshot({ path: `docs/ui-navigation-spacing/${category === '游戏规则' ? 'rules' : 'roles'}-430.png` });
      await page.getByRole('button', { name: '返回目录 ↑', exact: true }).click();
      check(await page.evaluate(() => scrollY) === 0, 'Return to directory failed', { viewport, category });
      guides.push({ viewport, category, chapters: count, pass: true });
    }
    await page.getByRole('button', { name: '返回原页面', exact: true }).click();
    await page.locator('.waiting-settings-summary').waitFor();
  }
  return { tables, guides, pass: true };
}
