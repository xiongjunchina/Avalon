import type { User } from '@avalon/contracts';
import type { WechatPlatform } from '../platform/wechat.js';
import { MiniGameSession } from './session.js';

export function networkCode(error: unknown): string {
  const message = error && typeof error === 'object' && 'errMsg' in error ? String(error.errMsg) : '';
  if (/not in domain list|url not in|合法域名/i.test(message)) return 'NETWORK_DOMAIN';
  if (/ssl|tls|certificate|hand.?shake/i.test(message)) return 'NETWORK_TLS';
  if (/timeout|timed out/i.test(message)) return 'NETWORK_TIMEOUT';
  return 'NETWORK';
}

export class MiniGameApi {
  readonly session: MiniGameSession;
  constructor(
    private readonly platform: WechatPlatform,
    private readonly baseUrl: string,
    private readonly options: { timeoutMs?: number } = {},
  ) {
    this.session = new MiniGameSession(platform);
  }

  request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    const token = this.session.get();
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (action: () => void) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        action();
      };
      const timer = setTimeout(() => finish(() => reject(new Error('NETWORK_TIMEOUT'))), this.options.timeoutMs ?? 10_000);
      this.platform.request({
        url: `${this.baseUrl.replace(/\/$/, '')}/api${path}`,
        method,
        header: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { data: body }),
        success: response => finish(() => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const error = response.data && typeof response.data === 'object' && 'error' in response.data
              ? String(response.data.error) : `HTTP_${response.statusCode}`;
            reject(new Error(error));
          } else if (typeof response.data === 'string' || response.data == null) {
            reject(new Error('NETWORK_RESPONSE'));
          } else resolve(response.data as T);
        }),
        fail: cause => finish(() => reject(new Error(networkCode(cause)))),
      });
    });
  }

  async login(nickname?: string): Promise<{ user: User; token: string }> {
    const code = await this.platform.login();
    const result = await this.request<{ user: User; token: string }>('/sessions/minigame', {
      code, ...(nickname ? { nickname } : {}),
    });
    this.session.set(result.token);
    return result;
  }

  async refresh(): Promise<User> {
    const result = await this.request<{ user: User }>('/sessions/refresh', {}, 'POST');
    return result.user;
  }

  async switchAccount(playerCode: string, expectedUserId?: string): Promise<User> {
    if (!this.session.get()) throw new Error('UNAUTHENTICATED');
    const result = await this.request<{ user: User; token: string }>('/sessions/switch', { playerCode, ...(expectedUserId?{expectedUserId}:{}) });
    if (!result.token) throw new Error('SESSION_TOKEN_MISSING');
    this.session.set(result.token);
    return result.user;
  }

  async logout(): Promise<void> {
    try { if (this.session.get()) await this.request<{ ok: boolean }>('/sessions', undefined, 'DELETE'); }
    finally { this.session.clear(); }
  }
  clearSession() { this.session.clear(); }
}
