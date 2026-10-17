import { useState } from 'react';
import type { Player, Role } from '@avalon/contracts';
import { assignLoyalGuardians } from '@avalon/game-core';
import { Modal } from './Modal';
import { formatRoleName } from './roles';

/** A compact trigger avoids making the whole practice toolbar a large form field. */
export function PracticeSeatPicker({ gameId = 'practice', players, roles, value, onChange }: {
  gameId?: string; players: Player[]; roles: Record<string, Role>; value: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const player = players.find(p => p.id === value);
  const loyalGuardians = assignLoyalGuardians(gameId, players, roles);
  return <>
    <button type="button" className="practice-view-trigger" aria-label="切换试玩视角" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span>视角 · {player?.seat}号</span><span className="practice-view-name">{player?.nickname}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <Modal label="切换试玩视角" scene="sword" onClose={() => setOpen(false)}>
      <section className="table-modal-sheet practice-view-sheet">
        <div className="table-modal-head"><strong>选择演练视角</strong><button className="secondary tool-pill" onClick={() => setOpen(false)}>返回</button></div>
        <div className="practice-view-options">{players.map(p => <button key={p.id} type="button" className="secondary" aria-pressed={p.id === value} data-player-id={p.id} onClick={() => { onChange(p.id); setOpen(false); }}>
          <span>{p.seat}号 · {p.nickname}</span><small>{formatRoleName(roles[p.id], loyalGuardians[p.id])}</small>
        </button>)}</div>
      </section>
    </Modal>}
  </>;
}
