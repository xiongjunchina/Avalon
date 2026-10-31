// Headless-only comparison report. Never attaches to a user's browser or desktop.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../../..');
const {chromium}=await import(process.env.MINIGAME_PLAYWRIGHT_PATH?pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href:'playwright');
const players=Number(process.env.PARITY_PLAYERS??6),width=Number(process.env.PARITY_WIDTH??390),suffix=(players===6?'':'-'+players)+(process.env.PARITY_BOTTOM==='1'?'-bottom':'');
const out=join(root,'dist/web-parity-review'+suffix);await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.MINIGAME_CHROMIUM_PATH?{executablePath:process.env.MINIGAME_CHROMIUM_PATH}:{})});
const checks=[];
try {
  for(const scene of (process.env.PARITY_SCENES?.split(',')??['entry','game'])) {
    const web=JSON.parse(await readFile(join(root,'dist/web-reference'+suffix,scene+'-'+width+'.json'),'utf8'));
    const native=JSON.parse(await readFile(join(root,'dist/minigame-preview'+suffix,scene+'-'+width+'.json'),'utf8'));
    const pairs=width!==390||players!==6||suffix||!['entry','game'].includes(scene)?[]:scene==='entry'?[['home-duel','lobby-duel-image'],['create','mp-cyan-pill'],['join','secondary lobby-join']]:[['mission:1','quest-medallion-wrap mission-current'],['arena-frame','table-seats-grid grid-8 altar-dual-flank-arena scheme-a-stage '],['action-dock','table-action-dock']];
    for(const [id,css] of pairs) {
      const a=native.nodes.find(n=>n.id===id),b=web.find(n=>n.class===css);assert.ok(a&&b,id);
      const error=Math.max(...['x','y','width','height'].map(k=>Math.abs(a[k]-b[k])));
      checks.push({scene,id,maxGeometryErrorPx:error});assert.ok(error<1,id+' geometry drift: '+error);
    }
    const left=(await readFile(join(root,'dist/web-reference'+suffix,scene+'-'+width+'.png'))).toString('base64');
    const right=(await readFile(join(root,'dist/minigame-preview'+suffix,scene+'-'+width+'.png'))).toString('base64');
    const title=(({ entry:'首页',game:'牌局 · 6人 · 队长组队 · 已选0/2',identity:'私密身份 · 孙悟空 · 6人',vote:'组队表决 · 首难 · 2人队伍 · 未提交',mission:'任务出牌 · 首难 · 蓝方 · 未提交',report:'首难战报 · 成功2/失败0',result:'终局 · 蓝方获胜',account:'个人中心 · 战绩'})[scene]??scene).replaceAll('6人',players+'人').replace('已选0/2','已选0/'+(players>=8?3:2)).replace('2人队伍',(players>=8?3:2)+'人队伍');
    const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#122033;color:#ffe9b7;font:14px 'Microsoft YaHei',sans-serif;padding:16px}h1{font-size:18px;margin:0 0 6px}p{font-size:12px;color:#b7c8d9;margin:0 0 12px}.pair{display:flex;gap:16px}.pair>div{width:${width}px}h2{text-align:center;font-size:14px;margin:0 0 8px}img{display:block;width:${width}px;height:844px}</style><h1>${title}</h1><p>相同数据 / ${players} 人 / ${width}×844 / 相同字体 / 安全区0 / 本地无界面渲染，非真机截图</p><div class="pair"><div><h2>网页端 · 最新 main 网页源码</h2><img src="data:image/png;base64,${left}"></div><div><h2>新版微信小游戏 · Canvas</h2><img src="data:image/png;base64,${right}"></div></div>`;
    await writeFile(join(out,scene+'.html'),html);
    const page=await browser.newPage({viewport:{width:width*2+48,height:946},deviceScaleFactor:1});
    await page.setContent(html);await page.screenshot({path:join(out,scene+'-comparison.png'),fullPage:true});await page.close();
  }
  await writeFile(join(out,'geometry-checks.json'),JSON.stringify(checks,null,2));
  console.log(JSON.stringify({out,checks},null,2));
} finally {await browser.close();}
