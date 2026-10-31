// Development-only: rasterize the repository's original React SVG components once.
// Run with node --import tsx; the checked-in PNGs keep production builds dependency-free.
import React from 'react';
import {execFileSync} from 'node:child_process';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Emblem, WuYueBackdrop, CloudFlourish, DragonPlinthDecor, ImperialDragonCrown, RuyiSlotFrame } from '../../web/src/Heraldry.tsx';
const root = resolve(import.meta.dirname, '../../..');
const {chromium}=await import(process.env.MINIGAME_PLAYWRIGHT_PATH?pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.MINIGAME_CHROMIUM_PATH?{executablePath:process.env.MINIGAME_CHROMIUM_PATH}:{})});
const page=await browser.newPage();
const out = join(root, 'apps/minigame/assets/emblems');
await mkdir(out, { recursive: true });
try{for (const [name, component, color] of [
  ['cards-cyan',React.createElement(Emblem,{kind:'cards'}),'#b6f5ff'],
  ...['left','right'].flatMap(side=>[['cloud-brown-'+side,React.createElement(CloudFlourish,{side}),'#78350f'],['cloud-disabled-'+side,React.createElement(CloudFlourish,{side}),'#5a260e']]),
  ['blue-faction',React.createElement(Emblem,{kind:'blue'}),'#b9e2ed'],
  ['red-faction',React.createElement(Emblem,{kind:'red'}),'#f0bea8'],
  ['imperial-crown',React.createElement(ImperialDragonCrown)],
  ['ruyi',React.createElement(RuyiSlotFrame,{isSelf:false})],
  ['ruyi-self',React.createElement(RuyiSlotFrame,{isSelf:true})],
  ...Array.from({ length: 5 }, (_, index) => ['quest-' + (index + 1), React.createElement(WuYueBackdrop, { mission: index + 1 })]),
  ...['left', 'right'].flatMap(side => [['cloud-' + side, React.createElement(CloudFlourish, { side })], ['dragon-' + side, React.createElement(DragonPlinthDecor, { side })]]),
  ...['cards', 'leaf', 'moon', 'sun', 'mountain', 'wave', 'star', 'blue', 'red', 'crown', 'chronicle'].map(kind => [kind, React.createElement(Emblem, { kind })]),
]) {
  const svg = renderToStaticMarkup(component).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" color="'+(color??'#ffd875')+'" ').replace(/style="transform:[^"]+"/g, '');
  const dimensions=name.startsWith('ruyi')?[200,230]:name==='imperial-crown'?[144,90]:name.startsWith('cloud-')||name.startsWith('dragon-')?[280,160]:[192,192];
  const png=await page.evaluate(async({svg,dimensions,flip})=>{const canvas=document.createElement('canvas');[canvas.width,canvas.height]=dimensions;const ctx=canvas.getContext('2d'),img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();const scale=Math.min(canvas.width/img.width,canvas.height/img.height);if(flip){ctx.translate(canvas.width,0);ctx.scale(-1,1);}ctx.drawImage(img,(canvas.width-img.width*scale)/2,(canvas.height-img.height*scale)/2,img.width*scale,img.height*scale);return canvas.toDataURL('image/png').split(',')[1];},{svg,dimensions,flip:name.endsWith('-right')});
  await writeFile(join(out,name+'.png'),Buffer.from(png,'base64'));
}}finally{await browser.close();}

await writeFile(join(out, 'source.json'), JSON.stringify({ component: 'apps/web/src/Heraldry.tsx', sha256: createHash('sha256').update(await readFile(join(root, 'apps/web/src/Heraldry.tsx'))).digest('hex') }, null, 2));
execFileSync('python',['-c',`from pathlib import Path
from PIL import Image
import sys
for p in Path(sys.argv[1]).glob('*.png'):
 im=Image.open(p); original=im.convert('RGBA').tobytes(); im.save(p,optimize=True,compress_level=9); assert Image.open(p).convert('RGBA').tobytes()==original
`,out],{stdio:'inherit'});
console.log('Original web SVG emblems rasterized: ' + out);
