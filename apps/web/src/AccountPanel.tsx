import { useEffect, useState } from 'react';
import type { Avatar, User, Statistics, Score, HistoryPage, GameSummary, Replay, GameResult } from '@avalon/contracts';
import { roleNames } from './roles';
import { RolePortrait } from './RolePortrait';
import { api, describe } from './api';
import { PresetsPanel, settingsText } from './PresetsPanel';
import { Emblem, roleTeam } from './Heraldry';

export const avatarNames:Record<Avatar,{symbol:string;name:string}>={leaf:{symbol:'❧',name:'绿叶'},moon:{symbol:'☾',name:'月亮'},sun:{symbol:'☀',name:'太阳'},mountain:{symbol:'△',name:'山峰'},wave:{symbol:'≋',name:'海浪'},star:{symbol:'✦',name:'星星'}};
const reasons:Record<GameResult['reason'],string>={three_failures:'三次任务失败',five_rejections:'五次组队未通过',merlin_found:'刺杀命中梅林',merlin_survived:'梅林躲过刺杀',early_merlin_found:'提前刺杀命中梅林',early_merlin_survived:'提前刺杀未命中梅林',unanimous_abort:'在线成员一致同意中断',offline_timeout:'全员离线超过 24 小时'};
const date=(s:string)=>new Date(s).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export const rate=(s:Score)=>s.winRate===null?'—':`${Math.round(s.winRate*100)}%`;
const outcome=(g:GameSummary)=>g.result.winner===null?'中断':g.result.winner===g.self.team?'胜利':'失败';

