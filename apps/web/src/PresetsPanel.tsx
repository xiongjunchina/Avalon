import { useEffect, useState } from 'react';
import { defaultSettings, defaultAnonymousTeamVote, type Settings, type SettingPreset } from '@avalon/contracts';
import { api, describe } from './api';
import { Modal } from './Modal';

export function SettingsFields({settings,onChange,prefix='room'}:{settings:Settings;onChange:(patch:Partial<Settings>)=>void;prefix?:string}) {
  return <>
    <fieldset className="player-count-field"><legend>对局人数</legend><div className="count-medallions">{[5,6,7,8,9,10,11,12].map(n=><label key={n}><input type="radio" name={`${prefix}-count`} value={n} checked={settings.playerCount===n} onChange={()=>onChange({playerCount:n,anonymousTeamVote:defaultAnonymousTeamVote(n)})}/><span>{n}<small className="sr-only">人</small></span></label>)}</div></fieldset>
    <label htmlFor={`${prefix}-voice`}>房间类型</label><select id={`${prefix}-voice`} value={settings.voiceChatEnabled ? 'voice' : 'regular'} onChange={e=>onChange({voiceChatEnabled: e.target.value === 'voice'})}><option value="regular">🏛️ 线下常规房（无语音，聚会面杀）</option><option value="voice">🎙️ 远端语音房（声网实时语音）</option></select>
    <label htmlFor={`${prefix}-captain`}>队长分配</label><select id={`${prefix}-captain`} value={settings.captainMode} onChange={e=>onChange({captainMode:e.target.value as Settings['captainMode']})}><option value="seat_order">按座位循环</option><option value="random_order">开局打乱一次，整局循环</option></select>
    <label htmlFor={`${prefix}-rejections`}>流局计数</label><select id={`${prefix}-rejections`} value={settings.rejectionScope} onChange={e=>onChange({rejectionScope:e.target.value as Settings['rejectionScope']})}><option value="game">全局累计，5 次判负</option><option value="mission">单次任务累计，5 次判负</option></select>
    {([['anonymousTeamVote','匿名组队投票'],['earlyAssassinationEnabled','提前刺杀'],['guardianPerksEnabled','护法天机（建议7-12人）'],['autoRevealRoleEnabled','倒计时后亮明真身'],['treasuresEnabled','专属法宝（8-12人专属）'],['rolePreferenceEnabled','心仪选角（偏好匹配模式）']] as const).map(([key,label])=><div className="check" key={key}><label htmlFor={`${prefix}-${key}`}>{label}</label><input id={`${prefix}-${key}`} type="checkbox" checked={settings[key]} onChange={e=>onChange({[key]:e.target.checked})}/></div>)}
  </>;
}
export function settingsText(s:Settings) {
  return `${s.playerCount} 人 · ${s.voiceChatEnabled ? '🎙️ 语音房' : '🏛️ 常规房'} · ${s.anonymousTeamVote?'匿名':'实名'}表决 · ${s.captainMode==='seat_order'?'座位队长':'随机队长'} · ${s.rejectionScope==='game'?'全局':'任务'}流局${s.earlyAssassinationEnabled?' · 提前刺杀':''}${s.guardianPerksEnabled?' · 护法天机':''}${s.autoRevealRoleEnabled?' · 自动亮牌':''}${s.treasuresEnabled?' · 专属法宝':''}${s.rolePreferenceEnabled?' · 心仪选角':''}`;
}
export function PresetsPanel({currentSettings,disabled=false,canApply=false,onApply}:{currentSettings?:Settings;disabled?:boolean;canApply?:boolean;onApply?:(s:Settings)=>void}) {
  const [presets,setPresets]=useState<SettingPreset[]>([]),[settings,setSettings]=useState<Settings>(defaultSettings);
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [editorOpen,setEditorOpen]=useState(false);
  useEffect(()=>{let active=true;setLoading(true);api<{presets:SettingPreset[]}>('/me/presets').then(r=>{if(active){setPresets(r.presets);setError('');}}).catch(e=>{if(active)setError(describe(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[retry]);
  const locked=busy||disabled||loading;
  async function run(action:()=>Promise<void>) {setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(describe(e));}finally{setBusy(false);}}
  return <div className="presets">
    <p className="hint">最多 10 个；同名保存会更新原预设。只保存玩法，不包含房间、成员或接纳开关。</p>
    {error&&!editorOpen&&<p role="alert" className="error">{error}<button className="secondary" onClick={()=>setRetry(n=>n+1)}>重新读取预设</button></p>}
    {notice&&<p className="notice" role="status">{notice}</p>}
    <button type="button" className="secondary preset-new-button" disabled={locked} onClick={()=>{setName('');setSettings(defaultSettings);setError('');setEditorOpen(true);}}>{currentSettings?'保存当前房间为预设':'新建常用设置'}</button>
    {loading?<p role="status">正在读取预设…</p>:presets.length===0?<p className="muted">还没有常用设置。</p>:<ul className="preset-list">{presets.map(p=><li key={p.id}><h3>{p.name}</h3><p className="hint">{settingsText(p.settings)}</p><div className="action-pair">
      {currentSettings?<button className="secondary" disabled={locked||!canApply} onClick={()=>onApply?.(p.settings)}><span>应用 {p.name}</span></button>:<button className="secondary" disabled={locked} onClick={()=>{setName(p.name);setSettings(p.settings);setError('');setEditorOpen(true);}}><span>编辑 {p.name}</span></button>}
      <button className="text-button" disabled={locked} onClick={()=>void run(async()=>{await api(`/me/presets/${p.id}`,undefined,'DELETE');setPresets(list=>list.filter(x=>x.id!==p.id));setNotice(`已删除“${p.name}”，房间设置不受影响。`);})}><span>删除 {p.name}</span></button>
    </div></li>)}</ul>}
    <p className="hint">应用预设需要房主在等待区操作，并会清除全员准备；人数不足以容纳现有座位时不能应用。</p>
    {editorOpen&&<Modal label="编辑常用设置" scene="library" onClose={()=>{if(!busy)setEditorOpen(false);}}>
      <section className="table-modal-sheet flow-editor-sheet">
        <header className="table-modal-head"><strong>{currentSettings?'保存房间预设':'编辑常用设置'}</strong><button type="button" className="secondary tool-pill" disabled={busy} onClick={()=>setEditorOpen(false)}>取消</button></header>
        <form id="preset-editor-form" className="preset-form flow-scroll-body" onSubmit={e=>{e.preventDefault();if(locked||!name.trim())return;void run(async()=>{const {preset}=await api<{preset:SettingPreset}>('/me/presets',{name:name.trim(),settings:currentSettings??settings});setPresets(p=>[preset,...p.filter(x=>x.id!==preset.id)]);setName('');setNotice(`已保存“${preset.name}”。`);setEditorOpen(false);});}}>
          <fieldset disabled={locked}><legend className="sr-only">保存常用设置</legend>
            <label htmlFor="preset-name">预设名称</label><input id="preset-name" value={name} onChange={e=>setName(e.target.value)} maxLength={24} required placeholder="例如：八人法宝局"/>
            {currentSettings?<p className="hint">将保存：{settingsText(currentSettings)}</p>:<SettingsFields prefix="preset" settings={settings} onChange={patch=>setSettings(s=>({...s,...patch}))}/>}
          </fieldset>
        </form>
        <footer className="flow-fixed-actions">{error&&<p className="error" role="alert">{error}</p>}<button type="submit" form="preset-editor-form" disabled={locked||!name.trim()}>{busy?'正在保存…':currentSettings?'保存当前房间设置':'保存预设'}</button></footer>
      </section>
    </Modal>}
  </div>;
}
