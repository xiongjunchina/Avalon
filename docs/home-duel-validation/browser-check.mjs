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
  {width:320,height:568,signedIn:true},{width:390,height:740,signedIn:true},{width:1440,height:900,signedIn:true},
  {width:360,height:650,signedIn:true,nickname:'老熊',avatar:true,variant:'avatar'},
  {width:360,height:740,signedIn:true,nickname:'老熊',avatar:true,variant:'avatar-tall'},
  {width:320,height:568,signedIn:true,nickname:'昵称很长的一位内测仙友',avatar:true,variant:'long-name'},
  {width:390,height:740,invitation:true},{width:390,height:740,promotion:false}];
try {
  for(const fixture of fixtures) {
    const {width,height,signedIn=false,invitation=false,promotion=true}=fixture;
    const label=`${width}-${signedIn?'player':invitation?'invite':promotion?'visitor':'no-promotion'}${fixture.variant?'-'+fixture.variant:''}`;
    if(process.env.HOME_REVIEW_FIXTURE && !new RegExp(process.env.HOME_REVIEW_FIXTURE).test(label)) continue;
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<900?3:1,isMobile:width<900,hasTouch:width<900});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Prove local font fallback works even when Google Fonts is unavailable.
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
    await page.route('https://fonts.gstatic.com/**',r=>r.abort());
    await page.route('**/api/**',r=>{
      const path=new URL(r.request().url()).pathname;
      if(path.endsWith('/me')) return r.fulfill(signedIn?{json:{user:{id:'review-home',nickname:fixture.nickname??'内测仙友',playerCode:'123456',...(fixture.avatar?{avatarUrl:'/art/avatars/wx-1.webp'}:{})},roomId:null}}:{status:401,json:{error:'UNAUTHENTICATED'}});
      if(path.endsWith('/friends'))return r.fulfill({json:{friends:[]}});
      if(path.endsWith('/dedicated-rooms'))return r.fulfill({json:{rooms:[]}});
      return r.fulfill({json:{announcement:{enabled:false,text:''},freeAccessMode:promotion}});
    });
    await page.goto(origin+(invitation?'?invite=review-invitation':''),{waitUntil:'networkidle'});
    await page.locator('.home-duel-screen').waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.lobby-duel-art img').evaluate(img=>img.decode());
    if(fixture.avatar)await page.locator('.mp-avatar-ring img').evaluate(img=>img.decode());
    const state=await page.evaluate(()=>{
      const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();
      const art=document.querySelector('.lobby-duel-art img');
      return {overflow:document.documentElement.scrollWidth>innerWidth,main:box('main'),copy:box('.lobby-duel-copy'),
        headline:box('.lobby-duel-copy h2'),headlineLines:[...document.querySelectorAll('.lobby-duel-copy h2 span')].map(n=>n.getBoundingClientRect().top),
        actionHeights:[...document.querySelectorAll('.lobby-primary-actions button')].map(n=>n.getBoundingClientRect().height),
        actions:box('.lobby-primary-actions'),footer:box('.mp-home-footer'),sound:box('.sound-button'),profile:box('.mp-avatar-btn'),
        toolbar:[...document.querySelectorAll('.mp-home-topbar button')].map(n=>n.getBoundingClientRect().toJSON()),
        nickname:{visible:document.querySelector('.mp-avatar-name').clientWidth,full:document.querySelector('.mp-avatar-name').scrollWidth},
        avatarLoaded:!!document.querySelector('.mp-avatar-ring img')?.naturalWidth,
        navigation:box('.lobby-compact-links'),
        promotion:(()=>{const n=document.querySelector('.lobby-free-access-note');return n?{box:n.getBoundingClientRect().toJSON(),background:getComputedStyle(n).backgroundColor,image:getComputedStyle(n).backgroundImage}:null;})(),
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
    assert.equal(state.image.fit,'cover');
    assert.ok(state.image.width===(width<900?640:1280));
    assert.ok(Math.abs(state.image.box.height-state.main.height)<1,'scene must fill home, not a small medallion');
    assert.ok(state.actions.bottom<=height,`${label}: main actions below first viewport: ${state.actions.bottom}`);
    assert.ok(state.actionHeights.every(h=>h>=44));
    if(!signedIn || width>=390)assert.ok(state.sound.width>=70,`${label}: approved oval sound label was squashed`);
    if(signedIn && width<=380){assert.equal(state.sound.width,36,`${label}: narrow icon width`);assert.equal(state.sound.height,36,`${label}: narrow icon height`);}
    assert.ok(state.toolbar.every(r=>Math.abs(r.height-state.profile.height)<.5),`${label}: toolbar heights differ`);
    for(let i=1;i<state.toolbar.length;i++)assert.ok(state.toolbar[i-1].right<=state.toolbar[i].left,`${label}: toolbar overlap`);
    if(fixture.nickname==='老熊')assert.ok(state.profile.width<=100,`${label}: short nickname stretched the profile`);
    if(fixture.avatar)assert.equal(state.avatarLoaded,true);
    if(fixture.variant==='long-name')assert.ok(state.nickname.full>state.nickname.visible,'long nickname must be constrained');
    assert.ok(state.main.bottom-state.footer.bottom<=40,`${label}: empty lower area returned`);
    if(width<900)assert.ok(state.headlineLines[1]>state.headlineLines[0]+10,'approved mobile hook must occupy two lines');
    else assert.ok(Math.abs(state.headlineLines[1]-state.headlineLines[0])<1,'desktop hook stays on one line');
    for(const text of state.text)assert.equal(text.overflow,false,`${label}: clipped ${text.text}`);
    for(const family of ['Home Calligraphy','Home Interface']) assert.ok(state.fonts.includes(family),`${label}: ${family} not loaded`);
    const images=state.resources.filter(r=>/\/art\/home\/duel-.*\.webp/.test(r.path));
    assert.equal(images.length,1);
    assert.equal(state.resources.some(r=>r.path.includes('/art/roles/')),false,'home must not rotate role portraits');
    assert.equal(await page.getByRole('radio',{name:'线下常规房',exact:false}).getAttribute('aria-checked'),'true');
    await page.getByRole('radio',{name:'远端语音房',exact:false}).click();
    await page.getByRole('button',{name:'开语音房',exact:false}).waitFor();
    await page.getByRole('radio',{name:'线下常规房',exact:false}).click();
    assert.equal(await page.locator('.lobby-free-access-note').count(),promotion?1:0);
    if(promotion){assert.equal(state.promotion.background,'rgba(0, 0, 0, 0)');assert.equal(state.promotion.image,'none');assert.ok(state.promotion.box.top>=state.navigation.bottom);}
    if(width===390 && !signedIn && !invitation && promotion) {
      await page.getByRole('button',{name:'声音设置',exact:true}).click();
      await page.getByRole('dialog',{name:'声音设置',exact:true}).waitFor();
      await page.getByRole('button',{name:'关闭',exact:true}).click();
      // No profile creation or server mutation is performed: only inspect the deferred sign-in dialog.
      for(const selector of ['.lobby-primary-actions button:first-child','.lobby-primary-actions button:last-child','.practice-entry']) {
        await page.locator(selector).click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button',{name:'关闭',exact:true}).click();
      }
      await page.waitForTimeout(4100);
      assert.ok(new URL(await page.locator('.lobby-duel-art img').getAttribute('src'),origin).pathname.endsWith('/art/home/duel-desktop.webp'));
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
