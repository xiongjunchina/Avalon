import { useEffect, useMemo, useState } from 'react';
import { Emblem } from './Heraldry';

export function remainingSeconds(remainingMs:number,elapsedMs:number) {
  return Math.max(0,Math.min(5,Math.ceil((remainingMs-elapsedMs)/1000)));
}
export function DealCountdown({deadline,serverTime,connected}:{deadline?:string;serverTime?:string;connected:boolean}) {
  const anchor=useMemo(()=>({received:performance.now(),remaining:deadline&&serverTime?Date.parse(deadline)-Date.parse(serverTime):0}),[deadline,serverTime]);
  const [,render]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>render(n=>n+1),100);return()=>clearInterval(timer);},[]);
  const seconds=remainingSeconds(anchor.remaining,performance.now()-anchor.received);
  return <section className="deal-countdown" aria-label="发牌倒计时">
    <p className="eyebrow">THE DEAL / 命运将启</p>
    <div className="deal-card-back" aria-hidden="true"><Emblem kind="cards"/><strong>{connected&&seconds>0?seconds:'·'}</strong></div>
    <p className="deal-message" role="status" aria-live="polite" aria-atomic="true">{!connected?'连接恢复后继续同步发牌':seconds>0?`${seconds} 秒后揭晓身份`:'正在同步身份牌…'}</p>
    <p className="hint">请拿好自己的手机，避开旁人视线。倒计时结束后，私下翻开身份牌。</p>
  </section>;
}
