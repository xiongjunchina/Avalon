import type { DirectMessage, FriendSummary, HistoryPage, Replay, SettingPreset, Settings, Statistics, User } from '@avalon/contracts';
import type { MiniGameApi } from '../net/api.js';

export class PlayerExtras {
  constructor(private readonly api: MiniGameApi) {}
  friends() { return this.api.request<{ friends: FriendSummary[] }>('/friends'); }
  requestFriend(query: string) { return this.api.request('/friends/request', { query }); }
  acceptFriend(id: string) { return this.api.request(`/friends/${encodeURIComponent(id)}/accept`, {}); }
  removeFriend(id: string) { return this.api.request(`/friends/${encodeURIComponent(id)}`, undefined, 'DELETE'); }
  invite(roomId: string, targetUserId: string) { return this.api.request<{ sent: boolean; online: boolean }>(`/rooms/${encodeURIComponent(roomId)}/invite`, { targetUserId }); }
  directChat(id: string) { return this.api.request<{ messages: DirectMessage[] }>(`/friends/${encodeURIComponent(id)}/chat`); }
  sendDirect(id: string, text: string) { return this.api.request(`/friends/${encodeURIComponent(id)}/chat`, { text }); }
  roomChat(roomId: string, text: string) { return this.api.request(`/rooms/${encodeURIComponent(roomId)}/chat`, { text }, 'POST'); }
  statistics() { return this.api.request<Statistics>('/me/stats'); }
  history(cursor?: string, favorites = false) {
    const query = [favorites ? 'favorites=true' : '', cursor ? `cursor=${encodeURIComponent(cursor)}` : ''].filter(Boolean).join('&');
    return this.api.request<HistoryPage>(`/me/games${query ? `?${query}` : ''}`);
  }
  replay(id: string) { return this.api.request<Replay>(`/games/${encodeURIComponent(id)}/replay`); }
  favorite(id: string, value: boolean) { return this.api.request(`/me/favorites/${encodeURIComponent(id)}`, undefined, value ? 'PUT' : 'DELETE'); }
  presets() { return this.api.request<{ presets: SettingPreset[] }>('/me/presets'); }
  savePreset(name: string, settings: Settings) { return this.api.request<{ preset: SettingPreset }>('/me/presets', { name, settings }); }
  deletePreset(id: string) { return this.api.request(`/me/presets/${encodeURIComponent(id)}`, undefined, 'DELETE'); }
  updateProfile(profile: { nickname: string; avatar: User['avatar']; avatarUrl?: string | null; wechatAvatarUrl?: string | null }) { return this.api.request<{ user: User }>('/me', profile, 'PATCH'); }
  redeem(code: string) { return this.api.request<{ ok: boolean; days: number; vipUntil: string }>('/me/redeem', { code }); }
  announcement() { return this.api.request<{ announcement: { text: string; enabled: boolean }; freeAccessMode: boolean }>('/system/announcement'); }
}
