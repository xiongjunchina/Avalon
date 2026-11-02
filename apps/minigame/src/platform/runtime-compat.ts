/** Install only the built-ins needed by shared game code on older WeChat engines.
 * esbuild lowers syntax but does not supply ES2022 methods such as Array.at. */
export function installRuntimeCompatibility(arrayPrototype: object = Array.prototype): void {
  if (typeof (arrayPrototype as { at?: unknown }).at === 'function') return;
  Object.defineProperty(arrayPrototype, 'at', {
    configurable: true,
    writable: true,
    enumerable: false,
    value: function at(this: unknown, index: number): unknown {
      if (this === null || this === undefined) throw new TypeError('Array.prototype.at called on null or undefined');
      const receiver = Object(this) as Record<number | 'length', unknown>;
      // Unary plus implements ToNumber (unlike Number(), it rejects BigInt).
      const rawLength = +(receiver.length as number);
      const length = Number.isNaN(rawLength) || rawLength <= 0 ? 0 : Math.min(Math.floor(rawLength), Number.MAX_SAFE_INTEGER);
      const rawIndex = +index;
      const relativeIndex = Number.isNaN(rawIndex) || rawIndex === 0 ? 0 : Math.trunc(rawIndex);
      const position = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
      return position < 0 || position >= length ? undefined : receiver[position];
    },
  });
}

installRuntimeCompatibility();
