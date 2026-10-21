import type { AdminGameSummary, AdminOverview, AdminRoomSummary, AdminUserSummary, RedemptionCodeItem, Replay } from '@avalon/contracts';
import type { WechatPlatform } from '../../platform/wechat.js';

export class AdminApi {
  private key: string | undefined;
  constructor(private readonly platform: Pick<WechatPlatform, 'request'>, private readonly baseUrl: string, private readonly bearer?: () => string | undefined, private readonly timeoutMs = 10_000) {}
  get authorized() { return Boolean(this.key); }
  onHide() { this.key = undefined; }
  clear() { this.key = undefined; }

  private request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', key = this.key): Promise<T> {
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (action: () => void) => { if (finished) return; finished = true; clearTimeout(timer); action(); };
      const timer = setTimeout(() => finish(() => reject(new Error('NETWORK_TIMEOUT'))), this.timeoutMs);
      this.platform.request({ url: `${this.baseUrl}/api/admin${path}`, method,
        header: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'x-admin-key': key } : {}), ...(this.bearer?.() ? { Authorization: `Bearer ${this.bearer()}` } : {}) },
        ...(body === undefined ? {} : { data: body }),
        success: response => {
          finish(() => {
            if (response.statusCode === 401 || response.statusCode === 403) { this.clear(); reject(new Error('ADMIN_UNAUTHORIZED')); return; }
            if (response.statusCode < 200 || response.statusCode >= 300) { reject(new Error(String((response.data as { error?: string })?.error ?? `HTTP_${response.statusCode}`))); return; }
            resolve(response.data as T);
          });
        }, fail: () => finish(() => reject(new Error('NETWORK'))),
      });
    });
  }

  async verify(key: string): Promise<void> {
    this.clear();
    const result = await this.request<{ ok: boolean }>('/verify', { key }, 'POST', undefined);
    if (!result.ok) throw new Error('ADMIN_UNAUTHORIZED');
    this.key = key;
  }
  private guard() { if (!this.key) throw new Error('ADMIN_UNAUTHORIZED'); }
  overview(): Promise<AdminOverview> { this.guard(); return this.request('/overview'); }
  settings(): Promise<Record<string, unknown>> { this.guard(); return this.request('/settings'); }
  updateSetting(key: string, value: unknown) { this.guard(); return this.request<{ ok: boolean }>('/settings', { key, value }); }
  users(query = '', offset = 0): Promise<{ users: AdminUserSummary[]; total: number }> { this.guard(); return this.request(`/users?query=${encodeURIComponent(query)}&offset=${offset}`); }
  rooms(): Promise<{ rooms: AdminRoomSummary[] }> { this.guard(); return this.request('/rooms'); }
  games(offset = 0): Promise<{ games: AdminGameSummary[] }> { this.guard(); return this.request(`/games?offset=${offset}`); }
  replay(id: string): Promise<Replay> { this.guard(); return this.request(`/games/${encodeURIComponent(id)}/replay`); }
  codes(): Promise<{ codes: RedemptionCodeItem[] }> { this.guard(); return this.request('/redemption-codes'); }
  generateCodes(count: number, days: number, note?: string) { this.guard(); return this.request<{ codes: string[] }>('/redemption-codes/generate', { count, days, ...(note ? { note } : {}) }); }
  broadcast(text: string, enabled: boolean) { this.guard(); return this.request<{ ok: boolean }>('/broadcast', { text, enabled }); }
  banUser(id: string, isBanned: boolean, reason = '') { this.guard(); return this.request<{ ok: boolean }>(`/users/${encodeURIComponent(id)}/ban`, { isBanned, reason }); }
  grantVip(id: string, days: number) { this.guard(); return this.request<{ ok: boolean; vipUntil: string }>(`/users/${encodeURIComponent(id)}/vip`, { days }); }
  resetProfile(id: string, resetNickname: boolean, resetAvatar: boolean) { this.guard(); return this.request<{ ok: boolean }>(`/users/${encodeURIComponent(id)}/reset-profile`, { resetNickname, resetAvatar }); }
  userFriends(id: string) { this.guard(); return this.request(`/users/${encodeURIComponent(id)}/friends`); }
  killRoom(id: string, confirmed: boolean) { this.guard(); if (!confirmed) throw new Error('CONFIRM_REQUIRED'); return this.request<{ ok: boolean }>(`/rooms/${encodeURIComponent(id)}/kill`, {}); }
  deleteUser(id: string, confirmed: boolean) { this.guard(); if (!confirmed) throw new Error('CONFIRM_REQUIRED'); return this.request<{ ok: boolean }>(`/users/${encodeURIComponent(id)}`, undefined, 'DELETE'); }
  deleteEmptyUsers(confirmed: boolean) { this.guard(); if (!confirmed) throw new Error('CONFIRM_REQUIRED'); return this.request<{ ok: boolean; deletedCount: number }>('/users/batch-delete-empty', {}); }
}
