import { useEffect, useMemo, useState } from 'react';

type ReadStorage = Pick<Storage, 'getItem' | 'setItem'>;
const pageVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

// Only an acknowledgement is stored, never the target, alignment, or role.
export function readPrivateAcknowledgement(key: string | null, storage?: ReadStorage) {
  if (!key) return false;
  try { return (storage ?? window.localStorage).getItem(key) === 'read'; } catch { return false; }
}
export function savePrivateAcknowledgement(key: string, storage?: ReadStorage) {
  try { (storage ?? window.localStorage).setItem(key, 'read'); } catch { /* In-memory acknowledgement still works. */ }
}

export function privateNoticeVisible(state: { key: string | null; unread: boolean; connected: boolean; visible: boolean; automatic: boolean; reviewing: string | null }) {
  return Boolean(state.key && state.connected && state.visible && (state.reviewing === state.key || (state.unread && state.automatic)));
}

export function usePrivateNotice(key: string | null, connected: boolean) {
  const storedRead = useMemo(() => readPrivateAcknowledgement(key), [key]);
  const [readKeys, setReadKeys] = useState<Set<string>>(() => new Set());
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [visible, setVisible] = useState(pageVisible);
  const [automatic, setAutomatic] = useState(() => connected && pageVisible());

  useEffect(() => {
    const change = () => {
      setVisible(pageVisible());
      if (!pageVisible()) { setAutomatic(false); setReviewing(null); }
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    if (!connected) { setAutomatic(false); setReviewing(null); }
  }, [connected]);

  const unread = Boolean(key && !storedRead && !readKeys.has(key));
  return {
    unread,
    visible: privateNoticeVisible({ key, unread, connected, visible, automatic, reviewing }),
    pageVisible: visible,
    // An explicit use/open action makes it safe to show the private result again.
    allowAutomatic: () => setAutomatic(true),
    open: () => { if (key) setReviewing(key); },
    acknowledge: () => {
      if (!key) return;
      savePrivateAcknowledgement(key);
      setReadKeys(previous => new Set(previous).add(key));
      setReviewing(null);
    },
  };
}
