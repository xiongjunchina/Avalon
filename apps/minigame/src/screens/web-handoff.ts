import type { RoomView, User } from '@avalon/contracts';
import type { MiniGameApi } from '../net/api.js';
import { applicationUrl, invitationUrl } from '../net/urls.js';
import type { WxRuntime } from '../platform/wechat.js';
import type { ScreenModel } from '../ui/widgets.js';

export function roomVoiceGuidance(room: Pick<RoomView, 'settings'>): string {
  return room.settings.playerCount > 10
    ? '本房可正常进行对局，但微信原生语音最多10人，当前人数不支持；网页声网独立，两端不互通。'
    : '小游戏内可直接使用微信原生语音，无需跳转网页；网页声网独立，两端不互通。';
}

export function webHandoffScreen(room: RoomView, user: User): ScreenModel {
  return {
    title: '转到网页版',
    rows: [
      { id: 'guide:web-room', text: `房间 ${room.code} · ${room.settings.playerCount} 人 · 当前账号 ${user.nickname}` },
      { id: 'guide:web-voice', text: roomVoiceGuidance(room) },
      { id: 'guide:web-personal', text: '本人接续链接：复制后，在手机系统浏览器粘贴打开并确认，继续使用同一账号、房间和座位。链接 5 分钟有效、只能用一次，请勿发给他人。' },
      { id: 'web:copyPersonal', text: '复制本人接续链接' },
      { id: 'guide:web-invite', text: '邀请朋友：只发送下面的房间邀请链接。朋友使用自己的账号入座，不会接管你的账号。' },
      { id: 'web:copyInvite', text: '复制房间邀请链接' },
      { id: 'guide:web-continue', text: '复制或返回不会退房。接续成功后，请留在网页版操作；无需重新建房。网页与小游戏语音不互通，请勿同时开启两端麦克风。' },
    ],
    web: { page: 'sheet', background: 'library', backId: 'auxiliaryClose', document: { kind: 'tools', modal: true } },
  };
}

export function personalHandoffUrl(base: string, ticket: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new Error('接续链接生成失败，请重试');
  // The short-lived bearer credential belongs only in the fragment, never a query or invitation.
  return applicationUrl(base, '') + '#avalon-handoff=' + encodeURIComponent(ticket);
}

export async function copyWebEntry(
  kind: 'personal' | 'invite', api: Pick<MiniGameApi, 'request'>,
  runtime: Pick<WxRuntime, 'setClipboardData'>, base: string, room: RoomView,
): Promise<void> {
  if (!runtime.setClipboardData) throw new Error('当前设备不支持复制链接');
  const url = kind === 'invite' ? invitationUrl(base, room.inviteKey ?? room.code)
    : personalHandoffUrl(base, (await api.request<{ ticket: string; expiresAt: string }>(
      '/sessions/web-handoff', { roomId: room.id },
    )).ticket);
  await new Promise<void>((resolve, reject) => runtime.setClipboardData!({
    data: url, success: resolve, fail: () => reject(new Error('复制失败，请重试')),
  }));
}
