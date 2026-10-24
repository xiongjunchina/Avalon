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
  let current = fixtures[0], stage = 'waiting', simulatedSafeAreaTop = 0, waitingReady = true;
  await page.unrouteAll({ behavior: 'wait' });
  // Simulate a browser reporting a top inset, including Vite's injected CSS.
  await page.route('**/src/*.css', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/env\(safe-area-inset-top(?:,[^)]*)?\)/g, `${simulatedSafeAreaTop}px`);
    await route.fulfill({ response, body });
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const room = stage === 'waiting' ? { ...current.waiting, members: current.waiting.members.map(m => ({ ...m, ready: waitingReady })) } : current[stage];
    const json = path === '/api/me' ? { user: current.user, roomId: current[stage].id }
      : path.includes('/rooms/') ? { room, invite: '' }
      : path.endsWith('/friends') ? { friends: [] }
      : { announcement: { enabled: false, text: '' }, freeAccessMode: true };
    return route.fulfill({ json });
  });
  await page.routeWebSocket('**/api/rooms/*/socket', ws => ws.onMessage(() => {}));
  const viewports = [{ width: 320, height: 568 }, { width: 375, height: 553 }, { width: 390, height: 844 }, { width: 430, height: 716 }, { width: 640, height: 900 }];
  const tables = [], guides = [], topInsets = [];
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
  // Cover the nonzero inset missed by the original desktop-browser audit.
  current = fixtures.at(-1);
  simulatedSafeAreaTop = 44;
  await page.setViewportSize({ width: 430, height: 716 });
  const recordInset = async name => {
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('main').scrollTop = 0; });
    await settle();
    const metrics = await page.evaluate(() => ({ top: document.querySelector('.room-top-bar').getBoundingClientRect().top, paddingTop: getComputedStyle(document.querySelector('main')).paddingTop, overflow: document.documentElement.scrollWidth > innerWidth }));
    check(metrics.top === 4 && !metrics.overflow, 'Duplicate top inset', { name, simulatedSafeAreaTop, ...metrics });
    topInsets.push({ name, simulatedSafeAreaTop, ...metrics });
  };
  for (stage of ['waiting', 'proposing', 'discussion']) {
    await page.reload();
    await page.locator(stage === 'waiting' ? '.waiting-settings-summary' : `[data-phase="${stage}"]`).waitFor();
    await settle();
    await recordInset(stage);
  }
  stage = 'waiting';
  waitingReady = false;
  await page.reload();
  await page.getByRole('dialog', { name: '准备提醒', exact: true }).waitFor();
  await page.getByRole('button', { name: '稍后准备', exact: true }).click();
  await recordInset('waiting-unready');
  await page.screenshot({ path: 'docs/ui-navigation-spacing/waiting-inset-430.png' });
  await page.getByRole('button', { name: /幻化分身试玩/ }).click();
  await page.locator('.is-practice-top-bar').waitFor();
  await page.getByRole('button', { name: '⚡ 电脑代操下一步', exact: true }).click();
  for (let i = 0; i < current.teamSize; i++) await page.locator('.table-seat-card').nth(i).click();
  await page.getByRole('button', { name: `预选阵容 (${current.teamSize}/${current.teamSize})`, exact: true }).waitFor();
  await recordInset('practice-proposing');
  await page.getByRole('button', { name: `预选阵容 (${current.teamSize}/${current.teamSize})`, exact: true }).click();
  await page.locator('[data-phase="discussion"]').waitFor();
  await page.getByRole('button', { name: '已确认阵容 · 开启投票', exact: true }).waitFor();
  await recordInset('practice-discussion');
  await page.screenshot({ path: 'docs/ui-navigation-spacing/practice-inset-430.png' });
  await page.getByRole('button', { name: '退出试玩', exact: true }).click();
  waitingReady = true;
  stage = 'waiting';
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.locator('.room-top-right button').filter({ hasText: '规则' }).click();
    for (const category of ['游戏规则', '角色介绍']) {
      await page.getByRole('button', { name: category, exact: true }).click();
      await settle();
      const select = page.getByRole('combobox', { name: category === '游戏规则' ? '跳转规则章节' : '跳转角色介绍', exact: true });
      const options = await select.locator('option').evaluateAll(es => es.filter(e => e.value).map(e => ({ id: e.value, title: e.textContent })));
      const count = options.length;
      for (let i = 0; i < count; i++) {
        await select.selectOption(options[i].id);
        const metrics = await page.evaluate(id => {
          const nav = document.querySelector('.guide-navigation').getBoundingClientRect();
          const target = document.getElementById(id)?.getBoundingClientRect();
          return { navTop: nav.top, navBottom: nav.bottom, navHeight: nav.height, targetTop: target?.top, visibleControls: [...document.querySelectorAll('.guide-navigation button,.guide-navigation select')].every(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), overflow: document.documentElement.scrollWidth > innerWidth };
        }, options[i].id);
        check(metrics.navHeight <= 54 && metrics.visibleControls && !metrics.overflow && metrics.targetTop >= metrics.navBottom - 1 && metrics.targetTop < viewport.height, 'Chapter hidden or toolbar too tall', { viewport, category, i, ...metrics });
      }
      if (category === '游戏规则') {
        check(await page.locator('.guide-config').count() === 8 && await page.locator('.guide-rules details').count() === 0, 'Configuration is hidden');
        await select.selectOption('guide-rule-4');
      }
      if (viewport.width === 430) await page.screenshot({ path: `docs/ui-navigation-spacing/${category === '游戏规则' ? 'rules' : 'roles'}-430.png` });
      await page.getByRole('button', { name: '返回目录', exact: true }).click();
      const directory = await page.locator('#guide-directory').boundingBox(), toolbar = await page.locator('.guide-navigation').boundingBox();
      check(directory.y >= toolbar.y + toolbar.height && directory.y < viewport.height, 'Return to directory failed', { viewport, category, directory, toolbar });
      check(await page.locator('.guide-index button').count() === count, 'Missing full index entries', { viewport, category });
      await page.locator('.guide-index button').first().click();
      check(await select.inputValue() === options[0].id, 'Index does not synchronize jump selector', { viewport, category });
      guides.push({ viewport, category, chapters: count, toolbarHeight: toolbar.height, pass: true });
    }
    await page.getByRole('button', { name: '返回原页面', exact: true }).click();
    await page.locator('.waiting-settings-summary').waitFor();
  }
  return { tables, topInsets, guides, pass: true };
}
