export type RandomBelow = (upperExclusive: bigint) => bigint;

/** Exact bounded sampling. The byte provider is injectable for browser-free practice and tests. */
export function randomBigIntBelow(
  upperExclusive: bigint,
  fill: (bytes: Uint8Array<ArrayBuffer>) => void = bytes => {
    if (!globalThis.crypto?.getRandomValues) throw new Error('SECURE_RANDOM_UNAVAILABLE');
    globalThis.crypto.getRandomValues(bytes);
  },
): bigint {
  if (upperExclusive <= 0n) throw new RangeError('INVALID_RANDOM_BOUND');
  if (upperExclusive === 1n) return 0n;
  const bits = (upperExclusive - 1n).toString(2).length;
  const bytes = new Uint8Array(Math.ceil(bits / 8));
  const mask = 0xff >>> (bytes.length * 8 - bits);
  // Acceptance probability is at least 1/2. A faulty injected provider must not hang a room.
  for (let attempt = 0; attempt < 128; attempt++) {
    fill(bytes);
    bytes[0] &= mask;
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    if (value < upperExclusive) return value;
  }
  throw new Error('RANDOM_SOURCE_FAILED');
}
