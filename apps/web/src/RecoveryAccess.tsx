import { useState } from 'react';
import type { User } from '@avalon/contracts';
import { api, describe } from './api';
import { knownAccountsList, rememberAccount } from './known-accounts';

export function RecoveryAccess({user}:{user:User}) {
  const [code,setCode]=useState(()=>knownAccountsList().find(a=>a.id===user.id)?.recoveryCode??''),[visible,setVisible]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  return <details className="panel recovery-access"><summary>账号切换与恢复码</summary>
    <p className="hint">仙友码用于识别玩家，换设备或切换账号还需要恢复码。请私下保存，不要发给其他玩家。</p>
    {code&&<><label htmlFor="account-recovery">本设备保存的恢复码</label><input id="account-recovery" type={visible?'text':'password'} readOnly value={code}/>
      <div className="action-pair"><button type="button" className="secondary" onClick={()=>setVisible(v=>!v)}>{visible?'隐藏':'查看恢复码'}</button><button type="button" className="secondary" onClick={()=>void navigator.clipboard.writeText(code).then(()=>setMessage('恢复码已复制，请妥善保管。')).catch(()=>setMessage('请展开查看并手工保存恢复码。'))}>复制恢复码</button></div></>}
    <button type="button" disabled={busy} onClick={()=>void(async()=>{
      if(code&&!confirm('重新生成后，旧恢复码和其他设备保存的旧快捷切号凭据将失效，是否继续？'))return;
      setBusy(true);try{const r=await api<{recoveryCode:string}>('/me/recovery-code',{});rememberAccount(user,r.recoveryCode);setCode(r.recoveryCode);setVisible(true);setMessage('新恢复码已生成，请保存。');}catch(e){setMessage(describe(e));}finally{setBusy(false);}
    })()}>{busy?'正在处理…':code?'重新生成恢复码':'生成并保存恢复码'}</button>
    {message&&<p role="status" className="hint">{message}</p>}
  </details>;
}
