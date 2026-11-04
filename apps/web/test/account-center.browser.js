// Run via browser_run_code_unsafe against `npm run dev:web`.
// All API responses are fixtures in an isolated context; no real accounts or ECS writes.
async (page) => {
  const context = await page.context().browser().newContext();
  const check = (value, message) => { if (!value) throw Error(message); };
  const results = [];
  const contrastAudit = async (p, surface) => {
    const failures = await p.locator(surface).evaluate(root => {
      const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
      const luminance = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      const failures = [];
      for (const el of [root, ...root.querySelectorAll('*')]) {
        if (!el.checkVisibility() || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || el.disabled) continue;
        const style = getComputedStyle(el), color = rgb(style.color);
        let ancestor = el, background;
        while (ancestor) {
          const c = rgb(getComputedStyle(ancestor).backgroundColor);
          if ((c[3] ?? 1) === 1) { background = c; break; }
          ancestor = ancestor.parentElement;
        }
        if (!background) continue;
        const l1 = luminance(color), l2 = luminance(background), ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) failures.push({ text: el.textContent.slice(0, 35), color: style.color, background, ratio });
      }
      return failures;
    });
    check(failures.length === 0, `Low contrast: ${JSON.stringify(failures)}`);
  };
  const settings = { playerCount: 10, captainMode: 'seat_order', anonymousTeamVote: true,
    rejectionScope: 'game', earlyAssassinationEnabled: false, guardianPerksEnabled: false,
    voiceChatEnabled: false, autoRevealRoleEnabled: false, treasuresEnabled: false, rolePreferenceEnabled: false };
  const user = { id: 'p1', nickname: '老熊', playerCode: '123456', avatar: 'leaf' };
  const roles = { p1: 'assassin', p2: 'merlin', p3: 'percival', p4: 'loyal', p5: 'loyal',
    p6: 'loyal', p7: 'morgana', p8: 'mordred', p9: 'minion', p10: 'minion' };
  const names = ['老熊', '一只取经的小猴子', '山间听雨', '白龙', '小陈', '阿辉', '清风', '明月', '桃桃', '花果山大王'];
  const players = names.map((nickname, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname })).reverse();
  const games = Array.from({ length: 8 }, (_, i) => ({
    id: `history-${i}`, startedAt: '2026-11-04T13:00:00Z', endedAt: `2026-11-04T14:${String(50 - i).padStart(2, '0')}:00Z`,
    rulesetVersion: 'v2', playerCount: 10, self: { nickname: '老名字', seat: 1, role: 'assassin', team: 'red' },
    result: i === 2 ? { winner: null, reason: 'host_ended' }
      : i % 2 ? { winner: 'blue', reason: 'merlin_survived' } : { winner: 'red', reason: 'three_failures' },
    favorite: i === 0,
  }));
  const score = { completed: 8, wins: 5, losses: 3, aborted: 1, winRate: 0.625 };
  const stats = { ...score, byTeam: { blue: score, red: score }, byRole: Object.fromEntries(
    ['merlin', 'percival', 'guinevere', 'loyal', 'morgana', 'assassin', 'mordred', 'oberon', 'minion'].map(r => [r, score])) };
  try {
    for (const width of [393, 320, 430, 1280]) {
      const p = await context.newPage();
      await p.setViewportSize({ width, height: 800 });
      const calls = [], errors = [];
      let rosterFail = true, favorite = true, presets = [{ id: 'preset-1', name: '十人好友取经局', settings }];
      p.on('pageerror', error => errors.push(error.message));
      await p.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4);
        calls.push({ path, method: req.method() });
        if (path === '/me') return route.fulfill({ json: { user, roomId: null } });
        if (path === '/me/stats') return route.fulfill({ json: stats });
        if (path === '/me/games') return route.fulfill({ json: { games: url.searchParams.get('favorites') === 'true' ? (favorite ? [games[0]] : []) : games, nextCursor: null } });
        if (path.startsWith('/games/')) {
          if (rosterFail) { rosterFail = false; return route.fulfill({ status: 503, json: { error: 'NETWORK' } }); }
          const game = games.find(g => path.includes(g.id));
          return route.fulfill({ json: { ...game, favorite, settings, roles, players, rounds: [], inspections: [], earlyWindows: [] } });
        }
        if (path === '/me/presets') {
          if (req.method() === 'POST') presets = [{ ...req.postDataJSON(), id: 'preset-1' }];
          return route.fulfill({ json: req.method() === 'POST' ? { preset: presets[0] } : { presets } });
        }
        if (path.startsWith('/me/favorites/')) { favorite = req.method() === 'PUT'; return route.fulfill({ json: { favorite } }); }
        return route.fulfill({ json: { friends: [], rooms: [], messages: [], announcement: { enabled: false, text: '' }, freeAccessMode: true } });
      });
      await p.goto('http://127.0.0.1:5173/');
      await p.getByRole('button', { name: '个人中心', exact: true }).click();
      await p.locator('.stat-grid strong').first().waitFor();
      await contrastAudit(p, '.account-flow');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-account-stats-393.png', fullPage: true });
      await p.getByRole('button', { name: '历史对局', exact: true }).click();
      await p.locator('.history-card').first().waitFor();
      check(calls.every(c => !c.path.startsWith('/games/')), 'Fetched replay data before expanding a roster');
      const layout = await p.evaluate(() => {
        const cards = [...document.querySelectorAll('.history-card')];
        return { heights: cards.slice(0, 3).map(el => el.getBoundingClientRect().height),
          visible: cards.filter(el => el.getBoundingClientRect().bottom <= innerHeight).length,
          victory: getComputedStyle(document.querySelector('.result-victory .history-outcome')).color,
          defeat: getComputedStyle(document.querySelector('.result-defeat .history-outcome')).color,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-account-history-393.png', fullPage: true });
      check(!layout.overflow && Math.max(...layout.heights) <= 165, `History is too tall or overflows horizontally: ${JSON.stringify(layout)}`);
      check(width !== 393 || layout.visible >= 3, `Fewer than three complete records fit on the mobile first screen: ${JSON.stringify(layout)}`);
      check(layout.victory !== layout.defeat, 'Win and loss colors are identical');
      check(!(await p.locator('.history-list').innerText()).includes('对局编号'), 'Unhelpful metadata remains in the list');
      const first = p.locator('.history-card').first();
      await first.locator('summary').click();
      await first.getByRole('button', { name: '重新读取角色' }).click();
      await first.locator('.history-roster li').first().waitFor();
      check(await first.locator('.history-roster li').count() === 10, 'Roster does not include all ten players');
      check((await first.locator('.roster-player b').allTextContents()).join() === '1,2,3,4,5,6,7,8,9,10', 'Roster is not in seat order');
      check(await first.locator('.history-roster .role-portrait').count() === 10, 'Missing character portraits');
      check((await first.locator('.is-self').innerText()).includes('老熊'), 'Self seat is not identified');
      await contrastAudit(p, '.account-flow');
      const requests = calls.filter(c => c.path === '/games/history-0/replay').length;
      await first.locator('summary').click(); await first.locator('summary').click();
      check(calls.filter(c => c.path === '/games/history-0/replay').length === requests, 'Reopening refetched an already loaded roster');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-account-roster-393.png' });
      await first.getByRole('button', { name: /查看.*的对局复盘/ }).click();
      await p.getByRole('heading', { name: '对局复盘', exact: true }).waitFor();
      await p.getByRole('button', { name: '返回记录', exact: true }).click();
      await p.getByRole('button', { name: '我的收藏', exact: true }).click();
      await p.locator('.history-card').waitFor();
      check(await p.locator('.history-card').count() === 1, 'Favorites filtering failed');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-account-favorites-393.png' });
      await contrastAudit(p, '.account-flow');
      await p.locator('.history-replay-button').click();
      await p.getByRole('button', { name: '取消收藏', exact: true }).click();
      await p.getByRole('button', { name: '收藏这局', exact: true }).waitFor();
      await p.getByRole('button', { name: '返回记录', exact: true }).click();
      await p.locator('.empty-state').waitFor();
      check(await p.locator('.history-card').count() === 0, 'Removed favorite still appears in favorites');
      await p.getByRole('button', { name: '常用设置', exact: true }).click();
      await p.locator('.preset-list li').waitFor();
      await contrastAudit(p, '.account-flow');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-account-presets-393.png' });
      await p.getByRole('button', { name: '编辑 十人好友取经局' }).click();
      const editor = p.getByRole('dialog', { name: '编辑常用设置', exact: true });
      await contrastAudit(p, '.account-editor');
      if (width === 393) await p.screenshot({ path: '/private/tmp/avalon-account-editor-393.png' });
      await editor.getByRole('textbox', { name: '预设名称' }).fill('十人取经·已修改');
      await editor.getByRole('button', { name: '保存预设', exact: true }).click();
      await editor.waitFor({ state: 'hidden' });
      await p.getByRole('heading', { name: '十人取经·已修改', exact: true }).waitFor();
      check(!await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Preset editor causes horizontal overflow');
      check(errors.length === 0, `Browser errors: ${errors.join(';')}`);
      results.push({ width, ...layout, roster: 10, retryAndCache: true, replayAndFavorites: true, presetSave: true, contrastAA: true });
      await p.close();
    }
    return results;
  } finally { await context.close(); }
}
