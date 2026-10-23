import { useState } from 'react';
import * as Label from '@radix-ui/react-label';
import type { User } from '@avalon/contracts';
import { api, describe } from './api';
import { Modal } from './Modal';

export interface KnownAccount { id: string; nickname: string; playerCode: string; lastSeen: number }
export type EntryIntent = { type: 'home' | 'create' | 'join' | 'practice' | 'account'; inviteKey?: string };

export function EntryDialog({ intent, knownAccounts, onClose, onAuthenticated }: {
  intent: EntryIntent; knownAccounts: KnownAccount[]; onClose: () => void;
  onAuthenticated: (user: User, roomId: string | null) => void;
}) {
  const [mode, setMode] = useState<'create' | 'switch'>('create');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const purpose = intent.type === 'create' ? '创建房间' : intent.type === 'join' ? '加入房间'
    : intent.type === 'practice' ? '开始试玩' : intent.type === 'account' ? '查看功果簿' : '踏入取经大道';

  async function authenticate(playerCode?: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(playerCode ? '/sessions/switch' : '/sessions/guest',
        playerCode ? { playerCode } : { nickname: nickname.trim() });
      // A returning account can already be seated. Restore that room before resuming an entry action.
      const data = await api<{ user: User; roomId: string | null }>('/me');
      onAuthenticated(data.user, data.roomId);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  return <Modal label="设置取经身份" scene="gate" onClose={() => { if (!busy) onClose(); }}>
    <section className="table-modal-sheet guest-login-card entry-sheet" aria-busy={busy}>
      <div className="table-modal-head">
        <strong>{mode === 'create' ? '请留取经尊号' : '仙友归位'}</strong>
        <button type="button" className="secondary tool-pill" disabled={busy} onClick={onClose}>关闭</button>
      </div>
      <p className="entry-purpose">设置身份后继续{purpose}，无需重新选择。</p>
      <div className="guest-tabs-bar" role="group" aria-label="登录模式选择">
        <button type="button" aria-pressed={mode === 'create'} disabled={busy}
          className={`guest-tab-btn ${mode === 'create' ? 'is-active' : ''}`}
          onClick={() => { setMode('create'); setError(''); }}>取名启程</button>
        <button type="button" aria-pressed={mode === 'switch'} disabled={busy}
          className={`guest-tab-btn is-switch ${mode === 'switch' ? 'is-active is-switch' : ''}`}
          onClick={() => { setMode('switch'); setError(''); }}>已有仙友码</button>
      </div>
      <form onSubmit={e => { e.preventDefault(); void authenticate(mode === 'switch' ? code : undefined); }}>
        <Label.Root htmlFor="entry-identity">{mode === 'create' ? '你的尊号（昵称）' : '6 位专属仙友码'}</Label.Root>
        {mode === 'create' ? <input key="nickname" id="entry-identity" value={nickname}
          maxLength={20} required autoComplete="nickname" placeholder="例如：仙友xx" disabled={busy}
          aria-describedby="entry-identity-hint" onChange={e => { setNickname(e.target.value); setError(''); }} />
          : <input key="code" id="entry-identity" className="guest-switch-input" value={code}
            maxLength={6} pattern="\d{6}" inputMode="numeric" required autoComplete="off"
            placeholder="例如：123456" disabled={busy} aria-describedby="entry-identity-hint"
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} />}
        <p className="hint" id="entry-identity-hint">{mode === 'create'
          ? '系统会为你分配唯一的 6 位仙友码，用于切换账号和保留战绩。'
          : '输入功果簿中的仙友码，找回原账号及历史战绩。'}</p>
        {error && <p className="error entry-error" role="alert">{error}</p>}
        <button className="mp-cyan-pill" disabled={busy || (mode === 'create' ? !nickname.trim() : code.length !== 6)} type="submit">
          {busy ? '正在设置身份…' : `确认身份，${purpose}`}
        </button>
      </form>
      {knownAccounts.length > 0 && <details className="entry-known-accounts">
        <summary>常用仙籍（{knownAccounts.length}）</summary>
        <div className="guest-known-list">
          {knownAccounts.map(account => <button key={account.playerCode} type="button" disabled={busy}
            className="guest-known-item" onClick={() => void authenticate(account.playerCode)}>
            <span>{account.nickname}</span><small>#{account.playerCode} · 切入</small>
          </button>)}
        </div>
      </details>}
    </section>
  </Modal>;
}
