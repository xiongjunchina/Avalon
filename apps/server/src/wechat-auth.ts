import { z } from 'zod';
import { DomainError } from './store.js';

export type WechatIdentity = { openid: string; unionid?: string; sessionKey?: string };
export type WechatConfig = { appId: string; appSecret: string };

const loginInput = z.object({
  code: z.string().trim().min(1).max(512),
  nickname: z.string().trim().min(1).max(20).optional(),
}).strict();

export async function exchangeWechatCode(
  code: string,
  config: WechatConfig,
  fetcher: typeof fetch = fetch,
  includeSessionKey = false,
): Promise<WechatIdentity> {
  if (!code.trim() || !config.appId || !config.appSecret) throw new DomainError('WECHAT_UNAVAILABLE', 503);
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', config.appId);
  url.searchParams.set('secret', config.appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new DomainError('WECHAT_UNAVAILABLE', 503);
  }
  if (!response.ok) throw new DomainError('WECHAT_UNAVAILABLE', 503);
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new DomainError('WECHAT_UNAVAILABLE', 503); }
  const body = z.object({
    openid: z.string().min(1).optional(),
    unionid: z.string().min(1).optional(),
    session_key: z.string().min(1).optional(),
    errcode: z.number().optional(),
  }).passthrough().safeParse(data);
  if (!body.success) throw new DomainError('WECHAT_UNAVAILABLE', 503);
  if (body.data.errcode === 40029 || body.data.errcode === 40163) throw new DomainError('WECHAT_CODE_INVALID', 401);
  if (body.data.errcode !== undefined || !body.data.openid) throw new DomainError('WECHAT_UNAVAILABLE', 503);
  return { openid: body.data.openid, ...(body.data.unionid ? { unionid: body.data.unionid } : {}),
    ...(includeSessionKey && body.data.session_key ? { sessionKey: body.data.session_key } : {}) };
}

export async function loginWithWechatCode<T>(
  raw: unknown,
  config: WechatConfig,
  login: (identity: WechatIdentity & { nickname?: string }) => Promise<T>,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const parsed = loginInput.safeParse(raw);
  if (!parsed.success) throw new DomainError('INVALID_INPUT', 400);
  const identity = await exchangeWechatCode(parsed.data.code, config, fetcher);
  return login({ ...identity, ...(parsed.data.nickname ? { nickname: parsed.data.nickname } : {}) });
}
