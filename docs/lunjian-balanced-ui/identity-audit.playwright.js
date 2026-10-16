async (page) => {
  const viewports = [{width:320,height:568},{width:375,height:553},{width:320,height:667},{width:390,height:844},{width:430,height:932}];
  await page.getByRole('button',{name:'创建房间',exact:true}).click();
  await page.getByRole('radio',{name:'12',exact:true}).click();
  await page.getByRole('button',{name:'单人演练 12 人对局画面 ›',exact:true}).click();
  const results=[];
  for(let seat=1;seat<=12;seat++) {
    await page.getByRole('button',{name:'切换试玩视角',exact:true}).click();
    await page.locator('[data-player-id="p'+seat+'"]').click();
    for(const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.getByRole('button',{name:'私下查看我的身份',exact:true}).click();
      await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
      const data=await page.evaluate(()=>{
        const sheet=document.querySelector('.identity-content'),body=document.querySelector('.identity-body');
        const rects=[...sheet.querySelectorAll('h3,p,button,.identity-card,.identity-vision,.identity-footer')].map(e=>({text:e.textContent,box:e.getBoundingClientRect().toJSON()}));
        const out=rects.filter(r=>r.box.top<0||r.box.bottom>innerHeight||r.box.left<0||r.box.right>innerWidth);
        const parts=[...body.children].map(e=>e.getBoundingClientRect());
        const overlap=parts.slice(1).some((b,i)=>b.top<parts[i].bottom-1);
        const footer=document.querySelector('.identity-footer').getBoundingClientRect();
        return {role:sheet.querySelector('.identity-card h3').textContent,viewport:[innerWidth,innerHeight],sheet:[sheet.clientHeight,sheet.scrollHeight],body:[body.clientHeight,body.scrollHeight],out,overlap,bodyOverFooter:parts.at(-1).bottom>footer.top,roleImages:sheet.querySelectorAll('img[src*="/roles/"]').length};
      });
      const pass=data.sheet[1]<=data.sheet[0]+1&&data.body[1]<=data.body[0]+1&&!data.out.length&&!data.overlap&&!data.bodyOverFooter&&data.roleImages===1;
      results.push({seat,pass,...data});
      if(viewport.width===390&&['风清扬','东方不败','令狐冲','林平之'].includes(data.role))await page.screenshot({path:'/Users/xjun/Gitrepo/Avalon/docs/lunjian-balanced-ui/identity-'+data.role+'.png'});
      await page.getByRole('button',{name:'关闭底牌',exact:true}).click();
    }
  }
  await page.evaluate(rows=>{window.__identityAudit=rows;},results);
  return {cases:results.length,passed:results.filter(r=>r.pass).length,roles:[...new Set(results.map(r=>r.role))],failures:results.filter(r=>!r.pass)};
}
