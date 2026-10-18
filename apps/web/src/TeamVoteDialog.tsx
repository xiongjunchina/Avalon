import { useEffect, useState } from 'react';
import type { Command, GameView, Player, TeamBallot } from '@avalon/contracts';
import { Modal } from './Modal';
import { PlayerToken } from './PlayerToken';

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
  return <Modal label="组队投票" scene="sword" onClose={onClose}>
    <section className="table-modal-sheet team-vote-sheet">
      <header className="table-modal-head"><strong>取经组队表决</strong><button className="secondary tool-pill a2-lacquer-pill" onClick={onClose}>返回牌桌</button></header>
      <p className="vote-rule">准行多于封驳即准予出征；旁观不计入比较，平票视为流局。</p>
      <div className="vote-proposal" aria-label="本次组队方案">{round.team.map(id => {
        const player = players.find(p => p.id === id)!;
        return <PlayerToken key={id} player={player} self={id === userId} />;
      })}</div>
      {submitted ? <p className="vote-submitted" role="status">已落印表决，静候众仙法旨。</p> : <form onSubmit={e => { e.preventDefault(); if (choice !== null) send({type:'teamVote',payload:{approve:choice}}); }}>
        <fieldset disabled={disabled}>
          <legend className="sr-only">选择你的法旨，落印后不可更改</legend>
          <div className="team-vote-choices">
            {([
              { value: true, label: '准行', sub: '赞同出征', icon: '✓', style: 'approve' },
              { value: false, label: '封驳', sub: '异议阻滞', icon: '×', style: 'reject' },
              { value: 'abstain', label: '旁观', sub: '默许中立', icon: '−', style: 'abstain' }
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
          <button type="submit" className="vote-submit btn-dragon-cta" disabled={choice === null}>📜 落印法旨 · 提交表决</button>
        </fieldset>
      </form>}
      <h3>投票进度 <span>{voted.length} / {players.length}</span></h3>
      <div className="live-voters" aria-label="玩家投票状态">{players.map(p => {
        const done = voted.includes(p.id), ballot = !anonymous ? game.teamVote?.ballots?.[p.id] : undefined;
        return <div key={p.id} className={!done && late ? 'awaiting-vote' : ''}>
          <PlayerToken player={p} vote={ballot} self={p.id === userId} />
          {ballot === undefined && <small className={done ? 'voted' : 'pending-vote'}>{done ? '已投票' : '待投票'}</small>}
        </div>;
      })}</div>
      <p className="vote-waiting" role="status">{late && missing.length ? `等待 ${missing.map(p => `${p.seat}号 ${p.nickname}`).join('、')} 投票` : anonymous ? '匿名表决，只公开是否已投，不公开个人选择。' : '公开表决，提交后全员可见个人选择。'}</p>
    </section>
  </Modal>;
}
