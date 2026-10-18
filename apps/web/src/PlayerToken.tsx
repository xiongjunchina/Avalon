import type { Player, TeamBallot } from '@avalon/contracts';
import { CloudFlourish, ImperialDragonCrown, PlayerAvatar } from './Heraldry';

/** Public player identity only. Never pass a secret role to this component. */
export function PlayerToken({ player, captain = false, vote, self = false }: {
  player: Player; captain?: boolean; vote?: TeamBallot; self?: boolean;
}) {
  return <span className={`player-token ${captain ? 'is-captain' : ''}`}>
    <span className="token-portrait">
      <PlayerAvatar avatar={player.avatar} avatarUrl={player.avatarUrl} wechatAvatarUrl={player.wechatAvatarUrl} fallbackKind="cards" />
      {captain && <span className="token-crown"><ImperialDragonCrown /></span>}
      {vote !== undefined && <span className={`token-vote ${vote === 'abstain' ? 'abstain' : vote ? 'approve' : 'reject'}`} aria-label={vote === 'abstain' ? '旁观' : vote ? '准行' : '封驳'}>{vote === 'abstain' ? '−' : vote ? '✓' : '×'}</span>}
    </span>
    <span className="token-caption" title={`${player.seat}号 ${player.nickname}`}><span className="token-seat">{player.seat}号</span> <span>{player.nickname}</span>{self && <small>（你）</small>}</span>
    {vote !== undefined && <span className={`token-vote-caption ${vote === 'abstain' ? 'abstain' : vote ? 'approve' : 'reject'}`}>{vote === 'abstain' ? '旁观' : vote ? '准行' : '封驳'}</span>}
  </span>;
}

export function PartyBanner({
  players,
  captainId,
  team,
  size,
  canRemove,
  onRemove,
  votes,
  statusText,
}: {
  players: Player[];
  captainId: string;
  team: string[];
  size: number;
  canRemove: boolean;
  onRemove: (id: string) => void;
  votes?: Record<string, { label: string; icon: string; className: string; text?: string }>;
  statusText?: string;
}) {
  const captain = players.find(p => p.id === captainId);
  const displayStatus = statusText ?? '正在点将';

  return (
    <section className="a2-draft-altar party-banner party-banner-two-tier" aria-label="领队点将与取经队伍">
      {/* 1. Scheme A-2 Ornate Red-Gold Banner with Auspicious Cloud Wings */}
      <div className="a2-altar-header">
        <span className="a2-header-cloud left" aria-hidden="true"><CloudFlourish side="left" /></span>
        <h3 className="a2-altar-title">
          领队 <strong>{captain?.nickname ?? '待定'}</strong> · {displayStatus} ({team.length}/{size})
        </h3>
        <span className="a2-header-cloud right" aria-hidden="true"><CloudFlourish side="right" /></span>
      </div>

      {/* 2. Scheme A-2 Dual-Column Body: Captain Throne on Left, Formation Slots on Right */}
      <div className="a2-altar-body">
        {/* Left Column: Imperial Captain Throne (领队神座) */}
        <div className="a2-captain-throne">
          <div className="a2-throne-crown" aria-hidden="true">
            <ImperialDragonCrown />
          </div>
          <div className="a2-throne-avatar-halo">
            {captain ? (
              <PlayerAvatar
                avatar={captain.avatar}
                avatarUrl={captain.avatarUrl}
                wechatAvatarUrl={captain.wechatAvatarUrl}
                fallbackKind="cards"
              />
            ) : null}
          </div>
          <div className="a2-throne-nameplate">
            <span className="a2-throne-name" title={captain?.nickname ?? '待定'}>
              {captain?.nickname ?? '待定'}
            </span>
            <span className="a2-throne-badge">领队</span>
          </div>
        </div>

        {/* Right Column: Formation Slots Area (取经阵容) */}
        <div className="party-formation">
          <div className="a2-formation-header">
            <span className="a2-filigree-bracket">—◇</span>
            <span className="a2-formation-title">取经阵容 {team.length}/{size}</span>
            <span className="a2-filigree-bracket">◇—</span>
          </div>

          <div className="party-slots" data-size={size}>
            {Array.from({ length: size }, (_, i) => {
              const player = players.find(p => p.id === team[i]);
              const vote = player && votes ? votes[player.id] : undefined;
              return player ? (
                <button
                  type="button"
                  key={player.id}
                  className="party-slot a2-slot-card filled"
                  disabled={!canRemove}
                  onClick={() => onRemove(player.id)}
                  aria-label={`${player.seat}号 ${player.nickname}，已入选${canRemove ? '，点击移出队伍' : ''}`}
                >
                  <div className="a2-slot-avatar-wrap">
                    <PlayerAvatar
                      avatar={player.avatar}
                      avatarUrl={player.avatarUrl}
                      wechatAvatarUrl={player.wechatAvatarUrl}
                      fallbackKind="cards"
                    />
                    {vote && (
                      <span className={`a2-slot-vote-bubble ${vote.className}`} title={vote.text ?? vote.label}>
                        {vote.icon}
                      </span>
                    )}
                  </div>
                  <span className="a2-slot-name-pill" title={`${player.seat}号 ${player.nickname}`}>
                    {player.seat}号 {player.nickname}
                  </span>
                </button>
              ) : (
                <div key={i} className="party-slot a2-slot-card empty" aria-label={`第${i + 1}个出征席位待选`}>
                  <div className="a2-slot-avatar-wrap empty-circle">
                    <span className="a2-empty-lozenge">◇</span>
                  </div>
                  <span className="a2-slot-name-pill empty-pill">
                    待同行
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
