import type { WxRuntime } from '../platform/wechat.js';

export function playEffect(runtime: WxRuntime, src: string): void {
  const sound = runtime.createInnerAudioContext?.();
  if (!sound) return;
  sound.src = src;
  sound.play();
  setTimeout(() => sound.destroy(), 4_000);
}
