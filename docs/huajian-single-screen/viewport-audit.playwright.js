async (page) => {
  const results = [];
  const viewports = [{width:320,height:568},{width:375,height:553},{width:320,height:667},{width:390,height:844},{width:430,height:932}];
  async function audit(count, stage) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0,0); document.querySelector('main').scrollTop=0; await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); });
      const data = await page.evaluate(() => {
        const main=document.querySelector('main');
        const controls=[...document.querySelectorAll('.room-top-bar button,.room-top-bar select,.quest-medallion-wrap,.table-seat-card[role=button],.party-slot.filled,.table-action-dock button,.dock-inline-controls select,.vote-card')];
        const boxes=controls.map(e=>{const b=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,30),x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};}).filter(b=>b.w>1&&b.h>1);
        const out=boxes.filter(b=>b.x<-.5||b.y<-.5||b.right>innerWidth+.5||b.bottom>innerHeight+.5);
        const small=boxes.filter(b=>b.w<43.5||b.h<43.5);
        return {viewport:[innerWidth,innerHeight],main:[main.clientHeight,main.scrollHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],phase:document.querySelector('.table-game-screen').dataset.phase,seats:document.querySelectorAll('.table-seat-card').length,controls:boxes.length,out,small,publicRoleImages:document.querySelectorAll('.table-seats-grid img[src*="/roles/"]').length};
      });
      const pass=data.main[1]<=data.main[0]+1&&data.document[0]<=viewport.width&&data.document[1]<=viewport.height+1&&data.seats===count&&!data.out.length&&!data.small.length&&!data.publicRoleImages;
      results.push({count,stage,pass,...data});
      if(!pass)throw new Error(JSON.stringify(results.at(-1)));
    }
  }
  try {
    for(let count=5;count<=12;count++) {
      await page.getByRole('button',{name:'创建房间',exact:true}).click();
      await page.getByRole('radio',{name:String(count),exact:true}).click();
      await page.getByRole('button',{name:`单人演练 ${count} 人对局画面 ›`,exact:true}).click();
      const captain=Number((await page.locator('.party-captain .token-seat').textContent()).replace('号',''));
      await page.getByRole('combobox',{name:'切换试玩视角'}).selectOption('p'+captain);
      const size=Number(await page.locator('.party-slots').getAttribute('data-size'));
      await audit(count,'empty-party');
      const indices=[captain-1,...Array.from({length:count},(_,i)=>i).filter(i=>i!==captain-1)].slice(0,size);
      for(const index of indices)await page.locator('.table-seat-card').nth(index).click();
      await audit(count,'selected-party');
      await page.getByRole('button',{name:`确认出征（${size}/${size}）`,exact:true}).click();
      await audit(count,'discussion');
      await page.getByRole('button',{name:'讨论结束，开始表决',exact:true}).click();
      await audit(count,'team-vote');
      await page.locator('.vote-card').first().click();
      await page.getByRole('button',{name:'确认提交表决',exact:true}).click();
      await page.getByRole('button',{name:'确认提交任务牌',exact:true}).waitFor();
      await audit(count,'mission');
      await page.getByRole('button',{name:'← 退出试玩',exact:true}).click();
    }
  } finally {
    await page.evaluate(rows => { window.__layoutAudit = rows; }, results);
  }
  return {cases:results.length,passed:results.filter(r=>r.pass).length,counts:[5,6,7,8,9,10,11,12],viewports};
}
