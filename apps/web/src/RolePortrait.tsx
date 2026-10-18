import { useState } from 'react';
import type { LoyalGuardian, Role } from '@avalon/contracts';
import { Emblem, roleTeam } from './Heraldry';
import { LOYAL_GUARDIANS, formatRoleName, roleMottos, roleNames, roleTitles } from './roles';

// Generic artwork is public. Mount a player's portrait only where their role may be revealed.
export function RolePortrait({
  role,
  loyalGuardian,
  size = 'tile',
}: {
  role: Role;
  loyalGuardian?: LoyalGuardian;
  size?: 'card' | 'tile' | 'mini';
}) {
  const [failedRole, setFailedRole] = useState<string | null>(null);
  const large = size === 'card';
  const guardian = role === 'loyal' && loyalGuardian ? LOYAL_GUARDIANS[loyalGuardian] : undefined;
  const artKey = guardian ? guardian.artPrefix : role;
  const labelName = guardian ? guardian.fullName : roleNames[role];
  return (
    <span
      className={`role-portrait portrait-${size} allegiance-${roleTeam(role)}`}
      role="img"
      aria-label={`${labelName}角色图案`}
    >
      <Emblem kind={role} />
      {failedRole !== artKey && (
        <img
          src={`/art/roles/${artKey}-160.webp?v=xiyou3`}
          srcSet={`/art/roles/${artKey}-160.webp?v=xiyou3 160w, /art/roles/${artKey}-640.webp?v=xiyou3 640w`}
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
}: {
  role: Role;
  loyalGuardian?: LoyalGuardian;
}) {
  const team = roleTeam(role);
  const guardian = role === 'loyal' && loyalGuardian ? LOYAL_GUARDIANS[loyalGuardian] : undefined;
  return (
    <figure className={`identity-card allegiance-${team}`}>
      <RolePortrait role={role} loyalGuardian={loyalGuardian} size="card" />
      <figcaption>
        <span className="identity-team">
          <Emblem kind={team} />
          {team === 'blue' ? '蓝方 · 取经正果' : '红方 · 群妖乱道'} ·{' '}
          {guardian ? guardian.title : roleTitles[role]}
        </span>
        <h3>{formatRoleName(role, loyalGuardian)}</h3>
        <p>{guardian ? guardian.motto : roleMottos[role]}</p>
      </figcaption>
    </figure>
  );
}
