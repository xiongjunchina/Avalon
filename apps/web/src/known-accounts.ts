import type { User } from '@avalon/contracts';
export interface KnownAccount { id: string; nickname: string; playerCode: string; lastSeen: number; recoveryCode?: string }
const key = 'avalon_known_accounts';
export function knownAccountsList(): KnownAccount[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(list) ? list.filter((a): a is KnownAccount => a && typeof a.id==='string' && typeof a.nickname==='string' && /^\d{6}$/.test(a.playerCode)).slice(0,5) : [];
  } catch { return []; }
}
export function rememberAccount(user: User, recoveryCode?: string): KnownAccount[] {
  const list=knownAccountsList(),previous=list.find(a=>a.id===user.id);
  if (!user.playerCode) return list;
  const secret=recoveryCode ?? previous?.recoveryCode;
  const next=[{id:user.id,nickname:user.nickname,playerCode:user.playerCode,lastSeen:Date.now(),...(secret?{recoveryCode:secret}:{})},...list.filter(a=>a.id!==user.id && a.playerCode!==user.playerCode)].slice(0,5);
  try { localStorage.setItem(key,JSON.stringify(next)); } catch { /* The current authenticated session remains usable. */ }
  return next;
}
