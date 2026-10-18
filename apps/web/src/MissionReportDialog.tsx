import type { Player, RoundView } from '@avalon/contracts';
import { failuresRequiredFor } from '@avalon/game-core';
import { Modal } from './Modal';
import { PlayerToken } from './PlayerToken';
import { CloudFlourish, Emblem } from './Heraldry';
import { WUYUE_MISSIONS } from './roles';

export function MissionReportDialog({
  round,
  players,
  anonymous,
  userId,
  onClose,
}: {
  round: RoundView;
  players: Player[];
  anonymous: boolean;
  userId?: string;
  onClose: () => void;
}) {
  const result = round.result;
  if (!result) return null;

  const missionConfig = WUYUE_MISSIONS[round.mission - 1];
  const captain = players.find(p => p.id === round.captainId);
  const twoFailsRequired = failuresRequiredFor(players.length, round.mission) >= 2;
  const ballots = !anonymous ? round.vote?.ballots : undefined;

  return (
    <Modal label={`第 ${round.mission} 难战报通报`} scene={result.passed ? 'dawn' : 'sword'} onClose={onClose}>
      <section className="table-modal-sheet mission-report-sheet">
        {/* Header */}
        <header className="table-modal-head mission-report-head">
          <div className="mission-report-head-title">
            <span className="mission-report-badge">第 {round.mission} 难 · 战报落定</span>
            <strong>{missionConfig?.title ?? `任务 ${round.mission}`}</strong>
          </div>
          <button type="button" className="secondary tool-pill a2-lacquer-pill" onClick={onClose}>
            返回牌桌
          </button>
        </header>

        {/* 1. Hero Result Banner */}
        <div className={`mission-report-hero ${result.passed ? 'is-pass' : 'is-fail'}`}>
          <div className="mission-report-hero-glow" aria-hidden="true" />
          <div className="mission-report-hero-emblem" aria-hidden="true">
            {result.passed ? '🪷' : '🔥'}
          </div>
          <div className="mission-report-hero-content">
            <span className="mission-report-kicker">
              {result.passed ? 'MISSION SUCCESS · 取经护持' : 'MISSION FAILED · 妖孽作祟'}
            </span>
            <h3 className="mission-report-title">
              {result.passed ? '✓ 护经成功 · 此难化解' : '× 妖魔作祟 · 任务失败'}
            </h3>
            <div className="mission-report-card-stats">
              <span className="stat-card stat-success">
                <span className="stat-icon" aria-hidden="true">🪷</span>
                <span className="stat-label">护经牌 (成功)</span>
                <strong className="stat-val">{result.successes} 张</strong>
              </span>
              <span className="stat-card stat-failure">
                <span className="stat-icon" aria-hidden="true">🔥</span>
                <span className="stat-label">作祟牌 (失败)</span>
                <strong className="stat-val">{result.failures} 张</strong>
              </span>
            </div>
            <p className="mission-report-rule-note">
              {twoFailsRequired ? '本难规则：需 2 张及以上失败牌方判定失败' : '本难规则：只要出现 1 张失败牌即判定失败'}
              ，出牌过程始终匿名。
            </p>
          </div>
        </div>

        {/* 2. Team Formation Details (Captain & Members) */}
        <div className="mission-report-section">
          <h4 className="mission-report-section-title">
            <Emblem kind="crown" />
            <span>出征领队与执行阵容</span>
          </h4>
          <div className="mission-report-team-tray">
            {captain && (
              <div className="mission-report-captain-card">
                <div className="report-captain-avatar-wrap">
                  <PlayerToken player={captain} captain self={captain.id === userId} />
                </div>
                <div className="report-captain-meta">
                  <span className="report-meta-tag">本难领队</span>
                  <span className="report-meta-dir">
                    {round.direction === 'clockwise' ? '↻ 顺时针论道' : '↺ 逆时针论道'}
                  </span>
                </div>
              </div>
            )}
            <div className="mission-report-party-members">
              <span className="report-party-label">同行出征仙众（{round.team.length}人）：</span>
              <div className="report-party-grid">
                {round.team.map(id => {
                  const p = players.find(player => player.id === id);
                  return p ? (
                    <div key={id} className="report-party-member-chip">
                      <PlayerToken player={p} self={id === userId} />
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Team Vote Results */}
        {round.vote && (
          <div className="mission-report-section">
            <h4 className="mission-report-section-title">
              <Emblem kind="chronicle" />
              <span>全员组队表决记录</span>
            </h4>
            <div className="mission-report-vote-totals">
              <span className="vote-tag approve">✓ {round.vote.approvals} 准行</span>
              <span className="vote-tag reject">× {round.vote.rejections} 封驳</span>
              <span className="vote-tag abstain">− {round.vote.abstentions ?? 0} 旁观</span>
              <strong className={`vote-conclusion ${round.vote.passed ? 'pass' : 'fail'}`}>
                {round.vote.passed ? '【组队表决通过 · 准予启程】' : '【组队表决未过 · 平票流局】'}
              </strong>
            </div>

            {ballots ? (
              <div className="mission-report-voters-grid" aria-label="全员公开票型">
                {players.map(p => (
                  <div key={p.id} className="report-voter-item">
                    <PlayerToken player={p} vote={ballots[p.id]} self={p.id === userId} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mission-report-anon-hint">
                {anonymous
                  ? '🛡️ 本局开启了「匿名组队表决」，仅展示总票数，不公开个人选票。'
                  : '本次未记录全员公开票型。'}
              </p>
            )}
          </div>
        )}

        {/* 4. Bottom Acknowledge Button */}
        <div className="mission-report-footer">
          <button
            type="button"
            className="btn-primary-cta btn-dragon-cta mission-report-ack-btn"
            onClick={onClose}
          >
            <span className="btn-cloud-flourish left" aria-hidden="true"><CloudFlourish side="left" /></span>
            <span className="btn-cta-text">📜 知道了 · 继续取经</span>
            <span className="btn-cloud-flourish right" aria-hidden="true"><CloudFlourish side="right" /></span>
          </button>
        </div>
      </section>
    </Modal>
  );
}
