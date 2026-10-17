import { useState } from 'react';
import { usePageSound } from './audio-interactions';
import type { Role } from '@avalon/contracts';
import { ROLE_CONFIG, MISSION_SIZES } from '@avalon/game-core';
import { Emblem, roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { WUYUE_MISSIONS, roleNames, roleMottos, roleTitles } from './roles';

export const roleDescriptions:Record<Role,{ability:string;visibility:string;tip:string}>={
  merlin:{ability:'开局火眼金睛看见除黄眉老怪以外的所有红方群妖，包括牛魔王；只知道这些人属于红方，不知道各自的具体角色。',visibility:'唐三藏会同时看见你与六耳猕猴，但无法区分谁是真正的齐天大圣孙悟空。',tip:'以言语暗中指点取经团队赢下西行任务，同时藏好真身。蓝方三次西行任务成功后，仍须躲过红孩儿的三昧真火终局刺杀。'},
  percival:{ability:'开局看见孙悟空和六耳猕猴两位美猴王候选，但不知道谁对应哪个身份；没有额外的红方视野。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'结合发言、组队和表决辨认真正的孙悟空，替大圣挡灾掩护并率领取经人完成西行任务。'},
  guinevere:{ability:'开局听闻两道南海天机（看见两位候选，其中必有一人是假扮佛祖的隐身红方黄眉老怪，另一人是蓝方取经同伴），但不知道谁对应哪个身份。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'在9–12人局中弥补孙悟空看不见黄眉老怪的视野盲区，结合发言与组队锁定真正的小雷音寺假佛黄眉老怪。'},
  loyal:{ability:'只知道自己的取经护法身份（每局从「猪八戒 / 沙悟净 / 白龙 / 金刚」四位护法中随机分配不同法相名称），没有其他初始身份视野。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'凭逻辑观察每次西行组队和表决记录，协助取经团队找出可靠同道，也可在发言中主动掩护孙悟空。'},
  morgana:{ability:'看见除牛魔王以外的红方群妖同伙，但不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'孙悟空能看见你属于红方；唐三藏会把你与孙悟空同时看作大圣候选，无法区分。',tip:'上演“真假美猴王”，用话术假扮孙悟空迷惑唐三藏，乱真惑众、操控组队与表决走向。'},
  assassin:{ability:'看见除牛魔王以外的红方同伙。蓝方完成三次任务后，你喷出三昧真火选择一名玩家刺杀：命中孙悟空则红方获胜，否则蓝方获胜。',visibility:'孙悟空能看见你属于红方；其他可互认的红方只知道你是同伙，不知道你的具体角色。',tip:'冷眼观察谁掌握了火眼金睛全局信息。开启提前刺杀时，完成两个任务后的轮间窗口可私下决定是否提前发难。'},
  mordred:{ability:'【西游典故：原著中弥勒佛座下黄眉童儿下界，假扮如来佛祖设立「小雷音寺」，连孙悟空的火眼金睛也未能识破】开局看见除牛魔王以外的红方同伙，且凭假佛金身不会被孙悟空的开局视野看见。任务可提交成功或失败。',visibility:'除牛魔王外的红方同伙能看见你属于红方；照妖宝镜查验仍能照出你的红方妖气。',tip:'利用孙悟空视野的盲区伪装成取经正果好人骗取信任，伺机混入西行队伍制造失败。'},
  oberon:{ability:'平天大圣独霸一方，属于红方，但孤狼独行——看不见其他红方群妖，红方队友也看不见你。任务可提交成功或失败。',visibility:'孙悟空能看见你属于红方；你不属于其他红方的互认名单。',tip:'通过发言和行动寻找群妖同党线索，搅乱西行取经局势，避免误伤红方队友。'},
  minion:{ability:'群妖巡山骨干，看见除牛魔王以外的红方队友，不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'孙悟空与除牛魔王以外的红方队友都能看见你属于红方。',tip:'争取进入西行取经队伍，配合群妖首领干扰推理、制造取经任务失败。'},
};

const allRoles=Object.keys(roleNames) as Role[];
function composition(roles:Role[]) {
  return [...new Set(roles)].map(role=>`${roleNames[role]}${roles.filter(r=>r===role).length>1?` ×${roles.filter(r=>r===role).length}`:''}`).join('、');
}
export function GuideRules() {
  return <div className="guide-rules">
    <section className="panel"><p className="eyebrow">01 / 佛魔真假对决</p><h2>一念佛魔皆幻相，谁是西行取经人</h2>
      <div className="guide-victories"><div className="allegiance-blue"><h3><Emblem kind="blue"/>蓝方 · 取经正果</h3><p>在西行五难中完成三次取经任务，并护住齐天大圣孙悟空躲过红孩儿的三昧真火刺杀，即可获胜。</p></div>
      <div className="allegiance-red"><h3><Emblem kind="red"/>红方 · 群妖乱道</h3><p>破坏三次西行任务、让流局次数达到五次，或由红孩儿刺杀命中孙悟空，任一条件成立即可获胜。</p></div></div>
      <p className="hint">开启提前刺杀时，红孩儿若刺错目标，蓝方立即获胜。中断对局不计胜负。</p>
    </section>
    <section className="panel"><p className="eyebrow">02 / 西行五难流程</p><h2>从聚义，到证果</h2><ol className="guide-steps">
      <li><details><summary><Emblem kind="cards"/><span>准备与发牌<small>全员准备，倒计时5秒</small></span></summary><p>5–12位玩家入座且全员准备后，由房主点击开始发牌。所有人同步倒计时5秒，结束后各自在手机上私下查看底牌法相（取经护法将在「猪八戒 / 沙悟净 / 白龙 / 金刚」中随机分配专属名号），首任领队（队长）即可开始点将组队。</p><p className="hint">点击开局后设置与席位锁定。刷新或重连继续原局、原身份和原倒计时；不会重新计时或重新洗牌。</p></details></li>
      <li><details><summary><Emblem kind="crown"/><span>领队点将，真假论道<small>预选实时同步，投票前可修改</small></span></summary><p>每局共历 1–5 五场西行劫难（依次为：1·五行揭帖、2·流沙收徒、3·三打白骨、4·真假雷音、5·灵山取经）。队长按本场劫难要求选人（可选自己），并指定顺时针或逆时针发言。众人讨论及总结时仍可调整阵容，预选与修改实时展示给全员；队长点击“总结完毕，锁定阵容并投票”后不可再改。</p></details></li>
      <li><details><summary><Emblem kind="chronicle"/><span>全员表决<small>赞成多于反对即通过</small></span></summary><p>每人提交赞成、反对或弃权，收齐后结算。赞成票多于反对票即通过；弃权不参与比较，平票或全员弃权不通过。未通过记一次流局，换下一位队长重新组队，不推进西行劫难编号。</p></details></li>
      <li><details><summary><Emblem kind="blue"/><span>护法出征执行西行<small>任务出牌始终匿名</small></span></summary><p>只有入选队员提交任务牌。蓝方取经人只能提交成功；红方群妖可以提交成功或失败。任务牌始终匿名，只公布成功、失败的数量。</p><p>通常出现一张失败牌即西行受阻失败。唯独7–12人局的第四难（4·真假雷音），以及9人局、12人局的第三难（3·三打白骨），需要至少两张失败牌才算失败。</p></details></li>
      <li><details><summary><Emblem kind="assassin"/><span>轮换与真火刺杀<small>三次成功后，仍须守护孙悟空</small></span></summary><p>每场任务结束后换下一位队长。三场任务失败立即红方胜；三场任务成功则进入终局刺杀，红方可当面商议，由红孩儿确认刺杀目标。命中孙悟空红方翻盘获胜，否则蓝方取经正果获胜。</p></details></li>
    </ol><p className="hint">投票提交成功后不可修改。断线不代投、不自动判负；重连后可继续。确实无法继续时，可向房主申请中止；房主同意或主动结束后关闭房间，全员返回大厅，不计胜负。</p></section>
    <details className="panel guide-disclosure"><summary>人数、角色与西行五难</summary><div className="guide-configs">
      {Object.entries(ROLE_CONFIG).map(([count,roles])=><article key={count} className="guide-config"><h3>{count} 人局</h3><p><strong>蓝方</strong> {composition(roles.filter(r=>roleTeam(r)==='blue'))}</p><p><strong>红方</strong> {composition(roles.filter(r=>roleTeam(r)==='red'))}</p><p className="hint">西行五难（1–5）出征人数</p><ol aria-label={`${count}人局各任务人数`} className="guide-missions">{MISSION_SIZES[Number(count)].map((size,i)=><li key={i}><span>{WUYUE_MISSIONS[i]?.shortLabel ?? `第${i+1}次`}</span><strong>{size}人</strong></li>)}</ol></article>)}
    </div></details>
    <details className="panel guide-disclosure"><summary>开局前，约定西行规矩</summary><dl className="guide-options">
      <dt>队长顺序</dt><dd>默认按座位循环；也可开局打乱一次，此后整局按该顺序循环。房主与当轮队长是两个概念。</dd>
      <dt>组队投票是否匿名</dt><dd>5–7人默认匿名，8–12人默认公开；房主开局前可修改。公开模式实时显示已提交的赞成、反对或弃权；匿名模式只展示是否已投和最终总票数。任务出牌在两种设置下都始终匿名。</dd>
      <dt>五次流局</dt><dd>默认全局累计，达到五次红方胜；也可只累计当前任务，实际任务结束后清零。一次组队表决未通过计一次流局。</dd>
      <dt>新成员加入</dt><dd>等待时房主可关闭新成员加入，已有成员仍可重连。开局后锁定席位。修改玩法会清除准备状态，切换接纳开关不会。</dd>
    </dl></details>
    <details className="panel guide-disclosure"><summary>照妖宝镜与提前刺杀</summary><p>可选开启，建议7人以上。托塔天王与南海大士赐下照妖宝镜：第2、3、4个实际西行任务结束后，若尚未终局，执镜持有人可查验一名玩家的蓝／红阵营（取经正果或群妖乱道）；不会得知具体角色。</p>
      <ul><li>首位执镜人为首任领队（队长）在座位顺序中的上一位。</li><li>不能查验自己或任何曾经执掌照妖宝镜的玩家。</li><li>查验对象和宝镜交接公开，阵营结果只有本次查验者能在私密身份区域查看并确认。</li><li>被查验者接任下一位照妖宝镜持有人，但不能读取前任的查验结果。</li></ul>
      <h2>提前刺杀</h2><p>可选开启。完成第二个实际任务起，在轮间确认窗口由红孩儿（刺客）私下决定发起或跳过；此后的任务结束或组队流局也可能再出现窗口，流局本身不计实际任务。</p>
      <ul><li>每局最多发起一次。跳过本次窗口不会消耗机会。</li><li>发起后不能撤回，红孩儿必须选人；命中孙悟空红方胜，刺错则立即蓝方胜。</li><li>不能在投票、任务出牌或宝镜查验过程中随时打断。</li><li>其他玩家只看到“轮间确认中”，不会获知谁是红孩儿。</li></ul>
      <p className="notice">判定顺序：先判断终局；未终局时先完成照妖宝镜查验，再进入提前刺杀窗口。三次任务成功走正常刺杀，三次失败或五次流局直接结束。</p>
    </details>
  </div>;
}
export function GuideRoles() {
  return <div className="guide-roles"><p className="hint">这里介绍《西游 · 真假猴王》全部神魔人物的通用规则，不显示本局谁拿到了什么身份。准确角色仅由本人查看，终局才公开。</p>
    {(['blue','red'] as const).map(team=><section key={team} aria-label={`${team==='blue'?'蓝方':'红方'}角色介绍`} className={`guide-faction allegiance-${team}`}>
      <h2><Emblem kind={team}/>{team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道'}</h2>
      <div className="guide-role-grid">{allRoles.filter(r=>roleTeam(r)===team).map(role=><article className={`guide-role allegiance-${team}`} key={role}>
        <div className="guide-role-heading">
          <RolePortrait role={role}/>
          <div className="guide-role-meta">
            <div className="guide-role-badges">
              <span className="guide-role-faction-pill">{team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道'}</span>
              <span className="guide-role-title-pill">{roleTitles[role]}</span>
            </div>
            <h3>{roleNames[role]}{role==='loyal'?'（猪八戒 / 沙悟净 / 白龙 / 金刚）':''}</h3>
            <p className="guide-role-motto">{roleMottos[role]}</p>
          </div>
        </div>
        <dl className="guide-role-dl">
          <div className="guide-role-detail"><dt>能力与视野</dt><dd>{roleDescriptions[role].ability}</dd></div>
          <div className="guide-role-detail"><dt>谁能看见你</dt><dd>{roleDescriptions[role].visibility}</dd></div>
          <div className="guide-role-detail"><dt>玩法提示</dt><dd>{roleDescriptions[role].tip}</dd></div>
        </dl>
      </article>)}</div>
    </section>)}<p className="hint">蓝方所有角色的任务牌都只能选成功；红方所有角色都可以选成功或失败。红方互认仅显示阵营，不揭示队友的具体角色。</p>
  </div>;
}
export function GuidePanel({onBack}:{onBack:()=>void}) {
  const [section,setSection]=useState<'rules'|'roles'>('rules');
  usePageSound(section);
  return <section className="guide"><div className="guide-heading"><div><p className="eyebrow">JOURNEY TO THE WEST / 真假猴王秘卷</p><h1>《西游 · 真假猴王》</h1><p className="muted">一念佛魔皆幻相，谁是西行取经人</p></div><button className="secondary" onClick={onBack}>返回原页面</button></div>
    <nav className="guide-nav" aria-label="说明分类"><button className="secondary" aria-pressed={section==='rules'} onClick={()=>setSection('rules')}>游戏规则</button><button className="secondary" aria-pressed={section==='roles'} onClick={()=>setSection('roles')}>角色介绍</button></nav>
    {section==='rules'?<GuideRules/>:<GuideRoles/>}
  </section>;
}
