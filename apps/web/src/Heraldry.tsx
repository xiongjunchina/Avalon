import { useId, useState } from 'react';
import type { Avatar, Role, Team } from '@avalon/contracts';

type Mark = Role | Avatar | 'blue' | 'red' | 'crown' | 'cards' | 'chronicle';
// Small, original vector emblems. They carry no game state or hidden role information.
export function Emblem({kind,className=''}:{kind:Mark;className?:string}) {
  return <svg className={`emblem ${className}`} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {(kind==='blue'||kind==='loyal')?<><path d="M32 7 51 15v17c0 12-19 24-19 24S13 44 13 32V15Z"/><path d="M32 16v29M23 29h18M20 19l12-5 12 5"/></>:
      (kind==='red'||kind==='assassin')?<><path d="m39 7 9 9-23 25-8-8Z M36 10l9 9 M12 29l18 18 M21 39 10 50l4 4 11-11 M8 49l7 7"/><path d="m19 10 29 37m-4-5 8 7-4 5-9-9 M12 7l7 3-3 5Z" opacity=".5"/></>:
      kind==='merlin'?<><path d="M21 44 35 9l11 35ZM18 48h31M24 54h19M34 28l4 3-4 4-4-4Z M12 19v8m-4-4h8M47 10v8m-4-4h8"/></>:
      kind==='percival'?<><path d="M7 32s10-14 25-14 25 14 25 14-10 14-25 14S7 32 7 32Z"/><circle cx="32" cy="32" r="8"/><path d="M32 9v4m0 38v4M11 14l4 4m34 28 4 4M11 50l4-4m34-28 4-4"/></>:
      kind==='guinevere'?<><path d="m12 24 10 8 10-16 10 16 10-8-5 22H17Z"/><path d="M17 51h30M24 38h16"/><circle cx="32" cy="12" r="2.5"/></>:
      kind==='morgana'?<><path d="M41 9c-20-1-32 25-13 40 9 7 19 3 24-2-18 2-30-18-11-38Z"/><path d="m46 20 2 6 7 1-6 4 1 7-5-4-6 3 2-7-4-5 7 1Z"/></>:
      kind==='mordred'?<><path d="M16 26 22 10h20l6 16-4 22-12 8-12-8Z M16 26l16 6 16-6M32 32v24M21 36l6 3m10 0 6-3M23 10l9 12 9-12"/></>:
      kind==='oberon'?<><path d="M15 31c2-12 8-20 17-24 9 4 15 12 17 24l6 22H9Z M22 30c1-6 5-10 10-12 5 2 9 6 10 12l-3 14-7 5-7-5Z M26 33h2m8 0h2"/></>:
      kind==='minion'?<><path d="m15 11 21 21m13-21L28 32M10 16l11-11m22 0 11 11M21 26l-9 18 6 8 14-20 14 20 6-8-9-18"/><path d="m12 44 6 8m28 0 6-8"/></>:
      kind==='moon'?<path d="M40 7C14 3 4 39 27 52c13 7 26 0 29-11C32 48 18 23 40 7Z"/>:
      kind==='sun'?<><circle cx="32" cy="32" r="12"/><path d="M32 5v7m0 40v7M5 32h7m40 0h7M13 13l5 5m28 28 5 5M13 51l5-5m28-28 5-5"/></>:
      kind==='mountain'?<><path d="M6 51 29 10l29 41ZM22 24l7 8 6-8M6 56h52"/></>:
      kind==='wave'?<><path d="M7 25c10-17 18 17 28 0s18 0 23 0M7 36c10-17 18 17 28 0s18 0 23 0M7 47c10-17 18 17 28 0s18 0 23 0"/></>:
      kind==='leaf'?<><path d="M14 49C1 25 31 9 52 10c1 26-10 45-38 39Z M10 55l30-31M23 41l-2-11m7 6h12"/></>:
      kind==='star'?<path d="m32 7 6 17 18 1-14 11 4 19-14-10-15 10 5-19L8 25l18-1Z"/>:
      kind==='cards'?<><rect x="22" y="10" width="30" height="44" rx="3"/><path d="m17 13-9 3 8 42 9-2M37 22l7 10-7 10-7-10Z"/></>:
      kind==='chronicle'?<><path d="M16 10h34v44H16c-7 0-7-10 0-10h34M16 10c-7 0-7 10 0 10v24M24 20h18M24 28h18M24 36h10"/></>:
      <><path d="m9 19 12 10L32 12l11 17 12-10-6 29H15ZM16 42h32M16 54h32"/><circle cx="9" cy="15" r="2"/><circle cx="32" cy="8" r="2"/><circle cx="55" cy="15" r="2"/></>}
  </svg>;
}

