import { EFFECT_CUES, type EffectCue } from './audio-events';
import { useEffect, useRef } from 'react';

export const PAGE_SOUND_EVENT = 'lunjian:page-sound';
export function requestPageSound() { document.dispatchEvent(new Event(PAGE_SOUND_EVENT)); }
export function usePageSound(key: string) {
  const previous = useRef(key);
  useEffect(() => { if (previous.current !== key) requestPageSound(); previous.current = key; }, [key]);
}

/** All actionable controls use the same neutral feedback, regardless of a secret choice. */
export function interactionCue(target: Element | null, kind: 'click' | 'change' | 'keyboard'): EffectCue | null {
  const selector = kind === 'change' ? 'select, input[type="checkbox"], input[type="radio"], input[type="file"]'
    : kind === 'keyboard' ? '[role="button"], [role="tab"], [role="switch"]'
    : 'button, a[href], summary, [role="button"], [role="tab"], [role="switch"], input[type="submit"], input[type="button"], input[type="reset"]';
  const control = target?.closest(selector);
  if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert], fieldset:disabled')) return null;
  // Native controls already generate click/change for keyboard input. Label clicks are followed by input change.
  if (kind === 'keyboard' && control.matches('button, input, select, a[href], summary')) return null;
  if (kind === 'click' && control.matches('input[type="checkbox"], input[type="radio"]')) return null;
  const cue = control.closest('[data-sound]')?.getAttribute('data-sound');
  return EFFECT_CUES.includes(cue as EffectCue) ? cue as EffectCue : 'tap';
}
