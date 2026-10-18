import type { GameView, Player } from '@avalon/contracts';
import { ROLE_CONFIG } from '@avalon/game-core';
import { IdentityCard } from './RolePortrait';
import { PlayerToken } from './PlayerToken';

/** Only the server-projected, private self view is accepted. Never infer other roles. */
export function IdentityDetails({ self, players }: { self: NonNullable<GameView['self']>; players: Player[] }) {
  const candidates = self.merlinCandidates.length ? self.merlinCandidates
    : self.guinevereCandidates?.length ? self.guinevereCandidates : self.evilIds;
  const title = self.merlinCandidates.length ? '两位大圣 · 真假待辨'
    : self.guinevereCandidates?.length ? '两道天机 · 尚待查证'
    : self.role === 'merlin' ? '你火眼金睛识破的群妖' : self.evilIds.length ? '与你相认的同伙群妖' : '取经漫漫 · 静观其变';
  const description = self.merlinCandidates.length ? '一位是真大圣孙悟空，一位是假大圣六耳猕猴，无法分辨对应身份。'
    : self.guinevereCandidates?.length ? '一位是假扮佛祖的黄眉老怪，一位是取经正果同伴，无法分辨对应身份。'
    : self.role === 'merlin' ? (ROLE_CONFIG[players.length]?.includes('mordred') ? '本局含黄眉老怪（假扮如来设小雷音寺），他不在你的火眼金睛视野中；所见成员仅知阵营，不知角色。' : '以上是本局全部群妖成员，仅知阵营，不知具体角色。')
    : self.evilIds.length ? (ROLE_CONFIG[players.length]?.includes('oberon') ? '本局牛魔王独霸一方不参与相认；同伙仅知阵营，不知角色。' : '以上是与你相认的群妖同伙，仅知阵营，不知具体角色。')
    : '没有其他初始身份线索，请从发言与取经战况中判断。';
  return <>
    <IdentityCard role={self.role} loyalGuardian={self.loyalGuardian} femaleDemon={self.femaleDemon} />
    <section className="identity-knowledge" aria-label="你的身份视野">
      <h3>{title}</h3>
      {!!candidates.length && <div className="identity-vision" data-count={candidates.length}>{candidates.map(id => {
        const player = players.find(p => p.id === id);
        return player ? <PlayerToken key={id} player={player} /> : null;
      })}</div>}
      <p>{description}</p>
    </section>
  </>;
}
