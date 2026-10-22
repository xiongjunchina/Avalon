// Development-only: rasterize the repository's original React SVG components once.
// Run with node --import tsx; the checked-in PNGs keep production builds dependency-free.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Emblem, WuYueBackdrop } from '../../web/src/Heraldry.tsx';
const root = resolve(import.meta.dirname, '../../..');
const { default: sharp } = await import(process.env.MINIGAME_SHARP_PATH ? pathToFileURL(process.env.MINIGAME_SHARP_PATH).href : 'sharp');
const out = join(root, 'apps/minigame/assets/emblems');
await mkdir(out, { recursive: true });
for (const [name, component] of [
  ...Array.from({ length: 5 }, (_, index) => ['quest-' + (index + 1), React.createElement(WuYueBackdrop, { mission: index + 1 })]),
  ...['cards', 'leaf', 'moon', 'sun', 'mountain', 'wave', 'star', 'blue', 'red', 'crown', 'chronicle'].map(kind => [kind, React.createElement(Emblem, { kind })]),
]) {
  const svg = renderToStaticMarkup(component).replace('<svg ', '<svg color="#ffd875" ');
  await sharp(Buffer.from(svg)).resize(96, 96).png().toFile(join(out, name + '.png'));
}
await writeFile(join(out, 'source.json'), JSON.stringify({ component: 'apps/web/src/Heraldry.tsx', sha256: createHash('sha256').update(await readFile(join(root, 'apps/web/src/Heraldry.tsx'))).digest('hex') }, null, 2));
console.log('Original web SVG emblems rasterized: ' + out);
