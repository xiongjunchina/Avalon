import { assetUrl } from './deployment';
import { useState } from 'react';
import type { FemaleDemon, LoyalGuardian, Role } from '@avalon/contracts';
import { Emblem, roleTeam } from './Heraldry';
import { FEMALE_DEMONS, LOYAL_GUARDIANS, defaultRoleArtPrefix, formatRoleName, roleMottos, roleNames, roleTitles } from './roles';

// Generic artwork is public. Mount a player's portrait only where their role may be revealed.
export function RolePortrait({
  role,
  loyalGuardian,
  femaleDemon,
  size = 'tile',
}: {
  role: Role;
  loyalGuardian?: LoyalGuardian;
  femaleDemon?: FemaleDemon;
  size?: 'card' | 'tile' | 'mini';
}) {
  const [failedRole, setFailedRole] = useState<string | null>(null);
  const large = size === 'card';
  const guardian = role === 'loyal' && loyalGuardian ? LOYAL_GUARDIANS[loyalGuardian] : undefined;
  const demon = role === 'minion' ? FEMALE_DEMONS[femaleDemon || 'yutu'] : undefined;
  const artKey = guardian ? guardian.artPrefix : demon ? demon.artPrefix : defaultRoleArtPrefix(role);
  const labelName = guardian ? guardian.fullName : demon ? demon.fullName : roleNames[role];
  return (
    <span
      className={`role-portrait portrait-${size} allegiance-${roleTeam(role)}`}
      role="img"
      aria-label={`${labelName}角色图案`}
    >
      <Emblem kind={role} />
      {failedRole !== artKey && (
        <img
          src={assetUrl(`/art/roles/${artKey}-160.webp?v=audit1`)}
          srcSet={`${assetUrl(`/art/roles/${artKey}-160.webp?v=audit1`)} 160w, ${assetUrl(`/art/roles/${artKey}-640.webp?v=audit1`)} 640w`}
          sizes={
            size === 'mini'
              ? '48px'
              : large
                ? '(max-width: 440px) 228px, 268px'
                : '(max-width: 440px) 132px, 180px'
          }
          width={640}
          height={640}
          alt=""
          loading={large ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedRole(artKey)}
        />
      )}
    </span>
  );
}

export function IdentityCard({
  role,
  loyalGuardian,
  femaleDemon,
  onInspect,
}: {
  role: Role;
  loyalGuardian?: LoyalGuardian;
  femaleDemon?: FemaleDemon;
  onInspect?: () => void;
}) {
  const team = roleTeam(role);
  const guardian = role === 'loyal' && loyalGuardian ? LOYAL_GUARDIANS[loyalGuardian] : undefined;
  const demon = role === 'minion' ? FEMALE_DEMONS[femaleDemon || 'yutu'] : undefined;
  const title = guardian ? guardian.title : demon ? demon.title : roleTitles[role];
  const motto = guardian ? guardian.motto : demon ? demon.motto : roleMottos[role];
  return (
    <figure
      className={`identity-card allegiance-${team} ${onInspect ? 'is-interactive' : ''}`}
      onClick={onInspect}
      role={onInspect ? 'button' : undefined}
      tabIndex={onInspect ? 0 : undefined}
      onKeyDown={onInspect ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInspect(); } } : undefined}
      title={onInspect ? '点击赏析此法相高清立绘大图' : undefined}
    >
      <RolePortrait role={role} loyalGuardian={loyalGuardian} femaleDemon={femaleDemon} size="card" />
      <figcaption>
        <span className="identity-team">
          <Emblem kind={team} />
          {team === 'blue' ? '蓝方 · 取经正果' : '红方 · 群妖乱道'} ·{' '}
          {title}
        </span>
        <h3>{formatRoleName(role, loyalGuardian, femaleDemon)}</h3>
        <p>{motto}</p>
        {onInspect && <span className="identity-inspect-hint">🔍 点击赏析高清大图</span>}
      </figcaption>
    </figure>
  );
}
