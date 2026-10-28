// Run via browser_run_code_unsafe(filename=...) against `npm run dev:web`.
// Isolated browser context; every API/WebSocket request is mocked, with no ECS writes.
async (page) => {
  const context = await page.context().browser().newContext();
  const results = [];
  const check = (value, message) => { if (!value) throw new Error(message); };
  try {
    for (const viewport of [{ width: 393, height: 750 }, { width: 1280, height: 900 }]) {
      const p = await context.newPage();
      await p.setViewportSize(viewport);
      await p.clock.install();
      const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '选角测试', playerCode: '183932' };
      let room = {
        id: '22222222-2222-4222-8222-222222222222', code: '123456', hostId: user.id,
        phase: 'waiting', version: 1, acceptingNewMembers: true,
        settings: { playerCount: 9, captainMode: 'seat_order', anonymousTeamVote: true, rejectionScope: 'game',
          earlyAssassinationEnabled: false, guardianPerksEnabled: false, voiceChatEnabled: false,
          autoRevealRoleEnabled: false, treasuresEnabled: false, rolePreferenceEnabled: true },
        members: [{ ...user, seat: 1, ready: true, online: true }],
      };
      let socket;
      let syncs = 0;
      const commands = [];
      const snapshot = () => socket.send(JSON.stringify({ type: 'snapshot', room }));
      const receipt = (command, ok, error) => socket.send(JSON.stringify({ type: 'commandResult', commandId: command.commandId, ok, ...(error ? { error } : {}) }));
      await p.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({ json: path === '/api/me' ? { user, roomId: room.id }
          : path.includes('/rooms/') ? { room, invite: 'test-invite' }
          : { friends: [], rooms: [], presets: [], messages: [], announcement: { enabled: false, text: '' }, freeAccessMode: true } });
      });
      await p.routeWebSocket('**/api/rooms/*/socket', ws => {
        socket = ws;
        ws.onMessage(raw => {
          const command = JSON.parse(String(raw));
          if (command.type === 'sync') { syncs++; snapshot(); }
          else commands.push(command);
        });
        snapshot();
      });
      await p.goto('http://127.0.0.1:5173/');
      await p.locator('.waiting-role-pref-btn').click();
      const dialog = p.getByRole('dialog', { name: '心仪选角', exact: true });
      const chosen = () => dialog.locator('.slot-card-name').allTextContents();
      const choose = name => dialog.locator('.role-choice-card').filter({ hasText: name }).click();
      const submit = dialog.locator('.role-pref-submit-btn');
      const waitText = text => dialog.getByText(text, { exact: true }).waitFor();
      await choose('孙悟空');
      await choose('唐三藏');
      await choose('红孩儿');
      for (let i = 0; i < 3; i++) {
        await p.clock.runFor(16000);
        check((await chosen()).join() === '孙悟空,唐三藏,红孩儿', 'Periodic snapshot erased the draft');
      }
      check(syncs >= 3, 'Did not exercise the real 15-second room sync');
      await submit.click();
      await waitText('保存中…');
      check(commands.length === 1 && commands[0].type === 'setRolePreferences', 'Wrong save command');
      check(commands[0].payload.preferences.join() === 'merlin,percival,assassin', 'Wrong saved preferences');
      snapshot();
      await p.clock.runFor(100);
      check(await dialog.count() === 1 && await submit.isDisabled(), 'Dialog closed before server confirmation');
      await p.keyboard.press('Escape');
      check(await dialog.count() === 1, 'Escape dismissed an unconfirmed save');
      room = { ...room, version: 2 };
      receipt(commands[0], false, 'VERSION_CONFLICT');
      snapshot();
      await waitText('房间刚刚更新，志愿已保留，请再次点击保存。');
      check((await chosen()).length === 3, 'Failed save erased the draft');
      await p.clock.runFor(16000);
      check(await dialog.locator('[role="alert"]').count() === 1, 'Snapshot erased the save error');
      await submit.click();
      await waitText('保存中…');
      check(commands.length === 2 && commands[1].expectedVersion === 2, 'Retry did not use the fresh room version');
      check(commands[0].commandId !== commands[1].commandId, 'Explicit retry reused a rejected command');
      room = { ...room, version: 3, selfRolePreferences: commands[1].payload.preferences };
      snapshot();
      receipt(commands[1], true);
      await dialog.waitFor({ state: 'hidden' });
      await p.locator('.waiting-role-pref-btn').click();
      check((await chosen()).join() === '孙悟空,唐三藏,红孩儿', 'Reopened dialog did not use saved preferences');
      await dialog.locator('.role-pref-clear-btn').click();
      await dialog.locator('.role-pref-cancel-btn').click();
      await p.locator('.waiting-role-pref-btn').click();
      check((await chosen()).length === 3, 'Cancelled draft leaked into the next editing session');
      await dialog.locator('.role-pref-clear-btn').click();
      await choose('孙悟空');
      await choose('观音菩萨');
      await choose('红孩儿');
      room = { ...room, version: 4, settings: { ...room.settings, playerCount: 6 } };
      snapshot();
      await dialog.locator('.role-choice-card').filter({ hasText: '观音菩萨' }).waitFor({ state: 'hidden' });
      check((await chosen()).join() === '孙悟空,红孩儿', 'Player-count change should only remove unavailable roles');
      await p.clock.runFor(16000);
      check((await chosen()).join() === '孙悟空,红孩儿', 'Updated role pool still loses draft on sync');
      await dialog.locator('.role-pref-clear-btn').click();
      await submit.click();
      await waitText('保存中…');
      const clearCommand = commands.at(-1);
      check(clearCommand.payload.preferences.length === 0, 'Cannot save a deliberate blind choice');
      room = { ...room, version: 5, selfRolePreferences: [] };
      snapshot(); receipt(clearCommand, true);
      await dialog.waitFor({ state: 'hidden' });
      await p.locator('.waiting-role-pref-btn').click();
      check((await chosen()).length === 0, 'Blind choice did not persist');
      await choose('孙悟空');
      room = { ...room, version: 6, phase: 'playing' };
      snapshot();
      await waitText('本局已开始，不能再修改心仪角色。');
      check(await submit.isDisabled(), 'Save remained enabled after game start');
      check((await chosen()).join() === '孙悟空', 'Start restriction erased the draft');
      const layout = await dialog.evaluate(el => {
        const sheet = el.querySelector('.role-pref-sheet').getBoundingClientRect();
        const footer = el.querySelector('.role-pref-footer').getBoundingClientRect();
        const button = el.querySelector('.role-pref-submit-btn').getBoundingClientRect();
        return { sheetFits: sheet.left >= 0 && sheet.right <= innerWidth && sheet.top >= 0 && sheet.bottom <= innerHeight,
          footerFits: footer.bottom <= innerHeight, buttonFits: button.left >= 0 && button.right <= innerWidth,
          titleFont: getComputedStyle(el.querySelector('.role-pref-title')).fontSize };
      });
      check(layout.sheetFits && layout.footerFits && layout.buttonFits, 'Preference layout clips primary controls');
      await p.screenshot({ path: `/private/tmp/avalon-role-preference-${viewport.width}.png` });
      results.push({ viewport, syncs, commands: commands.length, layout, pass: true });
      await p.close();
    }
    return results;
  } finally {
    await context.close();
  }
}
