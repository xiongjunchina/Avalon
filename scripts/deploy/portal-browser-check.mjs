// Optional visual check. Requires Playwright and an already-running static portal preview.
// PLAYWRIGHT_MODULE may point at the developer's bundled Playwright installation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2];
assert.ok(origin, 'Usage: node scripts/deploy/portal-browser-check.mjs <preview URL> [artifact directory]');
const artifacts = resolve(process.argv[3] || '/tmp/avalon-portal-browser');
await mkdir(artifacts, {recursive:true});
const browser = await chromium.launch({headless:true});
const results = [];
try {
  for (const [width,height] of [[320,700],[375,740],[390,740],[430,800],[760,900],[768,900],[1440,900]]) {
    const context = await browser.newContext({viewport:{width,height}, deviceScaleFactor:width === 390 ? 3 : 1});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, {waitUntil:'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => ({
      overflow:document.documentElement.scrollWidth > innerWidth,
      fontLoaded:[...document.fonts].some(font => font.family === 'Portal Display' && font.status === 'loaded'),
      resources:performance.getEntriesByType('resource').map(r => ({url:new URL(r.name).pathname,bytes:r.encodedBodySize})),
      documentBytes:performance.getEntriesByType('navigation')[0].encodedBodySize,
      cards:[...document.querySelectorAll('.game')].map(card => {
        const content = card.querySelector('.content'), image = card.querySelector('img');
        return {
          rect:card.getBoundingClientRect().toJSON(), content:content.getBoundingClientRect().toJSON(),
          background:getComputedStyle(content).backgroundColor,
          image:{url:new URL(image.currentSrc).pathname,width:image.naturalWidth,height:image.naturalHeight,
            rect:image.getBoundingClientRect().toJSON(),fit:getComputedStyle(image).objectFit},
          text:[...content.querySelectorAll('h2,p,a')].map(node => ({text:node.textContent,tag:node.className,
            width:node.clientWidth,scroll:node.scrollWidth,rect:node.getBoundingClientRect().toJSON(),
            font:getComputedStyle(node).fontFamily,size:parseFloat(getComputedStyle(node).fontSize)})),
          button:content.querySelector('a').getBoundingClientRect().toJSON(),
        };
      }),
    }));
    await writeFile(join(artifacts,`${width}.json`), JSON.stringify(state,null,2));
    await page.screenshot({path:join(artifacts,`${width}.png`),fullPage:true,scale:'css'});
    assert.equal(state.overflow,false, `page overflow at ${width}`);
    assert.deepEqual(errors,[]);
    assert.equal(state.fontLoaded,true, `local game font missing at ${width}`);
    assert.equal(state.resources.filter(r => r.url.endsWith('.webp')).length,2);
    const fonts = state.resources.filter(r => r.url.endsWith('.woff2'));
    assert.equal(fonts.length,1);
    assert.ok(fonts[0].bytes > 0 && fonts[0].bytes <= 30000);
    for (const card of state.cards) {
      assert.equal(card.background,'rgba(0, 0, 0, 0)');
      assert.ok(card.image.url.endsWith(width < 760 ? '-mobile.webp' : '-desktop.webp'));
      assert.ok(card.button.height >= 44);
      assert.ok(card.button.bottom <= card.rect.bottom);
      for (const text of card.text) {
        assert.ok(text.scroll <= text.width + 1, `text overflow at ${width}: ${text.text}`);
        assert.ok(text.font.startsWith('"Portal Display"'), `fallback game typography at ${width}`);
      }
      if (width < 760) {
        assert.equal(card.image.fit,'contain', `mobile must not crop at ${width}`);
        assert.ok(Math.abs(card.image.rect.width / card.image.rect.height - card.image.width / card.image.height) < .015);
        assert.ok(card.content.top >= card.rect.top + card.rect.height * .5, `copy enters faces at ${width}`);
        assert.ok(card.content.height / card.rect.height <= (width < 375 ? .45 : .4), `oversized copy area at ${width}`);
        for (const text of card.text.filter(text => ['hook','description'].includes(text.tag))) assert.ok(text.size <= 14);
      }
    }
    if (width === 390) assert.ok(state.cards[1].button.bottom <= height, 'mobile entrances below first viewport');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('href'),'/avalon/');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('href'),'/mafia/');
    results.push({width,height,...state});
    await context.close();
  }
  await writeFile(join(artifacts,'results.json'), JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(r => ({width:r.width,images:r.cards.map(c => ({...c.image,rect:undefined})),
    copyRatios:r.cards.map(c => +(c.content.height/c.rect.height).toFixed(3)),
    firstLoadBytes:r.documentBytes+r.resources.reduce((sum,r)=>sum+r.bytes,0),
    secondButtonBottom:r.cards[1].button.bottom})),null,2));
} finally {
  await browser.close();
}
