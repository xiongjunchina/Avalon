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
      <header className="table-modal-head"><strong>组队表决</strong><button className="secondary tool-pill" onClick={onClose}>查看对局</button></header>
      <p className="vote-rule">赞成多于反对即通过；弃权不参与比较，平票不通过。</p>
      <div className="vote-proposal" aria-label="本次组队方案">{round.team.map(id => {
        const player = players.find(p => p.id === id)!;
        return <PlayerToken key={id} player={player} self={id === userId} />;
      })}</div>
      {submitted ? <p className="vote-submitted" role="status">已提交表决，等待其他玩家。</p> : <form onSubmit={e => { e.preventDefault(); if (choice !== null) send({type:'teamVote',payload:{approve:choice}}); }}>
        <fieldset disabled={disabled}>
          <legend className="sr-only">选择你的表决，确认提交后不可更改</legend>
          <div className="team-vote-choices">{([{value:true,label:'赞成',icon:'✓',style:'approve'}, {value:false,label:'反对',icon:'×',style:'reject'}, {value:'abstain',label:'弃权',icon:'−',style:'abstain'}] as const).map(option => <label key={option.label} className={`vote-option ${option.style} ${choice === option.value ? 'selected' : ''}`}>
            <input type="radio" name="team-ballot" checked={choice === option.value} onChange={() => setChoice(option.value)} /><span aria-hidden="true">{option.icon}</span><strong>{option.label}</strong>
          </label>)}</div>
          <button className="vote-submit" disabled={choice === null}>确认表决</button>
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
