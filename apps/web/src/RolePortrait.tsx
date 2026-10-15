import { useState } from 'react';
import type { Role } from '@avalon/contracts';
import { Emblem, roleTeam } from './Heraldry';
import { roleMottos, roleNames } from './roles';

// Generic artwork is public. Mount a player's portrait only where their role may be revealed.
export function RolePortrait({role,size='tile'}:{role:Role;size?:'card'|'tile'|'mini'}) {
  const [failedRole,setFailedRole]=useState<Role|null>(null);
  const large=size==='card';
  return <span className={`role-portrait portrait-${size} allegiance-${roleTeam(role)}`} role="img" aria-label={`${roleNames[role]}角色图案`}>
    <Emblem kind={role}/>
    {failedRole!==role&&<img src={`/art/roles/${role}-160.webp`}
      srcSet={`/art/roles/${role}-160.webp 160w, /art/roles/${role}-640.webp 640w`}
      sizes={size==='mini'?'48px':large?'(max-width: 440px) 228px, 268px':'(max-width: 440px) 132px, 180px'}
      width={640} height={640} alt="" loading={large?'eager':'lazy'} decoding="async"
      onError={()=>setFailedRole(role)}/>} 
  </span>;
}

export function IdentityCard({role}:{role:Role}) {
  const team=roleTeam(role);
  return <figure className={`identity-card allegiance-${team}`}>
    <RolePortrait role={role} size="card"/>
    <figcaption><span className="identity-team"><Emblem kind={team}/>{team==='blue'?'蓝方阵营':'红方阵营'}</span>
      <h3>{roleNames[role]}</h3><p>{roleMottos[role]}</p>
    </figcaption>
  </figure>;
}