// Five Journey to the West Quests (西行五难) golden mythic emblems inside the 5 quest circles.
export function WuYueBackdrop({ mission }: { mission: number }) {
  const uniqueId = useId();
  const gold = `wuyue-gold-${uniqueId}`;
  const shadow = `wuyue-shadow-${uniqueId}`;
  const idx = (mission - 1) % 5;
  return (
    <svg
      className="wuyue-bg-svg"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="16" x2="0" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff4d2" />
          <stop offset="55%" stopColor="#eab965" />
          <stop offset="100%" stopColor="#9c6b26" />
        </linearGradient>
        <linearGradient id={shadow} x1="0" y1="22" x2="0" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d4a352" />
          <stop offset="100%" stopColor="#5e3d14" />
        </linearGradient>
      </defs>
      {idx === 0 ? (
        /* 1·五行揭帖: Five-Elements Mountain & Golden Talisman Seal */
        <g>
          <polygon points="14,78 33,44 48,78" fill={`url(#${shadow})`} />
          <polygon points="52,78 68,42 86,78" fill={`url(#${shadow})`} />
          <polygon points="24,78 50,28 76,78" fill={`url(#${shadow})`} />
          <polygon points="24,78 50,28 48,78" fill={`url(#${gold})`} />
          <rect x="44" y="14" width="12" height="19" rx="2" fill={`url(#${gold})`} stroke="#fff5d6" strokeWidth="1.4" />
          <path d="M50 17v13M47 21h6M47 26h6" stroke="#7a4510" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ) : idx === 1 ? (
        /* 2·流沙收徒: Flowing Sand River Waves & Crescent Monk Spade */
        <g>
          <path d="M18 66c10-9 20 9 32 0s22-9 32 0v12H18Z" fill={`url(#${shadow})`} />
          <path d="M14 74c12-8 24 8 36 0s24-8 36 0" stroke={`url(#${gold})`} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M50 20v52" stroke={`url(#${gold})`} strokeWidth="4" strokeLinecap="round" />
          <path d="M36 24c4 10 24 10 28 0-6 4-22 4-28 0Z" fill={`url(#${gold})`} stroke="#fff4d2" strokeWidth="1.5" />
          <circle cx="50" cy="46" r="5" fill={`url(#${gold})`} />
        </g>
      ) : idx === 2 ? (
        /* 3·三打白骨: Golden Warding Circle & Ruyi Jingu Bang */
        <g>
          <circle cx="50" cy="52" r="26" stroke={`url(#${gold})`} strokeWidth="2.6" strokeDasharray="6 4" />
          <circle cx="50" cy="52" r="19" stroke={`url(#${shadow})`} strokeWidth="1.8" />
          <path d="M32 72 68 24" stroke={`url(#${gold})`} strokeWidth="5.5" strokeLinecap="round" />
          <path d="M30 74 36 66M64 32 70 22" stroke="#fff6db" strokeWidth="6.5" strokeLinecap="round" />
        </g>
      ) : idx === 3 ? (
        /* 4·真假雷音: Small Leiyin Pagoda Eaves & Golden Cymbal Halo */
        <g>
          <circle cx="50" cy="46" r="24" stroke={`url(#${shadow})`} strokeWidth="2" />
          <polygon points="22,48 50,24 78,48" fill={`url(#${gold})`} />
          <polygon points="18,62 50,42 82,62" fill={`url(#${shadow})`} />
          <rect x="32" y="60" width="36" height="18" rx="2" fill={`url(#${gold})`} />
          <rect x="45" y="65" width="10" height="13" rx="3" fill="#5e3d14" />
        </g>
      ) : (
        /* 5·灵山取经: Lingshan Sacred Golden Lotus & Radiant Aura */
        <g>
          <circle cx="50" cy="44" r="23" stroke={`url(#${gold})`} strokeWidth="1.8" opacity=".75" />
          <path d="M50 22C42 36 40 50 50 64 60 50 58 36 50 22Z" fill={`url(#${gold})`} />
          <path d="M30 36C28 50 36 60 48 64 40 52 38 42 30 36Z" fill={`url(#${shadow})`} />
          <path d="M70 36C72 50 64 60 52 64 60 52 62 42 70 36Z" fill={`url(#${shadow})`} />
          <path d="M22 68c16 8 40 8 56 0-12 10-44 10-56 0Z" fill={`url(#${gold})`} />
        </g>
      )}
    </svg>
  );
}

export const roleTeam=(role:Role):Team=>['merlin','percival','guinevere','loyal'].includes(role)?'blue':'red';

export const WECHAT_SAMPLE_AVATARS = Array.from(
  { length: 12 },
  (_, i) => `/art/avatars/wx-${i + 1}.webp?v=xiyou2`
);

export function PlayerAvatar({
  avatar,
  avatarUrl,
  wechatAvatarUrl,
  fallbackKind = 'cards',
  className = '',
}: {
  avatar?: Avatar;
  avatarUrl?: string | null;
  wechatAvatarUrl?: string | null;
  fallbackKind?: Mark;
  className?: string;
}) {
  const rawSrc = avatarUrl || wechatAvatarUrl || null;
  const src =
    rawSrc && rawSrc.startsWith('/art/avatars/wx-')
      ? `${rawSrc.split('?')[0]}?v=xiyou2`
      : rawSrc;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && src !== failedSrc) {
    return (
      <img
        className={`player-avatar-img ${className}`.trim()}
        src={src}
        onError={() => setFailedSrc(src)}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <Emblem kind={avatar ?? fallbackKind} className={className} />;
}


