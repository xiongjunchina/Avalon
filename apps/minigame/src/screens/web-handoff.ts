import type { RoomView, User } from '@avalon/contracts';
import type { MiniGameApi } from '../net/api.js';
import { applicationUrl, invitationUrl } from '../net/urls.js';
import type { WxRuntime } from '../platform/wechat.js';
import type { ScreenModel } from '../ui/widgets.js';

export function roomVoiceGuidance(room: Pick<RoomView, 'settings'>): string {
  return room.settings.voiceChatEnabled
    ? '本房使用网页语音。请全员在手机系统浏览器打开网页版，才能互相听见；小游戏不会接入网页语音。'
    : '本房不使用内置语音，可面对面交流或自行使用外部通话。网页与小游戏均可进行 5–12 人对局。';
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
      { id: 'guide:web-continue', text: '复制或返回不会退房。接续成功后，请留在网页版操作；无需重新建房。微信语音当前保持关闭，不影响对局。' },
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
