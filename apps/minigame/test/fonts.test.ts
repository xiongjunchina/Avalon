import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installWebFonts } from '../src/platform/fonts.js';

test('native font loader uses packaged web fonts and tolerates unavailable fonts', () => {
  const paths: string[] = [];
  installWebFonts({ loadFont(path) { paths.push(path); if(path.includes('display')) throw new Error('old runtime'); return path.includes('sans') ? null : 'LocalCalligraphy'; } });
  assert.deepEqual(paths, ['art/fonts/calligraphy.ttf','art/fonts/display.ttf','art/fonts/sans.ttf']);
  assert.doesNotThrow(() => installWebFonts({}));
});

test('all bundled web fonts are TrueType files with their redistribution licenses', async () => {
  for(const name of ['calligraphy','display','sans']) {
    const font=await readFile(new URL('../assets/fonts/'+name+'.ttf',import.meta.url));
    assert.equal(font.subarray(0,4).toString('hex'),'00010000');
    const license=await readFile(new URL('../assets/fonts/'+name+'-OFL.txt',import.meta.url),'utf8');
    assert.match(license,/SIL OPEN FONT LICENSE/);
  }
});
