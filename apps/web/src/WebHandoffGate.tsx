import { useEffect, useRef, useState, type ReactNode } from 'react';
import { describe } from './api';
import { exchangeWebHandoff, readWebHandoff, type WebHandoffIntent } from './web-handoff';

/** A link pasted into an already-open game may only change the fragment. */
export function WebHandoffEntry({ initialIntent, children }: { initialIntent: WebHandoffIntent | null; children: ReactNode }) {
  const [entry, setEntry] = useState({ intent: initialIntent, revision: 0 });
  useEffect(() => {
    const receive = () => {
      const intent = readWebHandoff(window.location.href);
      if (!intent) return;
      window.history.replaceState(window.history.state, '', intent.cleanUrl);
      setEntry(current => ({ intent, revision: current.revision + 1 }));
    };
    window.addEventListener('hashchange', receive);
    return () => window.removeEventListener('hashchange', receive);
  }, []);
  return <WebHandoffGate key={entry.revision} intent={entry.intent}>{children}</WebHandoffGate>;
}

/** Do not mount the game (or reconnect an existing browser account) before consent. */
export function WebHandoffGate({ intent, children }: { intent: WebHandoffIntent | null; children: ReactNode }) {
  const [pending, setPending] = useState(Boolean(intent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(intent && !intent.ticket ? '链接无效，请回到小游戏重新复制本人接续链接。' : '');
  const submitting = useRef(false);
  if (!pending || !intent) return children;

  async function confirm() {
    if (submitting.current || !intent?.ticket) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await exchangeWebHandoff(intent.ticket);
      // The normal /me bootstrap restores the exact account, seat and current game.
      setPending(false);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className="app-shell handoff-shell" data-scene="pavilion">
    <section className="table-modal-sheet handoff-sheet" aria-labelledby="handoff-title" aria-busy={busy}>
      <h1 id="handoff-title">从小游戏继续到网页</h1>
      <p>确认后，本浏览器会使用链接对应的游戏账号，继续原来的房间、座位与对局。不会创建新账号。</p>
      <p>这是仅供本人使用的接续链接，5 分钟内有效且只能使用一次。若不是你本人刚刚在小游戏中生成的链接，请取消。</p>
      <p className="hint">网页语音仍需主动开启。需要同房通话时，请其他玩家也转到网页版。</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="handoff-actions">
        <button type="button" disabled={busy || !intent.ticket} onClick={() => void confirm()}>{busy ? '正在恢复账号…' : '确认使用我的小游戏账号'}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setPending(false)}>取消，继续使用当前网页身份</button>
      </div>
      <p className="hint">仅打开此页面不会切换账号。取消不会退出你在小游戏中的房间。</p>
    </section>
  </main>;
}
