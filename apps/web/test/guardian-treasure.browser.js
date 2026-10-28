// Run via browser_run_code_unsafe(filename=...) against `npm run dev:web`.
// Isolated browser context with mocked APIs and sockets; never writes to ECS.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 393, height: 750 } });
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  try {
    const p = await context.newPage();
    let fixture;
    const commands = [];
    await p.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/me') return route.fulfill({ status: fixture ? 200 : 401, json: fixture ? { user: fixture.user, roomId: fixture.room.id } : { error: 'UNAUTHENTICATED' } });
      return route.fulfill({ json: path.includes('/rooms/') ? { room: fixture.room, invite: '' }
        : { friends: [], presets: [], messages: [], rooms: [], freeAccessMode: true, announcement: { enabled: false, text: '' } } });
    });
    await p.routeWebSocket('**/api/rooms/*/socket', ws => {
      const snapshot = () => ws.send(JSON.stringify({ type: 'snapshot', room: fixture.room }));
      ws.onMessage(raw => { const message = JSON.parse(String(raw)); if (message.type === 'sync') snapshot(); else commands.push(message); });
      snapshot();
    });
    await p.goto('http://127.0.0.1:5173/');
    const fixtures = await p.evaluate(async () => {
      const { createGame, projectGame } = await import('/@id/@avalon/game-core');
      const { defaultSettings } = await import('/@id/@avalon/contracts');
      return [
        { name: 'v6-blue-guardian', guardian: true, version: 'standard-no-lancelot-v6', role: 'percival', disabled: true },
        { name: 'v6-red-guardian', guardian: true, version: 'standard-no-lancelot-v6', role: 'mordred', disabled: false },
        { name: 'v6-blue-no-guardian', guardian: false, version: 'standard-no-lancelot-v6', role: 'guinevere', disabled: false },
        { name: 'v5-blue-guardian', guardian: true, version: 'standard-no-lancelot-v5', role: 'percival', disabled: false },
      ].map(scenario => {
        const players = Array.from({ length: 12 }, (_, i) => ({ id: `review-${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
        const settings = { ...defaultSettings, playerCount: 12, treasuresEnabled: true, guardianPerksEnabled: scenario.guardian };
        const state = createGame(scenario.name, players, settings, a => a, { randomBelow: () => 0n });
        state.rulesetVersion = scenario.version; state.phase = 'proposing'; state.confirmed = players.map(p => p.id);
        const user = players.find(p => state.roles[p.id] === scenario.role);
        return { ...scenario, user, room: { id: `room-${scenario.name}`, code: '123456', version: 1, phase: 'playing',
          hostId: players[0].id, settings, acceptingNewMembers: false,
          members: players.map(p => ({ ...p, ready: true, online: true })), game: projectGame(state, user.id) } };
      });
    });
    const results = [];
    for (fixture of fixtures) {
      await p.reload();
      const entry = p.getByRole('button', { name: '法宝', exact: true });
      await p.locator('[data-phase="proposing"]').waitFor();
      await p.getByRole('button', { name: '私下查看我的身份', exact: true }).waitFor({ state: 'visible' });
      check((await entry.textContent()).trim() === '法宝', 'Public treasure button exposes role details');
      check(await entry.getAttribute('title') === null, 'Public treasure button reveals a private reason');
      check(await entry.isDisabled() === fixture.disabled, `Wrong treasure entry permission: ${fixture.name}`);
      await p.getByRole('button', { name: '私下查看我的身份', exact: true }).click();
      const identity = p.getByRole('dialog', { name: '我的私密身份详情', exact: true });
      const privateEntry = identity.locator('.identity-treasure-entry-btn');
      check(await privateEntry.isDisabled() === fixture.disabled, `Wrong private entry permission: ${fixture.name}`);
      const detail = await privateEntry.textContent();
      check(detail.includes('蓝方法宝本局禁用；红方法宝保留') === fixture.disabled, `Wrong restriction explanation: ${fixture.name}`);
      const textFits = await privateEntry.evaluate(el => {
        const text = el.querySelector('small'); const range = document.createRange(); range.selectNodeContents(text);
        const box = el.getBoundingClientRect(); const lines = [...range.getClientRects()];
        return lines.every(line => line.left >= box.left && line.right <= box.right && line.top >= box.top && line.bottom <= box.bottom);
      });
      check(textFits, `Private treasure text is clipped: ${fixture.name}`);
      if (fixture.disabled) await p.screenshot({ path: '/private/tmp/avalon-guardian-blue-393.png' });
      await identity.getByRole('button', { name: '返回对局', exact: true }).click();
      if (!fixture.disabled) {
        await entry.click();
        const treasure = p.getByRole('dialog', { name: '本命法宝', exact: true });
        await treasure.waitFor();
        check(!(await treasure.textContent()).includes('蓝方法宝本局禁用'), `Allowed treasure modal incorrectly restricted: ${fixture.name}`);
        await treasure.getByRole('button', { name: '关闭', exact: true }).click();
      }
      results.push({ name: fixture.name, disabled: fixture.disabled, textFits, pass: true });
    }
    check(commands.length === 0, 'Opening private details sent a game action');
    return results;
  } finally {
    await context.close();
  }
}
