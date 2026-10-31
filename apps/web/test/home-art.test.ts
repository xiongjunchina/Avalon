import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../public/art/home/', import.meta.url);

test('home artwork stays within separate mobile and desktop transfer budgets', async () => {
  for (const [name, budget] of [['duel-mobile.webp', 160_000], ['duel-desktop.webp', 260_000]] as const) {
    const image = await readFile(new URL(name, root));
    assert.equal(image.subarray(0, 4).toString(), 'RIFF');
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
    assert.ok(image.length <= budget, `${name}: ${image.length} bytes exceeds ${budget}`);
  }
  assert.deepEqual((await readdir(root)).filter(name => /\.(png|jpe?g|webp)$/i.test(name)).sort(),
    ['duel-desktop.webp', 'duel-mobile.webp']);
});

test('home theme fonts use small local WOFF2 subsets', async () => {
  const fonts = await Promise.all(['home-calligraphy.woff2', 'home-display.woff2'].map(async name => {
    const font = await readFile(new URL(`fonts/${name}`, root));
    assert.equal(font.subarray(0, 4).toString(), 'wOF2');
    assert.ok(font.length <= 35_000, `${name}: ${font.length} bytes exceeds 35KB`);
    return font;
  }));
  assert.ok(fonts.reduce((sum, font) => sum + font.length, 0) <= 60_000, 'home font transfer exceeds 60KB');
});
