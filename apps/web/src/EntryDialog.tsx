import { useRef, useState } from 'react';
import * as Label from '@radix-ui/react-label';
import type { User } from '@avalon/contracts';
import { api, describe } from './api';
import { Modal } from './Modal';
import { EntrySession } from './entry-session';

import { rememberAccount, type KnownAccount } from './known-accounts';
export type { KnownAccount } from './known-accounts';
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
  const [accounts, setAccounts] = useState(knownAccounts);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const submitting = useRef(false);
  const session = useRef<EntrySession | null>(null);
  if (!session.current) session.current = new EntrySession({
    request: api, knownAccounts: () => accountsRef.current,
    remember: user => { const next = rememberAccount(user); accountsRef.current = next; setAccounts(next); },
    registrationId: () => crypto.randomUUID(),
  });
  const purpose = intent.type === 'create' ? '创建房间' : intent.type === 'join' ? '加入房间'
    : intent.type === 'practice' ? '开始试玩' : intent.type === 'account' ? '查看功果簿' : '踏入取经大道';

  async function authenticate(playerCode?: string, account?: KnownAccount) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const data = await session.current!.authenticate({
        nickname, playerCode, account, roomKey: intent.inviteKey,
      });
      onAuthenticated(data.user, data.roomId);
    } catch (err) {
      setError(describe(err));
    } finally {
      submitting.current = false;
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
      {accounts.length > 0 && <section className="entry-known-accounts" aria-label="本机已保存的仙籍">
        <p className="hint">本机仙籍 · 点击继续原账号</p>
        <div className="guest-known-list">
          {accounts.map(account => <button key={account.playerCode} type="button" disabled={busy}
            className="guest-known-item" onClick={() => void authenticate(account.playerCode, account)}>
            <span>{account.nickname}</span><small>#{account.playerCode} · 继续</small>
          </button>)}
        </div>
      </section>}
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
          ? '新玩家将获得唯一的 6 位仙友码；本机保存过的同昵称账号会继续使用。'
          : '输入仙友码即可找回原账号，继续使用原昵称、头像和战绩。'}</p>
        {error && <p className="error entry-error" role="alert">{error}</p>}
        <button className="mp-cyan-pill" disabled={busy || (mode === 'create' ? !nickname.trim() : code.length !== 6)} type="submit">
          {busy ? '正在设置身份…' : `确认身份，${purpose}`}
        </button>
      </form>
    </section>
  </Modal>;
}
