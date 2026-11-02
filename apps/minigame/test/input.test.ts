import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askText, cancelTextInput } from '../src/ui/input.js';

test('closing the keyboard cancels input and removes both listeners', async () => {
  let close: (() => void) | undefined;
  const removed: string[] = [];
  const runtime = { showKeyboard() {}, onKeyboardConfirm() {},
    onKeyboardComplete(callback: () => void) { close = callback; },
    offKeyboardConfirm() { removed.push('confirm'); }, offKeyboardComplete() { removed.push('complete'); },
  } as any;
  const result = askText(runtime);
  assert.equal(typeof close, 'function');
  close!();
  assert.equal(await result, undefined);
  assert.deepEqual(removed, ['confirm', 'complete']);
});

test('join drafts survive keyboard dismissal and all input listeners are removed', async () => {
  let input: ((event: { value: string }) => void) | undefined;
  let complete: ((event?: { value?: string }) => void) | undefined;
  let confirm: ((event: { value: string }) => void) | undefined;
  const removed: string[] = [];
  const runtime = {
    showKeyboard() {}, hideKeyboard() {},
    onKeyboardInput(callback: typeof input) { input = callback; },
    onKeyboardComplete(callback: typeof complete) { complete = callback; },
    onKeyboardConfirm(callback: typeof confirm) { confirm = callback; },
    offKeyboardConfirm() { removed.push('confirm'); },
    offKeyboardComplete() { removed.push('complete'); },
    offKeyboardInput() { removed.push('input'); },
  } as any;
  const result = askText(runtime, '', 200, { retainOnComplete: true });
  input!({ value: ' 654321 ' });
  complete!();
  assert.equal(await result, '654321');
  assert.deepEqual(removed, ['confirm', 'complete', 'input']);
  confirm!({ value: 'late-event' });
  assert.equal(await result, '654321');
  const next = askText(runtime, '654321', 200, { retainOnComplete: true });
  complete!({ value: ' https://game.ccnepower.com/avalon/?invite=new-room ' });
  assert.equal(await next, 'https://game.ccnepower.com/avalon/?invite=new-room');
});

test('explicit cancellation and keyboard failure never accept a join draft', async () => {
  const runtime = { showKeyboard() {}, onKeyboardConfirm() {} } as any;
  const pending = askText(runtime, '654321', 200, { retainOnComplete: true });
  cancelTextInput();
  assert.equal(await pending, undefined);
  const failed = askText({ ...runtime, showKeyboard(options: any) { options.fail(new Error('unavailable')); } }, '654321', 200, { retainOnComplete: true });
  assert.equal(await failed, undefined);
});
