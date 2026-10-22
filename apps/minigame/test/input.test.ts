import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askText } from '../src/ui/input.js';

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
