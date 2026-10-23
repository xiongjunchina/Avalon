import { useEffect, useRef, type ReactNode } from 'react';
import { requestPageSound } from './audio-interactions';

/** Native dialog supplies focus trapping, Escape and focus restoration. */
export function Modal({ label, scene, onClose, children, sound = true }: {
  label: string; scene?: 'gate' | 'sword' | 'pavilion' | 'library' | 'mirror' | 'dawn';
  onClose: () => void; children: ReactNode; sound?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    if (sound) requestPageSound();
    return () => { dialog.close(); if (sound) requestPageSound(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="table-modal-backdrop" data-scene={scene} aria-label={label} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>{children}</dialog>;
}
