import { useEffect, useState } from 'react';
import type { Command, GameView, Player, TeamBallot } from '@avalon/contracts';
import { Modal } from './Modal';
import { CloudFlourish, ImperialDragonCrown, PlayerAvatar, RuyiSlotFrame } from './Heraldry';
import { WUYUE_MISSIONS } from './roles';

export function TeamVoteDialog({ game, players, anonymous, userId, serverTime, disabled, send, onClose }: {
  game: GameView; players: Player[]; anonymous: boolean; userId: string; serverTime?: string; disabled: boolean;
  send: (action: Pick<Command, 'type' | 'payload'>) => void; onClose: () => void;
}) {
  const [choice, setChoice] = useState<TeamBallot | null>(null);
  const [late, setLate] = useState(false);
  const startedAt = game.teamVote?.startedAt;
  useEffect(() => {
    const elapsed = startedAt && serverTime ? Math.max(0, Date.parse(serverTime) - Date.parse(startedAt)) : 0;
    const timer = setTimeout(() => setLate(true), Math.max(0, 3000 - elapsed));
    return () => clearTimeout(timer);
  }, [startedAt, serverTime]);

  const voted = game.teamVote?.votedIds ?? [];
  const missing = players.filter(p => !voted.includes(p.id));
  const round = game.rounds.at(-1)!;
  const submitted = Boolean(game.self?.teamVoted);
  const captainPlayer = players.find(p => p.id === game.captainId);
  const teamPlayers = round ? round.team.map(id => players.find(p => p.id === id)!).filter(Boolean) : [];
  const missionMeta = WUYUE_MISSIONS[game.mission - 1];
  const [showHistory, setShowHistory] = useState(false);
  const completedRounds = game.rounds.filter(r => r.result);

  return (
    <Modal label="出征组队表决" scene="sword" onClose={onClose}>
      <section className={`table-modal-sheet team-vote-sheet dedicated-vote-sheet vote-flow-sheet ${submitted ? 'is-submitted' : ''}`}>
        {/* Header */}
        <header className="table-modal-head dedicated-vote-head">
          <div className="vote-head-title-block">
            <span className="vote-head-kicker">
              第 {game.mission} 难 · 出征组队表决
            </span>
            <strong className="vote-head-main-title">
              {missionMeta ? missionMeta.subtitle : '取经出征组队表决'}
            </strong>
          </div>
          <button className="secondary tool-pill a2-lacquer-pill" onClick={onClose} aria-label="关闭弹窗返回法坛">
            返回法坛
          </button>
        </header>

        <p className="vote-rule-prompt">
          准行多于封驳即准予出征 · 平票或封驳视为流局
        </p>

        <div className="vote-scroll-body flow-scroll-body">
        {/* 1. 组队结果专区 (Imperial Team Formation Result matching Screenshot 1) */}
        <section className="vote-result-container imperial-expedition-panel" aria-label="本轮出征阵容">
          {/* Captain Banner matching Screenshot 1 Top Bar */}
          <div className="vote-captain-hero imperial-captain-banner">
            <div className="vote-captain-avatar-wrap">
              <span className="vote-crown-icon" aria-hidden="true">
                <ImperialDragonCrown />
              </span>
              <div className="vote-captain-avatar">
                {captainPlayer ? (
                  <PlayerAvatar
                    avatar={captainPlayer.avatar}
                    avatarUrl={captainPlayer.avatarUrl}
                    wechatAvatarUrl={captainPlayer.wechatAvatarUrl}
                    fallbackKind="cards"
                  />
                ) : null}
              </div>
            </div>
            <div className="vote-captain-info">
              <span className="vote-captain-title-text">
                队长：{captainPlayer ? `${captainPlayer.seat}号 ${captainPlayer.nickname}` : '待定'}
                {captainPlayer?.id === userId && <small className="vote-self-tag">（你）</small>}
              </span>
            </div>
          </div>

          {/* Members Slots Section matching Screenshot 1 Ornamental Ruyi Frames */}
          <div className="vote-members-section imperial-slots-section">
            <div className="vote-members-grid" data-count={teamPlayers.length}>
              {teamPlayers.map(p => {
                const isSelf = p.id === userId;
                return (
                  <div
                    key={p.id}
                    className={`vote-member-card imperial-ruyi-card ${isSelf ? 'is-self' : ''}`}
                    title={`${p.seat}号 ${p.nickname}`}
                  >
                    <RuyiSlotFrame isSelf={isSelf} />
                    <div className="vote-member-content">
                      <div className="vote-member-avatar">
                        <PlayerAvatar
                          avatar={p.avatar}
                          avatarUrl={p.avatarUrl}
                          wechatAvatarUrl={p.wechatAvatarUrl}
                          fallbackKind="cards"
                        />
                        <span className="vote-member-seat">{p.seat}号</span>
                      </div>
                      <span className="vote-member-name">
                        {p.nickname}
                        {isSelf && <small className="vote-self-tag">（你）</small>}
                      </span>
                      <span className="vote-member-badge">⚔️ 出征</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        {/* 往难前情折叠抽屉 (Historical Missions Accordion) */}
        {/* 3. 投票进度区 */}
        <div className="vote-progress-panel">
          <div className="vote-progress-head">
            <span>投票进度</span>
            <strong>{voted.length} / {players.length} 人已投</strong>
          </div>
          <div className="live-voters dedicated-voters-list" aria-label="玩家投票状态">
            {players.map(p => {
              const done = voted.includes(p.id);
              const ballot = !anonymous ? game.teamVote?.ballots?.[p.id] : undefined;
              return (
                <div key={p.id} className={`dedicated-voter-chip ${done ? 'is-done' : 'is-pending'} ${!done && late ? 'awaiting-vote' : ''}`}>
                  <span className="voter-chip-seat">{p.seat}号</span>
                  <span className="voter-chip-name">{p.nickname}</span>
                  {ballot !== undefined ? (
                    <span className={`voter-chip-ballot ${ballot === 'abstain' ? 'abstain' : ballot ? 'approve' : 'reject'}`}>
                      {ballot === 'abstain' ? '− 旁观' : ballot ? '✓ 准行' : '× 封驳'}
                    </span>
                  ) : (
                    <span className={`voter-chip-status ${done ? 'done' : 'pending'}`}>
                      {done ? '已落印' : '待落印'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="vote-waiting-footer" role="status">
            {late && missing.length
              ? `等待 ${missing.map(p => `${p.seat}号 ${p.nickname}`).join('、')} 投票`
              : anonymous
                ? '🔒 匿名表决：仅公开落印进度，不公开个人票型'
                : '🔓 公开表决：提交后全员可见票型'}
          </p>
        </div>
        <div className="vote-history-accordion">
          <button
            type="button"
            className="vote-history-toggle"
            onClick={() => setShowHistory(v => !v)}
            aria-expanded={showHistory}
          >
            <span className="history-toggle-title">
              📜 往难功过簿（{completedRounds.length ? `已历 ${completedRounds.length} 难` : '初难暂无记录'}）
            </span>
            <span className="history-toggle-arrow" aria-hidden="true">
              {showHistory ? '▲ 收起' : '▼ 展开参详'}
            </span>
          </button>
          {showHistory && (
            <div className="vote-history-drawer">
              {completedRounds.length === 0 ? (
                <p className="vote-history-empty">此乃西行首难，尚无往难战况记录，凭慧眼明断！</p>
              ) : (
                completedRounds.map(r => {
                  const rMeta = WUYUE_MISSIONS[r.mission - 1];
                  const rCaptain = players.find(p => p.id === r.captainId);
                  const isSuccess = Boolean(r.result?.passed);
                  return (
                    <div key={r.number} className={`vote-history-round-card ${isSuccess ? 'is-pass' : 'is-fail'}`}>
                      <div className="history-card-header">
                        <span className="history-round-badge">
                          第 {r.mission} 难 · {rMeta?.shortLabel ?? `难${r.mission}`}
                        </span>
                        <strong className={`history-round-result ${isSuccess ? 'text-pass' : 'text-fail'}`}>
                          {isSuccess ? '🪷 护经功成' : `🔥 妖魔作祟 (${r.result?.failures ?? 0}张作祟)`}
                        </strong>
                      </div>
                      <div className="history-card-detail">
                        <span className="history-captain-tag">
                          👑 领队：{rCaptain ? `${rCaptain.seat}号 ${rCaptain.nickname}` : '未知'}
                        </span>
                        <span className="history-team-tag">
                          ⚔️ 出征：{r.team.map(id => {
                            const p = players.find(x => x.id === id);
                            return p ? `${p.seat}号${p.nickname}` : id;
                          }).join('、')}
                        </span>
                      </div>
                      {r.vote && (
                        <div className="history-card-votes">
                          <span className="history-votes-count">
                            表决：✓ {r.vote.approvals} 准行 · × {r.vote.rejections} 封驳
                            {r.vote.abstentions ? ` · − ${r.vote.abstentions} 旁观` : ''}
                          </span>
                          {!anonymous && r.vote.ballots && (
                            <div className="history-ballots-row">
                              {players.map(p => {
                                const b = r.vote?.ballots?.[p.id];
                                if (b === undefined) return null;
                                return (
                                  <span key={p.id} className={`history-ballot-chip ${b === 'abstain' ? 'abstain' : b ? 'approve' : 'reject'}`}>
                                    {p.seat}号{b === 'abstain' ? '−' : b ? '✓' : '×'}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        </div>
        <div className="vote-fixed-actions flow-fixed-actions">
        {/* 2. 投票操作区 (Voting Buttons) */}
        {submitted ? (
          <div className="vote-submitted-card" role="status">
            <div className="vote-submitted-icon" aria-hidden="true">📜</div>
            <strong>法旨已落印，静候众仙表决</strong>
            <p>全员完成表决后，将自动揭晓结果并返回法坛</p>
          </div>
        ) : (
          <form
            className="vote-actions-form"
            onSubmit={e => {
              e.preventDefault();
              if (choice !== null) send({ type: 'teamVote', payload: { approve: choice } });
            }}
          >
            <fieldset disabled={disabled} className="vote-choices-fieldset">
              <legend className="sr-only">选择你的法旨，落印后不可更改</legend>
              <div className="team-vote-choices dedicated-choices-grid">
                {([
                  { value: true, label: '准行', sub: '赞同出征', icon: '✓', style: 'approve' },
                  { value: false, label: '封驳', sub: '异议阻滞', icon: '×', style: 'reject' },
                  { value: 'abstain', label: '旁观', sub: '默许中立', icon: '−', style: 'abstain' },
                ] as const).map(option => (
                  <button
                    type="button"
                    key={option.label}
                    className={`vote-option ${option.style} ${choice === option.value ? 'selected' : ''}`}
                    onClick={() => setChoice(option.value)}
                    aria-pressed={choice === option.value}
                  >
                    <span className="vote-option-icon" aria-hidden="true">{option.icon}</span>
                    <strong className="vote-option-title">{option.label}</strong>
                    <small className="vote-option-sub">{option.sub}</small>
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="vote-submit btn-dragon-cta dedicated-submit-btn"
                disabled={choice === null}
              >
                <span className="btn-cloud-flourish left" aria-hidden="true"><CloudFlourish side="left" /></span>
                <span className="btn-cta-text">📜 落印法旨 · 提交表决</span>
                <span className="btn-cloud-flourish right" aria-hidden="true"><CloudFlourish side="right" /></span>
              </button>
            </fieldset>
          </form>
        )}

        </div>
      </section>
    </Modal>
  );
}
