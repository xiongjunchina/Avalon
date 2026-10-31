// Run against a local Vite server. API traffic is mocked; no production rooms are touched.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin=process.argv[2] || 'http://127.0.0.1:5189';
const output=resolve(process.argv[3] || '/tmp/avalon-home-duel');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
const fixtures=[...[ [320,568],[375,553],[390,740],[430,800],[640,900],[760,900],[1440,900] ].map(([width,height])=>({width,height})),
  {width:390,height:740,signedIn:true},{width:1440,height:900,signedIn:true},
  {width:390,height:740,invitation:true},{width:390,height:740,promotion:false}];
try {
  for(const fixture of fixtures) {
    const {width,height,signedIn=false,invitation=false,promotion=true}=fixture;
    const label=`${width}-${signedIn?'player':invitation?'invite':promotion?'visitor':'no-promotion'}`;
    if(process.env.HOME_REVIEW_FIXTURE && !new RegExp(process.env.HOME_REVIEW_FIXTURE).test(label)) continue;
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===390?3:1});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Prove local font fallback works even when Google Fonts is unavailable.
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.route('**/api/**',r=>{
      const path=new URL(r.request().url()).pathname;
      if(path.endsWith('/me')) return r.fulfill(signedIn?{json:{user:{id:'review-home',nickname:'内测仙友',playerCode:'123456'},roomId:null}}:{status:401,json:{error:'UNAUTHENTICATED'}});
      if(path.endsWith('/friends'))return r.fulfill({json:{friends:[]}});
      if(path.endsWith('/dedicated-rooms'))return r.fulfill({json:{rooms:[]}});
      return r.fulfill({json:{announcement:{enabled:false,text:''},freeAccessMode:promotion}});
    });
    await page.goto(origin+(invitation?'?invite=review-invitation':''),{waitUntil:'networkidle'});
    await page.locator('.home-duel-screen').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.lobby-duel-art img').evaluate(img=>img.decode());
    const state=await page.evaluate(()=>{
      const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();
      const art=document.querySelector('.lobby-duel-art img');
      return {overflow:document.documentElement.scrollWidth>innerWidth,main:box('main'),copy:box('.lobby-duel-copy'),
        actions:box('.lobby-primary-actions'),footer:box('.mp-home-footer'),
        image:{src:new URL(art.currentSrc).pathname,width:art.naturalWidth,height:art.naturalHeight,fit:getComputedStyle(art).objectFit,box:art.getBoundingClientRect().toJSON()},
        fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family),
        text:[...document.querySelectorAll('.home-duel-screen h1,.home-duel-screen h2,.home-duel-screen p,.home-duel-screen button')].map(n=>({text:n.textContent,overflow:n.scrollWidth>n.clientWidth+1,size:getComputedStyle(n).fontSize,font:getComputedStyle(n).fontFamily})),
        resources:performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,bytes:r.encodedBodySize}))};
    });
    results.push({fixture,...state});
    await writeFile(join(output,`${label}.json`),JSON.stringify(state,null,2));
    await page.screenshot({path:join(output,`${label}.png`),fullPage:true,scale:'css'});
    assert.deepEqual(errors,[]);
    assert.equal(state.overflow,false,`${label}: page overflow`);
    assert.equal(state.image.fit,'contain');
    assert.ok(state.image.width===(width<760?640:1280));
    assert.ok(state.actions.bottom<=height,`${label}: main actions below first viewport: ${state.actions.bottom}`);
    for(const text of state.text)assert.equal(text.overflow,false,`${label}: clipped ${text.text}`);
    for(const family of ['Home Calligraphy','Home Display']) assert.ok(state.fonts.includes(family),`${label}: ${family} not loaded`);
    const images=state.resources.filter(r=>/\/art\/home\/duel-.*\.webp/.test(r.path));
    assert.equal(images.length,1);
    assert.equal(state.resources.some(r=>r.path.includes('/art/roles/')),false,'home must not rotate role portraits');
    assert.equal(await page.getByRole('radio',{name:'线下常规房',exact:false}).getAttribute('aria-checked'),'true');
    await page.getByRole('radio',{name:'远端语音房',exact:false}).click();
    await page.getByRole('button',{name:'开语音房',exact:false}).waitFor();
    await page.getByRole('radio',{name:'线下常规房',exact:false}).click();
    assert.equal(await page.locator('.lobby-free-access-banner').count(),promotion?1:0);
    if(width===390 && !signedIn && !invitation && promotion) {
      // No profile creation or server mutation is performed: only inspect the deferred sign-in dialog.
      for(const selector of ['.lobby-primary-actions button:first-child','.lobby-primary-actions button:last-child','.practice-entry']) {
        await page.locator(selector).click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button',{name:'关闭',exact:true}).click();
      }
      await page.waitForTimeout(4100);
      assert.ok((await page.locator('.lobby-duel-art img').getAttribute('src')).endsWith('/art/home/duel-desktop.webp'));
    }
    if(signedIn && width===390) {
      await page.locator('.lobby-primary-actions button:first-child').click();
      await page.locator('.mp-setup-screen').waitFor();
    }
    await context.close();
  }
  await writeFile(join(output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results.map(r=>({fixture:r.fixture,actionBottom:r.actions.bottom,image:r.image.src,fonts:r.fonts.filter(f=>f.startsWith('Home '))})),null,2));
} finally {await browser.close();}
