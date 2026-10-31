// Optional visual/geometry audit; use an already-running local static portal preview.
// The source images are intentionally close-ups, as in the approved design; contain is NOT a fidelity gate.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.argv[2];assert.ok(origin,'Usage: node scripts/deploy/portal-browser-check.mjs <preview URL> [artifact directory]');
const artifacts=resolve(process.argv[3]||'/tmp/avalon-portal-browser');await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true});const results=[];
try {
  for(const[width,height]of[[320,700],[375,740],[390,740],[430,800],[760,900],[768,900],[1440,900]]) {
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===390?3:1});const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
    const state=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth,
      fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family),
      resources:performance.getEntriesByType('resource').map(r=>({url:new URL(r.name).pathname,bytes:r.encodedBodySize})),
      documentBytes:performance.getEntriesByType('navigation')[0].encodedBodySize,
      cards:[...document.querySelectorAll('.game')].map(card=>{
        const content=card.querySelector('.content'),image=card.querySelector('img'),meta=card.querySelector('.meta'),button=card.querySelector('a');
        return {rect:card.getBoundingClientRect().toJSON(),content:content.getBoundingClientRect().toJSON(),background:getComputedStyle(content).backgroundColor,
          image:{url:new URL(image.currentSrc).pathname,width:image.naturalWidth,height:image.naturalHeight,rect:image.getBoundingClientRect().toJSON(),fit:getComputedStyle(image).objectFit},
          text:[...content.querySelectorAll('h2,p,a')].map(node=>({text:node.textContent,tag:node.tagName,kind:node.className,width:node.clientWidth,scroll:node.scrollWidth,rect:node.getBoundingClientRect().toJSON(),font:getComputedStyle(node).fontFamily,size:parseFloat(getComputedStyle(node).fontSize)})),
          meta:meta.getBoundingClientRect().toJSON(),button:button.getBoundingClientRect().toJSON()};
      })}));
    await writeFile(join(artifacts,`${width}.json`),JSON.stringify(state,null,2));await page.screenshot({path:join(artifacts,`${width}.png`),fullPage:true,scale:'css'});
    assert.equal(state.overflow,false,`page overflow at ${width}`);assert.deepEqual(errors,[]);
    for(const name of ['Portal Interface','Portal Calligraphy'])assert.ok(state.fonts.includes(name),`font missing: ${name}`);
    assert.equal(state.resources.filter(r=>r.url.includes('/art/')&&r.url.endsWith('.webp')).length,2);
    assert.equal(state.resources.filter(r=>r.url.endsWith('tabletop.webp')).length,1);
    const fonts=state.resources.filter(r=>r.url.endsWith('.woff2'));assert.equal(fonts.length,2);assert.ok(fonts.reduce((s,r)=>s+r.bytes,0)<=40000);
    for(const card of state.cards) {
      assert.equal(card.background,'rgba(0, 0, 0, 0)');assert.ok(card.image.url.endsWith(width<760?'-mobile.webp':'-desktop.webp'));
      assert.ok(card.button.height>=44);assert.ok(card.button.bottom<=card.rect.bottom);
      for(const text of card.text){assert.ok(text.scroll<=text.width+1,`text overflow at ${width}: ${text.text}`);assert.ok(text.font.startsWith(text.tag==='H2'?'"Portal Calligraphy"':'"Portal Interface"'));}
      if(width<760){
        // Mobile design: large close-up in upper card, title/copy in lower half; metadata and entrance stay on separate rows.
        assert.ok(card.content.top>=card.rect.top+card.rect.height*.36,`copy too high at ${width}`);
        assert.ok(card.content.top<=card.rect.top+card.rect.height*.59,`portrait reduced to small bust at ${width}`);
        assert.ok(card.button.width/card.rect.width>=.78,`entrance must be a full row at ${width}`);
        assert.ok(card.button.top>=card.meta.bottom,`metadata and entrance combined into one row at ${width}`);
      }else{
        assert.ok(card.content.width/card.rect.width<=.49,'desktop copy must stay left');
        assert.ok(card.rect.width/card.rect.height>=2.9,'desktop banner proportions changed');
      }
    }
    if(width===390)assert.ok(state.cards[1].button.bottom<=height,'both mobile entrances must remain visible');
    await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('href'),'/avalon/');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('href'),'/mafia/');
    if(width===390||width===1440)for(const path of ['/avalon/','/mafia/']){await page.goto(origin,{waitUntil:'networkidle'});await page.locator(`a[href="${path}"]`).click();assert.equal(new URL(page.url()).pathname,path);}
    results.push({width,height,...state});await context.close();
  }
  await writeFile(join(artifacts,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({width:r.width,firstLoadBytes:r.documentBytes+r.resources.reduce((s,r)=>s+r.bytes,0),secondButtonBottom:r.cards[1].button.bottom})),null,2));
}finally{await browser.close();}
