import { useState } from 'react';
import type { Role } from '@avalon/contracts';
import { ROLE_CONFIG, MISSION_SIZES } from '@avalon/game-core';
import { Emblem, roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { roleNames, roleMottos } from './roles';

export const roleDescriptions:Record<Role,{ability:string;visibility:string;tip:string}>={
  merlin:{ability:'开局看见除莫德雷德以外的所有红方成员，包括奥伯伦；只知道这些人属于红方，不知道各自的具体角色。',visibility:'派西维尔会同时看见你与莫甘娜，但无法区分谁是梅林。',tip:'用推理引导蓝方完成任务，同时隐藏自己。蓝方三次任务成功后，仍须躲过刺客的刺杀。'},
  percival:{ability:'开局看见梅林和莫甘娜两位候选，但不知道谁对应哪个身份；没有额外的红方队友视野。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'结合发言、组队和投票辨认真正的梅林，保护他并帮助蓝方完成任务。'},
  guinevere:{ability:'开局看见两位候选（其中必有一人是隐身红方莫德雷德，另一人是蓝方好人），但不知道谁对应哪个身份。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'在9–12人局中弥补梅林看不见莫德雷德的视野盲区，结合发言与组队锁定真正的莫德雷德。'},
  loyal:{ability:'只知道自己的身份，没有其他初始身份视野。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'观察队伍和表决记录，协助蓝方找到可靠队友，也可以通过发言掩护梅林。'},
  morgana:{ability:'看见除奥伯伦以外的红方队友，但不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'梅林能看见你属于红方；派西维尔会把你与梅林同时看作候选，无法区分。',tip:'可以假扮梅林迷惑派西维尔，影响组队和判断。'},
  assassin:{ability:'看见除奥伯伦以外的红方队友。蓝方完成三次任务后，你选择一名玩家刺杀：命中梅林则红方获胜，否则蓝方获胜。',visibility:'梅林能看见你属于红方；其他可互认的红方只知道你是队友，不知道你的具体角色。',tip:'观察谁掌握了更多信息。开启提前刺杀时，完成两个任务后的轮间窗口可私下决定是否发起。'},
  mordred:{ability:'看见除奥伯伦以外的红方队友，但不会被梅林的开局视野看见。任务可提交成功或失败。',visibility:'除奥伯伦外的红方队友能看见你属于红方；湖中女神仍能查出你的红方阵营。',tip:'利用梅林视野的盲区取得信任，寻找破坏任务的机会。'},
  oberon:{ability:'属于红方，但看不见红方队友，红方队友也看不见你。任务可提交成功或失败。',visibility:'梅林能看见你属于红方；你不属于其他红方的互认名单。',tip:'通过发言和行动寻找同阵营线索，避免误把队友当作蓝方。'},
  minion:{ability:'普通红方成员，看见除奥伯伦以外的红方队友，不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'梅林与除奥伯伦以外的红方队友都能看见你属于红方。',tip:'争取进入任务队伍，配合红方干扰推理、制造任务失败。'},
};

const allRoles=Object.keys(roleNames) as Role[];
function composition(roles:Role[]) {
  return [...new Set(roles)].map(role=>`${roleNames[role]}${roles.filter(r=>r===role).length>1?` ×${roles.filter(r=>r===role).length}`:''}`).join('、');
}
export function GuideRules() {
  return <div className="guide-rules">
    <section className="panel"><p className="eyebrow">01 / 胜负之约</p><h2>谁能赢下圆桌？</h2>
      <div className="guide-victories"><div className="allegiance-blue"><h3><Emblem kind="blue"/>蓝方阵营</h3><p>完成三次任务，并让梅林躲过最后的刺杀，即可获胜。</p></div>
      <div className="allegiance-red"><h3><Emblem kind="red"/>红方阵营</h3><p>让三个任务失败、让流局次数达到五次，或刺杀命中梅林，任一条件成立即可获胜。</p></div></div>
      <p className="hint">开启提前刺杀时，刺客若刺错，蓝方立即获胜。中断对局不计胜负。</p>
    </section>
    <section className="panel"><p className="eyebrow">02 / 一局如何进行</p><h2>从入席，到揭晓</h2><ol className="guide-steps">
      <li><h3>准备与发牌</h3><p>5–12人入座且全员准备后，由房主点击开始发牌。所有人同步倒计时5秒，结束后各自在手机上私下查看身份，队长即可开始选人组队。</p><p className="hint">点击开局后设置与席位锁定。刷新或重连继续原局、原身份和原倒计时；不会重新计时或重新洗牌。</p></li>
      <li><h3>队长组队，围桌讨论</h3><p>队长按本任务要求选人，可以选择自己，并选择顺时针或逆时针发言。大家面对面讨论，队长点击“讨论结束，开始表决”后进入投票。</p></li>
      <li><h3>全员表决</h3><p>每人提交赞成或反对，收齐后结算。必须严格超过半数赞成才通过，平票不通过。未通过记一次流局，换下一位队长重新组队，不推进任务编号。</p></li>
      <li><h3>队员执行任务</h3><p>只有入选队员提交任务牌。蓝方只能提交成功；红方可以提交成功或失败。任务牌始终匿名，只公布成功、失败的数量。</p><p>通常出现一张失败牌即任务失败。唯独7–12人局的第四个任务，以及9人局、12人局的第三个任务，需要至少两张失败牌才失败。</p></li>
      <li><h3>轮换与刺杀</h3><p>任务结束后换下一位队长。三个任务失败立即红方胜；三个任务成功则进入正常刺杀，红方可面对面讨论，由刺客确认目标。命中梅林红方胜，否则蓝方胜。</p></li>
    </ol><p className="hint">投票提交成功后不可修改。断线不代投、不自动判负；重连后可继续。确实无法继续时，可由当前在线成员一致同意中断。</p></section>
    <section className="panel"><p className="eyebrow">03 / 圆桌配置</p><h2>人数、角色与任务</h2><div className="guide-configs">
      {Object.entries(ROLE_CONFIG).map(([count,roles])=><article key={count} className="guide-config"><h3>{count} 人局</h3><p><strong>蓝方</strong> {composition(roles.filter(r=>roleTeam(r)==='blue'))}</p><p><strong>红方</strong> {composition(roles.filter(r=>roleTeam(r)==='red'))}</p><p className="hint">五次任务所需人数</p><ol aria-label={`${count}人局各任务人数`} className="guide-missions">{MISSION_SIZES[Number(count)].map((size,i)=><li key={i}><span>第{i+1}次</span><strong>{size}人</strong></li>)}</ol></article>)}
    </div></section>
    <section className="panel"><p className="eyebrow">04 / 房主可选规则</p><h2>开局前，约定玩法</h2><dl className="guide-options">
      <dt>队长顺序</dt><dd>默认按座位循环；也可开局打乱一次，此后整局按该顺序循环。房主与游戏队长是两个概念。</dd>
      <dt>组队投票是否匿名</dt><dd>默认收齐后公开每人赞反；开启匿名后只显示总票数。任务出牌在两种设置下都始终匿名。</dd>
      <dt>五次流局</dt><dd>默认全局累计，达到五次红方胜；也可只累计当前任务，实际任务结束后清零。一次组队表决未通过计一次流局。</dd>
      <dt>新成员加入</dt><dd>等待时房主可关闭新成员加入，已有成员仍可重连。开局后锁定席位。修改玩法会清除准备状态，切换接纳开关不会。</dd>
    </dl></section>
    <section className="panel"><p className="eyebrow">05 / 拓展玩法</p><h2>湖中女神</h2><p>可选开启，建议7人以上。第2、3、4个实际任务结束后，若尚未终局，持有人查验一名玩家的蓝／红阵营；不会得知具体角色。</p>
      <ul><li>首位持有人为首任队长在座位顺序中的上一位。</li><li>不能查验自己或任何曾经持有女神的玩家。</li><li>查验对象和交接公开，结果只有本次查验者能在私密身份区域查看并确认。</li><li>被查验者接任下一位持有人，但不能读取前任的查验结果。</li></ul>
      <h2>提前刺杀</h2><p>可选开启。完成第二个实际任务起，在轮间确认窗口由刺客私下决定发起或跳过；此后的任务结束或组队流局也可能再出现窗口，流局本身不计实际任务。</p>
      <ul><li>每局最多发起一次。跳过本次窗口不会消耗机会。</li><li>发起后不能撤回，刺客必须选人；命中梅林红方胜，刺错则立即蓝方胜。</li><li>不能在投票、任务出牌或女神查验过程中随时打断。</li><li>其他玩家只看到“轮间确认中”，不会获知谁是刺客。</li></ul>
      <p className="notice">判定顺序：先判断终局；未终局时先完成女神查验，再进入提前刺杀窗口。三次任务成功走正常刺杀，三次失败或五次流局直接结束。</p>
    </section>
  </div>;
}
export function GuideRoles() {
  return <div className="guide-roles"><p className="hint">这里介绍全部角色的通用规则，不显示本局谁拿到了什么身份。准确角色仅由本人查看，终局才公开。</p>
    {(['blue','red'] as const).map(team=><section key={team} aria-label={`${team==='blue'?'蓝方':'红方'}角色介绍`} className={`guide-faction allegiance-${team}`}>
      <h2><Emblem kind={team}/>{team==='blue'?'蓝方 · 守护圆桌':'红方 · 潜伏暗影'}</h2>
      <div className="guide-role-grid">{allRoles.filter(r=>roleTeam(r)===team).map(role=><article className={`guide-role allegiance-${team}`} key={role}>
        <div className="guide-role-heading"><RolePortrait role={role}/><div><p className="eyebrow">{team==='blue'?'蓝方阵营':'红方阵营'}</p><h3>{roleNames[role]}</h3><p className="hint">{roleMottos[role]}</p></div></div>
        <dl><dt>能力与视野</dt><dd>{roleDescriptions[role].ability}</dd><dt>谁能看见你</dt><dd>{roleDescriptions[role].visibility}</dd><dt>玩法提示</dt><dd>{roleDescriptions[role].tip}</dd></dl>
      </article>)}</div>
    </section>)}<p className="hint">蓝方所有角色的任务牌都只能选成功；红方所有角色都可以选成功或失败。红方互认仅显示阵营，不揭示队友的具体角色。</p>
  </div>;
}
export function GuidePanel({onBack}:{onBack:()=>void}) {
  const [section,setSection]=useState<'rules'|'roles'>('rules');
  return <section className="guide"><div className="guide-heading"><div><p className="eyebrow">THE CODEX / 圆桌手札</p><h1>玩法指南</h1><p className="muted">读懂规则，藏好秘密。</p></div><button className="secondary" onClick={onBack}>返回原页面</button></div>
    <nav className="guide-nav" aria-label="说明分类"><button className="secondary" aria-pressed={section==='rules'} onClick={()=>setSection('rules')}>游戏规则</button><button className="secondary" aria-pressed={section==='roles'} onClick={()=>setSection('roles')}>角色介绍</button></nav>
    {section==='rules'?<GuideRules/>:<GuideRoles/>}
  </section>;
}
