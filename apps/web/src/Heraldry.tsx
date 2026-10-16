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

// Five Sacred Mountains (五岳会盟) golden peak emblem inside the 5 quest circles.
export function WuYueBackdrop({ mission }: { mission: number }) {
  const uniqueId = useId();
  const gold = `wuyue-gold-${uniqueId}`;
  const shadow = `wuyue-shadow-${uniqueId}`;
  const peaks = [
    [[14,76,31,42,44,76],[56,76,69,42,86,76],[28,76,50,23,72,76]],
    [[8,76,26,32,43,76],[49,76,70,27,92,76],[25,76,48,43,71,76]],
    [[11,76,28,50,46,76],[53,76,72,47,89,76],[24,76,49,19,76,76]],
    [[8,76,30,24,49,76],[54,76,73,36,92,76],[27,76,49,30,72,76]],
    [[10,76,27,36,44,76],[56,76,74,28,91,76],[25,76,50,17,74,76]],
  ][(mission - 1) % 5];
  return (
    <svg
      className="wuyue-bg-svg"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="20" x2="0" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff2cf" />
          <stop offset="55%" stopColor="#e5be78" />
          <stop offset="100%" stopColor="#a87b38" />
        </linearGradient>
        <linearGradient id={shadow} x1="0" y1="25" x2="0" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#cfa45c" />
          <stop offset="100%" stopColor="#6e4b1c" />
        </linearGradient>
      </defs>
      {peaks.map(([x,y,tipX,tipY,rightX,rightY],i) => <g key={i}>
        <polygon points={`${x},${y} ${tipX},${tipY} ${rightX},${rightY}`} fill={`url(#${shadow})`} />
        <polygon points={`${x},${y} ${tipX},${tipY} ${tipX - 2},${y}`} fill={`url(#${gold})`} />
      </g>)}
    </svg>
  );
}

export const roleTeam=(role:Role):Team=>['merlin','percival','guinevere','loyal'].includes(role)?'blue':'red';

export const WECHAT_SAMPLE_AVATARS = Array.from(
  { length: 12 },
  (_, i) => `/art/avatars/wx-${i + 1}.webp`
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
  const src = avatarUrl || wechatAvatarUrl || null;
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


