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

// Five Sacred Mountains (五岳会盟) decorative silhouette backdrop for Mission 1-5 medallions.
export function WuYueBackdrop({ mission }: { mission: number }) {
  return (
    <svg
      className="wuyue-bg-svg"
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {mission === 1 ? (
        /* 1·嵩山会盟: Central twin peaks + ancient temple pagoda roof & cloud waves */
        <>
          <path d="M8 86 L30 42 L48 64 L68 32 L92 86 Z" fill="currentColor" opacity="0.22" />
          <path d="M36 34 L50 22 L64 34 M40 34 H60 M44 27 H56" stroke="currentColor" strokeWidth="2.2" opacity="0.45" />
          <path d="M14 76 Q35 68 52 76 T88 74" stroke="currentColor" strokeWidth="1.8" opacity="0.35" />
        </>
      ) : mission === 2 ? (
        /* 2·衡山会盟: Graceful Southern Peaks + flying crane & zither soundwave mist */
        <>
          <path d="M6 86 Q26 38 46 58 Q68 26 94 86 Z" fill="currentColor" opacity="0.22" />
          <path d="M28 30 Q40 20 50 32 Q60 20 72 30" stroke="currentColor" strokeWidth="2" opacity="0.42" />
          <path d="M18 72 C36 64 64 80 84 70" stroke="currentColor" strokeWidth="1.8" opacity="0.38" />
        </>
      ) : mission === 3 ? (
        /* 3·泰山会盟: Majestic Jade Emperor Peak + rising sun & stone steps */
        <>
          <circle cx="50" cy="34" r="15" stroke="currentColor" strokeWidth="2" opacity="0.38" />
          <path d="M6 88 L28 46 L50 26 L72 46 L94 88 Z" fill="currentColor" opacity="0.24" />
          <path d="M44 58 H56 M42 66 H58 M40 74 H60" stroke="currentColor" strokeWidth="2" opacity="0.4" />
        </>
      ) : mission === 4 ? (
        /* 4·恒山会盟: Sheer Northern Cliff + Hanging Temple pavilion silhouette */
        <>
          <path d="M10 88 L26 24 L56 54 L78 30 L92 88 Z" fill="currentColor" opacity="0.22" />
          <path d="M24 44 H44 M28 40 L34 33 L40 40 M28 44 V54 M38 44 V54" stroke="currentColor" strokeWidth="2" opacity="0.45" />
          <path d="M14 76 Q50 66 86 78" stroke="currentColor" strokeWidth="1.8" opacity="0.35" />
        </>
      ) : (
        /* 5·华山会盟: Razor-steep Huashan sword peaks + crossed swords at the summit */
        <>
          <path d="M8 88 L26 36 L44 66 L52 18 L68 62 L82 32 L94 88 Z" fill="currentColor" opacity="0.24" />
          <path d="M36 24 L64 52 M64 24 L36 52" stroke="currentColor" strokeWidth="2.2" opacity="0.45" />
          <path d="M16 78 Q50 68 86 78" stroke="currentColor" strokeWidth="1.8" opacity="0.36" />
        </>
      )}
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
  if (src) {
    return (
      <img
        className={`player-avatar-img ${className}`.trim()}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <Emblem kind={avatar ?? fallbackKind} className={className} />;
}


