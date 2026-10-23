import { useEffect, useMemo, useRef, useState } from 'react';
import type { Command, GameView, Player } from '@avalon/contracts';
import { Modal } from './Modal';
import { CloudFlourish, PlayerAvatar } from './Heraldry';

export function remainingGuanyinSeconds(remainingMs: number, elapsedMs: number) {
  return Math.max(0, Math.ceil((remainingMs - elapsedMs) / 1000));
}

export function GuanyinWindowDialog({
  game,
  players,
  userId,
  serverTime,
  disabled,
  send,
  onTick,
  onClose,
}: {
  game: GameView;
  players: Player[];
  userId: string;
  serverTime?: string;
  disabled: boolean;
  send: (action: Pick<Command, 'type' | 'payload'>) => void;
  onTick?: () => void;
  onClose?: () => void;
}) {
  const deadline = game.guanyinEndsAt;
  const isGuanyin = game.self?.role === 'guinevere';
  const round = game.rounds.at(-1);

  const anchor = useMemo(
    () => ({
      received: performance.now(),
      remaining:
        deadline && serverTime
          ? Math.max(0, Date.parse(deadline) - Date.parse(serverTime))
          : 4000,
    }),
    [deadline, serverTime]
  );

  const [, render] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => render(n => n + 1), 100);
    return () => clearInterval(timer);
  }, []);

  const seconds = remainingGuanyinSeconds(anchor.remaining, performance.now() - anchor.received);
  const previousSecond = useRef(seconds);

  useEffect(() => {
    if (seconds > 0 && seconds <= 3 && seconds === previousSecond.current - 1) {
      onTick?.();
    }
    previousSecond.current = seconds;
  }, [seconds, onTick]);

  const [submitting, setSubmitting] = useState(false);

  const teamPlayerIds = round ? round.team : [];
  const candidateIds = teamPlayerIds.filter(id => id !== userId);
  const candidatePlayers = candidateIds
    .map(id => players.find(p => p.id === id)!)
    .filter(Boolean);

  const handlePickTarget = (targetId: string) => {
    if (submitting || disabled) return;
    setSubmitting(true);
    send({
      type: 'useTreasure',
      payload: { action: 'guanyinMirror', targetId },
    });
  };

  const handleSkip = () => {
    if (submitting || disabled) return;
    setSubmitting(true);
    send({
      type: 'useTreasure',
      payload: { action: 'guanyinMirror', skip: true },
    });
  };

  return (
    <Modal label="慈航照妖镜" scene="mirror" onClose={onClose ?? (() => {})}>
      <section className="table-modal-sheet guanyin-window-sheet" aria-live="polite">
        {/* Header */}
        <header className="table-modal-head guanyin-window-head">
          <div className="guanyin-head-title-block">
            <span className="guanyin-head-kicker">
              {isGuanyin ? '✨ 慈航至宝 · 照妖神镜' : '🪞 佛光初现 · 仙魔辨察'}
            </span>
            <strong className="guanyin-head-main-title">
              {isGuanyin ? '辨察出征车队心性' : '观音菩萨正在审视出征车队'}
            </strong>
          </div>
          <div className="guanyin-timer-pill" role="timer" aria-label={`剩余时间 ${seconds} 秒`}>
            <span className="timer-icon" aria-hidden="true">⏱️</span>
            <span className="timer-seconds">{seconds}s</span>
          </div>
        </header>

        {isGuanyin ? (
          /* Guanyin View: Candidates to Inspect or Skip */
          <div className="guanyin-active-view">
            <p className="guanyin-prompt-desc">
              本轮组队表决已通过！你可在 <strong>{seconds} 秒</strong> 内私密照耀车队中 <strong>1 位队员</strong> 的心性纯浊，亦可保留宝镜后续再用。
            </p>

            <div className="guanyin-candidates-title">
              —◇ 点击选择欲辨察的车队仙友 ◇—
            </div>

            <div className="guanyin-candidates-grid">
              {candidatePlayers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={submitting || disabled}
                  className="guanyin-candidate-card"
                  onClick={() => handlePickTarget(p.id)}
                >
                  <div className="guanyin-candidate-avatar">
                    <PlayerAvatar avatar={p.avatar} wechatAvatarUrl={p.wechatAvatarUrl} />
                    <span className="guanyin-seat-badge">{p.seat}号</span>
                  </div>
                  <div className="guanyin-candidate-info">
                    <strong className="guanyin-candidate-name">{p.nickname}</strong>
                    <span className="guanyin-candidate-action">🪞 照耀此仙心性</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="guanyin-actions-bar">
              <button
                type="button"
                disabled={submitting || disabled}
                className="btn-guanyin-skip"
                onClick={handleSkip}
              >
                暂不发动 · 保留宝镜
              </button>
            </div>

            <p className="guanyin-rule-footnote">
              ※ 超时自动保留宝镜，后续轮次仍可使用。照耀心性纯属观音私密心证，绝不公开。
            </p>
          </div>
        ) : (
          /* Non-Guanyin View: Neutral, Unrevealing Countdown Window */
          <div className="guanyin-waiting-view">
            <div className="guanyin-waiting-aura" aria-hidden="true">
              <span className="aura-mirror-icon">🪞</span>
              <span className="aura-halo">✨</span>
            </div>

            <p className="guanyin-waiting-headline">
              车队表决已准行，天机流转，佛光微显。
            </p>
            <p className="guanyin-waiting-detail">
              观音菩萨正在审视出征车队（{seconds}s），稍后即将开启取经出难试炼…
            </p>

            <div className="guanyin-lineup-preview">
              <span className="lineup-label">本轮出征车队：</span>
              <span className="lineup-members">
                {teamPlayerIds
                  .map(id => {
                    const p = players.find(x => x.id === id);
                    return p ? `${p.seat}号 ${p.nickname}` : '';
                  })
                  .filter(Boolean)
                  .join('、')}
              </span>
            </div>

            <div className="guanyin-progress-track">
              <div
                className="guanyin-progress-bar"
                style={{ width: `${Math.min(100, Math.max(0, (seconds / 4) * 100))}%` }}
              />
            </div>

            <p className="guanyin-rule-footnote">
              ※ 照妖宝镜仅限观音菩萨私密心证，不公开结果，不影响任务出牌，亦不会暴露仙友身份。
            </p>
          </div>
        )}
      </section>
    </Modal>
  );
}
