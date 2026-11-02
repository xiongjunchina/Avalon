import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installRuntimeCompatibility } from '../src/platform/runtime-compat.js';

function shim() {
  const prototype: { at?: (this: unknown, index?: unknown) => unknown } = {};
  installRuntimeCompatibility(prototype);
  return { prototype, at: prototype.at! };
}

test('native compatibility supplies non-enumerable at without replacing a working native implementation', () => {
  const { prototype, at } = shim();
  assert.deepEqual(Object.keys(prototype), []);
  assert.deepEqual(Object.getOwnPropertyDescriptor(prototype, 'at'), { value: at, writable: true, enumerable: false, configurable: true });
  installRuntimeCompatibility(prototype);
  assert.equal(prototype.at, at);
  const native = { at: Array.prototype.at };
  installRuntimeCompatibility(native);
  assert.equal(native.at, Array.prototype.at);
});

test('native at fallback matches integer, negative, fractional and coerced index behavior', () => {
  const { at } = shim(), values = ['first', 'middle', 'last'];
  for (const index of [undefined, 0, -0, 1, -1, 2, -3, 3, -4, 1.9, -1.9, NaN, Infinity, -Infinity, '1', '-1', 'bad', null, true, { valueOf: () => -1 }]) {
    assert.equal(at.call(values, index), Array.prototype.at.call(values, index as number), String(index));
  }
  assert.equal(at.call([], -1), undefined);
  assert.equal(at.call(Array(2), 0), undefined);
  for (const index of [1n, Symbol('index')]) assert.throws(() => at.call(values, index), TypeError);
});

test('native at fallback supports array-like receivers and follows length before index coercion', () => {
  const { at } = shim();
  for (const length of [undefined, null, NaN, -1, 0, 2.9, '3', Infinity]) {
    const receiver = { 0: 'a', 1: 'b', 2: 'c', length };
    for (const index of [0, 1, -1, -3]) assert.equal(at.call(receiver, index), Array.prototype.at.call(receiver as unknown as unknown[], index));
  }
  assert.equal(at.call('西游', -1), '游');
  assert.equal(at.call(42, 0), undefined);
  assert.equal(at.call({ length: 3, 2: 'last' }, -1), 'last');
  for (const receiver of [null, undefined]) assert.throws(() => at.call(receiver, 0), TypeError);
  for (const length of [1n, Symbol('length')]) assert.throws(() => at.call({ length }, 0), TypeError);
  const order: string[] = [];
  const receiver = { get length() { order.push('length'); return 1; }, 0: 'a' };
  const index = { valueOf() { order.push('index'); return 0; } };
  assert.equal(at.call(receiver, index), 'a');
  assert.deepEqual(order, ['length', 'index']);
});
