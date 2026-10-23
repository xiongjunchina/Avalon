import { useState } from 'react';
import type { Command, GameView } from '@avalon/contracts';
type Props = {
  game: GameView;
  disabled: boolean;
  name: (id: string) => string;
  send: (action: Pick<Command,'type'|'payload'>) => void;
  selectedTarget?: string;
  onSelectTarget?: (id: string) => void;
};
// Render these controls only inside the collapsible private identity panel.
export function PrivateExtensions({game:g,disabled,send}:Props) {
  return <>
    {g.self?.canDecideEarly&&<section className="early-choice"><h3>提前刺杀 · 已解锁</h3><p>立即进入刺杀：命中孙悟空，群妖胜；刺错，取经人胜。</p><div className="action-pair"><button disabled={disabled} onClick={()=>send({type:'earlyAssassinationDecision',payload:{attempt:true}})}>启用提前刺杀</button></div></section>}
  </>;
}
export function ExtensionStep() {
  return null;
}
export function ExtensionHistory({game:g}:Pick<Props,'game'|'name'>) {
  return <>
    {!!g.earlyAssassination?.windows.length&&<details className="game-history"><summary>轮间确认记录（{g.earlyAssassination.windows.length} 次）</summary>{g.earlyAssassination.windows.map((w,i)=><p key={i}>已完成 {w.afterMission} 个任务 · 第 {w.afterProposal} 次提案后：{w.decision==='attempt'?'发起提前刺杀':'本次跳过'}。</p>)}</details>}
  </>;
}
