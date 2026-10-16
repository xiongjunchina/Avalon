async (page) => {
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'切换试玩视角',exact:true}).click();
  const players=await page.locator('[data-player-id]').evaluateAll(es=>es.map(e=>({id:e.dataset.playerId,blue:/风清扬|令狐冲|任盈盈|正道侠客/.test(e.innerText)})));
  await page.getByRole('button',{name:'返回',exact:true}).click();
  async function chooseCaptain() {
    const seat=Number((await page.locator('.party-captain .token-seat').textContent()).replace('号',''));
    await page.getByRole('button',{name:'切换试玩视角',exact:true}).click();
    await page.locator('[data-player-id="p'+seat+'"]').click();
    return seat;
  }
  async function vote() {
    await page.getByRole('button',{name:'讨论结束，开始表决',exact:true}).click();
    await page.locator('.vote-card').first().click();
    await page.getByRole('button',{name:'确认提交表决',exact:true}).click();
  }
  for(let mission=1;mission<=3;mission++) {
    await chooseCaptain();
    const n=Number(await page.locator('.party-slots').getAttribute('data-size'));
    for(const p of players.filter(p=>p.blue===(mission!==2)).slice(0,n))await page.locator('.table-seat-card').nth(Number(p.id.slice(1))-1).click();
    await page.getByRole('button',{name:`确认出征（${n}/${n}）`,exact:true}).click();
    await vote();
    if(await page.getByRole('button',{name:'确认提交任务牌',exact:true}).isVisible()) {
      await page.locator('.vote-card').nth(mission===2?1:0).click();
      await page.getByRole('button',{name:'确认提交任务牌',exact:true}).click();
    }
    await page.locator('.table-game-screen[data-phase=proposing]').waitFor();
  }
  const captain=await chooseCaptain();
  const ids=[captain,...Array.from({length:12},(_,i)=>i+1).filter(i=>i!==captain)].slice(0,6);
  for(const id of ids)await page.locator('.table-seat-card').nth(id-1).click();
  const rows=[];
  for(const stage of ['selected','discussion','vote','mission']) {
    if(stage==='discussion')await page.getByRole('button',{name:'确认出征（6/6）',exact:true}).click();
    if(stage==='vote')await page.getByRole('button',{name:'讨论结束，开始表决',exact:true}).click();
    if(stage==='mission'){await page.locator('.vote-card').first().click();await page.getByRole('button',{name:'确认提交表决',exact:true}).click();}
    for(const v of [{width:320,height:568},{width:375,height:553},{width:320,height:667},{width:390,height:844},{width:430,height:932}]) {
      await page.setViewportSize(v);
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const r=await page.evaluate(()=>{
        const main=document.querySelector('main'),banner=document.querySelector('.party-banner').getBoundingClientRect();
        const slots=[...document.querySelectorAll('.party-slot')].map(e=>e.getBoundingClientRect());
        const names=[...document.querySelectorAll('.seat-card-name')];
        return {viewport:[innerWidth,innerHeight],main:[main.clientHeight,main.scrollHeight],slotsOutside:slots.filter(b=>b.top<banner.top||b.bottom>banner.bottom).map(b=>b.toJSON()),clippedNames:names.filter(e=>e.clientHeight<parseFloat(getComputedStyle(e).lineHeight)).length,actionsBottom:document.querySelector('.table-action-dock').getBoundingClientRect().bottom};
      });
      rows.push({stage,pass:r.main[1]<=r.main[0]+1&&!r.slotsOutside.length&&!r.clippedNames&&r.actionsBottom<=v.height,...r});
      if(stage==='mission'&&(v.width===390||v.width===375))await page.screenshot({path:`/Users/xjun/Gitrepo/Avalon/docs/lunjian-balanced-ui/12-six-party-${v.width}.png`});
    }
  }
  await page.evaluate(rows=>window.__sixPartyAudit=rows,rows);
  return {cases:rows.length,passed:rows.filter(r=>r.pass).length,failures:rows.filter(r=>!r.pass)};
}
