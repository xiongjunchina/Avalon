import { useRef, useState } from 'react';
import * as Label from '@radix-ui/react-label';
import type { User } from '@avalon/contracts';
import { api, describe } from './api';
import { Modal } from './Modal';
import { entryRoomKey, EntrySession } from './entry-session';

import { rememberAccount, type KnownAccount } from './known-accounts';
export type { KnownAccount } from './known-accounts';
export type EntryIntent = { type: 'home' | 'create' | 'join' | 'practice' | 'account'; inviteKey?: string };

export function EntryDialog({ intent, knownAccounts, onClose, onAuthenticated }: {
  intent: EntryIntent; knownAccounts: KnownAccount[]; onClose: () => void;
  onAuthenticated: (user: User, roomId: string | null, destination: EntryIntent) => void;
}) {
  const [mode, setMode] = useState<'create' | 'switch'>('create');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [roomInput,setRoomInput]=useState('');
  const joining=intent.type==='join';
  const invited=joining&&Boolean(intent.inviteKey);
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
      const roomKey=joining?(intent.inviteKey||entryRoomKey(roomInput)):undefined;
      const data = await session.current!.authenticate({
        nickname, playerCode, account, roomKey,
      });
      onAuthenticated(data.user, data.roomId, joining?{...intent,inviteKey:roomKey}:intent);
    } catch (err) {
      setError(describe(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <Modal label={joining?'加入朋友的房间':'设置玩家昵称'} scene="gate" onClose={() => { if (!busy) onClose(); }}>
    <section className="table-modal-sheet guest-login-card entry-sheet" aria-busy={busy}>
      <div className="table-modal-head">
        <strong>{joining?'加入朋友的房间':mode === 'create' ? '取个朋友认识的昵称' : '找回原账号'}</strong>
        <button type="button" className="secondary tool-pill" disabled={busy} onClick={onClose}>关闭</button>
      </div>
      <p className="entry-purpose">{joining
        ? invited?'邀请已带好房间信息，填好昵称即可加入。':'先填朋友发来的房间号，再填你自己的昵称。'
        : `填好玩家昵称后继续${purpose}。`}</p>
      <form onSubmit={e => { e.preventDefault(); void authenticate(mode === 'switch' ? code : undefined); }}>
      {joining&&!invited&&<>
        <Label.Root htmlFor="entry-room">房间号（朋友发给你的号码）</Label.Root>
        <input id="entry-room" value={roomInput} maxLength={2048} required autoComplete="off"
          placeholder="6 位房间号，或粘贴邀请链接" disabled={busy} aria-describedby="entry-room-hint"
          onChange={e=>{setRoomInput(e.target.value);setError('');}}/>
        <p className="hint" id="entry-room-hint">房间号只用于找到朋友开的房间。</p>
      </>}
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
          onClick={() => { setMode('create'); setError(''); }}>第一次玩 · 取昵称</button>
        <button type="button" aria-pressed={mode === 'switch'} disabled={busy}
          className={`guest-tab-btn is-switch ${mode === 'switch' ? 'is-active is-switch' : ''}`}
          onClick={() => { setMode('switch'); setError(''); }}>已有仙友码</button>
      </div>
        <Label.Root htmlFor="entry-identity">{mode === 'create' ? '玩家昵称（大家怎么称呼你）' : '原账号的 6 位仙友码'}</Label.Root>
        {mode === 'create' ? <input key="nickname" id="entry-identity" value={nickname}
          maxLength={20} required autoComplete="nickname" placeholder="例如：小陈、阿辉" disabled={busy}
          aria-describedby="entry-identity-hint" onChange={e => { setNickname(e.target.value); setError(''); }} />
          : <input key="code" id="entry-identity" className="guest-switch-input" value={code}
            maxLength={6} pattern="\d{6}" inputMode="numeric" required autoComplete="off"
            placeholder="例如：123456" disabled={busy} aria-describedby="entry-identity-hint"
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} />}
        <p className="hint" id="entry-identity-hint">{mode === 'create'
          ? '填朋友认识的称呼，别填房间号；仙友码由系统自动分配。'
          : '输入仙友码即可找回原账号，继续使用原昵称、头像和战绩。'}</p>
        {error && <p className="error entry-error" role="alert">{error}</p>}
        <button className="mp-cyan-pill" disabled={busy || (mode === 'create' ? !nickname.trim() : code.length !== 6)} type="submit">
          {busy ? '正在进入…' : mode==='create'?joining?'使用此昵称加入房间':`取好昵称，${purpose}`:joining?'找回账号并加入房间':`找回账号，${purpose}`}
        </button>
      </form>
    </section>
  </Modal>;
}
