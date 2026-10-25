// Run on the local Vite page with browser_run_code_unsafe(filename=...).
// All account requests are mocked; this never changes a real player's profile.
async (page) => {
  await page.unrouteAll({ behavior: 'wait' });
  const originalPhoto = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#357d8a'; ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png');
  });
  let user = { id: '11111111-1111-4111-8111-111111111111', nickname: '头像验收', avatar: 'leaf', playerCode: '123456', avatarUrl: originalPhoto };
  const requests = [], viewports = [], choices = [];
  const score = { completed: 0, wins: 0, losses: 0, aborted: 0, winRate: null };
  const stats = { ...score, byTeam: { blue: score, red: score }, byRole: Object.fromEntries(['merlin','percival','guinevere','loyal','morgana','assassin','mordred','oberon','minion'].map(role => [role, score])) };
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me' && route.request().method() === 'PATCH') {
      const input = route.request().postDataJSON();
      requests.push(input); user = { ...user, ...input };
      return route.fulfill({ json: { user } });
    }
    return route.fulfill({ json: path === '/api/me' ? { user, roomId: null }
      : path.endsWith('/stats') ? stats : path.endsWith('/friends') ? { friends: [] }
      : { announcement: { enabled: false, text: '' }, freeAccessMode: true } });
  });
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const editor = page.getByRole('dialog', { name: '修改昵称与头像', exact: true });
  const preview = editor.locator('.profile-avatar-preview-box img');
  const openEditor = async () => page.getByRole('button', { name: '修改昵称与头像', exact: true }).click();
  const openAccount = async () => { await page.getByRole('button', { name: '📜 功果簿', exact: true }).click(); await openEditor(); };
  const choose = async index => {
    const label = editor.locator('.profile-avatar-option').nth(index);
    await label.click();
    const value = await label.locator('input').inputValue();
    check(await label.locator('input').isChecked(), `Choice ${index} not checked`);
    check(await preview.getAttribute('src') === value, `Choice ${index} preview mismatch`);
    await label.locator('img').evaluate(img => img.decode());
    return value;
  };
  await page.setViewportSize({ width: 393, height: 724 });
  await page.goto(new URL('/', page.url()).href);
  await openAccount();
  check(await preview.getAttribute('src') === originalPhoto, 'Existing custom photo replaced on open');
  check(await editor.getByRole('radio').count() === 12, 'Expected twelve artifact options');
  check(await editor.locator('input[type=radio]:checked').count() === 0, 'Custom photo marked as preset');
  check(!/绿叶|月亮|太阳|改用预置符号|仙友人物头像/.test(await editor.textContent()), 'Legacy picker is still shown');
  await choose(4);
  await editor.getByRole('button', { name: '关闭', exact: true }).click();
  await openEditor();
  check(await preview.getAttribute('src') === originalPhoto && requests.length === 0, 'Unsaved selection changed stored photo');
  for (let i = 0; i < 12; i++) choices.push(await choose(i));
  await editor.locator('#profile-nickname').fill('法宝验收');
  await editor.getByRole('button', { name: '保存资料', exact: true }).click();
  await editor.getByText('资料已保存，旧局记录保持原样。', { exact: true }).waitFor();
  check(requests.at(-1).avatarUrl === choices[11] && requests.at(-1).nickname === '法宝验收' && requests.at(-1).avatar === 'leaf', 'Saved payload mismatch');
  await page.reload(); await openAccount();
  check(await editor.locator('.profile-avatar-option').nth(11).locator('input').isChecked(), 'Preset selection lost after reload');
  check(await preview.getAttribute('src') === choices[11], 'Preset preview lost after reload');
  // Exercise the existing FileReader/canvas upload through the actual file input.
  await editor.locator('input[type=file]').evaluate((input, dataUrl) => {
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'avatar-test.png', { type: 'image/png' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, originalPhoto);
  await editor.getByText('头像预览：自定义上传头像', { exact: true }).waitFor();
  check(/^data:image\/(webp|jpeg);base64,/.test(await preview.getAttribute('src')), 'Upload crop did not produce avatar');
  check(await editor.locator('input[type=radio]:checked').count() === 0, 'Uploaded photo marked as preset');
  await editor.getByRole('button', { name: '保存资料', exact: true }).click();
  await editor.getByText('资料已保存，旧局记录保持原样。', { exact: true }).waitFor();
  check(/^data:image\/(webp|jpeg);base64,/.test(requests.at(-1).avatarUrl), 'Uploaded image not saved');
  const uploaded = user.avatarUrl;
  await page.reload(); await openAccount();
  check(await preview.getAttribute('src') === uploaded, 'Uploaded photo lost after reload');
  await editor.getByRole('button', { name: '关闭', exact: true }).click();
  user = { ...user, avatarUrl: choices[11], wechatAvatarUrl: originalPhoto };
  await page.reload(); await openAccount();
  await editor.getByRole('button', { name: '恢复原有头像', exact: true }).click();
  check(await preview.getAttribute('src') === originalPhoto, 'Existing external photo cannot be restored');
  await editor.getByRole('button', { name: '保存资料', exact: true }).click();
  await editor.getByText('资料已保存，旧局记录保持原样。', { exact: true }).waitFor();
  check(user.avatarUrl === null && user.wechatAvatarUrl === originalPhoto, 'Restore overwrote existing photo');
  for (const viewport of [{ width: 320, height: 568 }, { width: 393, height: 724 }, { width: 430, height: 716 }]) {
    await page.setViewportSize(viewport);
    await choose(11);
    const last = await editor.locator('.profile-avatar-option').last().boundingBox();
    const scroll = await editor.locator('.flow-scroll-body').boundingBox();
    check(last.y >= scroll.y - 1 && last.y + last.height <= scroll.y + scroll.height + 1, 'Last avatar is not reachable above footer');
    const metrics = await editor.evaluate(e => {
      const body = e.querySelector('.flow-scroll-body');
      const fonts = [...e.querySelectorAll('label[for],.profile-preset-fieldset legend,#profile-nickname,.profile-avatar-meta .hint')].map(n => getComputedStyle(n).fontSize);
      const header = e.querySelector('.table-modal-head').getBoundingClientRect();
      const save = e.querySelector('.flow-fixed-actions button').getBoundingClientRect();
      return { fonts, horizontalOverflow: body.scrollWidth > body.clientWidth, headerTop: header.top, saveTop: save.top, saveBottom: save.bottom, backdropScroll: e.scrollTop };
    });
    check(metrics.fonts.every(font => font === '14px'), 'Field typography differs from body');
    check(!metrics.horizontalOverflow && metrics.headerTop >= 0 && metrics.saveTop >= 0 && metrics.saveBottom <= viewport.height && metrics.backdropScroll === 0, 'Viewport overflow or unreachable fixed actions');
    await choose(4);
    await editor.locator('.flow-scroll-body').evaluate(e => { e.scrollTop = 0; });
    if (viewport.width === 393) await page.screenshot({ path: 'docs/profile-avatar-validation/profile-393.png' });
    viewports.push({ ...viewport, ...metrics, pass: true });
  }
  await editor.getByRole('radio', { name: '青玉葫芦', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  check(await editor.getByRole('radio', { name: '山河宝扇', exact: true }).isChecked(), 'Radio keyboard navigation failed');
  await editor.getByRole('button', { name: '关闭', exact: true }).click();
  return { choices: choices.length, customPhotoPreservedOnOpen: true, cancelPreservesSavedAvatar: true, presetSavedAndReloaded: true, uploadedAndReloaded: true, existingPhotoRestored: true, keyboardSelection: true, profileSaves: requests.length, viewports, pass: true };
}