export function StatisticsView({stats}:{stats:Statistics}) {
  return <>
    <div className="stat-grid" aria-label="我的战绩"><div><strong>{stats.completed}</strong><span>完成对局</span></div><div><strong>{stats.wins}</strong><span>胜利</span></div><div><strong>{stats.losses}</strong><span>失败</span></div><div><strong>{rate(stats)}</strong><span>总胜率</span></div></div>
    <p className="hint">另有 {stats.aborted} 局中断，不计入胜负与胜率。统计以最终获胜阵营为准，包含提前刺杀。</p>
    <section className="stats-section" aria-labelledby="faction-stats-title">
      <div className="ornament-heading"><div><p className="eyebrow">ALLEGIANCE</p><h2 id="faction-stats-title">阵营战绩</h2></div><span>忠诚，或是背叛</span></div>
      <div className="faction-grid">{(['blue','red'] as const).map(team=>{const s=stats.byTeam[team];return <article className={`faction-card allegiance-${team}`} key={team} aria-label={`${team==='blue'?'蓝方':'红方'}战绩`}>
        <Emblem kind={team}/><p className="faction-motto">{team==='blue'?'守护光明':'潜伏暗影'}</p><h3>{team==='blue'?'蓝方阵营':'红方阵营'}</h3>
        <div className="faction-rate"><strong>{rate(s)}</strong><span>胜率</span></div>
        <dl className="score-pair"><div><dt>胜利</dt><dd>{s.wins}</dd></div><div><dt>失败</dt><dd>{s.losses}</dd></div></dl>
        <p className="card-foot">{s.completed} 局完成 · {s.aborted} 局中断</p>
      </article>;})}</div>
    </section>
    <section className="stats-section" aria-labelledby="role-stats-title">
      <div className="ornament-heading"><div><p className="eyebrow">IDENTITIES</p><h2 id="role-stats-title">角色战绩</h2></div><span>你的每一重身份</span></div>
      <div className="role-grid">{Object.entries(roleNames).map(([key,label])=>{const role=key as keyof typeof roleNames,s=stats.byRole[role],team=roleTeam(role);return <article key={role} className={`role-card allegiance-${team}`} aria-label={`${label}战绩`}>
        <span className="role-team">{team==='blue'?'蓝方':'红方'}</span><RolePortrait role={role}/><h3>{label}</h3>
        <p className="role-rate"><strong>{rate(s)}</strong><span>胜率</span></p>
        <p className="role-record"><span>{s.wins} 胜</span><span>{s.losses} 负</span></p><p className="card-foot">{s.completed} 局完成 · {s.aborted} 局中断</p>
      </article>;})}</div>
    </section>
  </>;
}
function StatisticsPanel() {
  const [stats,setStats]=useState<Statistics|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');api<Statistics>('/me/stats').then(r=>{if(active)setStats(r);}).catch(e=>{if(active)setError(describe(e));});return()=>{active=false;};},[retry]);
  return error?<p role="alert" className="error">{error}<button className="secondary" onClick={()=>setRetry(n=>n+1)}>重新读取战绩</button></p>:stats?<StatisticsView stats={stats}/>:<p role="status">正在统计战绩…</p>;
}
function ProfileEditor({user,onUser}:{user:User;onUser:(u:User)=>void}) {
  const [nickname,setNickname]=useState(user.nickname),[avatar,setAvatar]=useState<Avatar>(user.avatar??'leaf');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  return <details className="profile-editor"><summary>修改昵称与头像</summary><form onSubmit={e=>{e.preventDefault();setBusy(true);setError('');setSaved(false);void api<{user:User}>('/me',{nickname,avatar},'PATCH').then(r=>{onUser(r.user);setNickname(r.user.nickname);setSaved(true);}).catch(e=>setError(describe(e))).finally(()=>setBusy(false));}}>
    <fieldset disabled={busy}><legend className="sr-only">编辑资料</legend><label htmlFor="profile-nickname">昵称</label><input id="profile-nickname" maxLength={20} required value={nickname} onChange={e=>{setNickname(e.target.value);setSaved(false);}}/>
      <label htmlFor="profile-avatar">预置头像</label><select id="profile-avatar" value={avatar} onChange={e=>{setAvatar(e.target.value as Avatar);setSaved(false);}}>{Object.entries(avatarNames).map(([id,a])=><option value={id} key={id}>{a.symbol} {a.name}</option>)}</select>
      <button disabled={!nickname.trim()}>保存资料</button>
    </fieldset>
    <p className="hint">旧对局保留当时昵称。浏览器身份连续 30 天未使用会失效；清除数据或换设备无法找回，无密码或恢复码。</p>
    {error&&<p role="alert" className="error">{error}</p>}{saved&&<p role="status" className="notice">资料已保存，旧局记录保持原样。</p>}
  </form></details>;
}
function HistoryPanel({favorites,onReplay}:{favorites:boolean;onReplay:(id:string)=>void}) {
  const [page,setPage]=useState<HistoryPage|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setBusy(true);setError('');api<HistoryPage>(`/me/games?favorites=${favorites}`).then(r=>{if(active)setPage(r);}).catch(e=>{if(active)setError(describe(e));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[favorites,retry]);
  async function more(){if(!page?.nextCursor||busy)return;setBusy(true);setError('');try{const r=await api<HistoryPage>(`/me/games?favorites=${favorites}&cursor=${encodeURIComponent(page.nextCursor)}`);setPage(p=>({games:[...(p?.games??[]),...r.games.filter(g=>!p?.games.some(x=>x.id===g.id))],nextCursor:r.nextCursor}));}catch(e){setError(describe(e));}finally{setBusy(false);}}
  return <>
    <p className="hint">只显示你参与且已结束的对局，按结束时间倒序。{favorites?'取消收藏不会删除对局。':'中断局也保留记录。'}</p>
    {error&&<p role="alert" className="error">{error}<button className="secondary" disabled={busy} onClick={()=>setRetry(n=>n+1)}>重新读取记录</button></p>}
    {!page&&busy&&<p role="status">正在读取记录…</p>}
    {page?.games.length===0&&<p className="empty-state">{favorites?'还没有收藏。在一局复盘中点击“收藏这局”，方便下次再看。':'还没有结束的对局。和朋友玩完一局后，战绩会出现在这里。'}</p>}
    <div className="history-list">{page?.games.map(g=><article key={g.id}><div className="section-head"><h3>{outcome(g)} <small>{g.playerCount} 人局</small></h3><span className="status">{g.favorite?'已收藏':'已结束'}</span></div><p>{roleNames[g.self.role]} · {g.self.team==='blue'?'蓝方':'红方'} · {reasons[g.result.reason]}</p><p className="hint"><time dateTime={g.endedAt}>{date(g.endedAt)}</time> · 当时昵称：{g.self.nickname}</p><button className="secondary" onClick={()=>onReplay(g.id)}>查看复盘 · {date(g.endedAt)}</button></article>)}</div>
    {page?.nextCursor&&<button className="secondary" disabled={busy} onClick={()=>void more()}>{busy?'正在读取…':'加载更多'}</button>}
  </>;
}

export function ReplayView({replay:g}:{replay:Replay}) {
  const name=(id:string)=>{const p=g.players.find(p=>p.id===id);return p?`${p.seat} 号 ${p.nickname}`:'未知成员';};
  return <>
    <div className="result-box"><h2>{g.result.winner===null?'本局中断':`${g.result.winner==='blue'?'蓝方':'红方'}获胜`}</h2><p>{reasons[g.result.reason]}{g.result.targetId?` · 刺杀目标：${name(g.result.targetId)}`:''}</p><p className="hint">开始 {date(g.startedAt)}<br/>结束 {date(g.endedAt)} · 你的结果：{outcome(g)}</p></div>
    <p className="hint">{settingsText(g.settings)}<br/>规则版本：{g.rulesetVersion}</p>
    <p className="notice">仅本局参与者可看。{g.settings.anonymousTeamVote?'组队投票仅展示总数。':'组队投票展示当时公开的个人赞反。'}任务出牌始终不对应个人。</p>
    <h3>最终身份</h3><ul className="role-list">{g.players.map(p=><li key={p.id}><span>{name(p.id)}</span><strong className={`revealed-role allegiance-${roleTeam(g.roles[p.id])}`}><RolePortrait role={g.roles[p.id]} size="mini"/>{roleNames[g.roles[p.id]]}</strong></li>)}</ul>
    <h3>逐轮记录</h3>{!g.rounds.length&&<p className="muted">本局在第一次组队前结束。</p>}
    <div className="replay-rounds">{g.rounds.map(r=><article key={r.number}>
      <h4>提案 {r.number} · 任务 {r.mission}{r.result?` · ${r.result.passed?'成功':'失败'}`:r.vote&&!r.vote.passed?' · 流局':' · 未完成'}</h4>
      <p>队长：{name(r.captainId)} · {r.direction==='clockwise'?'顺时针':'逆时针'}发言<br/>队伍：{r.team.map(name).join('、')}</p>
      {r.vote?<><p>表决：{r.vote.approvals} 赞成 / {r.vote.rejections} 反对 · {r.vote.passed?'通过':'否决'}</p>
        {!g.settings.anonymousTeamVote&&r.vote.ballots&&<p className="hint">{Object.entries(r.vote.ballots).map(([id,yes])=>`${name(id)}：${yes?'赞成':'反对'}`).join('；')}</p>}</>:<p className="hint">本次表决未完成，不展示未收齐的个人选择。</p>}
      {r.result&&<p>任务：{r.result.successes} 成功 / {r.result.failures} 失败（匿名）</p>}
      {g.inspections.filter(i=>i.afterMission===r.mission&&r.result).map(i=><p key={i.afterMission} className="hint">湖中女神：{name(i.inspectorId)} 查验 {name(i.targetId)}，随后交接给被查验者。</p>)}
      {g.earlyWindows.filter(w=>w.afterProposal===r.number).map((w,i)=><p className="hint" key={i}>轮间窗口：{w.decision==='skip'?'跳过提前刺杀':'发起提前刺杀'}（完成任务 {w.afterMission} 后）。</p>)}
    </article>)}</div>
  </>;
}
function ReplayPanel({id,onBack}:{id:string;onBack:()=>void}) {
  const [replay,setReplay]=useState<Replay|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');api<Replay>(`/games/${id}/replay`).then(r=>{if(active)setReplay(r);}).catch(e=>{if(active)setError(describe(e));});return()=>{active=false;};},[id,retry]);
  return <section className="panel replay"><div className="section-head"><h1>对局复盘</h1><button className="secondary compact-button" onClick={onBack}>返回记录</button></div>
    {error&&<p className="error" role="alert">{error}<button className="secondary" onClick={()=>setRetry(n=>n+1)}>重新读取复盘</button></p>}
    {!replay&&!error?<p role="status">正在读取复盘…</p>:replay&&<><ReplayView replay={replay}/><button className="secondary" disabled={busy} aria-pressed={replay.favorite} onClick={()=>{setBusy(true);setError('');void api<{favorite:boolean}>(`/me/favorites/${id}`,undefined,replay.favorite?'DELETE':'PUT').then(r=>setReplay(g=>g?{...g,favorite:r.favorite}:g)).catch(e=>setError(describe(e))).finally(()=>setBusy(false));}}>{replay.favorite?'取消收藏':'收藏这局'}</button><p className="hint">收藏只在你的个人中心可见，不会创建公开链接。取消收藏保留历史对局。</p></>}
  </section>;
}
export function AccountPanel({user,onUser,initialReplay,onBack}:{user:User;onUser:(u:User)=>void;initialReplay:string|null;onBack:()=>void}) {
  const [tab,setTab]=useState<'stats'|'history'|'favorites'|'presets'>('stats'),[replay,setReplay]=useState(initialReplay);
  const avatar=avatarNames[user.avatar??'leaf'];
  if(replay)return <ReplayPanel key={replay} id={replay} onBack={()=>{setReplay(null);if(initialReplay)setTab('history');}}/>;
  return <section className="panel account"><div className="account-banner" aria-hidden="true"><span>THE CHRONICLES OF AVALON</span></div><div className="section-head profile-bar"><div className="profile-heading"><span className="avatar" aria-label={`${avatar.name}头像`}><Emblem kind={user.avatar??'leaf'}/></span><div><p className="eyebrow">圆桌旅人 / 个人中心</p><h1>{user.nickname}</h1></div></div><button className="secondary compact-button" onClick={onBack}>回到朋友桌</button></div>
    <ProfileEditor user={user} onUser={onUser}/>
    <nav className="account-tabs" aria-label="个人中心栏目">{([['stats','我的战绩'],['history','历史对局'],['favorites','我的收藏'],['presets','常用设置']] as const).map(([id,label])=><button className="secondary" key={id} aria-current={id===tab?'page':undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='stats'?<StatisticsPanel/>:tab==='presets'?<PresetsPanel/>:<HistoryPanel key={tab} favorites={tab==='favorites'} onReplay={setReplay}/>}
  </section>;
}
