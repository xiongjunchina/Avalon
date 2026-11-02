import type { WxRuntime } from '../platform/wechat.js';

let cancelPending: (() => void) | undefined;
export function cancelTextInput() { cancelPending?.(); }
export function askText(runtime: WxRuntime, defaultValue = '', maxLength = 64, options: { retainOnComplete?: boolean } = {}): Promise<string | undefined> {
  cancelPending?.();
  return new Promise(resolve => {
    if (!runtime.showKeyboard || !runtime.onKeyboardConfirm) { resolve(undefined); return; }
    let finished = false, draft = defaultValue;
    const finish = (value?: string) => {
      if (finished) return;
      finished = true;
      runtime.offKeyboardConfirm?.(onConfirm);
      runtime.offKeyboardComplete?.(onComplete);
      runtime.offKeyboardInput?.(onInput);
      cancelPending = undefined;
      runtime.hideKeyboard?.();
      resolve(value);
    };
    const onInput = (event: { value: string }) => { draft = event.value; };
    const onConfirm = (event: { value: string }) => finish(event.value.trim());
    const onComplete = (event?: { value?: string }) => finish(options.retainOnComplete ? (event?.value ?? draft).trim() : undefined);
    const cancel = () => finish();
    cancelPending = cancel;
    runtime.onKeyboardConfirm(onConfirm);
    runtime.onKeyboardComplete?.(onComplete);
    runtime.onKeyboardInput?.(onInput);
    runtime.showKeyboard({ defaultValue, maxLength, confirmType: 'done', fail: cancel });
  });
}
