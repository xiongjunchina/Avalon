import { useState } from 'react';
import { usePageSound } from './audio-interactions';
import type { Role } from '@avalon/contracts';
import { ROLE_CONFIG, MISSION_SIZES } from '@avalon/game-core';
import { Emblem, roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { WUYUE_MISSIONS, roleNames, roleMottos, roleTitles } from './roles';

export const roleDescriptions:Record<Role,{ability:string;visibility:string;tip:string}>={
  merlin:{ability:'开局看见除岳不群以外的所有红方成员，包括左冷禅；只知道这些人属于红方，不知道各自的具体角色。',visibility:'令狐冲会同时看见你与东方不败，但无法区分谁是真正的风清扬。',tip:'以言语暗中指点正道同盟赢下会盟任务，同时藏好身份。蓝方三次会盟成功后，仍须躲过林平之的终局刺杀。'},
  percival:{ability:'开局看见风清扬和东方不败两位候选，但不知道谁对应哪个身份；没有额外的红方队友视野。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'结合发言、组队和投票辨认真正的太师叔风清扬，替他挡刀掩护并帮助正道完成会盟任务。'},
  guinevere:{ability:'开局听闻两道江湖密报（看见两位候选，其中必有一人是隐身红方岳不群，另一人是蓝方好人），但不知道谁对应哪个身份。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'在9–12人局中弥补风清扬看不见岳不群的视野盲区，结合发言与组队锁定真正的伪君子岳不群。'},
  loyal:{ability:'只知道自己的正道侠客身份，没有其他初始身份视野。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'凭逻辑观察每次会盟组队和表决记录，协助正道找出可靠同道，也可在发言中主动掩护风清扬。'},
  morgana:{ability:'看见除左冷禅以外的红方队友，但不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'风清扬能看见你属于红方；令狐冲会把你与风清扬同时看作候选，无法区分。',tip:'用话术假扮风清扬迷惑令狐冲，乱真惑众、操控会盟组队与表决走向。'},
  assassin:{ability:'看见除左冷禅以外的红方队友。蓝方完成三次任务后，你亮出辟邪剑选择一名玩家刺杀：命中风清扬则红方获胜，否则蓝方获胜。',visibility:'风清扬能看见你属于红方；其他可互认的红方只知道你是队友，不知道你的具体角色。',tip:'冷眼观察谁掌握了全局信息。开启提前刺杀时，完成两个任务后的轮间窗口可私下决定是否提前亮剑。'},
  mordred:{ability:'看见除左冷禅以外的红方队友，但凭伪君子假面不会被风清扬的开局视野看见。任务可提交成功或失败。',visibility:'除左冷禅外的红方队友能看见你属于红方；冲虚·方证明镜查验仍能识破你的红方阵营。',tip:'利用风清扬视野的盲区伪装成正道君子骗取信任，伺机混入会盟队伍制造失败。'},
  oberon:{ability:'属于红方，但孤狼独行——看不见红方队友，红方队友也看不见你。任务可提交成功或失败。',visibility:'风清扬能看见你属于红方；你不属于其他红方的互认名单。',tip:'通过发言和行动寻找魔教同党线索，搅乱五岳会盟局势，避免误伤红方队友。'},
  minion:{ability:'魔教骨干成员，看见除左冷禅以外的红方队友，不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'风清扬与除左冷禅以外的红方队友都能看见你属于红方。',tip:'争取进入五岳会盟队伍，配合教主干扰推理、制造会盟任务失败。'},
};

const allRoles=Object.keys(roleNames) as Role[];
function composition(roles:Role[]) {
  return [...new Set(roles)].map(role=>`${roleNames[role]}${roles.filter(r=>r===role).length>1?` ×${roles.filter(r=>r===role).length}`:''}`).join('、');
}
export function GuideRules() {
  return <div className="guide-rules">
    <section className="panel"><p className="eyebrow">01 / 江湖正邪对决</p><h2>围桌论剑，谁掌五岳？</h2>
      <div className="guide-victories"><div className="allegiance-blue"><h3><Emblem kind="blue"/>蓝方 · 正道同盟</h3><p>在五岳会盟中完成三次任务，并护住太师叔风清扬躲过林平之最后的刺杀，即可获胜。</p></div>
      <div className="allegiance-red"><h3><Emblem kind="red"/>红方 · 日月暗影</h3><p>破坏三次会盟任务、让流局次数达到五次，或由林平之刺杀命中风清扬，任一条件成立即可获胜。</p></div></div>
      <p className="hint">开启提前刺杀时，林平之若刺错目标，蓝方立即获胜。中断对局不计胜负。</p>
    </section>
    <section className="panel"><p className="eyebrow">02 / 五岳会盟流程</p><h2>从入席，到亮剑</h2><ol className="guide-steps">
      <li><details><summary><Emblem kind="cards"/><span>准备与发牌<small>全员准备，倒计时5秒</small></span></summary><p>5–12位江湖群豪入座且全员准备后，由房主点击开始发牌。所有人同步倒计时5秒，结束后各自在手机上私下查看底牌身份，首任盟主（队长）即可开始点将组队。</p><p className="hint">点击开局后设置与席位锁定。刷新或重连继续原局、原身份和原倒计时；不会重新计时或重新洗牌。</p></details></li>
      <li><details><summary><Emblem kind="crown"/><span>队长组队，围桌论剑<small>选定队伍，依次讨论</small></span></summary><p>每局共设 1–5 五场武林大会（依次为：1·嵩山会盟、2·衡山会盟、3·泰山会盟、4·恒山会盟、5·华山会盟）。队长按本场会盟要求选人（可选自己），并指定顺时针或逆时针发言。众人唇枪舌剑讨论后，队长点击“讨论结束，开始表决”进入投票。</p></details></li>
      <li><details><summary><Emblem kind="chronicle"/><span>全员表决<small>严格超过半数赞成才通过</small></span></summary><p>每人提交赞成或反对，收齐后结算。必须严格超过半数赞成才通过，平票不通过。未通过记一次流局，换下一位队长重新组队，不推进会盟场次编号。</p></details></li>
      <li><details><summary><Emblem kind="blue"/><span>大侠出征执行会盟<small>任务出牌始终匿名</small></span></summary><p>只有入选队员提交任务牌。蓝方正道只能提交成功；红方暗影可以提交成功或失败。任务牌始终匿名，只公布成功、失败的数量。</p><p>通常出现一张失败牌即会盟失败。唯独7–12人局的第四场（4·恒山会盟），以及9人局、12人局的第三场（3·泰山会盟），需要至少两张失败牌才算失败。</p></details></li>
      <li><details><summary><Emblem kind="assassin"/><span>轮换与辟邪刺杀<small>三次成功后，仍须守护风清扬</small></span></summary><p>每场会盟结束后换下一位队长。三场会盟失败立即红方胜；三场会盟成功则进入终局刺杀，红方可当面商议，由林平之确认刺杀目标。命中风清扬红方翻盘获胜，否则蓝方正道获胜。</p></details></li>
    </ol><p className="hint">投票提交成功后不可修改。断线不代投、不自动判负；重连后可继续。确实无法继续时，可由当前在线成员一致同意中断。</p></section>
    <details className="panel guide-disclosure"><summary>人数、角色与五岳会盟</summary><div className="guide-configs">
      {Object.entries(ROLE_CONFIG).map(([count,roles])=><article key={count} className="guide-config"><h3>{count} 人局</h3><p><strong>蓝方</strong> {composition(roles.filter(r=>roleTeam(r)==='blue'))}</p><p><strong>红方</strong> {composition(roles.filter(r=>roleTeam(r)==='red'))}</p><p className="hint">五岳会盟（1–5）出征人数</p><ol aria-label={`${count}人局各任务人数`} className="guide-missions">{MISSION_SIZES[Number(count)].map((size,i)=><li key={i}><span>{WUYUE_MISSIONS[i]?.shortLabel ?? `第${i+1}次`}</span><strong>{size}人</strong></li>)}</ol></article>)}
    </div></details>
    <details className="panel guide-disclosure"><summary>开局前，约定江湖规矩</summary><dl className="guide-options">
      <dt>队长顺序</dt><dd>默认按座位循环；也可开局打乱一次，此后整局按该顺序循环。房主与当轮队长是两个概念。</dd>
      <dt>组队投票是否匿名</dt><dd>默认收齐后公开每人赞反；开启匿名后只显示总票数。任务出牌在两种设置下都始终匿名。</dd>
      <dt>五次流局</dt><dd>默认全局累计，达到五次红方胜；也可只累计当前任务，实际任务结束后清零。一次组队表决未通过计一次流局。</dd>
      <dt>新成员加入</dt><dd>等待时房主可关闭新成员加入，已有成员仍可重连。开局后锁定席位。修改玩法会清除准备状态，切换接纳开关不会。</dd>
    </dl></details>
    <details className="panel guide-disclosure"><summary>少林明镜与提前刺杀</summary><p>可选开启，建议7人以上。武当掌门冲虚道长与少林方丈方证大师执掌武林明镜令：第2、3、4个实际会盟任务结束后，若尚未终局，执令持有人可查验一名玩家的蓝／红阵营（正道或魔教）；不会得知具体角色。</p>
      <ul><li>首位执令人为首任盟主（队长）在座位顺序中的上一位。</li><li>不能查验自己或任何曾经执掌明镜令的玩家。</li><li>查验对象和明镜令交接公开，阵营结果只有本次查验者能在私密身份区域查看并确认。</li><li>被查验者接任下一位明镜令持有人，但不能读取前任的查验结果。</li></ul>
      <h2>提前刺杀</h2><p>可选开启。完成第二个实际任务起，在轮间确认窗口由林平之（刺客）私下决定发起或跳过；此后的任务结束或组队流局也可能再出现窗口，流局本身不计实际任务。</p>
      <ul><li>每局最多发起一次。跳过本次窗口不会消耗机会。</li><li>发起后不能撤回，林平之必须选人；命中风清扬红方胜，刺错则立即蓝方胜。</li><li>不能在投票、任务出牌或明镜查验过程中随时打断。</li><li>其他玩家只看到“轮间确认中”，不会获知谁是林平之。</li></ul>
      <p className="notice">判定顺序：先判断终局；未终局时先完成明镜查验，再进入提前刺杀窗口。三次任务成功走正常刺杀，三次失败或五次流局直接结束。</p>
    </details>
  </div>;
}
export function GuideRoles() {
  return <div className="guide-roles"><p className="hint">这里介绍《论剑》全部江湖人物的通用规则，不显示本局谁拿到了什么身份。准确角色仅由本人查看，终局才公开。</p>
    {(['blue','red'] as const).map(team=><section key={team} aria-label={`${team==='blue'?'蓝方':'红方'}角色介绍`} className={`guide-faction allegiance-${team}`}>
      <h2><Emblem kind={team}/>{team==='blue'?'蓝方 · 正道同盟':'红方 · 日月暗影'}</h2>
      <div className="guide-role-grid">{allRoles.filter(r=>roleTeam(r)===team).map(role=><article className={`guide-role allegiance-${team}`} key={role}>
        <div className="guide-role-heading">
          <RolePortrait role={role}/>
          <div className="guide-role-meta">
            <div className="guide-role-badges">
              <span className="guide-role-faction-pill">{team==='blue'?'蓝方 · 正道同盟':'红方 · 日月暗影'}</span>
              <span className="guide-role-title-pill">{roleTitles[role]}</span>
            </div>
            <h3>{roleNames[role]}</h3>
            <p className="guide-role-motto">{roleMottos[role]}</p>
          </div>
        </div>
        <dl className="guide-role-dl">
          <div className="guide-role-detail"><dt>能力与视野</dt><dd>{roleDescriptions[role].ability}</dd></div>
        </dl>
        <details className="guide-role-more"><summary>谁能看见你 · 玩法提示</summary><p>{roleDescriptions[role].visibility}</p><p>{roleDescriptions[role].tip}</p></details>
      </article>)}</div>
    </section>)}<p className="hint">蓝方所有角色的任务牌都只能选成功；红方所有角色都可以选成功或失败。红方互认仅显示阵营，不揭示队友的具体角色。</p>
  </div>;
}
export function GuidePanel({onBack}:{onBack:()=>void}) {
  const [section,setSection]=useState<'rules'|'roles'>('rules');
  usePageSound(section);
  return <section className="guide"><div className="guide-heading"><div><p className="eyebrow">SWORD OF WORDS / 论剑秘卷</p><h1>《论剑》江湖谱</h1><p className="muted">围桌论剑，辨忠奸，定五岳。</p></div><button className="secondary" onClick={onBack}>返回原页面</button></div>
    <nav className="guide-nav" aria-label="说明分类"><button className="secondary" aria-pressed={section==='rules'} onClick={()=>setSection('rules')}>游戏规则</button><button className="secondary" aria-pressed={section==='roles'} onClick={()=>setSection('roles')}>角色介绍</button></nav>
    {section==='rules'?<GuideRules/>:<GuideRoles/>}
  </section>;
}

