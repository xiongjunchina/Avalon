import type { WxRuntime } from '../platform/wechat.js';

export function askText(runtime: WxRuntime, defaultValue = '', maxLength = 64): Promise<string | undefined> {
  return new Promise(resolve => {
    if (!runtime.showKeyboard || !runtime.onKeyboardConfirm) { resolve(undefined); return; }
    const onConfirm = (event: { value: string }) => { runtime.offKeyboardConfirm?.(onConfirm); runtime.hideKeyboard?.(); resolve(event.value.trim()); };
    runtime.onKeyboardConfirm(onConfirm);
    runtime.showKeyboard({ defaultValue, maxLength, confirmType: 'done', fail: () => { runtime.offKeyboardConfirm?.(onConfirm); resolve(undefined); } });
  });
}
