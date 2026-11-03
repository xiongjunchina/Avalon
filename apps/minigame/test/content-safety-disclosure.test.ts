import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayerPanel } from '../src/screens/player-panel.js';
import { PlayerExtras } from '../src/screens/player-extras.js';
import { entryScreen } from '../src/screens/entry.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';
import { PROFILE_CONTENT_SAFETY_NOTICE, CHAT_CONTENT_SAFETY_NOTICE, NICKNAME_CONTENT_SAFETY_NOTICE } from '../../web/src/content-safety-copy.js';

const user = { id: 'u', nickname: '仙友', avatar: 'leaf' as const };
const panel = () => new PlayerPanel(new PlayerExtras({ request: async (path: string) => path === '/friends'
  ? { friends: [{ id: 'f', nickname: '朋友', status: 'accepted' }] } : { messages: [] } } as any), user);

test('new nickname and profile forms disclose content data, purpose and providers before submitting', async () => {
  const profile = panel();
  await profile.handle('profileToggle', async () => undefined);
  for (const width of [320, 390, 430]) {
    const viewport = { width, height: 844, top: 24, bottom: 34 };
    const model = profile.model();
    const nodes = layoutWebScreen(model, viewport).nodes;
    const disclosure = nodes.find(n => n.id === 'profile-content-safety')!;
    assert.equal(disclosure.text, PROFILE_CONTENT_SAFETY_NOTICE);
    const nickname = nodes.find(n => n.id === 'nickname-label')!;
    assert.ok(disclosure.y + disclosure.height <= nickname.y);
    const auth = layoutWebScreen(entryScreen(undefined, undefined, true), viewport).nodes;
    assert.equal(auth.find(n => n.id === 'auth-content-safety')!.text, NICKNAME_CONTENT_SAFETY_NOTICE);
  }
});

for (const kind of ['room', 'direct'] as const) test(`${kind} message disclosure remains visible above input without covering the send button`, async () => {
  const chat = panel();
  if (kind === 'room') await chat.open('roomchat', { roomId: 'r' });
  else { await chat.open('friends'); await chat.handle('friend:f', async () => undefined); }
  for (const width of [320, 390, 430]) {
    const viewport = { width, height: 568, top: 24, bottom: 34 };
    const layout = layoutWebScreen(chat.model(), viewport);
    const disclosure = layout.nodes.find(n => n.id === 'chat-content-safety')!;
    const send = layout.nodes.find(n => n.id === (kind === 'room' ? 'chat:sendroom' : 'chat:send'))!;
    assert.equal(disclosure.text, CHAT_CONTENT_SAFETY_NOTICE);
    assert.equal(disclosure.fixed, true);
    assert.ok(disclosure.y >= viewport.top);
    assert.ok(disclosure.y + disclosure.height <= send.y);
    assert.ok(send.y + send.height <= viewport.height - viewport.bottom);
    assert.ok(layout.contentBottom > layout.contentTop, 'message stream retains visible height');
  }
});
