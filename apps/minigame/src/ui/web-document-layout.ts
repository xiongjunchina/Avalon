import type { GameView, Player, Role, Score } from '@avalon/contracts';
import { assignFemaleDemons, assignLoyalGuardians, failuresRequiredFor, ROLE_CONFIG, teamOf } from '@avalon/game-core';
import { ALL_GALLERY_ROLES, formatRoleName, getRoleGalleryItem, roleMottos, roleNames, roleTitles, WUYUE_MISSIONS } from '../../../web/src/roles.js';
import { webGuideRules } from './web-guide-rules.js';
import { roleTreasures } from '../../../web/src/role-descriptions.js';
import { reasons } from '../../../web/src/game-presentation.js';
import { identityKnowledge, identityTreasure } from '../../../web/src/identity-presentation.js';
import { roleDescriptions } from '../../../web/src/role-descriptions.js';
import { wrapText, type SafeViewport } from './layout.js';
import type { ScreenModel } from './widgets.js';
import type { WebLayout, WebNode } from './web-layout.js';

const clamp=(a:number,n:number,b:number)=>Math.max(a,Math.min(n,b));
const measure=(text:string,size:number)=>Array.from(text).reduce((sum,c)=>sum+(/[^\u0020-\u007e]/.test(c)?size:size*.55),0);
export function layoutDocument(model:ScreenModel,v:SafeViewport):WebLayout {
  const doc=model.web!.document!, nodes:WebNode[]=[];
  const drawer=doc.kind==='chat'&&doc.activeTab!=='direct';
  const modal=!!doc.modal, width=drawer?v.width:modal?Math.min(v.width-20,doc.kind==='identity'?500:doc.kind==='vote'?520:570):v.width;
  const ox=(v.width-width)/2, pad=modal?(doc.kind==='vote'?18:15):18, x=ox+pad, w=width-pad*2;
  const top=v.top, bottom=v.height-v.bottom, available=bottom-top;
  let y=modal?13:18, headerH=39, footerH=0, bodyStart=0, bodyEnd=0;
  const add=(kind:WebNode['kind'],id:string,text:string,px:number,py:number,pw:number,ph:number,props:Partial<WebNode>={})=>{const n:WebNode={kind,id,text,x:px,y:py,width:pw,height:ph,skin:kind==='button'?'button':kind==='label'?'text':'surface',...props};nodes.push(n);return n;};
  const txt=(id:string,text:string,py:number,size=14,props:Partial<WebNode>={},px=x,pw=w)=>{
    const lines=wrapText(text,pw-4,t=>measure(t,size)),lh=props.lineHeight??size*1.5;
    return add('label',id,text,px,py,pw,Math.max(lh,lines.length*lh),{fontSize:size,lineHeight:lh,lines,align:'left',...props});
  };
  const panel=(id:string,py:number,ph:number,skin='card',px=x,pw=w)=>add('panel',id,'',px,py,pw,ph,{skin});
  const button=(id:string,text:string,py:number,props:Partial<WebNode>={},px=x,pw=w,ph=42)=>add('button',id,text,px,py,pw,ph,{fontSize:13,...props});
  const para=(id:string,text:string,size=13,skin='hint')=>{const lines=wrapText(text,w-28,t=>measure(t,size)),h=lines.length*size*1.6+20;panel(id+':panel',y,h,skin);txt(id,text,y+10,size,{lineHeight:size*1.6},x+14,w-28);y+=h+10;};
  const heading=(id:string,text:string)=>{const lines=wrapText(text,w-16,t=>measure(t,17)),h=Math.max(30,lines.length*25.5);add('label',id,text,x,y,w,h,{skin:'section-title',fontSize:17,fontFace:'display',align:'center',tone:'gold',lines,lineHeight:25.5});y+=h+8;};
  const token=(id:string,p:Player,px:number,py:number,pw:number,ph=72,badge?:string)=>add('portrait',id,p.nickname,px,py,pw,ph,{skin:'token',image:p.avatarUrl??p.wechatAvatarUrl??'emblems/'+(p.avatar??'cards')+'.png',count:p.seat,detail:badge});
  const rowButtons=(items:{id:string;text:string;primary?:boolean;disabled?:boolean}[],py:number,ph=42)=>items.forEach((item,i)=>button(item.id,item.text,py,{primary:item.primary,disabled:item.disabled},x+i*(w+8)/items.length,(w-8*(items.length-1))/items.length,ph));
  const feedback=model.rows.filter(r=>['status','error'].includes(r.id)||!['vote','identity','report','history','confirm'].includes(doc.kind)&&['notice','announcement'].includes(r.id));
  const modalHeader=(title:string,subtitle?:string)=>{
    headerH=subtitle?51.9:39;
    add('label','dialog-title',title,x,y,w-96,subtitle?18:32,{fontSize:subtitle?11:17,fontFace:'display',tone:'gold',align:'left',fixed:true});
    if(subtitle)add('label','dialog-subtitle',subtitle,x,y+20,w-92,26,{fontSize:clamp(14,v.width*.043,19),fontFace:'calligraphy',align:'left',fixed:true});
    button(model.web!.backId??'back',doc.kind==='identity'?'返回对局':doc.kind==='art'?'✕ 关闭':'返回法坛',y,{skin:'pill',fixed:true},x+w-84,84,32);
    add('label','dialog-rule','',x,y+headerH-1,w,1,{skin:'rule',fixed:true});
    y+=headerH+6;bodyStart=y;
  };
  const game=doc.game;
  if(doc.kind==='identity'&&doc.self&&game) {
    const self=doc.self,item=getRoleGalleryItem(self.role,self.loyalGuardian,self.femaleDemon), knowledge=identityKnowledge(self,game.players.length);
    modalHeader('真身法相底牌');
    const bx=x+2,bw=w-4;
    add('button','identityArt',item.name,bx,y,bw,110,{skin:'identity-card',image:'roles/'+item.artPrefix+'-160.webp',team:self.team,detail:item.title+'|'+item.motto,badge:(self.team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道')});y+=116;
    const candidatePlayers=knowledge.candidates.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>!!p);
    const columns=Math.max(1,Math.min(4,candidatePlayers.length)),tokenRows=Math.ceil(candidatePlayers.length/columns);
    const descLines=wrapText(knowledge.description,bw-24,t=>measure(t,11.5));
    const kh=36+(candidatePlayers.length?tokenRows*64:0)+descLines.length*16.675+1;
    panel('identity-knowledge',y,kh,'knowledge',bx,bw);
    txt('identity-vision-title',knowledge.title,y+9,14,{fontFace:'display',align:'center',lineHeight:18.2},bx+10,bw-20);
    candidatePlayers.forEach((p,i)=>{const tw=candidatePlayers.length<=2?60:(bw-24)/columns;const sx=candidatePlayers.length<=2?bx+bw/2-(candidatePlayers.length*tw+(candidatePlayers.length-1)*16)/2:bx+12;token('vision:'+p.id,p,sx+(i%columns)*(tw+(candidatePlayers.length<=2?16:0)),y+32+Math.floor(i/columns)*64,tw,54);});
    txt('identity-vision-description',knowledge.description,y+30+(candidatePlayers.length?tokenRows*64:0),11.5,{lineHeight:16.675,align:'center',tone:'muted'},bx+12,bw-24);y+=kh+6;
    const tip=roleDescriptions[self.role].tip,tipLines=wrapText(tip,bw-110,t=>measure(t,11)),tipH=Math.max(48,tipLines.length*15.4+14);
    panel('identity-tip',y,tipH,'tip',bx,bw);add('label','identity-tip-badge','💡 玩法心法',bx+10,y+8,72,20,{skin:'badge',fontSize:10.5,tone:'gold'});
    txt('role-tip',tip,y+7,11,{lineHeight:15.4},bx+88,bw-98);y+=tipH+9;
    const treasure=identityTreasure(self,game.players.length,model.web!.underlay?.web?.room?.settings.treasuresEnabled??false,{...game,self});
    button('treasures','本命法宝 · 仙家神兵',y,{skin:'treasure-entry',detail:treasure.description,disabled:!treasure.enabled},bx,bw,43.5);y+=48.5;
    for(const row of model.rows.filter(r=>r.id.startsWith('inspection:')||['confirmInspection','confirmRole','earlyAttempt','earlySkip'].includes(r.id))) {
      if(row.id.startsWith('inspection:')){const n=txt(row.id,row.text,y,11,{},bx,bw);y+=n.height+6;}else{button(row.id,row.text,y,{primary:true},bx,bw,36);y+=42;}
    }
    bodyEnd=y;footerH=81;
  } else if(doc.kind==='vote'&&game) {
    y=18;modalHeader('第 '+game.mission+' 难 · 出征组队表决',WUYUE_MISSIONS[game.mission-1]?.subtitle??'取经出征组队表决');
    y+=2;panel('vote-rule',y,31,'vote-prompt');txt('guide:vote-rule','准行多于封驳即准予出征 · 平票或封驳视为流局',y+5,11.5,{align:'center',lineHeight:20},x+10,w-20);y+=41;
    const round=game.rounds.at(-1),party=(round?.team??[]).map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>!!p), captain=game.players.find(p=>p.id===game.captainId);
    const columns=Math.min(3,party.length)||1, slotW=Math.min(115,(w-32-(columns-1)*10)/columns),slotH=132.2;
    const teamH=66+28+Math.ceil(party.length/columns)*slotH+(Math.ceil(party.length/columns)-1)*10+6;
    panel('vote-team-panel',y,teamH,'expedition');
    add('label','vote-captain',captain?'队长：'+captain.seat+'号 '+captain.nickname+(captain.id===doc.user?.id?'（你）':''):'队长：待定',x+2,y+2,w-4,66,{skin:'captain-banner',image:captain?.avatarUrl??'emblems/'+(captain?.avatar??'cards')+'.png',fontSize:19,fontFace:'calligraphy',tone:'gold'});
    party.forEach((p,i)=>token('party:'+p.id,p,x+(w-columns*slotW-(columns-1)*10)/2+(i%columns)*(slotW+10),y+80+Math.floor(i/columns)*(slotH+10),slotW,slotH,'出征'+(p.id===doc.user?.id?'|我':'')));
    y+=teamH+12;
    button('voteHistory','📜 往难功过簿（'+(game.rounds.some(r=>r.result)?'已历 '+game.rounds.filter(r=>r.result).length+' 难':'初难暂无记录')+'）',y,{skin:'accordion',detail:doc.historyExpanded?'▲ 收起':'▼ 展开参详'},x,w,64);y+=64;
    if(doc.historyExpanded){y+=8;const rounds=game.rounds.filter(r=>r.result);if(!rounds.length)para('vote-history-empty','此乃西行首难，尚无往难战况记录，凭慧眼明断！',12);else for(const r of rounds)para('vote-history:'+r.number,'第'+r.mission+'难 · '+(r.result?.passed?'🪷 护经功成':'🔥 妖魔作祟')+'\n领队：'+(game.players.find(p=>p.id===r.captainId)?.nickname??'')+' · 出征：'+r.team.map(id=>game.players.find(p=>p.id===id)?.nickname??'').join('、'),12);}
    y+=38;
    if(!doc.submitted) {
      for(const [i,key,label,sub,icon] of [[0,'approve','准行','赞同出征','✓'],[1,'reject','封驳','异议阻滞','×'],[2,'abstain','旁观','默许中立','−']] as const) add('choice','vote-choice:'+key,label,x+i*(w+12)/3,y,(w-24)/3,86.4,{skin:'vote-choice',detail:sub,badge:icon,selected:doc.voteChoice===(key==='approve'?true:key==='reject'?false:'abstain'),tone:key==='approve'?'green':key==='reject'?'red':'gold'});
      y+=98.4;button('submitVote','📜 落印法旨 · 提交表决',y,{skin:'dragon-button',primary:true,disabled:doc.voteChoice===undefined},x,w,48);y+=54;
    } else {panel('vote-submitted',y,100,'submitted');txt('submitted','📜 法旨已落印，静候众仙表决\n全员完成表决后，将自动揭晓结果并返回法坛',y+18,14,{align:'center'},x+12,w-24);y+=108;}
    const columnsV=v.width<360?2:3,rows=Math.ceil(game.players.length/columnsV),progressH=58+rows*25+10;
    panel('vote-progress',y,progressH,'progress');txt('progress','投票进度                         '+(game.teamVote?.votedIds.length??0)+' / '+game.players.length+' 人已投',y+10,11,{tone:'gold'},x+10,w-20);
    game.players.forEach((p,i)=>{const done=game.teamVote?.votedIds.includes(p.id),ballot=game.teamVote?.ballots?.[p.id];add('label','ballot:'+p.id,p.seat+'号 '+p.nickname+'  '+(ballot==='abstain'?'− 旁观':ballot===true?'✓ 准行':ballot===false?'× 封驳':done?'已落印':'待落印'),x+10+i%columnsV*((w-14)/columnsV),y+32+Math.floor(i/columnsV)*25,(w-20-(columnsV-1)*6)/columnsV,22,{skin:'voter-chip',fontSize:9.5,tone:done?'green':'gold'});});
    txt('vote-privacy',game.teamVote?.ballots?'🔓 公开表决：提交后全员可见票型':'🔒 匿名表决：仅公开落印进度，不公开个人票型',y+progressH-25,10.5,{align:'center'},x+5,w-10);y+=progressH+6;bodyEnd=y;
  } else if(doc.kind==='art'&&doc.roleItem) {
    modalHeader('法相鉴赏');const item=doc.roleItem;
    add('portrait','role-large',item.fullName,x,y,w,w*1.1,{skin:'art-image',image:'/art/roles/'+item.artPrefix+'-640.webp',team:item.team});y+=w*1.1+12;
    if(model.web?.backId==='guideArtClose'){rowButtons([{id:'guideArtPrev',text:'‹ 上一位'},{id:'guideArtNext',text:'下一位 ›'}],y);y+=52;}heading('art-name',item.fullName);para('art-motto',item.motto,14);para('art-story',item.story,14);bodyEnd=y;
  } else if(['report','history','treasures','confirm','tools'].includes(doc.kind)) {
    modalHeader(doc.kind==='report'?'第 '+doc.reportMission+' 难 · 战报落定':doc.kind==='history'?'战况与提案记录':model.title);
    if(doc.kind==='report'&&game){const r=game.rounds.find(r=>r.mission===doc.reportMission&&r.result);if(r?.result){panel('report-hero',y,154,r.result.passed?'success-hero':'failure-hero');add('label','report-result',r.result.passed?'🪷 护经成功 · 愿力圆满':'🔥 取经失利 · 妖魔作祟',x+10,y+15,w-20,40,{skin:'text',fontSize:21,fontFace:'display',tone:r.result.passed?'green':'red',align:'center'});txt('report-totals','成功牌 '+r.result.successes+' 张     失败牌 '+r.result.failures+' 张',y+67,16,{align:'center'},x+12,w-24);txt('report-rule','本难规则：需 '+failuresRequiredFor(game.players.length,doc.reportMission??game.mission)+' 张失败牌方判定失败，出牌过程始终匿名。',y+110,11.5,{align:'center'},x+14,w-28);y+=166;}}
    const ignored=new Set(['back','overlayClose']);
    if(doc.kind==='confirm')for(const r of model.rows){if(r.id.startsWith('confirm:'))continue;para(r.id,r.text);}
    else for(const r of model.rows){if(ignored.has(r.id)||r.id==='result'||r.id==='rematch')continue;if(r.id==='report-result')continue;
      const actionable=doc.kind==='tools'||doc.kind==='treasures'&&(/^(treasure:|player:|early|assassinate)/.test(r.id))||r.id==='confirmInspection';
      if(actionable){button(r.id,r.text,y,{skin:r.id.startsWith('player:')?'target':'button',selected:r.text.includes('已选'),primary:!r.id.startsWith('player:')});y+=50;}else para(r.id,r.text,12.5,r.id.startsWith('replay:mission:')?'tip':'card');
    }
    if(doc.kind==='confirm'){rowButtons([{id:'confirm:no',text:'取消'},{id:'confirm:yes',text:'确认执行',primary:true}],y);y+=50;}
    else {button(model.web!.backId??'overlayClose',doc.kind==='report'?'📜 知道了 · 继续取经':'返回法坛',y,{skin:'dragon-button',primary:true});y+=52;}
    bodyEnd=y;
  } else {
    // Full pages share the original web header, sections and input/card primitives.
    const title=doc.kind==='account'||doc.kind==='presets'?'取经功果':doc.kind==='guide'||doc.kind==='guide-role'?'嘻游识妖谱':doc.kind==='admin'?'天庭中枢 · 运营控制台':model.title;
    if(!modal&&!(doc.kind==='settings'&&doc.activeTab==='setup')){add('label','page-title',title,x,y,w,54,{skin:'page-heading',fontSize:26,fontFace:'display',align:'center'});y+=72;}
    if(doc.kind==='account'||doc.kind==='presets') {
      y=148;
      const user=doc.user!;panel('account-profile',y,208,'profile');
      add('portrait','account-avatar',user.nickname,x+16,y+30,84,84,{skin:'avatar',image:user.avatarUrl??user.wechatAvatarUrl??'emblems/'+(user.avatar??'leaf')+'.png'});
      txt('account-kicker','嘻游 · 真假猴王 / 个人中心',y+17,10,{tone:'gold'},x+108,w-120);
      add('label','account-name',user.nickname,x+108,y+43,68,38,{skin:'text',fontSize:28,fontFace:'display',lines:[user.nickname],lineHeight:38,align:'left'});
      button('copyCode','#'+(user.playerCode??'')+' 📋 复制',y+50,{skin:'code-badge',fontSize:11},x+176,Math.max(90,w-208),24);
      txt('account-help','专属仙友码全局唯一 · 微信小程序静默对应 · 换号凭此码随时找回战绩',y+89,11.5,{},x+108,w-120);
      button('switch','🚪 更换身份',y+145,{skin:'pill'},x+16,116,48);button('back','返回原页面',y+145,{skin:'pill'},x+140,108,48);y+=222;
      button('profileToggle',(doc.profileEditing?'▼':'▶')+' 修仙功果与仙位资料',y,{skin:'profile-toggle',fontSize:15},x,w,65);y+=78;
      if(doc.profileEditing){
        para('vip',user.isVip?'⭐ 尊享 VIP 仙友 · 有效期至 '+(user.vipUntil??''):'🎉 公测全员畅玩阶段\n全员零门槛免费畅享战绩复盘与高级板子！',13);
        button('redeem','输入 VIP 授权兑换码 · 核销兑换',y,{skin:'input'});y+=50;
        const draft=doc.profileDraft;add('portrait','profile-avatar',draft?.nickname??user.nickname,x,y,80,80,{skin:'avatar',image:draft?.avatarUrl??draft?.wechatAvatarUrl??'emblems/'+(draft?.avatar??user.avatar??'leaf')+'.png'});
        button('uploadAvatar','上传自定义头像',y,{skin:'button'},x+92,w-92,36);button('profile:wechat','选择仙友人物头像',y+42,{skin:'button'},x+92,w-92,36);y+=92;
        button('profile:nickname','尊号：'+(draft?.nickname??user.nickname),y,{skin:'input'});y+=50;
        const avatars=['leaf','moon','sun','mountain','wave','star'];avatars.forEach((a,i)=>add('button','profile:avatar:'+a,a,x+i*(w+6)/6,y,(w-30)/6,44,{skin:'avatar-choice',image:'emblems/'+a+'.png',selected:a===(draft?.avatar??user.avatar??'leaf')}));y+=54;
        button('profile:save','保存资料',y,{primary:true,skin:'gold-button'});y+=52;
      }
      button('sound','▶ 声音设置',y,{skin:'profile-toggle',fontSize:15},x,w,67);y+=85;
      const tabs=[['stats','我的战绩'],['history','历史对局'],['favorites','我的收藏'],['presets','常用设置']];
      panel('account-tab-frame',y,56,'tabs');tabs.forEach(([id,text],i)=>button('page:'+id,text!,y+4,{skin:'account-tab',selected:id===doc.activeTab,fontSize:13},x+4+i*(w-8)/4,(w-8)/4,48));y+=64;
      if(doc.kind==='presets') {
        para('preset-hint','最多 10 个；同名保存会更新原预设。只保存玩法，不包含房间、成员或接纳开关。',13);
        button('preset:name',doc.presetName||'预设名称，例如：七人宝镜局',y,{skin:'input'});y+=50;
        if(doc.roomPreset)para('preset-room-summary','将保存当前房间：'+doc.settings?.playerCount+' 人 · '+(doc.settings?.anonymousTeamVote?'匿名':'公开')+'组队表决。玩法修改请返回房间设置。');else settingsForm(doc.settings);
        button('preset:save',doc.canApplyPreset?'保存当前房间设置':'保存预设',y,{skin:'gold-button',primary:true,disabled:!doc.presetName?.trim()});y+=54;
        for(const preset of doc.presets??[]){panel('preset:'+preset.id,y,128,'card');txt('preset-name:'+preset.id,preset.name,y+12,18,{fontFace:'display'},x+12,w-24);txt('preset-settings:'+preset.id,preset.settings.playerCount+'人 · '+(preset.settings.anonymousTeamVote?'匿名':'实名')+'表决 · '+(preset.settings.guardianPerksEnabled?'护法天机':'常规板子'),y+44,12,{},x+12,w-24);button('apply:'+preset.id,(doc.canApplyPreset?'应用 ':'编辑 ')+preset.name,y+79,{},x+12,(w-32)/2,38);button('delete:'+preset.id,'删除',y+79,{tone:'red'},x+20+(w-32)/2,(w-32)/2,38);y+=140;}
        if(!doc.presets?.length)para('empty','还没有常用设置。',13);
      } else if(doc.activeTab==='history'||doc.activeTab==='favorites') {
        const games=doc.games??[];
        if(!games.length)para('empty',doc.activeTab==='favorites'?'暂无收藏，可在复盘中收藏对局':'暂无已完成的对局');
        for(const g of games){panel('history:'+g.id,y,142,'card');txt('history-outcome:'+g.id,(g.result.winner===g.self.team?'胜利':'失败')+' · '+g.playerCount+'人 · '+formatRoleName(g.self.role),y+12,17,{fontFace:'display',tone:g.result.winner===g.self.team?'green':'red'},x+12,w-24);txt('history-date:'+g.id,g.endedAt.replace('T',' ').slice(0,16)+' · '+(g.favorite?'★ 已收藏':'未收藏'),y+45,12,{},x+12,w-24);txt('history-id:'+g.id,'对局编号 ID：'+g.id,y+70,10.5,{tone:'muted'},x+12,w-24);button('game:'+g.id,'复盘',y+95,{},x+12,w-24,36);y+=154;}
        if(model.rows.some(r=>r.id==='more')){button('more','加载更多',y);y+=50;}
      } else if(doc.stats){
        const s=doc.stats;const metrics=[[s.completed,'完成对局'],[s.wins,'胜利'],[s.losses,'失败'],[s.winRate==null?'—':Math.round(s.winRate*100)+'%','总胜率']];
        panel('stat-grid',y,58,'metrics');metrics.forEach(([value,label],i)=>add('label','metric:'+i,String(value),x+i*w/4,y,w/4,58,{skin:'metric',detail:String(label),fontSize:20}));y+=72;
        para('statistics-aborted','另有 '+s.aborted+' 局中断，不计入胜负与胜率。统计以最终获胜阵营为准，包含提前刺杀。');
        heading('faction-heading','阵营战绩');
        for(const [i,team] of ['blue','red'].entries()){const score=s.byTeam[team as 'blue'|'red'];scoreCard('team:'+team,team==='blue'?'蓝方阵营':'红方阵营',score,x+i*(w+8)/2,y,(w-8)/2,team==='blue'?'emblems/blue.png':'emblems/red.png',team as 'blue'|'red');}y+=216;
        heading('role-heading','角色战绩');
        Object.entries(roleNames).forEach(([role,name],i)=>{scoreCard('role:'+role,name,s.byRole[role as Role],x+(i%2)*(w+8)/2,y+Math.floor(i/2)*198,(w-8)/2,'roles/'+role+'-160.webp',teamOf(role as Role));});y+=Math.ceil(Object.keys(roleNames).length/2)*198;
      }
      if(model.rows.some(r=>r.id==='admin')){button('admin','管理员入口',y,{skin:'pill'});y+=52;}
    } else if(doc.kind==='friends') {
      modalHeader('仙友录 · 召集与好友');
      button('refresh:friends','刷新仙友与申请',y,{skin:'pill'},x,w,32);y+=40;
      const tabs=[['invite','房间召集'],['friends','我的仙友'],['add','添加仙友']];tabs.forEach(([id,text],i)=>button('friendTab:'+id,text!,y,{skin:'tab',selected:doc.friendTab===id},x+i*(w+6)/3,(w-12)/3,40));y+=54;
      if(doc.friendTab==='invite') {
        if(doc.roomCode){heading('invite-title','邀请仙友 · 同入法坛');para('invite-room','房间号：'+doc.roomCode,24);rowButtons([{id:'copyRoom',text:'复制邀请链接'},{id:'share',text:'微信分享房间'}],y);y+=54;}
        else para('no-room','🏛️ 尚未进入房间\n先创建或加入房间，再邀请仙友一起取经。',16);
        button('copyCode','我的仙友码：'+(doc.user?.playerCode??'')+' · 复制',y,{skin:'code-badge'});y+=54;
      } else if(doc.friendTab==='add') {para('friend-code','我的仙友码：'+(doc.user?.playerCode??'')+' · 将仙友码告知朋友即可互相添加');button('input:friend',doc.friendQuery||'输入仙友码或尊号',y,{skin:'input'});y+=50;button('friend:add','发送仙友申请',y,{skin:'gold-button',primary:true,disabled:!doc.friendQuery?.trim()});y+=54;}
      else {
        const groups=[['incoming','待处理的仙申令'],['accepted','仙友列表'],['outgoing','已发送的申请']];
        for(const [key,label] of groups){const list=(doc.friends??[]).filter(f=>key==='accepted'?f.status==='accepted':f.status==='pending'&&f.isSender===(key==='outgoing'));if(!list.length)continue;
          txt('friend-group:'+key,label+'（'+list.length+'）',y,13,{tone:'gold'});y+=30;
          for(const friend of list){add('label','friend-card:'+friend.id,friend.nickname,x,y,w,84,{skin:'friend-card',image:friend.avatarUrl??'emblems/'+(friend.avatar??'cards')+'.png',detail:friend.status==='pending'?'申请与你结为仙友':friend.online?'大厅闲逛':'离线',badge:friend.playerCode});
            if(key==='incoming')button('acceptFriend:'+friend.id,'结为仙友',y+22,{skin:'gold-button'},x+w-92,80,44);
            else if(key==='accepted'){button('friend:'+friend.id,'✉ 密札',y+22,{skin:'cyan-button'},x+w-130,76,44);button('removeFriend:'+friend.id,'×',y+22,{skin:'pill',tone:'red'},x+w-48,38,44);}
            if(key==='accepted'&&doc.canInvite){button('inviteFriend:'+friend.id,'邀请加入当前房间',y+88,{skin:'cyan-button'},x,w,36);y+=40;}
            y+=96;
          }y+=8;
        }
        if(!doc.friends?.length)para('empty','还没有仙友，前往「添加仙友」发送申请吧。');
      }

    } else if(doc.kind==='chat') {
      const direct=doc.activeTab==='direct';modalHeader(direct?'私聊密札':'法坛传音');
      for(const msg of doc.messages??[]){const tw=Math.min(w*.8,Math.max(100,measure(msg.text,13)+24)),lines=wrapText(msg.text,tw-20,t=>measure(t,13)),h=lines.length*20+38;add('label','chat:'+msg.id,msg.text,msg.self?x+w-tw:x,y,tw,h,{skin:'message',lines,fontSize:13,detail:msg.name,selected:msg.self,align:'left'});y+=h+12;}
      if(!doc.messages?.length)para('empty',direct?'📜 暂无密札往来，发送快捷密语或打字开始交谈吧！':'法坛尚无传音，发送文字与仙友论道。');
      button('quickToggle',doc.quickExpanded?'收起快捷密语':'📜 快捷密语',y,{skin:'accordion'});y+=48;
      if(doc.quickExpanded)for(const r of model.rows.filter(r=>r.id.startsWith('quick:'))){button(r.id,r.text,y,{skin:'pill'});y+=44;}
      button('chat:input',doc.chatDraft||'写下你要说的话…',y,{skin:'input'});y+=50;
      button(direct?'chat:send':'chat:sendroom','发送',y,{skin:'gold-button',primary:true,disabled:!doc.chatDraft?.trim()});y+=52;
      for(const r of model.rows.filter(r=>['accept','remove','invite','page:friends'].includes(r.id))){button(r.id,r.text,y);y+=48;}
    } else if(doc.kind==='guide'||doc.kind==='guide-role') {
      button('back','‹',28,{skin:'pill',fixed:true},18,40,34);
      rowButtons([{id:'guide:rules',text:'游戏规则'},{id:'guide:roles',text:'角色介绍'}],y);y+=54;
      if(doc.roleItem){const item=doc.roleItem;add('button','guideArt',item.fullName,x,y,w,142,{skin:'identity-card',image:'roles/'+item.artPrefix+'-160.webp',detail:item.title+'|'+item.motto,team:item.team});y+=156;
        for(const r of model.rows.filter(r=>r.id.startsWith('role-')))para(r.id,r.text,14);
      } else if(doc.activeTab==='roles') {
        para('guide-privacy','这里介绍《嘻游 · 真假猴王》全部神魔人物的通用规则，不显示本局谁拿到了什么身份。准确角色仅由本人查看，终局才公开。点击任意法相可鉴赏高清立绘大图。');
        for(const team of ['blue','red'] as const){heading('guide-faction:'+team,team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道');
          for(const role of Object.keys(roleNames).filter(r=>teamOf(r as Role)===team) as Role[]){const item=getRoleGalleryItem(role);add('button','guide-role:'+item.id,item.fullName,x,y,w,110,{skin:'identity-card',image:'roles/'+item.artPrefix+'-160.webp',team,detail:item.title+'|'+item.motto});y+=120;para('guide-story:'+role,item.story,13);
            for(const [key,label] of [['ability','身份能力'],['visibility','身份关联'],['tip','玩法心法']] as const)para('guide:'+role+':'+key,label+'：'+roleDescriptions[role][key],13);
            para('guide-treasure:'+role,'专属法宝：'+roleTreasures[role],13);const variants=ALL_GALLERY_ROLES.filter(r=>r.role===role);if(variants.length>1){variants.forEach((r,i)=>add('button','guide-role:'+r.id,r.fullName,x+i%2*(w+8)/2,y+Math.floor(i/2)*156,(w-8)/2,146,{skin:'gallery-card',image:'roles/'+r.artPrefix+'-160.webp',team,detail:r.title}));y+=Math.ceil(variants.length/2)*156;}y+=16;
          }
        }
      }
      else webGuideRules.forEach((block,i)=>{if(block.heading)heading('guide-rule:'+i,block.text);else para('guide-rule:'+i,block.text,13);});
    } else if(doc.kind==='settings') {
      if(doc.activeTab==='setup'&&doc.settings){
        y=12;button('cancelSettings','❮',y,{skin:'pill'},16,38,38);button('sound','♫',y,{skin:'pill'},v.width-94,32,32);button('guide','规则',y,{skin:'pill'},v.width-56,40,32);add('label','setup-title','🏛 开启常规房',62,y,v.width-162,40,{skin:'text',fontSize:22,fontFace:'display',tone:'gold',align:'center'});y=74;
        button('noop','🏛 线下常规房\n同桌聚会 · 面杀无语音',y,{skin:'setup-mode',selected:true},16,(v.width-42)/2,52);button('noop','🎙️ 远端语音房\n本轮暂不提供',y,{skin:'setup-mode',disabled:true},26+(v.width-42)/2,(v.width-42)/2,52);y=143;
        panel('setup-count-frame',y,120,'profile',53,v.width-106);
        for(let count=5;count<=12;count++)button('count:'+count,String(count),y+10+Math.floor((count-5)/4)*56,{skin:'count',selected:doc.settings.playerCount===count,fontSize:18},70+(count-5)%4*(v.width-140)/4,(v.width-160)/4,48);y+=135;
        for(const team of ['blue','red'] as const){
          const roles=ROLE_CONFIG[doc.settings.playerCount].filter(role=>teamOf(role)===team),unique=[...new Set(roles)],rows=Math.ceil(unique.length/3),cardH=team==='blue'?152:132,gh=58+rows*cardH+8;
          panel('setup-faction:'+team,y,gh,team==='blue'?'faction-blue':'faction-red',16,v.width-32);
          add('label','faction-heading:'+team,(team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道')+'（'+roles.length+'人）',28,y+12,v.width-56,28,{skin:'text',fontSize:17,fontFace:'display',tone:'gold',align:'center'});
          const cw=Math.min(84,(v.width-90)/3);unique.forEach((role,i)=>{const cols=Math.min(3,unique.length),px=v.width/2-(cols*cw+(cols-1)*10)/2+i%3*(cw+10);add('button','setupRole:'+role,roleNames[role],px,y+48+Math.floor(i/3)*cardH,cw,cardH-2,{skin:'setup-role',image:'roles/'+role+'-160.webp',team,detail:roleTitles[role],badge:roles.filter(r=>r===role).length>1?'x'+roles.filter(r=>r===role).length:undefined});});y+=gh+14;
        }
        for(const r of model.rows.filter(r=>['createRoom','startPractice'].includes(r.id))){button(r.id,r.id==='createRoom'?'开启线下常规房':'幻境单人演练 '+doc.settings.playerCount+' 人取经牌局 ›',y,{primary:r.id==='createRoom',skin:r.id==='createRoom'?'cyan-button':'pill',fontSize:r.id==='createRoom'?21:12},r.id==='createRoom'?65:80,v.width-(r.id==='createRoom'?130:160),r.id==='createRoom'?52:28);y+=r.id==='createRoom'?64:40;}
        heading('setup-advanced','进阶玩法设置');settingsForm(doc.settings);
      } else {if(modal)modalHeader('房间设置');settingsForm(doc.settings);for(const r of model.rows.filter(r=>['apply','createRoom','startPractice'].includes(r.id))){button(r.id,r.text,y,{primary:true,skin:'gold-button'});y+=52;}}
    }
    else if(doc.kind==='replay'&&doc.replay){
      const g=doc.replay,name=(id:string)=>{const p=g.players.find(p=>p.id===id);return p?p.seat+' 号 '+p.nickname:'未知成员';};
      heading('replay-result',g.result.winner===null?'本局中断':g.result.winner==='blue'?'蓝方获胜':'红方获胜');
      para('replay-reason',(reasons[g.result.reason]??g.result.reason)+(g.result.targetId?' · 刺杀目标：'+name(g.result.targetId):''),15);
      para('replay-date','开始 '+g.startedAt.replace('T',' ').slice(0,16)+'\n结束 '+g.endedAt.replace('T',' ').slice(0,16)+'\n对局编号 ID：'+g.id,11.5);
      para('replay-privacy','规则版本：'+g.rulesetVersion+' · '+(g.settings.anonymousTeamVote?'组队投票仅展示总数。':'组队投票展示当时公开的个人赞反。')+'任务出牌始终不对应个人。');
      heading('replay-roles','最终身份');
      const guardians=assignLoyalGuardians(g.id,g.players,g.roles),demons=assignFemaleDemons(g.id,g.players,g.roles);
      for(const p of g.players){const role=g.roles[p.id];if(!role)continue;const item=getRoleGalleryItem(role,guardians[p.id],demons[p.id]);add('label','replay-player:'+p.id,name(p.id)+' · '+item.fullName,x,y,w,62,{skin:'friend-card',image:'roles/'+item.artPrefix+'-160.webp',detail:item.team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道'});y+=70;}
      heading('replay-rounds','逐轮记录');
      for(const r of g.rounds){heading('round:'+r.number,'第 '+r.number+' 轮 · 第 '+r.mission+' 难');para('round-captain:'+r.number,'队长：'+name(r.captainId)+' · '+(r.direction==='clockwise'?'顺时针':'逆时针')+'发言');
        const cols=Math.min(3,r.team.length)||1;for(const [i,id] of r.team.entries()){const p=g.players.find(p=>p.id===id);if(p)token('round-team:'+r.number+':'+id,p,x+i%cols*w/cols,y+Math.floor(i/cols)*84,w/cols-6,76);}y+=Math.ceil(r.team.length/cols)*84;
        if(r.vote)para('round-vote:'+r.number,'组队'+(r.vote.passed?'通过':'否决')+' · 准行 '+r.vote.approvals+' · 封驳 '+r.vote.rejections+' · 弃权 '+(r.vote.abstentions??0));
        if(!g.settings.anonymousTeamVote&&r.vote?.ballots){for(const [id,ballot] of Object.entries(r.vote.ballots))para('public-ballot:'+r.number+':'+id,name(id)+' · '+(ballot==='abstain'?'旁观':ballot?'准行':'封驳'),12);}
        for(const row of model.rows.filter(row=>row.id===`replay:mission:${r.number}`||row.id.startsWith(`replay:inspection:${r.number}:`)||row.id.startsWith(`replay:early:${r.number}:`)))para(row.id,row.text);
      }
      for(const row of model.rows.filter(r=>r.id==='favorite')){button(row.id,row.text,y,{skin:'gold-button'});y+=52;}
      button(model.web?.backId??'back','返回记录',y);y+=52;
    }
    else {
      // Admin and replay retain every authorized action while using web table/section styling.
      if(doc.kind==='admin'){
        const tabs=model.rows.filter(r=>r.id.startsWith('page:'));tabs.forEach((r,i)=>button(r.id,r.text,y+Math.floor(i/3)*42,{skin:'tab',selected:r.id===model.web?.activeTab},x+i%3*(w+6)/3,(w-12)/3,36));y+=Math.ceil(tabs.length/3)*42+14;
      }
      if(model.subtitle)para('subtitle',model.subtitle,13);
      const statsRows=doc.kind==='admin'?model.rows.filter(r=>/^stats:/.test(r.id)):[];
      statsRows.forEach((r,i)=>{const px=x+i%2*(w+10)/2,py=y+Math.floor(i/2)*92;panel(r.id+':panel',py,82,'profile',px,(w-10)/2);txt(r.id,r.text,py+16,14,{fontFace:'display',align:'center'},px+10,(w-30)/2);});y+=Math.ceil(statsRows.length/2)*92;
      for(const r of model.rows){if(r.id==='back'||doc.kind==='admin'&&(/^(page:|stats:)/.test(r.id)))continue;
        if(/^(stats:|replay:|guide:|empty|summary|notice|error)/.test(r.id)){para(r.id,r.text,13,/^stats:/.test(r.id)?'profile':'card');}
        else if(/^(user:|room:|game:|code:)/.test(r.id)){button(r.id,r.text,y,{skin:'table-row',fontSize:12});y+=52;}
        else {button(r.id,r.text,y,{skin:/^(search|input|codeDraft:)/.test(r.id)?'input':'button',tone:/^(delete|ban|cleanup)/.test(r.id)?'red':undefined});y+=50;}
      }
      button(doc.kind==='admin'?'back':model.web!.backId??'back','返回原页面',y,{skin:'pill'});y+=50;
    }
    bodyEnd=y;
  }
  if(!bodyEnd)bodyEnd=y;
  if(modal) {
    const identity=doc.kind==='identity';
    const intrinsic=identity?bodyEnd+footerH+23:y+13;
    const h=Math.min(drawer?available*.6:available-(identity?24:28),intrinsic),fy=drawer?bottom-h:top+(available-h)/2;
    const frame=add('panel','dialog-frame','',ox,fy,width,h,{skin:doc.kind==='vote'?'vote-frame':'dialog-frame',fixed:true});
    nodes.splice(nodes.indexOf(frame),1);nodes.unshift(frame);
    const maxScroll=Math.max(0,intrinsic-h),scroll=Math.min(model.scroll??0,maxScroll);
    const clipTop=fy+(bodyStart||12),clipBottom=fy+h-(identity?footerH+17:12);
    for(const node of nodes){if(node===frame)continue;node.y+=fy;if(node.fixed||identity&&node.y<fy+bodyStart){node.fixed=true;}else {node.y-=scroll;node.clipTop=clipTop;node.clipBottom=clipBottom;}}
    if(identity){const footerY=fy+h-footerH-11;add('label','identity-footer-rule','',x,footerY,w,1,{skin:'rule',fixed:true});txt('identity-permission','出牌权限：'+(doc.self?.team==='blue'?'仅能护经（成功）':'可护经（成功）/ 作祟（失败）')+' · 离页自动收起',footerY+8,10,{align:'center',fixed:true,tone:'muted'});button(model.web!.backId??'overlayClose','返回对局页面',footerY+27,{skin:'gold-button',fixed:true,primary:true},x,w,38);}
    feedback.slice(0,1).forEach(r=>add('button',r.id==='error'?'error':'dismissFeedback',r.text,x,fy+Math.min(60,h-70),w,56,{skin:'toast',tone:r.id==='error'?'red':'gold',fixed:true,fontSize:12}));
    // Block taps within the sheet; only its outer backdrop dismisses it.
    add('hitbox','noop','',ox,fy,width,h,{skin:'hitbox',fixed:true});add('hitbox',model.web!.backId??'back','',0,top,v.width,available,{skin:'hitbox',fixed:true});
    return {nodes,maxScroll,contentTop:clipTop,contentBottom:clipBottom};
  }
  const maxScroll=Math.max(0,y+20-available),scroll=Math.min(model.scroll??0,maxScroll);
  for(const node of nodes){node.y+=top-(node.fixed?0:scroll);node.clipTop=top;node.clipBottom=bottom;}
  feedback.slice(0,1).forEach(r=>add('button',r.id==='error'?'error':'dismissFeedback',r.text,18,top+58,v.width-36,56,{skin:'toast',tone:r.id==='error'?'red':'gold',fixed:true,fontSize:12}));
  return {nodes,maxScroll,contentTop:top,contentBottom:bottom};

  function settingsForm(settings=doc.settings) {
    if(!settings)return;
    const prefix=doc.kind==='presets'?'preset:':'';
    heading('settings-count-title','对局人数');
    for(let count=5;count<=12;count++)button(prefix+'count:'+count,String(count),y,{skin:'count',selected:settings.playerCount===count},x+(count-5)*w/8,w/8-4,44);y+=58;
    const fields=[['captainMode','队长分配',settings.captainMode==='seat_order'?'按座位循环':'开局打乱一次，整局循环'],['rejectionScope','流局计数',settings.rejectionScope==='game'?'全局累计，5 次判负':'单次任务累计，5 次判负']];
    for(const [id,label,value] of fields){txt('field:'+id,label!,y,13);y+=25;button(prefix+id,value!,y,{skin:'input'});y+=52;}
    for(const [id,label] of [['anonymousTeamVote','匿名组队投票'],['ladyEnabled','照妖宝镜'],['earlyAssassinationEnabled','提前刺杀'],['guardianPerksEnabled','护法天机（建议7-12人）'],['autoRevealRoleEnabled','倒计时后亮明真身'],['treasuresEnabled','专属法宝（8-12人专属）']] as const){button(prefix+id,label,y,{skin:'setting',selected:settings[id]});y+=50;}
  }
  function scoreCard(id:string,name:string,score:Score|undefined,px:number,py:number,pw:number,image:string,team:'blue'|'red') {
    add('label',id,name,px,py,pw,id.startsWith('role:')?186:204,{skin:'score-card',image,team,detail:(score?.winRate==null?'—':Math.round(score.winRate*100)+'%')+'|'+(score?.wins??0)+' 胜 · '+(score?.losses??0)+' 负|'+(score?.completed??0)+' 局完成 · '+(score?.aborted??0)+' 局中断'});
  }
}
