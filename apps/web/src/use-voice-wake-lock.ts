import { useEffect, useState } from 'react';
import { VoiceWakeLockController, type VoiceWakeLockState } from './voice-wake-lock';

export type { VoiceWakeLockState } from './voice-wake-lock';

/** Own once in App, so moving voice controls between waiting/game views does not reset the preference. */
export function useVoiceWakeLock(voiceActive: boolean): VoiceWakeLockState {
  const [controller] = useState(() => new VoiceWakeLockController({
    supported: typeof navigator !== 'undefined' && typeof navigator.wakeLock?.request === 'function',
    visible: () => typeof document !== 'undefined' && document.visibilityState === 'visible',
    request: () => navigator.wakeLock.request('screen'),
  }));
  const [state, setState] = useState(controller.getState());
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    const changed = () => controller.visibilityChanged();
    document.addEventListener('visibilitychange', changed);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', changed); controller.dispose(); };
  }, [controller]);
  useEffect(() => { controller.setVoiceActive(voiceActive); }, [controller, voiceActive]);
  return { ...state, toggle: () => controller.toggle() };
}
