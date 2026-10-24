import type { User } from '@avalon/contracts';
export interface KnownAccount { id: string; nickname: string; playerCode: string; lastSeen: number }
const key = 'avalon_known_accounts';
export function knownAccountsList(): KnownAccount[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(list) ? list.filter((a): a is KnownAccount => a && typeof a.id==='string' && typeof a.nickname==='string' && /^\d{6}$/.test(a.playerCode)).slice(0,5).map(({id,nickname,playerCode,lastSeen})=>({id,nickname,playerCode,lastSeen})) : [];
  } catch { return []; }
}
export function rememberAccount(user: User): KnownAccount[] {
  const list=knownAccountsList();
  if (!user.playerCode) return list;
  const next=[{id:user.id,nickname:user.nickname,playerCode:user.playerCode,lastSeen:Date.now()},...list.filter(a=>a.id!==user.id && a.playerCode!==user.playerCode)].slice(0,5);
  try { localStorage.setItem(key,JSON.stringify(next)); } catch { /* The current authenticated session remains usable. */ }
  return next;
}
