import { useState } from 'react';
import type { FemaleDemon, LoyalGuardian, Role } from '@avalon/contracts';
import { Emblem, roleTeam } from './Heraldry';
import { FEMALE_DEMONS, LOYAL_GUARDIANS, formatRoleName, roleMottos, roleNames, roleTitles } from './roles';

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
  const demon = role === 'minion' && femaleDemon ? FEMALE_DEMONS[femaleDemon] : undefined;
  const artKey = guardian ? guardian.artPrefix : demon ? demon.artPrefix : role;
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
          src={`/art/roles/${artKey}-160.webp?v=xiyou4`}
          srcSet={`/art/roles/${artKey}-160.webp?v=xiyou4 160w, /art/roles/${artKey}-640.webp?v=xiyou4 640w`}
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
}: {
  role: Role;
  loyalGuardian?: LoyalGuardian;
  femaleDemon?: FemaleDemon;
}) {
  const team = roleTeam(role);
  const guardian = role === 'loyal' && loyalGuardian ? LOYAL_GUARDIANS[loyalGuardian] : undefined;
  const demon = role === 'minion' && femaleDemon ? FEMALE_DEMONS[femaleDemon] : undefined;
  const title = guardian ? guardian.title : demon ? demon.title : roleTitles[role];
  const motto = guardian ? guardian.motto : demon ? demon.motto : roleMottos[role];
  return (
    <figure className={`identity-card allegiance-${team}`}>
      <RolePortrait role={role} loyalGuardian={loyalGuardian} femaleDemon={femaleDemon} size="card" />
      <figcaption>
        <span className="identity-team">
          <Emblem kind={team} />
          {team === 'blue' ? '蓝方 · 取经正果' : '红方 · 群妖乱道'} ·{' '}
          {title}
        </span>
        <h3>{formatRoleName(role, loyalGuardian, femaleDemon)}</h3>
        <p>{motto}</p>
      </figcaption>
    </figure>
  );
}
