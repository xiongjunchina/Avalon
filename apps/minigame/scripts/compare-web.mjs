// Headless-only comparison report. Never attaches to a user's browser or desktop.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../../..');
const {chromium}=await import(process.env.MINIGAME_PLAYWRIGHT_PATH?pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href:'playwright');
const out=join(root,'dist/web-parity-review');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.MINIGAME_CHROMIUM_PATH?{executablePath:process.env.MINIGAME_CHROMIUM_PATH}:{})});
const checks=[];
try {
  for(const scene of ['entry','game']) {
    const web=JSON.parse(await readFile(join(root,'dist/web-reference',scene+'-390.json'),'utf8'));
    const native=JSON.parse(await readFile(join(root,'dist/minigame-preview',scene+'-390.json'),'utf8'));
    const pairs=scene==='entry'?[['showcase','mp-medallion-circle allegiance-blue'],['create','mp-cyan-pill'],['join','secondary lobby-join']]:[['mission:1','quest-medallion-wrap mission-current'],['arena-frame','table-seats-grid grid-8 altar-dual-flank-arena scheme-a-stage '],['action-dock','table-action-dock']];
    for(const [id,css] of pairs) {
      const a=native.nodes.find(n=>n.id===id),b=web.find(n=>n.class===css);assert.ok(a&&b,id);
      const error=Math.max(...['x','y','width','height'].map(k=>Math.abs(a[k]-b[k])));
      checks.push({scene,id,maxGeometryErrorPx:error});assert.ok(error<1,id+' geometry drift: '+error);
    }
    const left=(await readFile(join(root,'dist/web-reference',scene+'-390.png'))).toString('base64');
    const right=(await readFile(join(root,'dist/minigame-preview',scene+'-390.png'))).toString('base64');
    const title=scene==='entry'?'首页':'牌局 · 6人 · 队长组队 · 已选0/2';
    const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#122033;color:#ffe9b7;font:14px 'Microsoft YaHei',sans-serif;padding:16px}h1{font-size:18px;margin:0 0 6px}p{font-size:12px;color:#b7c8d9;margin:0 0 12px}.pair{display:flex;gap:16px}.pair>div{width:390px}h2{text-align:center;font-size:14px;margin:0 0 8px}img{display:block;width:390px;height:844px}</style><h1>${title}</h1><p>相同数据 / 390×844 / 相同字体 / 安全区0 / 本地无界面渲染，非真机截图</p><div class="pair"><div><h2>网页端 · main edf53a0</h2><img src="data:image/png;base64,${left}"></div><div><h2>新版微信小游戏 · Canvas</h2><img src="data:image/png;base64,${right}"></div></div>`;
    await writeFile(join(out,scene+'.html'),html);
    const page=await browser.newPage({viewport:{width:828,height:946},deviceScaleFactor:1});
    await page.setContent(html);await page.screenshot({path:join(out,scene+'-comparison.png'),fullPage:true});await page.close();
  }
  await writeFile(join(out,'geometry-checks.json'),JSON.stringify(checks,null,2));
  console.log(JSON.stringify({out,checks},null,2));
} finally {await browser.close();}
