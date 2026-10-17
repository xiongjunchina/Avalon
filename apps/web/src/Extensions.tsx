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
export function PrivateExtensions({game:g,disabled,name,send}:Props) {
  return <>
    {!!g.self?.inspections?.length&&<section className="private-inspections"><h3>我的宝镜查验</h3>{g.self.inspections.map(i=><p key={i.afterMission}>任务 {i.afterMission} 后：{name(i.targetId)} 的阵营是 <strong>{i.team==='blue'?'蓝方':'红方'}</strong>。</p>)}</section>}
    {g.self?.canConfirmInspection&&<button disabled={disabled} onClick={()=>send({type:'confirmInspection',payload:{}})}>我已记住查验结果，继续</button>}
    {g.self?.canDecideEarly&&<section className="early-choice"><h3>提前刺杀 · 已解锁</h3><p>立即进入刺杀：命中孙悟空，群妖胜；刺错，取经人胜。</p><div className="action-pair"><button disabled={disabled} onClick={()=>send({type:'earlyAssassinationDecision',payload:{attempt:true}})}>启用提前刺杀</button></div></section>}
  </>;
}
export function ExtensionStep({game:g,disabled,name,send,selectedTarget,onSelectTarget}:Props) {
  const [internalTarget,setInternalTarget]=useState('');
  const target=selectedTarget!==undefined?selectedTarget:internalTarget;
  const setTarget=onSelectTarget??setInternalTarget;
  if(g.phase==='lady_reveal'){
    const last=g.lady!.inspections.at(-1)!;
    return <div className="extension-step"><p>任务 {last.afterMission} 后，{name(last.inspectorId)} 查验了 {name(last.targetId)}，照妖宝镜已交给后者。</p><p role="status">{g.self?.canConfirmInspection?'请私下打开身份面板，查看阵营结果并确认。':`等待 ${name(last.inspectorId)} 私下查看并确认结果。`}</p></div>;
  }
  if(g.phase!=='lady')return null;
  const lady=g.lady!;
  return <div className="extension-step"><p>任务 {g.mission-1} 已结束。由 <strong>{name(lady.holderId)}</strong> 执掌照妖宝镜。</p><p className="hint">点选未执掌过宝镜的玩家，查验后将宝镜交给对方。</p>
    {g.self?.canInspect?<form onSubmit={e=>{e.preventDefault();if(target)send({type:'inspectAlignment',payload:{targetId:target}});}}><fieldset disabled={disabled}><label htmlFor="lady-target">选择查验对象</label><select id="lady-target" value={target} onChange={e=>setTarget(e.target.value)}><option value="">请点击座位或下拉选择玩家</option>{g.players.filter(p=>!lady.holderIds.includes(p.id)).map(p=><option value={p.id} key={p.id}>{name(p.id)}</option>)}</select><button disabled={!target}>确认查验</button></fieldset></form>:<p role="status">等待照妖宝镜持有人选择查验对象。</p>}
  </div>;
}
export function ExtensionHistory({game:g,name}:Pick<Props,'game'|'name'>) {
  return <>
    {g.lady&&<details className="game-history"><summary>照妖宝镜记录（{g.lady.inspections.length} 次查验）</summary><p>当前执镜人：{name(g.lady.holderId)}</p><p className="hint">执镜顺序：{g.lady.holderIds.map(name).join(' → ')}</p>{g.lady.inspections.map(i=><p key={i.afterMission}>任务 {i.afterMission} 后：{name(i.inspectorId)} 查验 {name(i.targetId)}，并将照妖宝镜交给后者。</p>)}<p className="hint">对局中，查验结果仅对查验者可见；结束后统一公开最终身份。</p></details>}
    {!!g.earlyAssassination?.windows.length&&<details className="game-history"><summary>轮间确认记录（{g.earlyAssassination.windows.length} 次）</summary>{g.earlyAssassination.windows.map((w,i)=><p key={i}>已完成 {w.afterMission} 个任务 · 第 {w.afterProposal} 次提案后：{w.decision==='attempt'?'发起提前刺杀':'本次跳过'}。</p>)}</details>}
  </>;
}
