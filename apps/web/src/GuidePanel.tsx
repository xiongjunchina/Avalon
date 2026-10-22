import { useState } from 'react';
import { usePageSound } from './audio-interactions';
import type { FemaleDemon, LoyalGuardian, Role } from '@avalon/contracts';
import { ROLE_CONFIG, MISSION_SIZES } from '@avalon/game-core';
import { Emblem, roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { ALL_GALLERY_ROLES, FEMALE_DEMONS, LOYAL_GUARDIANS, WUYUE_MISSIONS, roleNames, roleMottos, roleTitles } from './roles';
import { RoleViewerModal } from './RoleViewerModal';

export const roleDescriptions:Record<Role,{ability:string;visibility:string;tip:string}>={
  merlin:{ability:'开局火眼金睛看见除黄眉老怪以外的所有红方群妖，包括牛魔王；只知道这些人属于红方，不知道各自的具体角色。',visibility:'唐三藏会同时看见你与六耳猕猴，但无法区分谁是真正的齐天大圣孙悟空。',tip:'以言语暗中指点取经团队赢下取经任务，同时藏好真身。蓝方三次取经任务成功后，仍须躲过红孩儿的三昧真火终局刺杀。'},
  percival:{ability:'开局看见孙悟空和六耳猕猴两位美猴王候选，但不知道谁对应哪个身份；没有额外的红方视野。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'结合发言、组队和表决辨认真正的孙悟空，替大圣挡灾掩护并率领取经人完成取经任务。'},
  guinevere:{ability:'开局听闻两道南海天机（看见两位候选，其中必有一人是假扮佛祖的隐身红方黄眉老怪，另一人是蓝方取经同伴），但不知道谁对应哪个身份。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'在9–12人局中弥补孙悟空看不见黄眉老怪的视野盲区，结合发言与组队锁定真正的小雷音寺假佛黄眉老怪。'},
  loyal:{ability:'只知道自己的取经护法身份（每局从「猪八戒 / 沙悟净 / 白龙 / 金刚」四位护法中随机分配不同法相名称）。若房主开启「护法天机」模式，还将获得专属微弱灵觉线索。任务只能提交成功。',visibility:'你的准确身份不会在开局自动告知其他人。',tip:'凭逻辑观察每次取经组队和表决记录，协助取经团队找出可靠同道，也可在发言中主动掩护孙悟空。'},
  morgana:{ability:'看见除牛魔王以外的红方群妖同伙，但不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'孙悟空能看见你属于红方；唐三藏会把你与孙悟空同时看作大圣候选，无法区分。',tip:'上演“真假美猴王”，用话术假扮孙悟空迷惑唐三藏，乱真惑众、操控组队与表决走向。'},
  assassin:{ability:'看见除牛魔王以外的红方同伙。蓝方完成三次任务后，你喷出三昧真火选择一名玩家刺杀：命中孙悟空则红方获胜，否则蓝方获胜。',visibility:'孙悟空能看见你属于红方；其他可互认的红方只知道你是同伙，不知道你的具体角色。',tip:'冷眼观察谁掌握了火眼金睛全局信息。开启提前刺杀时，完成两个任务后的轮间窗口可私下决定是否提前发难。'},
  mordred:{ability:'【西游典故：原著中弥勒佛座下黄眉童儿下界，假扮如来佛祖设立「小雷音寺」，连孙悟空的火眼金睛也未能识破】开局看见除牛魔王以外的红方同伙，且凭假佛金身不会被孙悟空的开局视野看见。任务可提交成功或失败。',visibility:'除牛魔王外的红方同伙能看见你属于红方；照妖宝镜查验仍能照出你的红方妖气。',tip:'利用孙悟空视野的盲区伪装成取经正果好人骗取信任，伺机混入取经队伍制造失败。'},
  oberon:{ability:'平天大圣独霸一方，属于红方，但孤狼独行——看不见其他红方群妖，红方队友也看不见你。任务可提交成功或失败。',visibility:'孙悟空能看见你属于红方；你不属于其他红方的互认名单。',tip:'通过发言和行动寻找群妖同党线索，搅乱修道取经局势，避免误伤红方队友。'},
  minion:{ability:'深山绝色女妖精（每局从「玉兔精 / 白骨精 / 老鼠精 / 蜘蛛精」四位妖仙中随机分配专属法相），暗藏祸心欲阻西行。看见除牛魔王以外的红方队友，不知道他们各自的具体角色。任务可提交成功或失败。',visibility:'孙悟空与除牛魔王以外的红方队友都能看见你属于红方。',tip:'争取进入取经队伍，以倾城伪装迷惑好人，配合群妖制造取经任务失败。'},
};

export const roleTreasures: Record<Role, string> = {
  merlin: '【无为潜龙】不持任何法宝。刺客红孩儿时刻在暗中窥伺真大圣踪迹，大圣不持法宝、不露锋芒，深藏功名方为保命取经之道。',
  percival: '【九环锡杖】第 2 轮任务结算完成后解锁。可在【真身法相】中私密查验 1 位盲区仙友气息（自动排除自己与开局所见的真假美猴王）。若验到黄眉老怪，因其妖气深敛，仍显现为蓝方。整局限用 1 次。',
  guinevere: '【慈航照妖镜】在某轮组队通过后、执行出牌前使用。私密辨察车上 1 位队员的心性纯浊（纯善/妖邪）。纯属私密心证，绝不改变出牌结果，不公开广播。整局限用 1 次。',
  loyal: '【紧箍信物】当局势陷入大劣势（好人已输 2 轮任务，比分 0:2 或 1:2）时激活。点击可消耗信物向大唐圣僧暗中明示你的护法座次，三藏将私密获知你的座位为绝对铁好人。整局限用 1 次。',
  morgana: '【随心机变】不持专属法宝。六耳猕猴已熟知同伙群妖与大圣虚实，无须额外法宝，以假乱真惑乱圣僧即是至强神通。',
  assassin: '【火尖枪】刺客终局刺杀与提前刺杀的专属神兵。终局或提前刺杀阶段，在【真身法相】或主界面祭起火尖枪选定真大圣发动刺杀。全局通用此入口。',
  mordred: '【后天人种袋】在第 3 轮或第 4 轮队长开始提名前使用。选定场上 1 位仙友收入袋中，该仙友本轮禁止被选入车队出战（当轮队长不可被禁）。整局限用 1 次，用于打破好人抱团车。',
  oberon: '【芭蕉神扇】可在组队与投票期间随时预设【平息 / 聚风待发】。若本次组队投票通过，神扇将立刻掀起狂风吹散车队换下任队长重新组队！绝对不计入 5 次流局上限，全场 0 秒等待无缝判定。整局限用 1 次。',
  minion: '【伺机而动】深山女妖听候大王调遣，本局无专属主动法宝。',
};

const allRoles=Object.keys(roleNames) as Role[];
function composition(roles:Role[]) {
  return [...new Set(roles)].map(role=>`${roleNames[role]}${roles.filter(r=>r===role).length>1?` ×${roles.filter(r=>r===role).length}`:''}`).join('、');
}
export function GuideRules() {
  return <div className="guide-rules">
    <section className="panel guide-section"><p className="eyebrow">01 / 佛魔真假对决</p><h2>一念佛魔皆幻相，谁是修道取经人</h2>
      <div className="guide-victories"><div className="allegiance-blue"><h3><Emblem kind="blue"/>蓝方 · 取经正果</h3><p>在五轮劫难中完成三次取经任务，并护住齐天大圣孙悟空躲过红孩儿的三昧真火刺杀，即可获胜。</p></div>
      <div className="allegiance-red"><h3><Emblem kind="red"/>红方 · 群妖乱道</h3><p>破坏三次取经任务、让流局次数达到五次，或由红孩儿刺杀命中孙悟空，任一条件成立即可获胜。</p></div></div>
      <p className="hint">开启提前刺杀时，红孩儿若刺错目标，蓝方立即获胜。中断对局不计胜负。</p>
    </section>
    <section className="panel guide-section"><p className="eyebrow">02 / 取经五难流程</p><h2>从聚义，到证果</h2><ol className="guide-steps">
      <li className="guide-step-card">
        <div className="guide-step-header">
          <Emblem kind="cards"/>
          <div className="guide-step-title-wrap">
            <strong>准备与发牌</strong>
            <small>全员准备，倒计时5秒</small>
          </div>
        </div>
        <p>5–12位玩家入座且全员准备后，由房主点击开始发牌。所有人同步倒计时5秒，结束后各自在手机上私下查看底牌法相（取经护法与女妖精均会随机分配专属法相名号），首任领队（队长）即可开始点将组队。</p>
        <p className="hint">点击开局后设置与席位锁定。刷新或重连继续原局、原身份和原倒计时；不会重新计时或重新洗牌。</p>
      </li>
      <li className="guide-step-card">
        <div className="guide-step-header">
          <Emblem kind="crown"/>
          <div className="guide-step-title-wrap">
            <strong>领队点将，真假论道</strong>
            <small>预选实时同步，投票前可修改</small>
          </div>
        </div>
        <p>每局共历 1–5 五场修道劫难（依次为：1·五行揭帖、2·流沙收徒、3·三打白骨、4·真假雷音、5·灵山取经）。队长按本场劫难要求选人（可选自己），并指定顺时针或逆时针发言。众人讨论及总结时仍可调整阵容，预选与修改实时展示给全员；队长点击“总结完毕，锁定阵容并投票”后不可再改。</p>
      </li>
      <li className="guide-step-card">
        <div className="guide-step-header">
          <Emblem kind="chronicle"/>
          <div className="guide-step-title-wrap">
            <strong>全员表决</strong>
            <small>赞成多于反对即通过</small>
          </div>
        </div>
        <p>每人提交赞成、反对或弃权，收齐后结算。赞成票多于反对票即通过；弃权不参与比较，平票或全员弃权不通过。未通过记一次流局，换下一位队长重新组队，不推进劫难编号。</p>
      </li>
      <li className="guide-step-card">
        <div className="guide-step-header">
          <Emblem kind="blue"/>
          <div className="guide-step-title-wrap">
            <strong>护法出征执行取经</strong>
            <small>任务出牌始终匿名</small>
          </div>
        </div>
        <p>只有入选队员提交任务牌。蓝方取经人只能提交成功；红方群妖可以提交成功或失败。任务牌始终匿名，只公布成功、失败的数量。</p>
        <p>通常出现一张失败牌即取经受阻失败。唯独7–12人局的第四难（4·真假雷音），以及9人、11人、12人局的第三难（3·三打白骨），需要至少两张失败牌才算失败。</p>
      </li>
      <li className="guide-step-card">
        <div className="guide-step-header">
          <Emblem kind="assassin"/>
          <div className="guide-step-title-wrap">
            <strong>轮换与真火刺杀</strong>
            <small>三次成功后，仍须守护孙悟空</small>
          </div>
        </div>
        <p>每场任务结束后换下一位队长。三场任务失败立即红方胜；三场任务成功则进入终局刺杀，红方可当面商议，由红孩儿确认刺杀目标。命中孙悟空红方翻盘获胜，否则蓝方取经正果获胜。</p>
      </li>
    </ol><p className="hint">投票提交成功后不可修改。断线不代投、不自动判负；重连后可继续。确实无法继续时，可向房主申请中止；房主同意或主动结束后关闭房间，全员返回大厅，不计胜负。</p></section>
    <section className="panel guide-section"><p className="eyebrow">03 / 配置与规模</p><h2>人数、角色与取经五难</h2><div className="guide-configs">
      {Object.entries(ROLE_CONFIG).map(([count,roles])=><article key={count} className="guide-config"><h3>{count} 人局</h3><p><strong>蓝方</strong> {composition(roles.filter(r=>roleTeam(r)==='blue'))}</p><p><strong>红方</strong> {composition(roles.filter(r=>roleTeam(r)==='red'))}</p><p className="hint">取经五难（1–5）出征人数</p><ol aria-label={`${count}人局各任务人数`} className="guide-missions">{MISSION_SIZES[Number(count)].map((size,i)=><li key={i}><span>{WUYUE_MISSIONS[i]?.shortLabel ?? `第${i+1}次`}</span><strong>{size}人</strong></li>)}</ol></article>)}
    </div></section>
    <section className="panel guide-section"><p className="eyebrow">04 / 房主约定</p><h2>开局前，约定取经规矩</h2><dl className="guide-options">
      <dt>队长顺序</dt><dd>默认按座位循环；也可开局打乱一次，此后整局按该顺序循环。房主与当轮队长是两个概念。</dd>
      <dt>组队投票是否匿名</dt><dd>5–7人默认匿名，8–12人默认公开；房主开局前可修改。公开模式实时显示已提交的赞成、反对或弃权；匿名模式只展示是否已投和最终总票数。任务出牌在两种设置下都始终匿名。</dd>
      <dt>五次流局</dt><dd>默认全局累计，达到五次红方胜；也可只累计当前任务，实际任务结束后清零。一次组队表决未通过记一次流局。</dd>
      <dt>新成员加入</dt><dd>等待时房主可关闭新成员加入，已有成员仍可重连。开局后锁定席位。修改玩法会清除准备状态，切换接纳开关不会。</dd>
    </dl></section>
    <section className="panel guide-section"><p className="eyebrow">05 / 宝镜与刺杀</p><h2>照妖宝镜、提前刺杀与护法天机</h2><p>可选开启，建议7人以上。托塔天王与南海大士赐下照妖宝镜：第2、3、4个实际取经任务结束后，若尚未终局，执镜持有人可查验一名玩家的蓝／红阵营（取经正果或群妖乱道）；不会得知具体角色。</p>
      <ul><li>首位执镜人为首任领队（队长）在座位顺序中的上一位。</li><li>不能查验自己或任何曾经执掌照妖宝镜的玩家。</li><li>查验对象和宝镜交接公开，阵营结果只有本次查验者能在私密身份区域查看并确认。</li><li>被查验者接任下一位照妖宝镜持有人，但不能读取前任的查验结果。</li></ul>
      <h3 className="guide-sub-heading">提前刺杀</h3><p>可选开启。完成第二个实际任务起，在轮间确认窗口由红孩儿（刺客）私下决定发起或跳过；此后的任务结束或组队流局也可能再出现窗口，流局本身不计实际任务。</p>
      <ul><li>每局最多发起一次。跳过本次窗口不会消耗机会。</li><li>发起后不能撤回，红孩儿必须选人；命中孙悟空红方胜，刺错则立即蓝方胜。</li><li>不能在投票、任务出牌或宝镜查验过程中随时打断。</li><li>其他玩家只看到“轮间确认中”，不会获知谁是红孩儿。</li></ul>
      <h3 className="guide-sub-heading">护法天机（建议7-12人）</h3><p>可选开启，建议7人以上对局开启。开启后为闭眼的「取经护法」赋予专属微弱灵觉，各显神通：</p>
      <ul>
        <li><strong>猪八戒（八戒巡山）</strong>：探知一名仙友绝非六耳猕猴（假猴王）。</li>
        <li><strong>沙悟净（同修感应）</strong>：感应到另一位亦是取经护法的同修仙友（若无其他护法则感应唯君独守）。</li>
        <li><strong>白龙（龙驹护圣）</strong>：感知两位仙友之中，必有一位是大唐圣僧唐三藏（另一位为红方群妖）。</li>
        <li><strong>金刚（金刚怒目）</strong>：金光察知两位仙友之中，至少潜藏一位混世妖魔（绝不包含齐天大圣孙悟空）。</li>
      </ul>
      <p className="notice">判定顺序：先判断终局；未终局时先完成照妖宝镜查验，再进入提前刺杀窗口。三次任务成功走正常刺杀，三次失败或五次流局直接结束。护法天机线索为私下查验信息，不直接揭示大圣真身，兼顾平衡与乐趣。</p>
    </section>
    <section className="panel guide-section"><p className="eyebrow">06 / 仙家专属法宝</p><h2>9–12人局专属法宝奇谋</h2>
      <p>为解决 9–12 人大型局中好人信息极度匮乏、坏人人数占优（如11人局5红6蓝）的痛点，房主开局前可勾选开启【9–12人专属法宝模式】。所有法宝均在手机底牌【查看身份（真身法相）】内操作，全员全公开透明：</p>
      <ul>
        <li><strong>大唐圣僧 ·【九环锡杖】</strong>：第 2 轮任务完成后，私密查验 1 位盲区仙友气息（排除自己与真假猴王，查验黄眉老怪仍显蓝方）。整局限用 1 次。</li>
        <li><strong>南海观音 ·【慈航照妖镜】</strong>：组队通过后出牌前，私密辨察车上 1 位队员的心性纯浊（纯私密心证，绝不改票）。整局限用 1 次。</li>
        <li><strong>小雷音寺黄眉 ·【后天人种袋】</strong>：第 3/4 轮提名前，禁锢 1 名仙友本轮不可被选入车队（当轮队长不可被禁，打破好人抱团车）。整局限用 1 次。</li>
        <li><strong>取经护法 ·【紧箍信物】</strong>：当好人阵营连续输掉 2 轮任务（0:2 或 1:2 绝境）时激活，可默念佛印向唐三藏单独亮明护法座次。整局限用 1 次。</li>
        <li><strong>平天大圣牛魔王 ·【芭蕉神扇】</strong>：采用预设狂风机制，若投票通过立刻吹散换下任队长，绝对不计入 5 次流局上限，全场 0 延迟。整局限用 1 次。</li>
        <li><strong>圣婴大王红孩儿 ·【火尖枪】</strong>：刺客专属神兵，终局刺杀选定真大圣一击定乾坤。未开启法宝模式时全局亦通用此入口。</li>
        <li><strong>齐天大圣孙悟空 & 假猴王六耳猕猴</strong>：坚决不持任何法宝，潜龙在渊，深藏功名。</li>
      </ul>
      <p className="notice">✦ 战术防坑铁律：所有法宝能力与名称在本规则与仙魔谱中全员公开查阅。公屏背诵法宝规则不能作为自证身份的凭据（坏人亦可假冒法宝发言）；真取经人须凭行事、票型与私密系统显圣综合判断！</p>
    </section>
  </div>;
}
export function GuideRoles() {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const openViewer = (role: Role, guardian?: LoyalGuardian, demon?: FemaleDemon) => {
    let idx = -1;
    if (guardian) {
      idx = ALL_GALLERY_ROLES.findIndex(r => r.role === 'loyal' && r.loyalGuardian === guardian);
    } else if (demon) {
      idx = ALL_GALLERY_ROLES.findIndex(r => r.role === 'minion' && r.femaleDemon === demon);
    } else {
      idx = ALL_GALLERY_ROLES.findIndex(r => r.role === role);
    }
    if (idx !== -1) setViewerIndex(idx);
  };

  return (
    <div className="guide-roles">
      <p className="hint">这里介绍《嘻游 · 真假猴王》全部神魔人物的通用规则，不显示本局谁拿到了什么身份。准确角色仅由本人查看，终局才公开。点击任意法相可鉴赏高清立绘大图。</p>
      {(['blue', 'red'] as const).map(team => (
        <section key={team} aria-label={`${team === 'blue' ? '蓝方' : '红方'}角色介绍`} className={`guide-faction allegiance-${team}`}>
          <h2>
            <Emblem kind={team} />
            {team === 'blue' ? '蓝方 · 取经正果' : '红方 · 群妖乱道'}
          </h2>
          <div className="guide-role-grid">
            {allRoles.filter(r => roleTeam(r) === team).map(role => (
              <article className={`guide-role allegiance-${team}`} key={role}>
                <div
                  className="guide-role-heading guide-role-interactive"
                  onClick={() => openViewer(role)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openViewer(role);
                    }
                  }}
                  title="点击鉴赏此神魔高清立绘大图"
                >
                  <RolePortrait role={role} />
                  <div className="guide-role-meta">
                    <div className="guide-role-badges">
                      <span className="guide-role-faction-pill">{team === 'blue' ? '蓝方 · 取经正果' : '红方 · 群妖乱道'}</span>
                      <span className="guide-role-title-pill">{roleTitles[role]}</span>
                    </div>
                    <h3>
                      {roleNames[role]}
                      {role === 'loyal' ? '（猪八戒 / 沙悟净 / 白龙 / 金刚）' : ''}
                      {role === 'minion' ? '（玉兔精 / 白骨精 / 老鼠精 / 蜘蛛精）' : ''}
                    </h3>
                    <p className="guide-role-motto">{roleMottos[role]}</p>
                    <span className="guide-role-inspect-hint">🔍 点击赏析完整法相大图 ›</span>
                  </div>
                </div>

                <dl className="guide-role-dl">
                  <div className="guide-role-detail"><dt>能力与视野</dt><dd>{roleDescriptions[role].ability}</dd></div>
                  <div className="guide-role-detail"><dt>谁能看见你</dt><dd>{roleDescriptions[role].visibility}</dd></div>
                  <div className="guide-role-detail"><dt>专属法宝</dt><dd>{roleTreasures[role]}</dd></div>
                  <div className="guide-role-detail"><dt>玩法提示</dt><dd>{roleDescriptions[role].tip}</dd></div>
                </dl>

                {/* Sub-gallery for Loyal Guardians */}
                {role === 'loyal' && (
                  <div className="sub-figures-section">
                    <h4 className="sub-figures-title">✦ 四位取经护法使者法相（点击鉴赏高清立绘大图）：</h4>
                    <div className="sub-figures-grid">
                      {Object.values(LOYAL_GUARDIANS).map(g => (
                        <button
                          key={g.key}
                          type="button"
                          className="sub-figure-card allegiance-blue"
                          onClick={() => openViewer('loyal', g.key)}
                          aria-label={`${g.fullName}法相立绘`}
                        >
                          <span className="sub-figure-avatar">
                            <img src={`/art/roles/${g.artPrefix}-160.webp?v=audit1`} alt={g.name} />
                          </span>
                          <span className="sub-figure-title">{g.title}</span>
                          <strong className="sub-figure-name">{g.name}</strong>
                          <span className="sub-figure-zoom">🔍 大图</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-gallery for Female Demons */}
                {role === 'minion' && (
                  <div className="sub-figures-section">
                    <h4 className="sub-figures-title">✦ 四位绝色妖仙法相（点击鉴赏高清立绘大图）：</h4>
                    <div className="sub-figures-grid">
                      {Object.values(FEMALE_DEMONS).map(d => (
                        <button
                          key={d.key}
                          type="button"
                          className="sub-figure-card allegiance-red"
                          onClick={() => openViewer('minion', undefined, d.key)}
                          aria-label={`${d.fullName}法相立绘`}
                        >
                          <span className="sub-figure-avatar">
                            <img src={`/art/roles/${d.artPrefix}-160.webp?v=audit1`} alt={d.name} />
                          </span>
                          <span className="sub-figure-title">{d.title}</span>
                          <strong className="sub-figure-name">{d.name}</strong>
                          <span className="sub-figure-zoom">🔍 大图</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="hint">蓝方所有角色的任务牌都只能选成功；红方所有角色都可以选成功或失败。红方互认仅显示阵营，不揭示队友的具体角色。</p>

      {/* Full Artwork Modal Viewer */}
      <RoleViewerModal
        item={viewerIndex !== null ? ALL_GALLERY_ROLES[viewerIndex] : null}
        onClose={() => setViewerIndex(null)}
        onPrev={() => setViewerIndex(i => (i !== null ? (i - 1 + ALL_GALLERY_ROLES.length) % ALL_GALLERY_ROLES.length : 0))}
        onNext={() => setViewerIndex(i => (i !== null ? (i + 1) % ALL_GALLERY_ROLES.length : 0))}
        currentIndex={viewerIndex ?? undefined}
        totalCount={ALL_GALLERY_ROLES.length}
      />
    </div>
  );
}
export function GuidePanel({onBack}:{onBack:()=>void}) {
  const [section,setSection]=useState<'rules'|'roles'>('rules');
  usePageSound(section);
  return <section className="guide"><div className="guide-heading"><div><p className="eyebrow">JOURNEY TO THE WEST / 真假猴王秘卷</p><h1>《嘻游 · 真假猴王》</h1><p className="muted">一念佛魔皆幻相，谁是修道取经人</p></div><button className="secondary" onClick={onBack}>返回原页面</button></div>
    <nav className="guide-nav" aria-label="说明分类"><button className="secondary" aria-pressed={section==='rules'} onClick={()=>setSection('rules')}>游戏规则</button><button className="secondary" aria-pressed={section==='roles'} onClick={()=>setSection('roles')}>角色介绍</button></nav>
    {section==='rules'?<GuideRules/>:<GuideRoles/>}
  </section>;
}
