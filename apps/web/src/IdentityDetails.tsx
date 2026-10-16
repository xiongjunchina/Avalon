import type { GameView, Player } from '@avalon/contracts';
import { IdentityCard } from './RolePortrait';
import { PlayerToken } from './PlayerToken';

/** Only the server-projected, private self view is accepted. Never infer other roles. */
export function IdentityDetails({ self, players }: { self: NonNullable<GameView['self']>; players: Player[] }) {
  const candidates = self.merlinCandidates.length ? self.merlinCandidates
    : self.guinevereCandidates?.length ? self.guinevereCandidates : self.evilIds;
  const title = self.merlinCandidates.length ? '两位候选 · 真假待辨'
    : self.guinevereCandidates?.length ? '两道传闻 · 尚待查证'
    : self.role === 'merlin' ? '你看见的暗影成员' : self.evilIds.length ? '与你相认的暗影' : '独行江湖 · 静观其变';
  const description = self.merlinCandidates.length ? '一位是风清扬，一位是东方不败，无法分辨对应身份。'
    : self.guinevereCandidates?.length ? '一位是岳不群，一位是正道同伴，无法分辨对应身份。'
    : self.role === 'merlin' ? '岳不群不在你的视野中；其他人仅知阵营，不知角色。'
    : self.evilIds.length ? '左冷禅不参与相认；队友仅知阵营，不知角色。'
    : '没有其他初始身份线索，请从发言与战况中判断。';
  return <>
    <IdentityCard role={self.role} />
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
