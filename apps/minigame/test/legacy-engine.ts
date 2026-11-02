import { transform } from 'esbuild';

// The Android device log showed that Devtools lowered the unsupported regexp
// literal to a RegExp constructor, which then threw while painting a label.
// Emulate that compile/runtime boundary, not just Node's modern regexp engine.
export async function forLegacyWechatEngine(bundle: string): Promise<string> {
  const lowered = await transform(bundle, {
    loader: 'js', target: 'es2020',
    supported: { 'regexp-unicode-property-escapes': false },
  });
  return String.raw`"use strict";
delete Array.prototype.at;
delete String.prototype.replaceAll;
const NativeRegExp = RegExp;
globalThis.RegExp = new Proxy(NativeRegExp, {
  apply(target, receiver, args) {
    if (String(args[0]).includes('\\p{') || String(args[0]).includes('\\P{'))
      throw new SyntaxError('Invalid property name in character class');
    return Reflect.apply(target, receiver, args);
  },
  construct(target, args, newTarget) {
    if (String(args[0]).includes('\\p{') || String(args[0]).includes('\\P{'))
      throw new SyntaxError('Invalid property name in character class');
    return Reflect.construct(target, args, newTarget);
  },
});
` + lowered.code;
}
