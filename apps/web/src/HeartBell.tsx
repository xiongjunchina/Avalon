import { useState } from 'react';
import type { Command, GameView, HeartBellMessage, Player, SelfTreasures } from '@avalon/contracts';
import { Modal } from './Modal';

export const heartBellAdviceLabel = (advice: HeartBellMessage['advice']) => advice === 'protect' ? '建议护经' : '建议作祟';
export function heartBellNoticeKey(game: GameView, userId: string) {
  return game.self?.treasures?.enabled && game.self.treasures.incomingHeartBell
    ? `avalon:heart-bell-read:${game.id}:${userId}` : null;
}

export function HeartBellMessageCard({ message, sent = false }: { message: HeartBellMessage; sent?: boolean }) {
  return <section className="heart-bell-message" aria-label="同心铃私密建议">
    <p>第 {message.mission} 难 · 第 {message.roundNumber} 次组队</p>
    <strong>{heartBellAdviceLabel(message.advice)}</strong>
    <p>{message.active ? sent ? '已私密送达；对方自行决定如何出牌。' : '一位已相认同伙发来的建议，如何出牌由你决定。' : '此传音已过出牌时机，仅供回看。'}</p>
  </section>;
}

export function HeartBellDialog({ message, onClose }: { message: HeartBellMessage; onClose: () => void }) {
  return <Modal label="同心铃 · 私密传音" scene="mirror" sound={false} onClose={onClose}>
    <section className="table-modal-sheet heart-bell-sheet">
      <header className="table-modal-head"><strong>同心铃 · 私密传音</strong><span>仅你可见</span></header>
      <HeartBellMessageCard message={message} />
      <p className="hint">无需回复，不改变任何出牌。其他玩家正常继续对局。</p>
      <button type="button" className="treasure-confirm-btn" onClick={onClose}>已阅，返回对局</button>
      <small>可从对局页「法宝」回看</small>
    </section>
  </Modal>;
}

export function HeartBellControls({ bell, players, disabled, send }: {
  bell: SelfTreasures['heartBell']; players: Player[]; disabled: boolean;
  send: (action: Pick<Command, 'type' | 'payload'>) => void;
}) {
  const [targetId, setTargetId] = useState('');
  const canSend = !disabled && bell?.available && bell.targetIds.includes(targetId);
  const target = players.find(p => p.id === bell?.sent?.targetId);
  return <div className="treasure-card minion-card heart-bell-controls">
    <div className="treasure-card-header"><span className="treasure-badge">妖仙传音</span><h3>同心铃</h3></div>
    <p className="treasure-desc">整局一次。仅限一张失败牌即失败的任务，向同车且已相认的一名同伙传递建议，双方都须尚未出牌。牛魔王不参与相认。</p>
    {bell?.sent ? <>
      <p className="heart-bell-sent" role="status">已传给 {target ? `${target.seat}号 · ${target.nickname}` : '所选同伙'} · 本局已使用</p>
      <HeartBellMessageCard message={bell.sent} sent />
    </> : <div className="treasure-action-box">
      <label htmlFor="heart-bell-target">选择同车同伙</label>
      <select id="heart-bell-target" value={bell?.targetIds.includes(targetId) ? targetId : ''} disabled={disabled || !bell?.available} onChange={e => setTargetId(e.target.value)}>
        <option value="">{bell?.available ? '请选择一位同伙' : '当前没有可传音的同伙'}</option>
        {players.filter(p => bell?.targetIds.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.seat}号 · {p.nickname}</option>)}
      </select>
      <div className="heart-bell-actions">
        {(['protect', 'sabotage'] as const).map(advice => <button type="button" className="treasure-confirm-btn" key={advice} disabled={!canSend}
          onClick={() => { if (canSend) send({ type: 'useTreasure', payload: { action: 'heartBell', targetId, advice } }); }}>
          {heartBellAdviceLabel(advice)}
        </button>)}
      </div>
      <p className="hint">点击即发送并消耗本局次数。只能发送固定建议，不能指定对方实际出牌。</p>
      {!bell?.available && <p className="hint">需已进入出牌阶段、你与已相认同伙同车且双方未出牌；两张失败牌才失败的轮次不可用。</p>}
    </div>}
  </div>;
}
