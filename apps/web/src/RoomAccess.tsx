import { useEffect, useId, useState } from 'react';
import type { DedicatedRoom, RoomView, Settings } from '@avalon/contracts';
import { api, describe } from './api';

export type CreationAccess = { dedicatedRoomId?: string; password?: string | null };
export function PasswordChoice({ hasSaved, onChange }: { hasSaved?: boolean; onChange:(password:string|null|undefined)=>void }) {
  const id=useId(),[mode,setMode]=useState(hasSaved?'keep':'none'),[password,setPassword]=useState('');
  function choose(value:string) { setMode(value);onChange(value==='keep'?undefined:value==='none'?null:password); }
  return <fieldset className="room-access-field"><legend>入房密码</legend>
    <div className="access-options">
      {hasSaved && <label><input type="radio" name={id} checked={mode==='keep'} onChange={()=>choose('keep')}/>沿用已保存设置</label>}
      <label><input type="radio" name={id} checked={mode==='none'} onChange={()=>choose('none')}/>不设密码</label>
      <label><input type="radio" name={id} checked={mode==='set'} onChange={()=>choose('set')}/>设置新密码</label>
    </div>
    {mode==='set' && <><label htmlFor={id}>新密码（4–64位）</label><input id={id} type="password" autoComplete="new-password" minLength={4} maxLength={64} value={password} onChange={e=>{setPassword(e.target.value);onChange(e.target.value);}}/></>}
  </fieldset>;
}
export function RoomCreationAccess({onChange,onSettings}:{onChange:(value:CreationAccess)=>void;onSettings:(s:Settings)=>void}) {
  const [rooms,setRooms]=useState<DedicatedRoom[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState('');
  useEffect(()=>{let active=true;void api<{rooms:DedicatedRoom[]}>('/me/dedicated-rooms').then(r=>{if(active)setRooms(r.rooms);}).catch(e=>{if(active)setError(describe(e));});return()=>{active=false;};},[]);
  return <section className="panel room-access-card">
    <label htmlFor="dedicated-room">开桌方式</label>
    <select id="dedicated-room" value={selected} onChange={e=>{const value=e.target.value;setSelected(value);onChange(value?{dedicatedRoomId:value}:{});const room=rooms.find(r=>r.id===value);if(room)onSettings(room.settings);}}>
      <option value="">普通房 · 随机房号</option>
      {rooms.map(r=><option key={r.id} value={r.id} disabled={!!r.activeRoomId}>{r.code} · {r.name}{r.activeRoomId?'（已开桌）':''}</option>)}
    </select>
    {error && <p className="error" role="alert">{error}</p>}
    <PasswordChoice key={selected} hasSaved={!!selected} onChange={password=>onChange({...(selected?{dedicatedRoomId:selected}:{}),password})}/>
    <p className="hint">房号入房按需验证密码；有效邀请链接可直接入房。倒计时开始后锁定密码设置。</p>
  </section>;
}
export function RoomPasswordSettings({room,onSaved}:{room:RoomView;onSaved:(room:RoomView)=>void}) {
  const [password,setPassword]=useState<string|null|undefined>(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  return <section className="room-access-card"><h3>房间密码</h3>
    <p className="hint">当前{room.hasPassword?'已设置密码':'无密码'}。保存后旧邀请链接失效，请重新分享。</p>
    <PasswordChoice hasSaved onChange={v=>{setPassword(v);setMessage('');setError('');}}/>
    <button type="button" disabled={busy||room.phase!=='waiting'||password===undefined||(typeof password==='string'&&password.length<4)} onClick={()=>void(async()=>{
      setBusy(true);setError('');try{const r=await api<{room:RoomView}>(`/rooms/${room.id}/password`,{password,expectedVersion:room.version});onSaved(r.room);setMessage('密码设置已保存，邀请链接已更新。');}catch(e){setError(describe(e));}finally{setBusy(false);}
    })()}>{busy?'正在保存…':'保存密码设置'}</button>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
  </section>;
}
