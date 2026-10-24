import { useEffect, useState } from 'react';
import { defaultSettings, type AdminUserSummary, type DedicatedRoom, type PlayerCodeAvailability, type PlayerCodeReservation, type Settings } from '@avalon/contracts';
import { Modal } from './Modal';
import { PasswordChoice } from './RoomAccess';
import { SettingsFields } from './PresetsPanel';
import { errors } from './api';

export type AdminApi = <T>(path:string,body?:unknown,method?:string)=>Promise<T>;
const message=(e:unknown)=>e instanceof Error?errors[e.message]??e.message:'操作失败，请重试。';
export function SpecialAdmin({request}:{request:AdminApi}) {
  const [rooms,setRooms]=useState<DedicatedRoom[]>([]),[codes,setCodes]=useState<PlayerCodeReservation[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<DedicatedRoom|null|undefined>(),[code,setCode]=useState(''),[name,setName]=useState(''),[managerCode,setManagerCode]=useState(''),[settings,setSettings]=useState<Settings>({...defaultSettings}),[password,setPassword]=useState<string|null|undefined>();
  const [reserve,setReserve]=useState(''),[note,setNote]=useState('');
  async function load(){const [r,c]=await Promise.all([request<{rooms:DedicatedRoom[]}>('/dedicated-rooms'),request<{codes:PlayerCodeReservation[]}>('/player-codes')]);setRooms(r.rooms);setCodes(c.codes);}
  useEffect(()=>{void load().catch(e=>setError(message(e)));},[]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await action();await load();}catch(e){setError(message(e));}finally{setBusy(false);}}
  function edit(r:DedicatedRoom|null){setError('');setEditing(r);setCode(r?.code??'');setName(r?.name??'');setManagerCode(r?.managerCode??'');setSettings(r?.settings??{...defaultSettings});setPassword(undefined);}
  return <div className="special-admin">
    <section className="admin-panel"><div className="section-head"><h2>专属房管理</h2><button type="button" className="admin-primary-btn" onClick={()=>edit(null)}>新建专属房</button></div>
      <p className="hint">专属房长期保留房号与默认配置。只指定房主管理者，朋友无需提前登记。</p>
      <div className="special-list">{rooms.map(r=><article className="special-card" key={r.id}>
        <strong>{r.code} · {r.name}</strong><p>房主：{r.managerName} #{r.managerCode} · {r.settings.playerCount}人 · {r.hasPassword?'有密码':'无密码'} · {r.activeRoomId?'已开桌':'待开桌'}</p>
        <button type="button" className="admin-action-btn" disabled={!!r.activeRoomId||busy} onClick={()=>edit(r)}>修改配置与密码</button>
        {r.activeRoomId&&<small>本次房间关闭后可编辑配置；等待区改密可由房主直接操作。</small>}
      </article>)}{!rooms.length&&<p>尚无专属房，可在此创建。</p>}</div>
    </section>
    <section className="admin-panel"><h2>仙友靓号预留</h2><p className="hint">预留号不会随机分配。给玩家分配号码，请在“仙友用户”中点击“改仙友码”。</p>
      <form className="special-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await request('/player-codes',{code:reserve,note});setReserve('');setNote('');setNotice('号码已预留。');});}}>
        <label>六位仙友码<input className="admin-input" inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} required value={reserve} onChange={e=>setReserve(e.target.value.replace(/\D/g,''))}/></label>
        <label>备注<input className="admin-input" maxLength={80} value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy} className="admin-primary-btn">预留号码</button>
      </form>
      <div className="special-list">{codes.map(c=><article className="special-card" key={c.code}><strong>{c.code} · {c.state==='retired'?'历史旧号保留':'待分配'}</strong><p>{c.nickname??''} {c.note}</p>
        {c.state==='reserved'&&<button type="button" className="admin-action-btn" disabled={busy} onClick={()=>void run(async()=>{await request(`/player-codes/${c.code}`,undefined,'DELETE');setNotice('预留已解除。');})}>解除预留</button>}
      </article>)}</div>
    </section>
    {editing!==undefined&&<Modal label={editing?'编辑专属房':'创建专属房'} scene="gate" onClose={()=>{if(!busy)setEditing(undefined);}}>
      <section className="table-modal-sheet special-editor"><div className="table-modal-head"><strong>{editing?'编辑专属房':'创建专属房'}</strong><button type="button" disabled={busy} className="secondary tool-pill" onClick={()=>setEditing(undefined)}>关闭</button></div>
        <form onSubmit={e=>{e.preventDefault();void run(async()=>{
          const result=await request<{users:AdminUserSummary[]}>(`/users?query=${encodeURIComponent(managerCode)}&limit=10`);
          const manager=result.users.find(u=>u.playerCode===managerCode);if(!manager)throw Error('请填写已注册房主管理者的仙友码。');
          await request(`/dedicated-rooms${editing?'/'+editing.id:''}`,{code,name,managerId:manager.id,settings,...(password!==undefined?{password}:{})},editing?'PUT':'POST');
          setEditing(undefined);setNotice('专属房配置已保存，房主可在建房页选择开桌。');
        });}}>
          <label>固定房号<input value={code} className="admin-input" required readOnly={!!editing} pattern="[1-9][0-9]{5}" maxLength={6} inputMode="numeric" onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
          <label>房间名称<input value={name} className="admin-input" required maxLength={30} onChange={e=>setName(e.target.value)}/></label>
          <label>房主管理者仙友码<input value={managerCode} className="admin-input" required pattern="[1-9][0-9]{5}" maxLength={6} inputMode="numeric" onChange={e=>setManagerCode(e.target.value.replace(/\D/g,''))}/></label>
          <PasswordChoice key={editing?.id??'new'} hasSaved={!!editing} onChange={setPassword}/>
          <fieldset disabled={busy}><SettingsFields settings={settings} onChange={patch=>setSettings(s=>({...s,...patch}))}/></fieldset>
          {error&&<p className="error" role="alert">{error}</p>}
          <button disabled={busy||(typeof password==='string'&&(password.length<4||password.length>8))} className="mp-cyan-pill">{busy?'正在保存…':'保存专属房'}</button>
        </form>
      </section>
    </Modal>}
    {error&&editing===undefined&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  </div>;
}

