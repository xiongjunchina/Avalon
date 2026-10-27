import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secureRandomBelow } from '../src/secure-random.js';

test('cryptographic draw rejects incomplete ranges instead of introducing modulo bias', () => {
  const source = [Uint8Array.of(15), Uint8Array.of(10), Uint8Array.of(9)];
  let draws = 0;
  const value = secureRandomBelow(10n, size => { assert.equal(size, 1); return source[draws++]; });
  assert.equal(value, 9n); assert.equal(draws, 3);
});

test('cryptographic draw masks excess bits and retains exact values beyond safe integers', () => {
  assert.equal(secureRandomBelow(4n, () => Uint8Array.of(255)), 3n);
  const large = (1n << 80n) + 1n;
  const bytes = Uint8Array.of(255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.equal(secureRandomBelow(large, size => { assert.equal(size, 11); return bytes; }), 1n << 80n);
  assert.equal(bytes[0], 255); // The caller's entropy buffer is never modified.
});

test('cryptographic draw handles one possible ticket without entropy and rejects invalid bounds', () => {
  assert.equal(secureRandomBelow(1n, () => { throw Error('No entropy needed'); }), 0n);
  assert.throws(() => secureRandomBelow(0n), RangeError); assert.throws(() => secureRandomBelow(-5n), RangeError);
  assert.throws(() => secureRandomBelow(4n, () => new Uint8Array()), /entropy length/);
  for (const bound of [2n, 256n, 257n, 10n ** 25n]) {
    const draw = secureRandomBelow(bound);
    assert.ok(draw >= 0n && draw < bound);
  }
});
