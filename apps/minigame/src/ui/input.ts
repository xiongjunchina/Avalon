import type { WxRuntime } from '../platform/wechat.js';

let cancelPending: (() => void) | undefined;
export function cancelTextInput() { cancelPending?.(); }
export function askText(runtime: WxRuntime, defaultValue = '', maxLength = 64): Promise<string | undefined> {
  cancelPending?.();
  return new Promise(resolve => {
    if (!runtime.showKeyboard || !runtime.onKeyboardConfirm) { resolve(undefined); return; }
    let finished = false;
    const finish = (value?: string) => {
      if (finished) return;
      finished = true;
      runtime.offKeyboardConfirm?.(onConfirm);
      runtime.offKeyboardComplete?.(onComplete);
      cancelPending = undefined;
      runtime.hideKeyboard?.();
      resolve(value);
    };
    const onConfirm = (event: { value: string }) => finish(event.value.trim());
    const onComplete = () => finish();
    cancelPending = onComplete;
    runtime.onKeyboardConfirm(onConfirm);
    runtime.onKeyboardComplete?.(onComplete);
    runtime.showKeyboard({ defaultValue, maxLength, confirmType: 'done', fail: onComplete });
  });
}
