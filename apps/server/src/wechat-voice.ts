import { createHmac, randomBytes } from 'node:crypto';
import { exchangeWechatCode, type WechatConfig } from './wechat-auth.js';
import { DomainError } from './store.js';

// WeChat native VoIP supports at most ten members, independently of game capacity.
export async function issueWechatVoiceTicket(
  userId: string, roomId: string, code: string, config: WechatConfig,
  lookup: (userId: string, roomId: string) => Promise<{ openid?: string | null; playerCount: number }>,
  fetcher: typeof fetch = fetch,
) {
  const member = await lookup(userId, roomId);
  if (member.playerCount > 10) throw new DomainError('WECHAT_VOICE_LIMIT', 409);
  if (!member.openid) throw new DomainError('WECHAT_VOICE_IDENTITY', 403);
  const identity = await exchangeWechatCode(code, config, fetcher, true);
  if (identity.openid !== member.openid) throw new DomainError('WECHAT_VOICE_IDENTITY', 403);
  if (!identity.sessionKey) throw new DomainError('WECHAT_VOICE_SESSION', 503);
  // Membership may have changed while the code exchange was in flight.
  const current = await lookup(userId, roomId);
  if (current.playerCount > 10) throw new DomainError('WECHAT_VOICE_LIMIT', 409);
  if (current.openid !== identity.openid) throw new DomainError('WECHAT_VOICE_IDENTITY', 403);
  const groupId = `avalon-${roomId}`, nonceStr = randomBytes(24).toString('hex');
  const timeStamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', identity.sessionKey)
    .update([config.appId, groupId, nonceStr, String(timeStamp)].sort().join('')).digest('hex');
  return { groupId, nonceStr, timeStamp, signature };
}
