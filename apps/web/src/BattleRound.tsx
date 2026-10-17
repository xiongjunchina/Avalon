import type { Player, RoundView } from '@avalon/contracts';
import { Emblem } from './Heraldry';
import { PlayerToken } from './PlayerToken';
import { WUYUE_MISSIONS } from './roles';

/** Shared by live mission details, all rounds and historical replays. */
export function BattleRound({ round: r, players, anonymous, userId }: {
  round: RoundView; players: Player[]; anonymous: boolean; userId?: string;
}) {
  const captain = players.find(p => p.id === r.captainId);
  const playerById = (id: string): Player => players.find(p => p.id === id) ?? { id, seat: 0, nickname: '未知成员' };
  // Even if a stale/inconsistent response contains ballots, anonymous rooms never render them.
  const ballots = !anonymous ? r.vote?.ballots : undefined;
  return <article className="battle-round" aria-label={`第${r.number}次提案`}>
    <h3>第 {r.number} 次提案 · {WUYUE_MISSIONS[r.mission - 1]?.title ?? `任务 ${r.mission}`}</h3>
    <section className="battle-section battle-party" aria-label="组队方案">
      <h4><Emblem kind="crown" />组队方案</h4>
      <div className="battle-captain">{captain && <PlayerToken player={captain} captain self={captain.id === userId} />}<p className="battle-captain-meta"><strong>本轮领队</strong><span>{r.direction === 'clockwise' ? '↻ 顺时针' : '↺ 逆时针'}发言</span></p></div>
      <p className="battle-section-label">本次出征队员（{r.team.length}人）</p>
      <div className="battle-party-grid" data-count={r.team.length}>{r.team.map(id => <PlayerToken key={id} player={playerById(id)} self={id === userId} />)}</div>
    </section>
    <section className="battle-section" aria-label="组队表决">
      <h4><Emblem kind="chronicle" />组队表决</h4>
      {r.vote ? <>
        <div className="battle-vote-totals"><span className="approve">✓ {r.vote.approvals} 赞成</span><span className="reject">× {r.vote.rejections} 反对</span><span className="abstain">− {r.vote.abstentions ?? 0} 弃权</span><strong>{r.vote.passed ? '组队通过' : '组队未通过（流局）'}</strong></div>
        {ballots ? <><div className="battle-voters" aria-label="全员公开票型">{players.map(p => <div key={p.id} aria-label={`${p.seat} 号 ${p.nickname}：${ballots[p.id] === true ? '赞成' : ballots[p.id] === false ? '反对' : ballots[p.id] === 'abstain' ? '弃权' : '无票型记录'}`}><PlayerToken player={p} vote={ballots[p.id]} self={p.id === userId} /></div>)}</div><p className="hint">图标表示组队投票，不代表任务出牌。</p></> : <p className="hint">{anonymous ? '匿名组队投票，仅展示总票数。' : '本次未记录个人票型，仅展示总票数。'}</p>}
      </> : <p className="hint">本次表决未完成，不展示未收齐的个人选择。</p>}
    </section>
    {r.result && <section className={`battle-section battle-result ${r.result.passed ? 'is-pass' : 'is-fail'}`} aria-label="任务结算">
      <h4><Emblem kind="cards" />任务结算</h4>
      <strong className="battle-result-title">{r.result.passed ? '✓ 任务成功' : '× 任务失败'}</strong>
      <div className="battle-card-counts"><span><Emblem kind="blue" />成功牌 × {r.result.successes}</span><span><Emblem kind="red" />失败牌 × {r.result.failures}</span></div>
      <p className="hint">任务牌始终匿名，不对应个人。</p>
    </section>}
  </article>;
}

/** Keep every proposal in chronological order; each individual card stays compact. */
export function BattleHistory({ rounds, ...props }: Omit<Parameters<typeof BattleRound>[0], 'round'> & { rounds: RoundView[] }) {
  if (!rounds.length) return <p>尚无提案记录。</p>;
  return <div className="battle-history">
    {rounds.map(round => <BattleRound key={round.number} {...props} round={round} />)}
  </div>;
}
