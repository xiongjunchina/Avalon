import { useLayoutEffect, useRef, useState } from 'react';
import { usePageSound } from './audio-interactions';
import type { FemaleDemon, LoyalGuardian, Role } from '@avalon/contracts';
import { ROLE_CONFIG, MISSION_SIZES } from '@avalon/game-core';
import { Emblem, roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { ALL_GALLERY_ROLES, FEMALE_DEMONS, LOYAL_GUARDIANS, WUYUE_MISSIONS, roleNames, roleMottos, roleTitles } from './roles';
import { RoleViewerModal } from './RoleViewerModal';

import { roleDescriptions, roleTreasures } from './role-descriptions';
export { roleDescriptions, roleTreasures };

const allRoles=Object.keys(roleNames) as Role[];
const ruleChapters=['胜负条件','对局流程','人数配置','房主设置','刺杀与天机','专属法宝'];
type GuideSection='rules'|'roles';
function guideChapters(section:GuideSection) {
  return section==='rules'
    ? ruleChapters.map((title,i)=>({title,id:`guide-rule-${i+1}`}))
    : allRoles.map(role=>({title:roleNames[role],id:`guide-role-${role}`}));
}
function GuideIndex({section,onJump}:{section:GuideSection;onJump:(id:string)=>void}) {
  return <div className="guide-directory" id="guide-directory">
    <p className="guide-index-heading">{section==='rules'?'规则目录':'角色目录'}</p>
    <nav className="guide-index" aria-label={section==='rules'?'规则章节定位':'角色快速定位'}>{guideChapters(section).map(({title,id})=><button type="button" className="secondary" key={id} onClick={()=>onJump(id)}>{title}</button>)}</nav>
  </div>;
}
function composition(roles:Role[]) {
  return [...new Set(roles)].map(role=>`${roleNames[role]}${roles.filter(r=>r===role).length>1?` ×${roles.filter(r=>r===role).length}`:''}`).join('、');
}
export function GuideRules() {
  return <div className="guide-rules">
    <section id="guide-rule-1" className="panel guide-section"><p className="eyebrow">01 / 佛魔真假对决</p><h2>一念佛魔皆幻相，谁是修道取经人</h2>
      <div className="guide-victories"><div className="allegiance-blue"><h3><Emblem kind="blue"/>蓝方 · 取经正果</h3><p>在五轮劫难中完成三次取经任务，并护住齐天大圣孙悟空躲过红孩儿的三昧真火刺杀，即可获胜。</p></div>
      <div className="allegiance-red"><h3><Emblem kind="red"/>红方 · 群妖乱道</h3><p>破坏三次取经任务、让流局次数达到五次，或由红孩儿刺杀命中孙悟空，任一条件成立即可获胜。</p></div></div>
      <p className="hint">开启提前刺杀时，红孩儿若刺错目标，蓝方立即获胜。中断对局不计胜负。</p>
    </section>
    <section id="guide-rule-2" className="panel guide-section"><p className="eyebrow">02 / 取经五难流程</p><h2>从聚义，到证果</h2><ol className="guide-steps">
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
        <p>每局共历 1–5 五场修道劫难（依次为：1·五行揭帖、2·流沙收徒、3·三打白骨、4·真假雷音、5·灵山取经）。领队按本场劫难要求选人（可选自己），并指定顺时针或逆时针发言。领队点击“预选阵容”后全员按序论道发言；发言完毕后领队点击“已确认阵容 · 开启投票”发起全员表决，此后不可再改。</p>
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
        <p>通常出现一张失败牌即取经受阻失败。唯独7–12人局的第四难（4·真假雷音），以及11人、12人局的第三难（3·三打白骨），需要至少两张失败牌才算失败。</p>
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
    <section id="guide-rule-3" className="panel guide-section"><p className="eyebrow">03 / 配置与规模</p><h2>人数、角色与取经五难</h2><div className="guide-configs">
      {Object.entries(ROLE_CONFIG).map(([count,roles])=><article key={count} className="guide-config"><h3>{count} 人局</h3><p><strong>蓝方</strong> {composition(roles.filter(r=>roleTeam(r)==='blue'))}</p><p><strong>红方</strong> {composition(roles.filter(r=>roleTeam(r)==='red'))}</p><p className="hint">取经五难（1–5）出征人数</p><ol aria-label={`${count}人局各任务人数`} className="guide-missions">{MISSION_SIZES[Number(count)].map((size,i)=><li key={i}><span>{WUYUE_MISSIONS[i]?.shortLabel ?? `第${i+1}次`}</span><strong>{size}人</strong></li>)}</ol></article>)}
    </div></section>
    <section id="guide-rule-4" className="panel guide-section"><p className="eyebrow">04 / 房主约定</p><h2>开局前，约定取经规矩</h2><dl className="guide-options">
      <dt>队长顺序</dt><dd>默认按座位循环；也可开局打乱一次，此后整局按该顺序循环。房主与当轮队长是两个概念。</dd>
      <dt>组队投票是否匿名</dt><dd>5–7人默认匿名，8–12人默认公开；房主开局前可修改。公开模式实时显示已提交的赞成、反对或弃权；匿名模式只展示是否已投和最终总票数。任务出牌在两种设置下都始终匿名。</dd>
      <dt>五次流局</dt><dd>默认全局累计，达到五次红方胜；也可只累计当前任务，实际任务结束后清零。一次组队表决未通过记一次流局。</dd>
      <dt>心仪选角（偏好匹配）</dt><dd>房主可选开启。玩家入座后可在 3 个志愿槽位中挑选心仪出战角色；开局时系统将全员随机洗牌排序，按顺序优先逐个满足玩家的第 1、2、3 志愿，若均无法满足则从剩余角色中随机分配（类似王者荣耀分路匹配）。</dd>
      <dt>实时语音房与麦克风指示</dt><dd>支持开启声网高清实时语音；入座仙友的头像座次上将实时显示麦克风指示（绿波开麦、浅绿就绪、灰色静音），方便相互感知开麦状态。</dd>
      <dt>新成员加入</dt><dd>等待时房主可关闭新成员加入，已有成员仍可重连。开局后锁定席位。修改玩法会清除准备状态，切换接纳开关不会。</dd>
    </dl></section>
    <section id="guide-rule-5" className="panel guide-section"><p className="eyebrow">05 / 刺杀与天机</p><h2>提前刺杀与护法天机</h2>
      <h3 className="guide-sub-heading">提前刺杀</h3><p>可选开启。完成第二个实际任务起，在轮间确认窗口由红孩儿（刺客）私下决定发起或跳过；此后的任务结束或组队流局也可能再出现窗口，流局本身不计实际任务。</p>
      <ul><li>每局最多发起一次。跳过本次窗口不会消耗机会。</li><li>发起后不能撤回，红孩儿必须选人；命中孙悟空红方胜，刺错则立即蓝方胜。</li><li>不能在投票或任务出牌过程中随时打断。</li><li>其他玩家只看到“轮间确认中”，不会获知谁是红孩儿。</li></ul>
      <p>新开对局按护法人数依次选入白龙、猪八戒、沙悟净、金刚，再随机分配给护法玩家；人物各自的护法天机能力保持不变。旧局及历史复盘沿用原分配结果。</p>
      <h3 className="guide-sub-heading">护法天机（建议7-12人）</h3><p>可选开启，建议7人以上对局开启。开启后为闭眼的「取经护法」赋予专属微弱灵觉，各显神通：</p>
      <ul>
        <li><strong>猪八戒（八戒巡山）</strong>：探知一名仙友绝非六耳猕猴（假猴王）。</li>
        <li><strong>沙悟净（同修感应）</strong>：感应到另一位亦是取经护法的同修仙友（若无其他护法则感应唯君独守）。</li>
        <li><strong>白龙（龙驹护圣）</strong>：感知两位仙友之中，必有一位是大唐圣僧唐三藏（另一位为红方群妖）。</li>
        <li><strong>金刚（金刚怒目）</strong>：金光察知两位仙友之中，至少潜藏一位混世妖魔（绝不包含齐天大圣孙悟空）。</li>
      </ul>
      <p className="notice">判定顺序：先判断终局；未终局时进入提前刺杀窗口。三次任务成功走正常刺杀，三次失败或五次流局直接结束。护法天机线索为私下查验信息，不直接揭示大圣真身，兼顾平衡与乐趣。</p>
    </section>
    <section id="guide-rule-6" className="panel guide-section"><p className="eyebrow">06 / 仙家专属法宝</p><h2>8–12人局专属法宝奇谋</h2>
      <p>为解决 8–12 人大型局中好人信息匮乏、坏人人数占优的痛点，房主开局前可勾选开启【8–12人专属法宝模式】。对局页统一提供【法宝】入口，按角色、人数与房间设置开放使用。法宝规则公开，私密查验与传音仅当事人可见：</p>
      <ul>
        <li><strong>大唐圣僧 ·【九环锡杖】</strong>：第 2 轮任务完成后，私密查验 1 位盲区仙友气息（排除自己与真假猴王，查验黄眉老怪仍显蓝方）。整局限用 1 次。</li>
        <li><strong>南海观音 ·【慈航照妖镜】</strong>：组队通过后全场进入 4 秒中立决断期，观音可一键点选车队 1 人私密辨察纯善/妖邪（或跳过保留至后续轮次），全场仅中立倒计时，绝不暴露观音编号。整局限用 1 次。</li>
        <li><strong>小雷音寺黄眉 ·【后天人种袋】</strong>：第 3/4 轮提名前，禁锢 1 名仙友本轮不可被选入车队（当轮队长不可被禁，打破好人抱团车）。整局限用 1 次。</li>
        <li><strong>取经护法 ·【紧箍信物】</strong>：当好人阵营输掉 2 轮任务（0:2 或 1:2 绝境）时激活，可消耗信物向唐三藏自证，唐三藏将收到全屏【金箍显圣 · 护法归位】弹窗并点亮护法神座角标。整局限用 1 次。</li>
        <li><strong>平天大圣牛魔王 ·【芭蕉神扇】</strong>：采用预设狂风机制，若投票通过立刻吹散换下任队长，绝对不计入 5 次流局上限，全场 0 延迟。整局限用 1 次。</li>
        <li><strong>女妖精 ·【同心铃】</strong>：11–12人局中，整局一次，向同车且已相认的同伙发送「建议护经」或「建议作祟」。仅限一张失败牌即失败的任务，双方都须未出牌，不含牛魔王。私密传音不透露发送者座位、不要求回复、不改动任务牌。</li>
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
              <article id={`guide-role-${role}`} className={`guide-role allegiance-${team}`} key={role}>
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
                      {role === 'loyal' ? '（白龙 / 猪八戒 / 沙悟净 / 金刚）' : ''}
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
  const [section,setSection]=useState<GuideSection>('rules');
  const [destination,setDestination]=useState('');
  const guideRef=useRef<HTMLElement>(null);
  const navigationRef=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const navigation=navigationRef.current;
    if(!navigation)return;
    const measure=()=>guideRef.current?.style.setProperty('--guide-navigation-height',`${navigation.getBoundingClientRect().height}px`);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(navigation);
    return ()=>observer.disconnect();
  },[]);
  usePageSound(section);
  const changeSection=(next:GuideSection)=>{setSection(next);setDestination('');window.scrollTo({top:0});};
  const jumpTo=(id:string)=>{setDestination(id);document.getElementById(id)?.scrollIntoView({block:'start'});};
  const returnToDirectory=()=>{setDestination('');document.getElementById('guide-directory')?.scrollIntoView({block:'start'});};
  return <section className="guide guide-flow" ref={guideRef}>
    <div className="guide-navigation" ref={navigationRef}>
      <div className="guide-controls">
        <button type="button" className="secondary" aria-label="返回原页面" onClick={onBack}>返回</button>
        <nav className="guide-nav" aria-label="说明分类">
          <button type="button" className="secondary" aria-label="游戏规则" aria-pressed={section==='rules'} onClick={()=>changeSection('rules')}>规则</button>
          <button type="button" className="secondary" aria-label="角色介绍" aria-pressed={section==='roles'} onClick={()=>changeSection('roles')}>角色</button>
        </nav>
        <select className="guide-chapter-select" aria-label={section==='rules'?'跳转规则章节':'跳转角色介绍'} value={destination} onChange={e=>jumpTo(e.target.value)}>
          <option value="" disabled>章节跳转</option>
          {guideChapters(section).map(({title,id})=><option key={id} value={id}>{title}</option>)}
        </select>
        <button type="button" className="secondary" aria-label="返回目录" onClick={returnToDirectory}>目录 ↑</button>
      </div>
    </div>
    <div className="guide-heading"><div><p className="eyebrow">JOURNEY TO THE WEST / 真假猴王秘卷</p><h1>《嘻游 · 真假猴王》</h1><p className="muted">一念佛魔皆幻相，谁是修道取经人</p></div></div>
    <GuideIndex section={section} onJump={jumpTo}/>
    {section==='rules'?<GuideRules/>:<GuideRoles/>}
  </section>;
}
