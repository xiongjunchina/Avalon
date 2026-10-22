import type { User } from '@avalon/contracts';
import type { WechatPlatform } from '../platform/wechat.js';
export interface KnownAccount { id: string; nickname: string; playerCode: string }
export class KnownAccounts {
  private readonly key = 'avalon_minigame_known_accounts';
  constructor(private readonly storage: Pick<WechatPlatform, 'get' | 'set'>) {}
  list(): KnownAccount[] {
    try {
      const raw = this.storage.get(this.key), items: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(items)) return [];
      return items.filter((item): item is KnownAccount => item && typeof item.id === 'string' && typeof item.nickname === 'string' && typeof item.playerCode === 'string' && /^\d{6}$/.test(item.playerCode)).slice(0, 5);
    } catch { return []; }
  }
  remember(user: User) {
    if (!user.playerCode || !/^\d{6}$/.test(user.playerCode)) return;
    this.storage.set(this.key, JSON.stringify([{ id: user.id, nickname: user.nickname, playerCode: user.playerCode }, ...this.list().filter(item => item.id !== user.id && item.playerCode !== user.playerCode)].slice(0, 5)));
  }
}
