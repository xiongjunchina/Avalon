import { randomBytes } from 'node:crypto';

/** Uniform integer in [0, upperExclusive), including ranges larger than Number.MAX_SAFE_INTEGER. */
export function secureRandomBelow(upperExclusive: bigint, entropy: (size: number) => Uint8Array = randomBytes): bigint {
  if (upperExclusive <= 0n) throw new RangeError('Random bound must be positive');
  if (upperExclusive === 1n) return 0n;
  const bits = (upperExclusive - 1n).toString(2).length;
  const length = Math.ceil(bits / 8), mask = 0xff >>> (length * 8 - bits);
  for (;;) {
    const bytes = Uint8Array.from(entropy(length));
    if (bytes.length !== length) throw new RangeError('Random entropy length does not match request');
    bytes[0] &= mask;
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    if (value < upperExclusive) return value;
    // Modulo would bias the last incomplete range; reject it and sample fresh bytes instead.
  }
}
