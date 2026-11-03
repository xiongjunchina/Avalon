import { z } from 'zod';
import { DomainError } from './store.js';

export type SafetyDecision = {
  decision: 'pass' | 'risky' | 'review';
  traceId?: string;
  provider: string;
};

export interface ContentSafetyProvider {
  checkText(content: string, scene: 1 | 5, openid?: string): Promise<SafetyDecision>;
  checkImage(mediaUrl: string, openid?: string): Promise<SafetyDecision>;
}

type WechatSafetyConfig = {
  appId: string;
  appSecret: string;
  /** Includes token retrieval, a possible token refresh, and the content check. */
  timeoutMs?: number;
};

const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  errcode: z.number().optional(),
});
const checkResponse = z.object({
  errcode: z.number().int(),
  trace_id: z.string().min(1).max(256).optional(),
  result: z.object({ suggest: z.enum(['pass', 'risky', 'review']) }).optional(),
});
const tokenErrors = new Set([40001, 40014, 42001]);
const unavailable = () => new DomainError('CONTENT_CHECK_UNAVAILABLE', 503);

/**
 * Server-only WeChat game-specific v2 checks. No legacy v1 fallback: a missing
 * actor OpenID must be handled by another provider or an unpublished review queue.
 * Official API references: docs/content-safety-provider.md.
 */
export class WechatContentSafetyProvider implements ContentSafetyProvider {
  private cachedToken?: { value: string; expiresAt: number };
  private pendingToken?: Promise<string>;
  private readonly timeoutMs: number;

  constructor(private readonly config: WechatSafetyConfig, private readonly fetcher: typeof fetch = fetch) {
    this.timeoutMs = Math.min(Math.max(config.timeoutMs ?? 5_500, 1), 5_500);
  }

  checkText(content: string, scene: 1 | 5, openid?: string): Promise<SafetyDecision> {
    if (!content.trim() || Array.from(content).length > 2_500 || ![1, 5].includes(scene))
      return Promise.reject(new DomainError('INVALID_INPUT', 400));
    return this.check('/wxa/game/content_spam/msg_sec_check', { content, scene }, openid);
  }

  checkImage(mediaUrl: string, openid?: string): Promise<SafetyDecision> {
    // The caller supplies an immutable, controlled upload URL, never a client URL.
    let url: URL;
    try { url = new URL(mediaUrl); }
    catch { return Promise.reject(new DomainError('INVALID_INPUT', 400)); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash)
      return Promise.reject(new DomainError('INVALID_INPUT', 400));
    return this.check('/wxa/game/content_spam/media_check_sync', {
      media_url: url.href, media_type: 2, scene: 1,
    }, openid);
  }

  private async check(path: string, payload: Record<string, unknown>, openid?: string): Promise<SafetyDecision> {
    if (!openid?.trim()) throw new DomainError('CONTENT_IDENTITY_REQUIRED', 401);
    if (!this.config.appId || !this.config.appSecret) throw unavailable();
    const signal = AbortSignal.timeout(this.timeoutMs);
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.withDeadline(this.getToken(), signal);
      const response = await this.json(`https://api.weixin.qq.com${path}?access_token=${encodeURIComponent(token)}`,
        { ...payload, version: 2, openid }, signal);
      const parsed = checkResponse.safeParse(response);
      if (!parsed.success) throw unavailable();
      const data = parsed.data;
      if (tokenErrors.has(data.errcode) && attempt === 0) {
        if (this.cachedToken?.value === token) this.cachedToken = undefined;
        continue;
      }
      if ([40003, 43104].includes(data.errcode)) throw new DomainError('CONTENT_IDENTITY_REQUIRED', 401);
      if (data.errcode !== 0 || !data.result) throw unavailable();
      return {
        decision: data.result.suggest,
        provider: 'wechat-minigame-v2',
        ...(data.trace_id ? { traceId: data.trace_id } : {}),
      };
    }
    throw unavailable();
  }

  private getToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) return Promise.resolve(this.cachedToken.value);
    if (this.pendingToken) return this.pendingToken;
    // Stable tokens do not invalidate an existing token on every server restart.
    const pending = this.json('https://api.weixin.qq.com/cgi-bin/stable_token', {
      grant_type: 'client_credential', appid: this.config.appId,
      secret: this.config.appSecret, force_refresh: false,
    }, AbortSignal.timeout(this.timeoutMs)).then(raw => {
      const parsed = tokenResponse.safeParse(raw);
      if (!parsed.success || (parsed.data.errcode !== undefined && parsed.data.errcode !== 0)) throw unavailable();
      const token = parsed.data;
      const refreshBuffer = Math.min(300, token.expires_in / 10);
      this.cachedToken = { value: token.access_token, expiresAt: Date.now() + (token.expires_in - refreshBuffer) * 1_000 };
      return token.access_token;
    });
    this.pendingToken = pending;
    // Clear only this request; an older completion must not clear a new refresh.
    void pending.then(() => { if (this.pendingToken === pending) this.pendingToken = undefined; },
      () => { if (this.pendingToken === pending) this.pendingToken = undefined; });
    return pending;
  }

  private async json(url: string, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    try {
      return await this.withDeadline((async () => {
        const response = await this.fetcher(url, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body), signal, redirect: 'error',
        });
        if (!response.ok) throw unavailable();
        return await response.json();
      })(), signal);
    } catch {
      // Never propagate URL, access_token, AppSecret, or user content from an upstream error.
      throw unavailable();
    }
  }

  private withDeadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(unavailable());
      if (signal.aborted) { void promise.catch(() => undefined); abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
}
