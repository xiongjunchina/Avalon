import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerPanel } from '../src/screens/player-panel.js';
import { PlayerExtras } from '../src/screens/player-extras.js';
import { describeMiniGameError } from '../src/ui/messages.js';
import { describe } from '../../web/src/api.js';

const safetyErrors = ['CONTENT_REJECTED', 'CONTENT_PENDING', 'CONTENT_CHECK_UNAVAILABLE'] as const;
const originalUser = { id: 'u', nickname: '原昵称', avatar: 'leaf' as const, avatarUrl: 'data:image/jpeg;base64,T0xE' };
const newAvatar = 'data:image/jpeg;base64,TkVX';

for (const error of safetyErrors) {
  test(`${error}: a failed profile save retains the old public profile and the editable nickname/avatar draft`, async () => {
    let failure: string | undefined = error;
    const submissions: unknown[] = [];
    const panel = new PlayerPanel(new PlayerExtras({ request: async (path: string, body: unknown) => {
      assert.equal(path, '/me');
      submissions.push(body);
      if (failure) throw Error(failure);
      return { user: { ...originalUser, ...(body as object) } };
    } } as any), { ...originalUser }, async () => newAvatar);
    await panel.handle('profileToggle', async () => undefined);
    await panel.handle('profile:nickname', async () => '新昵称');
    await panel.handle('uploadAvatar', async () => undefined);
    await assert.rejects(panel.handle('profile:save', async () => undefined), { message: error });
    assert.deepEqual(panel.user, originalUser);
    const draft = panel.model().web?.document?.profileDraft;
    assert.equal(draft?.nickname, '新昵称');
    assert.equal(draft?.avatarUrl, newAvatar);
    assert.equal(panel.model().web?.document?.profileEditing, true);
    failure = undefined;
    await panel.handle('profile:save', async () => undefined);
    assert.deepEqual(submissions[1], submissions[0]);
    assert.equal(panel.user.nickname, '新昵称');
    assert.equal(panel.user.avatarUrl, newAvatar);
    assert.equal(panel.model().web?.document?.profileEditing, false);
  });

  for (const kind of ['room', 'direct'] as const) {
    test(`${error}: ${kind} chat stays open, retains the message and permits retry after rejection`, async () => {
      let failure: string | undefined = error;
      const sent: unknown[] = [];
      const panel = new PlayerPanel(new PlayerExtras({ request: async (path: string, body?: unknown) => {
        if (path === '/friends') return { friends: [{ id: 'f', nickname: '仙友', status: 'accepted' }] };
        if (body !== undefined) { sent.push(body); if (failure) throw Error(failure); return { ok: true }; }
        return { messages: [] };
      } } as any), { ...originalUser });
      if (kind === 'room') await panel.open('roomchat', { roomId: 'r' });
      else { await panel.open('friends'); await panel.handle('friend:f', async () => undefined); }
      await panel.handle('chat:input', async () => '需要保留的消息草稿');
      const send = kind === 'room' ? 'chat:sendroom' : 'chat:send';
      await assert.rejects(panel.handle(send, async () => undefined), { message: error });
      assert.equal(panel.model().web?.document?.kind, 'chat');
      assert.equal(panel.model().web?.document?.chatDraft, '需要保留的消息草稿');
      assert.deepEqual(panel.model().web?.document?.messages, []);
      failure = undefined;
      await panel.handle(send, async () => undefined);
      assert.equal(panel.model().web?.document?.chatDraft, '');
      assert.deepEqual(sent, [{ text: '需要保留的消息草稿' }, { text: '需要保留的消息草稿' }]);
      assert.deepEqual(panel.user, originalUser);
    });
  }
}

test('web and minigame explain content failures without displaying internal codes or claiming a queued review', () => {
  for (const code of safetyErrors) {
    const message = describe(new Error(code));
    assert.match(message, /内容/);
    assert.doesNotMatch(message, /CONTENT_|已提交|已发送|资料已保存/);
    assert.equal(describeMiniGameError(new Error(code)), message);
  }
  assert.match(describe(new Error('CONTENT_PENDING')), /暂未公开/);
  assert.match(describe(new Error('CONTENT_CHECK_UNAVAILABLE')), /未发布/);
});

test('identity expiry and invalid avatars offer the right recovery action on both clients', () => {
  const cases = [
    ['CONTENT_IDENTITY_REQUIRED', /重新微信登录/],
    ['INVALID_AVATAR', /重新从相册选择上传/],
  ] as const;
  for (const [code, recovery] of cases) {
    const message = describe(new Error(code));
    assert.match(message, recovery);
    assert.equal(describeMiniGameError(new Error(code)), message);
    assert.doesNotMatch(message, /CONTENT_|INVALID_AVATAR/);
  }
});
