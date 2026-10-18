import { useEffect, useState } from 'react';
import type { RoomView } from '@avalon/contracts';
import { Modal } from './Modal';

export function ReadyReminder({room,userId,disabled,onReady}:{room:RoomView;userId:string;disabled:boolean;onReady:()=>void}) {
  const needsReady = room.members.some(m => m.id === userId && !m.ready);
  const isLast = needsReady && room.members.length === room.settings.playerCount && room.members.filter(m => !m.ready).length === 1;
  const [visible,setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    if (!needsReady) return;
    if (isLast) { setVisible(true); return; }
    const timer=setTimeout(()=>setVisible(true),1800);
    return()=>clearTimeout(timer);
  },[room.id,needsReady,isLast]);
  if (!visible || !needsReady) return null;
  return <Modal label="准备提醒" scene="pavilion" onClose={()=>setVisible(false)}>
    <section className="table-modal-sheet ready-reminder"><h2>{isLast?'大家都在等你':'入席后，请点击准备'}</h2>
      <p>{isLast?'其他玩家均已准备，只差你一位。':'确认房间玩法后，请准备好开始本局。'}</p>
      <div className="action-pair"><button className="secondary" onClick={()=>setVisible(false)}>稍后准备</button><button disabled={disabled} onClick={onReady}>我已准备</button></div>
    </section>
  </Modal>;
}