export function PlayerCodeEditor({user,request,onClose,onSaved}:{user:AdminUserSummary;request:AdminApi;onClose:()=>void;onSaved:()=>void}) {
  const [currentCode,setCurrentCode]=useState(user.playerCode);
  const [code,setCode]=useState(user.playerCode),[check,setCheck]=useState<PlayerCodeAvailability|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[recovery,setRecovery]=useState('');
  const [history,setHistory]=useState<Array<{oldCode:string;newCode:string;retained:boolean;createdAt:string}>>([]);
  useEffect(()=>{let active=true;setCheck(null);if(!/^[1-9]\d{5}$/.test(code))return;const t=setTimeout(()=>void request<PlayerCodeAvailability>(`/player-codes/check?code=${code}&userId=${user.id}`).then(r=>{if(active)setCheck(r);}).catch(e=>{if(active)setError(message(e));}),250);return()=>{active=false;clearTimeout(t);};},[code,user.id,currentCode]);
  useEffect(()=>{void request<{history:typeof history}>(`/users/${user.id}/player-code-history`).then(r=>setHistory(r.history)).catch(e=>setError(message(e)));},[user.id,currentCode]);
  const available=check&&['available','reserved'].includes(check.status);
  return <Modal label="管理仙友码" scene="gate" onClose={()=>{if(!busy)onClose();}}><section className="table-modal-sheet special-editor">
    <div className="table-modal-head"><strong>{user.nickname} · 仙友码管理</strong><button className="secondary tool-pill" disabled={busy} onClick={onClose}>关闭</button></div>
    <p>当前仙友码：<strong>{currentCode}</strong></p><p className="hint">改号保留账号、好友和会员；从未开局则释放旧号，存在任何已开局记录则保留旧号。</p>
    <form onSubmit={e=>{e.preventDefault();if(!available||!confirm(`将 ${user.nickname} 的仙友码从 ${currentCode} 改为 ${code}？`))return;void(async()=>{setBusy(true);setError('');try{const r=await request<{retained:boolean}>(`/users/${user.id}/player-code`,{playerCode:code,expectedCode:currentCode});setCurrentCode(code);setNotice(`已改为 ${code}，旧号${r.retained?'保留':'已释放'}。`);onSaved();}catch(e){setError(message(e));}finally{setBusy(false);}})();}}>
      <label htmlFor="new-player-code">新仙友码</label><input id="new-player-code" value={code} inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} className="admin-input" onChange={e=>{setCode(e.target.value.replace(/\D/g,''));setError('');setNotice('');}}/>
      {check&&<p role="status" className={available?'notice':'hint'}>{check.status==='occupied'?`已占用：${check.nickname}，不能分配。`:check.status==='retired'?'该旧号关联历史对局，不能分配。':check.status==='current'?'这是玩家当前号码。':check.status==='reserved'?'后台预留号，可以分配。':'号码可用。'}</p>}
      <button disabled={busy||!available} className="mp-cyan-pill">保存仙友码</button>
    </form>
    <details><summary>改号记录</summary>{history.length?history.map((h,i)=><p key={i}>{h.oldCode} → {h.newCode} · 旧号{h.retained?'保留':'释放'} · {new Date(h.createdAt).toLocaleString()}</p>):<p>尚无改号记录。</p>}</details>
    <details><summary>账号恢复码重置</summary><p className="hint">用于协助失去原设备的玩家。重置后旧恢复码失效；请私下交付给本人。</p>
      <button type="button" disabled={busy} className="secondary" onClick={()=>void(async()=>{if(!confirm('确认重置此玩家的恢复码？旧恢复码将失效。'))return;setBusy(true);try{const r=await request<{recoveryCode:string}>(`/users/${user.id}/recovery-code`,{});setRecovery(r.recoveryCode);}catch(e){setError(message(e));}finally{setBusy(false);}})()}>重置恢复码</button>
      {recovery&&<label>仅本次显示，请私下保存<input readOnly value={recovery} autoComplete="off"/></label>}
    </details>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  </section></Modal>;
}
