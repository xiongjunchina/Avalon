import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import {forLegacyWechatEngine} from './legacy-engine.js';

test('text grouping runs on the phone engine that rejects Unicode property escapes',async()=>{
  // esbuild can lower property literals to RegExp constructors without providing
  // property support. This reproduces the Vivo 1.0.2 subtitle crash exactly.
  const compiled=await build({entryPoints:['apps/minigame/src/ui/layout.ts'],bundle:true,write:false,format:'cjs',target:'es2020'});
  const module={exports:{}};
  runInNewContext(await forLegacyWechatEngine(compiled.outputFiles[0]!.text),{module,exports:module.exports});
  const group=(value:string)=>Array.from((module.exports as {textGraphemes(value:string):string[]}).textGraphemes(value));
  assert.deepEqual(group('一念佛魔皆幻相'),Array.from('一念佛魔皆幻相'));
  assert.deepEqual(group('A\u0301👩🏽‍💻🇨🇳🇺🇸猴'),['A\u0301','👩🏽‍💻','🇨🇳','🇺🇸','猴']);
  assert.deepEqual(group('א\u05b0ب\u0651क\u093fก\u0e49'),['א\u05b0','ب\u0651','क\u093f','ก\u0e49']);
  assert.deepEqual(group('漢\u{e0100}𝅘𝅥\u{1d165}✌️1️⃣'),['漢\u{e0100}','𝅘𝅥\u{1d165}','✌️','1️⃣']);
  assert.deepEqual(group('🇨🇳🇺'),['🇨🇳','🇺'],'regional indicators only combine into pairs');
});
