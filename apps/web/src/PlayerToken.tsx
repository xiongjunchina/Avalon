import type { Player } from '@avalon/contracts';
import { Emblem, PlayerAvatar } from './Heraldry';

/** Public player identity only. Never pass a secret role to this component. */
export function PlayerToken({ player, captain = false, vote, self = false }: {
  player: Player; captain?: boolean; vote?: boolean; self?: boolean;
}) {
  return <span className={`player-token ${captain ? 'is-captain' : ''}`}>
    <span className="token-portrait">
      <PlayerAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} wechatAvatarUrl={player.wechatAvatarUrl} fallbackKind="cards" />
      {captain && <span className="token-crown"><Emblem kind="crown" /></span>}
      {vote !== undefined && <span className={`token-vote ${vote ? 'approve' : 'reject'}`} aria-label={vote ? '赞成' : '反对'}>{vote ? '✓' : '×'}</span>}
    </span>
    <span className="token-caption" title={`${player.seat}号 ${player.nickname}`}><span className="token-seat">{player.seat}号</span> <span>{player.nickname}</span>{self && <small>（你）</small>}</span>
    {vote !== undefined && <span className={`token-vote-caption ${vote ? 'approve' : 'reject'}`}>{vote ? '赞成' : '反对'}</span>}
  </span>;
}

export function PartyBanner({ players, captainId, team, size, canRemove, onRemove }: {
  players: Player[]; captainId: string; team: string[]; size: number;
  canRemove: boolean; onRemove: (id: string) => void;
}) {
  const captain = players.find(p => p.id === captainId);
  return <section className="party-banner" aria-label="队长与出征队伍">
    <div className="party-captain">
      {captain && <PlayerToken player={captain} captain />}
      <strong aria-label="盟主，本轮队长">盟主</strong>
    </div>
    <div className="party-formation">
      <p>出征阵容 <span>{team.length} / {size}</span></p>
      <div className="party-slots" data-size={size}>
        {Array.from({ length: size }, (_, i) => {
          const player = players.find(p => p.id === team[i]);
          return player ? <button type="button" key={i} className="party-slot filled" disabled={!canRemove} onClick={() => onRemove(player.id)} aria-label={`${player.seat}号 ${player.nickname}，已入选${canRemove ? '，点击移出队伍' : ''}`}>
            <PlayerToken player={player} />
          </button> : <div key={i} className="party-slot empty" aria-label={`第${i + 1}个出征席位待选`}><span>＋</span><small>待点将</small></div>;
        })}
      </div>
    </div>
  </section>;
}
