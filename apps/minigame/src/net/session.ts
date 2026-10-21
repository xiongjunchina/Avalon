import type { WechatPlatform } from '../platform/wechat.js';

const KEY = 'avalon_minigame_session';

export class MiniGameSession {
  constructor(private readonly platform: Pick<WechatPlatform, 'get' | 'set' | 'remove'>) {}
  get(): string | undefined {
    const value = this.platform.get(KEY);
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
  set(token: string) { this.platform.set(KEY, token); }
  clear() { this.platform.remove(KEY); }
}
