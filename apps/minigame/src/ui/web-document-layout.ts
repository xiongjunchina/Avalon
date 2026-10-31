import {settingOptions} from '../screens/settings.js';
import {webTreasureCopy} from './web-treasure-copy.js';
import {BACKGROUND_MUSIC} from '../../../web/src/audio-catalog.js';
import {settingsText} from '../../../web/src/settings-summary.js';
import { roomVoiceGuidance } from '../screens/web-handoff.js';
import {BUILTIN_AVATARS} from '../../../web/src/avatar-catalog.js';
import type { GameView, Player, Role, Score, RoundView } from '@avalon/contracts';
import { assignFemaleDemons, assignLoyalGuardians, failuresRequiredFor, GUANYIN_WINDOW_MS, ROLE_CONFIG, teamOf } from '@avalon/game-core';
import { defaultRoleArtPrefix, ALL_GALLERY_ROLES, formatRoleName, getRoleGalleryItem, roleMottos, roleNames, roleTitles, WUYUE_MISSIONS } from '../../../web/src/roles.js';
import { webGuideSections } from './web-guide-sections.js';
import { roleTreasures } from '../../../web/src/role-descriptions.js';
import { reasons } from '../../../web/src/game-presentation.js';
import { identityKnowledge, identityTreasure } from '../../../web/src/identity-presentation.js';
import { roleDescriptions } from '../../../web/src/role-descriptions.js';
import { wrapText, type SafeViewport } from './layout.js';
import type { ScreenModel } from './widgets.js';
import type { WebLayout, WebNode } from './web-layout.js';

const formatDate=(value:string)=>new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const clamp=(a:number,n:number,b:number)=>Math.max(a,Math.min(n,b));
let textMeasurer:((text:string,size:number,face?:WebNode['fontFace'],weight?:string)=>number)|undefined;
export function setDocumentTextMeasurer(value:((text:string,size:number,face?:WebNode['fontFace'],weight?:string)=>number)|undefined){textMeasurer=value;}
const measure=(text:string,size:number,face:WebNode['fontFace']='sans',weight='400')=>textMeasurer?.(text,size,face,weight)??Array.from(text).reduce((sum,c)=>sum+(/[^\u0020-\u007e]/.test(c)?size:size*.55),0);
export function layoutDocument(model:ScreenModel,v:SafeViewport):WebLayout {
  const doc=model.web!.document!, nodes:WebNode[]=[];
  const drawer=doc.kind==='chat'&&doc.activeTab!=='direct';
  const adminFriends=doc.kind==='admin-friends',auth=doc.kind==='auth',sound=doc.kind==='sound',preferences=doc.kind==='preferences';
  const social=doc.kind==='friends'||doc.kind==='chat'&&doc.activeTab==='direct', socialPad=v.width<=380?17:23;
  const modal=!!doc.modal, width=doc.kind==='art'?Math.min(v.width-32,v.width*.92,480):drawer?v.width:adminFriends?Math.min(v.width-40,500):sound?Math.min(v.width-44,420):modal?Math.min(doc.kind==='treasures'?v.width*.92:v.width-20,doc.kind==='guanyin-window'?450:doc.kind==='private-notice'?(doc.noticeKind==='jingu'?380:420):doc.kind==='treasures'?440:doc.kind==='identity'?500:doc.kind==='vote'?520:570):v.width;
  const ox=(v.width-width)/2, pad=modal?(doc.kind==='abort-confirm'?(v.width<=380?17:23):doc.kind==='guanyin-window'?17:doc.kind==='private-notice'?(doc.noticeKind==='bell'?21:doc.noticeKind==='jingu'?23:v.width<=360?15:1+clamp(16,v.width*.04,24)):doc.kind==='art'?22:adminFriends?18:doc.kind==='treasures'?16.5:auth?21:doc.kind==='presets'&&doc.presetEditing?21:preferences?13:sound?23:social?socialPad:doc.kind==='vote'?18:doc.kind==='report'?19:doc.kind==='special-editor'||doc.kind==='code-editor'?19:doc.kind==='history'?17:15):doc.kind==='guide'||doc.kind==='guide-role'?12:doc.kind==='replay'?31:18, x=ox+pad, w=width-pad*2;
  const top=v.top, bottom=v.height-v.bottom, available=bottom-top;
  let y=modal?(adminFriends?19:doc.kind==='treasures'?16.5:auth?21:sound?23:social?socialPad:doc.kind==='history'?17:13):18, headerH=39, footerH=0, bodyStart=0, bodyEnd=0;
  const add=(kind:WebNode['kind'],id:string,text:string,px:number,py:number,pw:number,ph:number,props:Partial<WebNode>={})=>{const n:WebNode={kind,id,text,x:px,y:py,width:pw,height:ph,skin:kind==='button'?'button':kind==='label'?'text':'surface',...props};nodes.push(n);return n;};
  const txt=(id:string,text:string,py:number,size=14,props:Partial<WebNode>={},px=x,pw=w)=>{
    if(['admin','admin-friends','special-editor','code-editor'].includes(doc.kind)){props={fontFace:'system',...props};if(props.fontFace==='display'&&size===15){size=16;props={weight:'700',lineHeight:24,...props};}}
    if(doc.profileEditing)props={weight:'500',...props};
    const lines=wrapText(text,pw,t=>measure(t,size,props.fontFace,props.weight)+Math.max(0,Array.from(t).length-1)*(props.letterSpacing??0)),lh=props.lineHeight??size*1.5;
    return add('label',id,text,px,py,pw,Math.max(lh,lines.length*lh),{fontSize:size,lineHeight:lh,lines,align:'left',...props});
  };
  const panel=(id:string,py:number,ph:number,skin='card',px=x,pw=w)=>add('panel',id,'',px,py,pw,ph,{skin});
  const button=(id:string,text:string,py:number,props:Partial<WebNode>={},px=x,pw=w,ph=42)=>add('button',id,text,px,py,pw,ph,{fontSize:13,...props});
  const para=(id:string,text:string,size=13,skin='hint')=>{const lines=wrapText(text,w-28,t=>measure(t,size)),h=lines.length*size*1.6+20;panel(id+':panel',y,h,skin);txt(id,text,y+10,size,{lineHeight:size*1.6},x+14,w-28);y+=h+10;};
  const heading=(id:string,text:string)=>{const lines=wrapText(text,w-16,t=>measure(t,17,'display')),h=Math.max(30,lines.length*25.5);add('label',id,text,x,y,w,h,{skin:'section-title',fontSize:16,fontFace:'display',align:'center',tone:'gold',lines,lineHeight:30});y+=h+8;};
  const token=(id:string,p:Player,px:number,py:number,pw:number,ph=72,badge?:string)=>add('portrait',id,p.nickname,px,py,pw,ph,{skin:'token',image:p.avatarUrl??p.wechatAvatarUrl??'emblems/'+(p.avatar??'cards')+'.png',count:p.seat,detail:badge});
  const rowButtons=(items:{id:string;text:string;primary?:boolean;disabled?:boolean}[],py:number,ph=42)=>items.forEach((item,i)=>button(item.id,item.text,py,{primary:item.primary,disabled:item.disabled},x+i*(w+8)/items.length,(w-8*(items.length-1))/items.length,ph));
  const feedback=model.rows.filter(r=>['status','error'].includes(r.id)||!['vote','identity','report','history','confirm'].includes(doc.kind)&&['notice','announcement'].includes(r.id));
  const modalHeader=(title:string,subtitle?:string)=>{
    headerH=doc.profileEditing?47:sound?48:social?51:doc.kind==='report'?52.78125:subtitle?51.9:39;
    add('label','dialog-title',title,x,y,social?w-50:w-96,subtitle?18:social?36:32,{fontSize:doc.profileEditing?18:sound?25:social?24:doc.kind==='preferences'?15:subtitle?11:17,fontFace:'display',tone:'gold',align:'left',fixed:true});
    if(subtitle)add('label','dialog-subtitle',subtitle,x,y+(doc.kind==='report'?17.390625:20),w-92,26,{fontSize:doc.kind==='report'?22:doc.kind==='preferences'?11:clamp(14,v.width*.043,19),fontFace:doc.kind==='preferences'?'sans':'calligraphy',weight:'700',align:'left',fixed:true});
    button(model.web!.backId??'back',doc.kind==='identity'?'返回对局':doc.kind==='art'?'✕ 关闭':doc.kind==='presets'&&doc.presetEditing?'取消':social||doc.kind==='treasures'||doc.profileEditing||['friends','sound','special-editor','preferences','treasures'].includes(doc.kind)?'关闭':'返回法坛',y+(doc.kind==='report'?5.890625:doc.kind==='vote'?4.421875:0),{skin:doc.kind==='vote'||doc.kind==='report'?'modal-return':'pill',fixed:true,fontSize:doc.kind==='identity'?12:13},x+w-(sound?64:social||doc.profileEditing||doc.kind==='treasures'||doc.kind==='presets'?42:doc.kind==='identity'?66:doc.kind==='vote'?79.25:doc.kind==='report'?75.25:84),sound?64:social||doc.profileEditing||doc.kind==='treasures'||doc.kind==='presets'?42:doc.kind==='identity'?66:doc.kind==='vote'?79.25:doc.kind==='report'?75.25:84,sound?48:32);
    if(!sound)add('label','dialog-rule','',x,y+headerH-1,w,1,{skin:'rule',fixed:true});
    y+=headerH+(sound?10:social?16:6);bodyStart=y;
  };
  const renderRounds=(rounds:RoundView[],players:Player[],anonymous:boolean)=>{
      for(const r of rounds){
        txt('round:'+r.number,'第 '+r.number+' 次提案 · '+(WUYUE_MISSIONS[r.mission-1]?.title??'任务 '+r.mission),y,17,{fontFace:'display',tone:'gold',align:'center'});y+=36;
        const cols=Math.min(3,r.team.length)||1,partyH=120+Math.ceil(r.team.length/cols)*76;
        panel('round-party:'+r.number,y,partyH,'knowledge');panel('round-captain:'+r.number,y+12,94,'profile',x+16,w-32);
        const captain=players.find(p=>p.id===r.captainId);if(captain)add('label','round-captain-token:'+r.number,captain.nickname,x+28,y+20,w-56,48,{skin:'replay-captain',image:captain.avatarUrl??captain.wechatAvatarUrl??'emblems/'+(captain.avatar??'cards')+'.png',count:captain.seat});
        txt('round-direction:'+r.number,'本轮领队   '+(r.direction==='clockwise'?'↻ 顺时针':'↺ 逆时针')+'发言',y+76,12.5,{tone:'muted'},x+28,w-56);
        for(const [i,id] of r.team.entries()){const p=players.find(p=>p.id===id);if(p)token('round-team:'+r.number+':'+id,p,x+10+i%cols*(w-20)/cols,y+116+Math.floor(i/cols)*76,(w-20)/cols-6,70);}y+=partyH+10;
        const voteFrame=panel('round-vote-frame:'+r.number,y,1,'knowledge');y+=12;
        txt('round-vote-title:'+r.number,'组队表决',y,15,{fontFace:'display',tone:'gold'},x+14,w-28);y+=30;
        if(r.vote){
          panel('round-vote:'+r.number,y,68,'progress',x+14,w-28);
          const totals=[['✓ '+r.vote.approvals+' 赞成','green'],['× '+r.vote.rejections+' 反对','red'],['− '+(r.vote.abstentions??0)+' 弃权','gold']] as const;
          totals.forEach(([label,tone],i)=>txt('round-vote-total:'+r.number+':'+i,label,y+8,12,{tone,align:'center'},x+20+i*(w-40)/3,(w-40)/3));
          txt('round-vote-outcome:'+r.number,r.vote.passed?'组队通过':'组队未通过（流局）',y+38,13.5,{align:'center'},x+20,w-40);y+=80;
          if(!anonymous&&r.vote.ballots){
            const cw=(w-28)/6;
            players.forEach((p,i)=>{const ballot=r.vote!.ballots![p.id];add('portrait','public-ballot:'+r.number+':'+p.id,p.nickname,x+14+i%6*cw,y+Math.floor(i/6)*82,cw-3,76,{skin:'battle-token',image:p.avatarUrl??p.wechatAvatarUrl??'emblems/'+(p.avatar??'cards')+'.png',count:p.seat,badge:ballot===true?'✓':ballot===false?'×':ballot==='abstain'?'−':'?',selected:p.id===doc.user?.id,detail:ballot===true?'准行':ballot===false?'封驳':ballot==='abstain'?'旁观':'未记录',tone:ballot===true?'green':ballot===false?'red':'gold'});});y+=Math.ceil(players.length/6)*82;
            const hint=txt('round-vote-privacy:'+r.number,'图标表示组队投票，不代表任务出牌。',y,12.5,{align:'center',tone:'muted'},x+14,w-28);y+=hint.height+12;
          }else{const hint=txt('round-vote-privacy:'+r.number,anonymous?'匿名组队投票，仅展示总票数。':'本次未记录个人票型，仅展示总票数。',y,12.5,{align:'center',tone:'muted'},x+14,w-28);y+=hint.height+12;}
        }else{const hint=txt('round-vote-pending:'+r.number,'本次表决未完成，不展示未收齐的个人选择。',y,12.5,{align:'center',tone:'muted'},x+14,w-28);y+=hint.height+12;}
        voteFrame.height=y-voteFrame.y;y+=10;
        if(r.result){const frame=panel('round-result:'+r.number,y,116,'knowledge');txt('round-result-title:'+r.number,r.result.passed?'✓ 任务成功':'× 任务失败',y+12,19,{fontFace:'display',tone:r.result.passed?'green':'red',align:'center'},x+14,w-28);txt('round-result-count:'+r.number,'成功牌 × '+r.result.successes+'      失败牌 × '+r.result.failures,y+48,14,{align:'center'},x+14,w-28);txt('round-result-privacy:'+r.number,'任务牌始终匿名，不对应个人。',y+82,12.5,{align:'center',tone:'muted'},x+14,w-28);y=frame.y+frame.height+10;}
        for(const row of model.rows.filter(row=>row.id.startsWith(`replay:inspection:${r.number}:`)||row.id.startsWith(`replay:early:${r.number}:`)))para(row.id,row.text);
      }
  };
  const game=doc.game;
  if(auth){
    const switching=model.web!.authMode==='switch';add('label','auth-title',switching?'找回原来的仙友身份':'取个朋友认识的昵称',x,y,w-50,30,{skin:'text',fontSize:22,fontFace:'display',tone:'gold',align:'left',fixed:true});button(model.web!.backId??'authClose','关闭',y,{skin:'pill',fontSize:12,fixed:true},x+w-42,42,32);y+=42;add('label','auth-rule','',x,y,w,1,{skin:'rule',fixed:true});y+=15;bodyStart=y;
    const intro=txt('auth-intro','填好玩家昵称后继续创建房间。',y,14);y+=intro.height+12;
    for(const account of model.web!.knownAccounts??[]){button('known:'+account.playerCode,account.nickname+'  #'+account.playerCode+' · 继续',y,{skin:'pill'});y+=48;}
    button('auth:create','第一次玩 · 取昵称',y,{skin:'auth-tab',selected:!switching,fontSize:14},x,(w-8)/2,44);button('auth:switch','已有仙友码',y,{skin:'auth-tab',selected:switching,fontSize:14},x+(w+8)/2,(w-8)/2,44);y+=58;
    txt('auth-label',switching?'原账号的 6 位仙友码':'玩家昵称（大家怎么称呼你）',y,16);y+=34;
    button(switching?'input:switch':'input:nickname',switching?model.web!.switchCode||'例如：123456':model.web!.nickname||'例如：小陈、阿辉',y,{skin:'input',fontSize:16},x,w,50);y+=64;
    const hint=txt('auth-note',switching?'输入仙友码即可找回原账号，继续使用原昵称、头像和战绩。':'填朋友认识的称呼，别填房间号；仙友码由系统自动分配。',y,14,{lineHeight:25.2});y+=hint.height+14;
    button('login',switching?'找回账号，继续游戏':model.web!.authIntent==='create'?'取好昵称，创建房间':model.web!.authIntent==='join'?'取好昵称，加入房间':'取好昵称，继续游戏',y,{skin:'waiting-primary',fontSize:18,disabled:switching?!/^\d{6}$/.test(model.web!.switchCode??''):!model.web!.nickname?.trim()},x,w,50);y+=60;bodyEnd=y;
  }else if(adminFriends){
    const title=txt('admin-friends-title','【'+(doc.adminFriendOwner??'')+'】的仙友圈子',y+5,18,{fontFace:'display',tone:'gold',fixed:true},x,w-60);button('page:users','关闭',y,{skin:'admin-tool',fontSize:12,fixed:true},x+w-54,54,30);y+=Math.max(38,title.height+14);bodyStart=y;
    if(!doc.adminFriends?.length){txt('admin-friends-empty','暂无好友记录',y+12,14,{fontFace:'system',tone:'muted'});y+=48;}
    for(const [i,f] of (doc.adminFriends??[]).entries()){const lines=wrapText(f.nickname+' ('+f.player_code+')',w-98,t=>measure(t,14)),h=Math.max(37,lines.length*21+16);panel('admin-friend:'+i,y,h,'admin-friend-row');txt('admin-friend-name:'+i,f.nickname+' ('+f.player_code+')',y+8,14,{fontFace:'system',lines,lineHeight:21},x+12,w-98);txt('admin-friend-status:'+i,f.status==='accepted'?'已互关好友':'申请中',y+11,12,{fontFace:'system',tone:f.status==='accepted'?'green':'gold',align:'right'},x+w-80,68);y+=h+8;}y-=8;bodyEnd=y;
  }else if(doc.kind==='code-editor'&&doc.playerCodeEditor){
    const d=doc.playerCodeEditor;y=19;bodyStart=19;
    txt('codeEditor-title',d.user.nickname+' · 仙友码管理',y+7.5,15,{weight:'700',tone:'gold',lineHeight:22.5},x,w-56);button('codeEditor:close','关闭',y,{skin:'admin-back',fontSize:13},x+w-44,44,37.5);add('label','codeEditor-rule','',x,y+47.5,w,1,{skin:'admin-rule'});y+=62.5;
    txt('codeEditor-current','当前仙友码：'+d.currentCode,y,13,{lineHeight:19.5});y+=32.5;
    const help=txt('codeEditor-help','改号保留账号、好友和会员；从未开局则释放旧号，存在任何已开局记录则保留旧号。',y,13,{tone:'muted',lineHeight:19.5});y+=help.height+12;
    txt('codeEditor-label','新仙友码',y,12.5,{weight:'600',lineHeight:18.75});y+=24.75;button('codeEditor:input',d.code,y,{skin:'admin-input',fontSize:13.5},x,w,38);y+=38;
    const available=d.check&&['available','reserved'].includes(d.check.status),status=d.check?.status;
    if(d.check){const hint=txt('codeEditor-status',status==='occupied'?'已占用：'+(d.check.nickname??'')+'，不能分配。':status==='retired'?'该旧号关联历史对局，不能分配。':status==='current'?'这是玩家当前号码。':status==='reserved'?'后台预留号，可以分配。':'号码可用。',y,13,{tone:available?'green':'muted',lineHeight:19.5});y+=hint.height+26;}
    button('codeEditor:save','保存仙友码',y,{skin:'admin-primary',fontSize:14,disabled:!available},x,102,39);y+=53;add('label','codeEditor-history-rule','',x,y,w,1,{skin:'admin-rule'});y+=10;button('codeEditor:history',(d.expanded?'▾':'▸')+' 改号记录',y,{skin:'plain-summary',fontSize:13},x,w,22);y+=49;
    if(d.expanded){if(!d.history.length){txt('codeEditor-empty','尚无改号记录。',y,13);y+=32.5;}for(const [i,h] of d.history.entries()){const n=txt('codeEditor-history:'+i,h.oldCode+' → '+h.newCode+' · 旧号'+(h.retained?'保留':'释放')+' · '+formatDate(h.createdAt),y,13);y+=n.height+13;}}
    if(d.notice){const n=txt('codeEditor-notice',d.notice,y,13,{tone:'green'});y+=n.height+13;}for(const n of nodes)n.fontFace='system';bodyEnd=y;
  }else if(doc.kind==='admin'){
    panel('admin-header',0,80.59375,'admin-header',0,v.width);
    txt('admin-title','⛩️ 法坛中枢',8,16,{fontFace:'display',tone:'gold'},18,200);
    add('label','admin-status','● 系统正常',v.width-88,10,72,21,{skin:'admin-status',fontSize:11});
    const toolW=[94.625,81.765625,69.625],toolText=['🔄 刷新数据','‹ 返回大厅','🚪 登出'],toolIds=['admin:refresh','back','admin:logout'];let tx=(v.width-262.015625)/2;
    toolIds.forEach((id,i)=>{button(id,toolText[i]!,41.59375,{skin:'admin-tool',fontSize:12.5,tone:i===2?'red':undefined},tx,toolW[i],28);tx+=toolW[i]!+8;});
    const tabs=[['page:overview','📊 运营看板'],['page:settings','⚙️ 运营策略'],['page:users','👥 仙友用户 ('+(doc.adminUserTotal??0)+')'],['page:rooms','🏛️ 法坛对局 ('+(doc.adminRooms?.length??0)+')'],['page:codes','🎟️ 兑换码 ('+(doc.adminCodes?.length??0)+')'],['page:special','专属房与靓号']];
    y=86.59375;const navFrame=panel('admin-nav',80.59375,1,'admin-nav',0,v.width);let nx=12;for(const [id,label] of tabs){const tw=measure(label!,12.5,'system','600')+22;if(nx+tw>v.width-12){nx=12;y+=36;}button(id!,label!,y,{skin:'admin-tab',selected:model.web?.activeTab===id||id==='page:rooms'&&model.web?.activeTab==='page:games',fontSize:12.5,weight:'600'},nx,tw,30);nx+=tw+6;}navFrame.height=y+37-80.59375;y+=53;
    const aw=v.width-32,ax=16;
    if(model.web?.activeTab==='page:overview'&&doc.adminOverview){
      const a=doc.adminOverview,bannerText=a.freeAccessMode?'当前系统处于【冷启动全员免费体验阶段】。所有对局复盘、高级角色板子均向所有玩家零门槛免费开放，无任何弹窗广告或付费限制，让玩家尽享纯粹开黑乐趣！':'当前已切换至【商业化运营模式】。玩家看激励视频广告可获得 24 小时灵气特权或兑换 VIP 会员。';
      const lines=wrapText(bannerText,aw-42,t=>measure(t,12.5)),bh=109+lines.length*18.75;
      panel('admin-banner',y,bh,'admin-banner',ax,aw);txt('admin-banner-title',a.freeAccessMode?'🎉 公测全员畅玩模式生效中':'💼 商业化运营模式生效中',y+17,15,{tone:'green',fontFace:'display'},ax+21,aw-42);
      txt('admin-banner-text',bannerText,y+42,12.5,{lineHeight:18.75},ax+21,aw-42);
      button('admin:mode',a.freeAccessMode?'切换为商业化模式':'一键恢复全员免费模式',y+bh-53,{skin:'admin-primary',fontSize:14},ax+21,144,37);y+=bh+20;
      const metrics=[['👥 累计注册用户',a.totalUsers],['🌱 今日新增用户',a.todayNewUsers],['⚡ 未关闭房间',a.activeRoomsCount],['🔌 在线长连接 (WS)',a.onlineConnections],['📜 累计对局总数',a.totalGames],['⚔️ 今日对局场次',a.todayGames]];
      metrics.forEach(([label,value],i)=>add('label','admin-metric:'+i,String(value),ax+i%2*(aw+12)/2,y+Math.floor(i/2)*86,(aw-12)/2,74,{skin:'admin-metric',detail:String(label)}));y+=258+8;
      panel('admin-shortcuts',y,142,'admin-card',ax,aw);txt('admin-shortcuts-title','⚡ 运营快捷捷径',y+18,15,{fontFace:'display'},ax+19,aw-38);
      const actions=[['page:settings','📢 发送全服实时公告'],['page:users','🔍 查询与管理仙友'],['page:rooms','🏛️ 巡查未关闭法坛房间'],['page:codes','🎟️ 批量生成 VIP 兑换码']];
      let shortcutX=ax+19,shortcutY=y+56;for(const [id,label] of actions){const bw=measure(label!,12,'system','700')+24;if(shortcutX+bw>ax+aw-19){shortcutX=ax+19;shortcutY+=40;}button(id!,label!,shortcutY,{skin:'admin-tool',fontSize:12},shortcutX,bw,28);shortcutX+=bw+12;}y=shortcutY+46;
    }else if(model.web?.activeTab==='page:special'&&doc.adminSpecial&&!doc.adminSpecial.editing){
      const d=doc.adminSpecial,roomPanel=panel('admin-special-rooms',y,1,'admin-card',ax,aw);y+=19;
      txt('special-room-title','专属房管理',y+7.5,16,{fontFace:'display'},ax+18,aw-150);button('special:new','新建专属房',y,{skin:'admin-primary',fontSize:14},ax+aw-121,102,39);y+=53;
      const intro=txt('special-room-help','专属房长期保留房号与默认配置。只指定房主管理者，朋友无需提前登记。',y,13,{tone:'muted',lineHeight:19.5},ax+19,aw-38);y+=intro.height+12;
      if(!d.rooms.length){y+=13;txt('special-room-empty','尚无专属房，可在此创建。',y,13,{},ax+19,aw-38);y+=51.5;}
      for(const r of d.rooms){
        const card=panel('special-room:'+r.id,y,1,'admin-special-card',ax+19,aw-38),px=ax+32,cw=aw-64;
        txt('special-room-name:'+r.id,r.code+' · '+r.name,y+13,14,{weight:'700'},px,cw);y+=40;
        const phase=r.activeRoomId?({waiting:'等待入席',playing:'对局进行中',finished:'已结束 · 待续局'}[r.activePhase??'waiting']):'待开桌';
        const info=txt('special-room-info:'+r.id,'房主：'+r.managerName+' #'+r.managerCode+' · '+r.settings.playerCount+'人 · '+(r.hasPassword?'有密码':'无密码')+' · '+phase,y,13,{lineHeight:19.5},px,cw);y+=info.height+8;
        button('special:edit:'+r.id,'修改配置与密码',y,{skin:'admin-tool',fontSize:11.5,disabled:!!r.activeRoomId},px,107,28);
        if(r.activeRoomId)button('special:end:'+r.id,'结束本次房间',y,{skin:'admin-tool',fontSize:11.5,tone:'red'},px+115,96,28);y+=36;
        if(r.activeRoomId){const hint=txt('special-room-hint:'+r.id,r.activePhase==='finished'?'本局已结束，房主可返回等待区续局；也可结束本次房间后重新开桌。':'本次房间关闭后可编辑配置；等待区改密可由房主直接操作。',y,13,{tone:'muted',lineHeight:19.5},px,cw);y+=hint.height+8;}
        y+=5;card.height=y-card.y;y+=10;
      }roomPanel.height=y-roomPanel.y;y+=20;
      const codePanel=panel('admin-special-codes',y,1,'admin-card',ax,aw);y+=19;txt('special-code-title','仙友靓号管理',y,15,{fontFace:'display'},ax+19,aw-38);y+=38;const help=txt('special-code-help','预留号不会随机分配；分配后仍在此显示持有玩家和分配记录。分配号码请在“仙友用户”中点击“改仙友码”。',y,13,{tone:'muted',lineHeight:19.5},ax+19,aw-38);y+=help.height+12;
      const columns=aw-38>=310?2:1,fw=(aw-38-(columns-1)*10)/columns;
      for(const [i,id,label,value] of [[0,'special:reserveCode','六位仙友码',d.reserveDraft?.code??''],[1,'special:reserveNote','备注',d.reserveDraft?.note??'']] as const){const px=ax+19+i%columns*(fw+10),py=y+Math.floor(i/columns)*72.75;txt(id+'-label',label,py,12.5,{weight:'600',lineHeight:18.75},px,fw);button(id,value,py+18.75,{skin:'admin-input',fontSize:13.5},px,fw,38);}y+=Math.ceil(2/columns)*72.75;
      button('special:reserve','预留号码',y,{skin:'admin-primary',fontSize:14},ax+19,fw,39);y+=57;
      txt('special-code-counts','待分配 '+d.codes.filter(c=>c.state==='reserved').length+' · 已分配 '+d.codes.filter(c=>c.state==='assigned').length+' · 历史旧号 '+d.codes.filter(c=>c.state==='retired').length,y,13,{tone:'muted'},ax+19,aw-38);y+=32;
      if(!d.codes.length){txt('special-code-empty','暂无预留或已分配的靓号。',y,13,{},ax+18,aw-36);y+=36;}
      for(const c of d.codes){const card=panel('special-code-card:'+c.code,y,1,'admin-special-card',ax+19,aw-38),px=ax+32,cw=aw-64;txt('special-code:'+c.code,c.code+' · '+(c.state==='assigned'?'已分配':c.state==='retired'?'历史旧号保留':'待分配'),y+13,14,{weight:'700'},px,cw);y+=40;
        for(const [key,value] of [['owner',c.nickname?(c.state==='assigned'?'持有玩家':'原玩家')+'：'+c.nickname:''],['note',c.note?'备注：'+c.note:''],['allocation',c.state==='assigned'?'原仙友码：'+c.oldCode+' · 分配时间：'+(c.assignedAt?new Date(c.assignedAt).toLocaleString('zh-CN'):'—'):'']])if(value){const n=txt('special-code-'+key+':'+c.code,value,y,13,{lineHeight:19.5},px,cw);y+=n.height+6;}
        if(c.state==='reserved'){button('special:release:'+c.code,'解除预留',y,{skin:'admin-tool',fontSize:11.5},px,70,28);y+=34;}y+=7;card.height=y-card.y;y+=10;
      }codePanel.height=y-codePanel.y;y+=20;
      const historyPanel=panel('admin-special-history',y,1,'admin-card',ax,aw);y+=18;txt('special-history-title','分配记录',y,15,{fontFace:'display'},ax+18,aw-36);y+=36;const historyHelp=txt('special-history-help','按时间倒序展示改号历史；号码释放或重新分配后，历史记录仍可回看。',y,13,{tone:'muted'},ax+18,aw-36);y+=historyHelp.height+14;
      if(!d.history.history.length){txt('special-history-empty','暂无分配记录。',y,13,{},ax+19,aw-38);y+=32;}
      for(const h of d.history.history){const card=panel('special-allocation-card:'+h.id,y,1,'admin-special-card',ax+19,aw-38),px=ax+32,cw=aw-64;txt('special-allocation:'+h.id,h.oldCode+' → '+h.newCode,y+13,14,{weight:'700'},px,cw);y+=40;const info=txt('special-allocation-player:'+h.id,'玩家：'+(h.nickname??'账号已删除')+' · '+(h.retained?'当时保留旧号':'当时释放旧号'),y,13,{lineHeight:19.5},px,cw);y+=info.height+6;if(h.note){const note=txt('special-allocation-note:'+h.id,'预留备注：'+h.note,y,13,{lineHeight:19.5},px,cw);y+=note.height+6;}txt('special-allocation-date:'+h.id,new Date(h.createdAt).toLocaleString('zh-CN'),y,10.833,{tone:'muted'},px,cw);y+=29;card.height=y-card.y;y+=10;}
      if(d.history.nextCursor){button('special:more','加载更多分配记录',y,{skin:'admin-tool'},ax+18,aw-36,38);y+=50;}y+=12;historyPanel.height=y-historyPanel.y;
    }else if(model.web?.activeTab==='page:rooms'||model.web?.activeTab==='page:games'){
      const frame=panel('admin-rooms-panel',y,1,'admin-card',ax,aw);y+=19;
      const historyLabel='📜 历史对局归档 ('+(doc.adminGames?.length??0)+')',activeLabel='⚡ 未关闭房间 ('+(doc.adminRooms?.length??0)+')',activeWidth=measure(activeLabel,12.5,'system','700')+24,historyWidth=measure(historyLabel,12.5,'system','700')+24,titleWidth=Math.max(25,aw-38-activeWidth-historyWidth-8);
      const titleText='🏛️ 法坛对局监控',titleMeasure=(value:string)=>measure(value,16,'display'),lineCount=wrapText(titleText,titleWidth,titleMeasure).length;
      let low=16,high=titleWidth;for(let i=0;i<12;i++){const mid=(low+high)/2;if(wrapText(titleText,mid,titleMeasure).length<=lineCount)high=mid;else low=mid;}
      const titleLines=wrapText(titleText,high,titleMeasure).map(line=>line.trim()),heading=add('label','admin-rooms-title',titleText,ax+19,y,titleWidth,titleLines.length*16+5,{skin:'admin-room-heading',fontFace:'display',fontSize:16,lines:titleLines}),headH=Math.max(28,heading.height);
      button('page:rooms',activeLabel,y+(headH-28)/2,{skin:'admin-tool',fontSize:12.5},ax+aw-19-historyWidth-8-activeWidth,activeWidth,28);button('page:games',historyLabel,y+(headH-28)/2,{skin:'admin-tool',fontSize:12.5},ax+aw-19-historyWidth,historyWidth,28);y+=headH+16;
      if(model.web.activeTab==='page:rooms'){
        if(!doc.adminRooms?.length){txt('admin-rooms-empty','当前没有未关闭的法坛房间',y+20,13,{tone:'muted',align:'center'},ax+18,aw-36);y+=76;}
        for(const r of doc.adminRooms??[]){
          panel('admin-room:'+r.id,y,174,'admin-user-card',ax+19,aw-38);
          txt('admin-room-title:'+r.id,'房间 #'+r.code,y+15,17,{tone:'gold',weight:'700',letterSpacing:1},ax+34,aw-170);
          add('label','admin-room-phase:'+r.id,({'waiting':'等待入席','playing':'对局进行中','finished':'已结束 · 待续局','closed':'已关闭'}[r.phase]??r.phase),ax+aw-118,y+16,84,20,{skin:'admin-membership',selected:r.phase==='playing'});
          txt('admin-room-info:'+r.id,'房主：'+r.hostNickname+'\n在席：'+r.memberCount+' / '+r.playerCount+' 人\n语音：'+(r.voiceChatEnabled?'🎙️ 开启':'无语音'),y+44,13,{lineHeight:20.5},ax+34,aw-68);
          txt('admin-room-created:'+r.id,'创建于：'+new Date(r.createdAt).toLocaleTimeString('zh-CN'),y+105.5,12,{tone:'muted'},ax+34,aw-68);
          button('room:'+r.id,'💥 一键强制解散',y+132,{skin:'admin-tool',fontSize:11.5,tone:'red'},ax+34,112,28);y+=188;
        }
      }else{
        if(!doc.adminGames?.length){txt('admin-games-empty','暂无历史对局数据',y+20,13,{tone:'muted',align:'center'},ax+18,aw-36);y+=76;}
        for(const g of doc.adminGames??[]){
          const start=y,card=panel('admin-game:'+g.id,y,1,'admin-user-card',ax+19,aw-38),px=ax+34,cw=aw-68;
          txt('admin-game-title:'+g.id,'房间 #'+g.roomCode+' ('+g.playerCount+'人局)',y+13,13,{weight:'700'},px,cw*.6);
          txt('admin-game-winner:'+g.id,g.winner==='blue'?'蓝方 · 取经正果':g.winner==='red'?'红方 · 群妖乱道':'平局/中止',y+13,13.5,{weight:'700',tone:g.winner==='red'?'red':g.winner==='blue'?'blue':'muted',align:'right'},px+cw*.6,cw*.4);y+=41;
          add('label','admin-game-rule:'+g.id,'',px,y,cw,1,{skin:'admin-rule'});y+=6;
          for(const [key,value] of [['reason','结案原因：'+(g.reason||'—')],['ended','结束时间：'+(g.endedAt?new Date(g.endedAt).toLocaleString('zh-CN'):'—')],['id','对局ID：'+g.id]]){const n=txt('admin-game-'+key+':'+g.id,value!,y,key==='id'?11:12,{tone:key==='id'?'gold':'muted',lineHeight:18,lines:key==='id'?[value!]:undefined},px,cw);y+=n.height+3;}
          y+=3;add('label','admin-game-end-rule:'+g.id,'',px,y,cw,1,{skin:'admin-rule'});y+=9;
          button('replay:'+g.id,'🔍 查看本局完整复盘',y,{skin:'admin-primary',fontSize:14},px,cw,37);y+=50;card.height=y-start;y+=10;
        }
        if(model.rows.some(r=>r.id==='more:games')){button('more:games','加载更多对局',y,{skin:'admin-tool'});y+=50;}
      }y+=5;frame.height=y-frame.y;
    }else if(model.web?.activeTab==='page:codes'){
      const d=doc.adminCodeDraft??{count:'5',days:'30',note:''},frame=panel('admin-code-generator',y,334,'admin-card',ax,aw),px=ax+19,iw=aw-38;y+=19;
      txt('admin-code-title','🎟️ 批量生成 VIP 兑换码',y,15,{fontFace:'display'},px,iw);y+=51;
      txt('codeDraft-count-label','生成数量',y,12.5,{weight:'600'},px,100);txt('codeDraft-days-label','VIP 有效天数',y,12.5,{weight:'600'},px+110,120);y+=30;
      button('codeDraft:count',d.count,y,{skin:'admin-web-input',fontSize:13.5},px,100,48);button('codeDraft:days',d.days,y,{skin:'admin-web-input',fontSize:13.5},px+110,120,48);y+=74;
      txt('codeDraft-note-label','备注说明（可选）',y,12.5,{weight:'600'},px,iw);y+=30;button('codeDraft:note',d.note||'如：小红书公测抽奖福利 / 社群专属',y,{skin:'admin-web-input',fontSize:13.5},px,iw,48);y+=58;
      button('generateDraft','🚀 立即生成',y,{skin:'admin-primary',fontSize:14},px,111.1,37);y+=92;
      const list=panel('admin-code-list',y,1,'admin-card',ax,aw);y+=19;
      const copyWidth=157.1,title=txt('admin-code-list-title','兑换码库存与核销记录 ('+(doc.adminCodes?.length??0)+')',y,15,{fontFace:'display',lineHeight:16},px,iw-copyWidth-12);
      button('copy:unused','📋 一键复制全部可用码',y+2,{skin:'admin-tool',fontSize:12.5},px+iw-copyWidth,copyWidth,28);y+=Math.max(30,title.height)+16;
      const codes=doc.adminCodes??[],labels=['兑换码','VIP 天数','备注说明','核销状态','兑换玩家','兑换时间','创建时间'];
      const values=codes.map(c=>[c.code,c.days+' 天',c.note||'—',c.redeemedAt?'已核销':'● 可使用',c.redeemerNickname||'—',c.redeemedAt?new Date(c.redeemedAt).toLocaleString('zh-CN'):'—',new Date(c.createdAt).toLocaleString('zh-CN')]);
      const widths=labels.map((label,i)=>Math.max(measure(label,13,'system','600'),...values.map(row=>measure(row[i]!,13,'system')))+28),total=Math.max(700,widths.reduce((a,b)=>a+b,0));widths[2]!+=total-widths.reduce((a,b)=>a+b,0);
      const max=Math.max(0,total-iw+2),offset=Math.min(max,Math.max(0,model.horizontalScroll??0)),clip={clipLeft:px+1,clipRight:px+iw-1,scrollMaxX:max};
      panel('codes-table',y,38+Math.max(1,codes.length)*39,'admin-card',px,iw);let colX=px+1-offset;
      labels.forEach((label,i)=>{add('button','codes-heading:'+i,label,colX,y+1,widths[i]!,37,{skin:'admin-table-head',fontSize:13,...clip});colX+=widths[i]!;});y+=38;
      if(!codes.length){txt('admin-code-empty','暂无兑换码记录，请在上方批量生成',y+12,13,{tone:'muted',align:'center'},px,iw);y+=48;}
      values.forEach((row,r)=>{let cellX=px+1-offset;row.forEach((value,i)=>{add('button',i===0?'code:'+codes[r]!.code:'codes-cell:'+r+':'+i,value,cellX,y,widths[i]!,39,{skin:'admin-table-cell',fontSize:13,tone:i===0?'gold':i===3&&!codes[r]!.redeemedAt?'green':undefined,...clip});cellX+=widths[i]!;});y+=39;});y+=19;list.height=y-list.y;
    }else if(model.web?.activeTab==='page:users'){
      const frame=panel('admin-users-panel',y,1,'admin-card',ax,aw);y+=18;
      y+=1;txt('admin-users-title','👥 仙友用户列表 ('+(doc.adminUserTotal??0)+')',y,15,{fontFace:'display'},ax+19,aw-38);y+=35;
      button('search:input',doc.adminUserQuery||'搜索仙友（仙友码 / 昵称 / UUID）…',y,{skin:'admin-web-input',fontSize:13.5},ax+19,Math.max(40,aw-284.875),48);
      button('search:submit','🔍 搜索',y+5,{skin:'admin-primary',fontSize:13},ax+Math.max(60,aw-282)+26,82,38);button('cleanup','🗑️ 批量清理无战绩账号',y+9,{skin:'admin-tool',fontSize:11.5,tone:'red'},ax+Math.max(60,aw-282)+116,aw-Math.max(60,aw-282)-134,30);y+=64;
      if(!doc.adminUsers?.length){txt('admin-users-empty','暂未找到匹配的仙友',y+24,13,{tone:'muted',align:'center'},ax+18,aw-36);y+=72;}
      for(const u of doc.adminUsers??[]){const uy=y,uc=panel('admin-user:'+u.id,y,1,'admin-user-card',ax+19,aw-38),cw=aw-68,px=ax+34;
        const nameWidth=measure(u.nickname,14.5,'system','700'),codeWidth=62,badgeWidth=u.isBanned?131:112,wrapped=nameWidth+6+codeWidth+8+badgeWidth>cw;
        txt('admin-user-name:'+u.id,u.nickname,y+13,14.5,{weight:'700',lines:[u.nickname]},px,Math.min(nameWidth,cw-codeWidth-6));
        add('label','admin-user-code:'+u.id,'#'+u.playerCode,px+Math.min(nameWidth,cw-codeWidth-6)+6,y+13,codeWidth,20,{skin:'admin-user-code',fontSize:12});
        const badgeY=y+13+(wrapped?28:0),badgeX=wrapped?px:px+cw-badgeWidth;
        add('label','admin-user-membership:'+u.id,u.isVip?'⭐ 会员':'公测全免',badgeX,badgeY,65,20,{skin:'admin-membership',selected:u.isVip,fontSize:11});
        txt('admin-user-status:'+u.id,u.isBanned?'🚫 封禁':'● 正常',badgeY,11,{tone:u.isBanned?'red':'green',weight:'600'},badgeX+70,badgeWidth-70);
        const metaY=y+41+(wrapped?28:0);add('label','admin-user-meta-rule:'+u.id,'',px,metaY,cw,1,{skin:'admin-rule'});
        txt('admin-user-meta:'+u.id,'⚔️ '+u.gamesCount+' 局   👥 '+u.friendsCount+' 位好友   📅 '+new Date(u.createdAt).toLocaleDateString('zh-CN'),metaY+7,11.5,{tone:'muted',lineHeight:16},px,cw);add('label','admin-user-meta-end:'+u.id,'',px,metaY+29,cw,1,{skin:'admin-rule'});y=metaY+38;
        const actions=[['playerCode','改仙友码'],['vip','🎁 赠VIP'],['ban',u.isBanned?'✅ 解封':'🚫 封禁'],['friends','👥 社交'],['reset','🔄 重置'],['delete','🗑️ 删除']];
        actions.forEach(([action,label],i)=>button('userAction:'+action+':'+u.id,label!,y+Math.floor(i/4)*35,{skin:'admin-tool',fontSize:11.5,disabled:action==='delete'&&u.gamesCount>0,tone:action==='delete'||action==='ban'&&!u.isBanned?'red':undefined},px+i%4*(cw+6)/4,(cw-18)/4,29));y+=77;uc.height=y-uy;y+=10;
      }
      if(model.rows.some(r=>r.id==='more:users')){button('more:users','加载更多用户',y,{skin:'admin-tool'},ax+18,aw-36,38);y+=50;}y+=6;frame.height=y-frame.y;
    }else if(model.web?.activeTab==='page:settings'&&doc.adminSettings){
      const s=doc.adminSettings,card=panel('admin-strategy',y,1,'admin-card',ax,aw);y+=18;
      txt('strategy-title','⚙️ 商业化与功能放开策略',y,15,{fontFace:'display'},ax+18,aw-36);y+=42;
      txt('strategy-mode','公测全员畅玩模式（冷启动零摩擦）',y-4,15,{weight:'700',lineHeight:20.5},ax+19,aw-204);
      const modeHelp=txt('strategy-mode-help','开启后，全体玩家无需看广告、无需开通 VIP，即可免费体验战绩复盘、高级阵营板子与房主管理特权。',y+41,13,{tone:'muted',lineHeight:22.75},ax+19,aw-192);
      button('mode',s.freeAccessMode?'已开启（全员免费）':'已关闭（商业模式）',y+45,{skin:'admin-primary',fontSize:13,weight:'700'},ax+aw-177,158,37);y+=Math.max(130,modeHelp.height+59);
      add('label','strategy-rule','',ax+18,y,aw-36,1,{skin:'admin-rule'});y+=20;
      txt('strategy-reward-title','激励视频广告特权奖励时长',y,15,{weight:'700',lineHeight:20},ax+19,aw-38);y+=25;
      const rewardHelp=txt('strategy-reward-help','在商业化模式下，玩家观看 1 次激励视频所获得的地仙特权时长（单位：小时）。',y,13,{tone:'muted',lineHeight:22.75},ax+19,aw-38);y+=rewardHelp.height+6;
      button('reward:input',String(s.adRewardHours),y,{skin:'admin-web-input'},ax+19,Math.max(70,aw-158),48);txt('reward-unit','小时',y+15,13,{lines:['小时']},ax+29+Math.max(70,aw-158),26);button('reward:save','保存配置',y+10,{skin:'admin-tool',fontSize:12.5},ax+aw-93,74,28);y+=67;card.height=y-card.y;y+=20;
      const announcement=panel('admin-announcement',y,1,'admin-card',ax,aw);y+=18;txt('announcement-title','📢 全服跑马灯实时广播推送',y,15,{fontFace:'display'},ax+18,aw-36);y+=40;
      const help=txt('announcement-help','编辑文字并点击推送后，全服所有当前在线的 WebSocket 客户端将立即同步弹出跑马灯或置顶广播。',y,13,{tone:'muted',lineHeight:19.5},ax+18,aw-36);y+=help.height+14;
      const broadcastLines=wrapText(s.announcement.text||'请输入要向全服仙友广播的公告内容…',aw-60,t=>measure(t,13.5,'system')),broadcastHeight=Math.max(65,broadcastLines.length*20+24);button('broadcast:input',s.announcement.text||'请输入要向全服仙友广播的公告内容…',y,{skin:'admin-textarea',fontSize:13.5,lines:broadcastLines,lineHeight:20,selected:!!s.announcement.text},ax+18,aw-36,broadcastHeight);y+=broadcastHeight+31;
      const saveWidth=Math.min(aw-100,measure('📢 立即推送全服广播',14,'system','700')+32),toggleWidth=aw-36-saveWidth;const toggleLines=wrapText('启用此广播横幅并在大厅循环展示',toggleWidth-27,t=>measure(t,13,'system'));const actionHeight=Math.max(48,toggleLines.length*19.5);button('broadcast:toggle','启用此广播横幅并在大厅循环展示',y,{skin:'admin-broadcast-check',fontSize:13,lines:toggleLines,lineHeight:19.5,selected:s.announcement.enabled},ax+18,toggleWidth,actionHeight);button('broadcast:save','📢 立即推送全服广播',y+1.5,{skin:'admin-primary',fontSize:14},ax+aw-18-saveWidth,saveWidth,37);y+=actionHeight+18;announcement.height=y-announcement.y;
    }else{
      txt('admin-page-title',model.title,y,18,{fontFace:'display'},ax,aw);y+=38;
      if(['page:rooms','page:games'].includes(model.web?.activeTab??'')){rowButtons([{id:'page:rooms',text:'未关闭房间'},{id:'page:games',text:'历史对局'}],y,32);y+=44;}
      for(const r of model.rows){if(r.id==='back'||r.id.startsWith('page:'))continue;
        const lines=wrapText(r.text,aw-24,t=>measure(t,13)),h=Math.max(38,lines.length*20+20);
        if(/^(stats:|guide:|empty|summary|notice|error)/.test(r.id)){panel(r.id+':panel',y,h,'admin-card',ax,aw);txt(r.id,r.text,y+10,13,{},ax+12,aw-24);}
        else button(r.id,r.text,y,{skin:/^(search|input|codeDraft:)/.test(r.id)?'admin-input':'admin-tool',fontSize:13,lines,tone:/^(delete|ban|cleanup)/.test(r.id)?'red':undefined},ax,aw,h);
        y+=h+12;
      }
    }
    for(const node of nodes)if(node.fontFace!=='display')node.fontFace='system';
    bodyEnd=y;
  } else if(doc.kind==='special-editor'&&doc.specialDraft){
    const d=doc.specialDraft;y=19;bodyStart=19;
    txt('special-editor-title',d.id?'编辑专属房':'创建专属房',y+7.5,15,{weight:'700',tone:'gold',lineHeight:22.5},x,w-56);button('special:cancel','关闭',y,{skin:'admin-back',fontSize:13},x+w-44,44,37.5);add('label','special-header-rule','',x,y+47.5,w,1,{skin:'admin-rule'});y+=62.5;
    for(const [key,label] of [['code','固定房号'],['name','房间名称'],['managerCode','房主管理者仙友码']] as const){txt('special-label:'+key,label,y,12.5,{weight:'600',lineHeight:18.75});y+=18.75;button('special:'+key,d[key],y,{skin:'admin-input',fontSize:13.5,disabled:key==='code'&&!!d.id},x,w,38);y+=48;}
    const passwordNew=typeof d.password==='string',passwordPanel=panel('special-password-box',y,1,'admin-password-frame');txt('special-password-label','入房密码',y-4,12.5,{lineHeight:18.75,tone:'gold'},x+16,60);let passwordX=x+11,passwordY=y+26.75;
    for(const [mode,label,selected] of [...(d.id?[['keep','保持原密码设置',d.password===undefined] as const]:[]),['none','不设密码',d.password===null||!d.id&&d.password===undefined] as const,['new','设置新密码',passwordNew] as const]){const bw=measure(label,12.5,'system','600')+24;if(passwordX+bw>x+w-11){passwordX=x+11;passwordY+=38;}button('special:password:'+mode,label,passwordY,{skin:'admin-radio',fontSize:12.5,selected},passwordX,bw,32);passwordX+=bw+16;}
    y=passwordY+47;if(passwordNew){button('special:password',d.password||'请输入4–8位密码',y,{skin:'admin-input',fontSize:13.5},x+11,Math.min(220,w-22),38);y+=52;}passwordPanel.height=y-passwordPanel.y;y+=20;
    settingsForm(d.settings);y+=26;button('special:save','保存专属房',y,{skin:'admin-primary',fontSize:14,disabled:passwordNew&&(d.password!.length<4||d.password!.length>8)},x,102,39);y+=58;bodyEnd=y;
    for(const n of nodes)n.fontFace='system';
  } else if(doc.kind==='presets'&&doc.presetEditing){
    modalHeader(doc.roomPreset?'保存房间预设':'编辑常用设置');y+=22;
    txt('preset-name-label','预设名称',y+12,16);y+=42;button('preset:name',doc.presetName||'例如：八人法宝局',y,{skin:'input',fontSize:14},x,w,50);y+=64;
    if(doc.roomPreset)para('preset-room-summary','将保存当前房间：'+doc.settings?.playerCount+' 人 · '+(doc.settings?.anonymousTeamVote?'匿名':'公开')+'组队表决。玩法修改请返回房间设置。');else settingsForm(doc.settings);
    bodyEnd=y;footerH=88;
  } else if(doc.kind==='account'&&doc.profileEditing&&doc.user){
    y=11;modalHeader('修改昵称与头像');y+=6;
    const user=doc.user,draft=doc.profileDraft;
    panel('profile-preview',y,150,'knowledge');
    add('portrait','profile-avatar','',x+16,y+14,64,64,{skin:'avatar',image:draft?.avatarUrl??draft?.wechatAvatarUrl??'emblems/'+(draft?.avatar??user.avatar??'leaf')+'.png'});
    const builtin=BUILTIN_AVATARS.find(a=>a.src===draft?.avatarUrl),source=builtin?'法宝头像（'+builtin.name+'）':draft?.avatarUrl?'自定义头像':draft?.wechatAvatarUrl?'微信头像':'法宝头像（'+BUILTIN_AVATARS[0]!.name+'）';add('label','avatar-source','头像预览：'+source,x+92,y+14,w-108,23.25,{skin:'profile-source',fontSize:11.5});
    txt('avatar-help','选择下方法宝头像，或上传自己的照片；头像只用于朋友之间辨认。',y+43,13,{},x+90,w-102);
    button('uploadAvatar','上传自定义头像',y+92,{skin:'pill',fontSize:13},x+12,w-24,44);y+=166;
    txt('nickname-label','昵称',y,14);y+=28;
    button('profile:nickname',draft?.nickname??user.nickname,y,{skin:'input'},x,w,44);y+=60;
    txt('avatar-heading','预置头像',y,14);y+=24;
    txt('avatar-hint','十二件法宝，点击选择并预览；保存资料后生效。',y,13);y+=28;
    const cols=v.width<=360?3:4,gap=8,aw=(w-4-gap*(cols-1))/cols;
    BUILTIN_AVATARS.forEach((a,i)=>add('button','profile:builtin:'+i,a.name,x+2+(i%cols)*(aw+gap),y+Math.floor(i/cols)*96,aw,88,{skin:'avatar-choice',image:a.src,selected:a.src===(draft?.avatarUrl??BUILTIN_AVATARS[0]?.src)}));y+=Math.ceil(BUILTIN_AVATARS.length/cols)*96;
    txt('profile-history-help','旧对局保留当时昵称。更换设备后，可用当前微信身份重新登录找回账号。',y+4,13);y+=70;
    button('details:profile-vip',(doc.expanded?.includes('profile-vip')?'▾':'▸')+' VIP 兑换与权益',y,{skin:'accordion'});y+=52;
    if(doc.expanded?.includes('profile-vip')){para('vip',user.isVip?'⭐ VIP 有效期至 '+(user.vipUntil??''):'公测全员畅玩阶段，免费体验战绩复盘与高级板子。',13);
    button('redeem','输入 VIP 授权兑换码 · 核销兑换',y,{skin:'input'});y+=50;}bodyEnd=y;footerH=60;
  } else if(doc.kind==='sound'){
    modalHeader('天宫仙乐');
    for(const [id,label,detail] of [['music','背景音乐',BACKGROUND_MUSIC.title],['effects','操作音效','法器反馈 · 降妖法鼓 · 金箍惊鸣 · 胜负终章']] as const){
      const lines=wrapText(detail,w-60,t=>measure(t,12)),h=58+lines.length*18;
      button('sound:'+id,label,y,{skin:'sound-option',selected:doc.soundPreferences?.[id],detail,lines,fontSize:16},x,w,h);y+=h+10;
    }
    for(const [i,t] of ['仅影响自己的设备，自动记住选择。音量使用手机或电脑的媒体音量键调整。','全部操作都有声音反馈，投票与出牌使用相同点击声。胜负音效按自己的结果播放，全程无人声。'].entries()){const n=txt('sound-hint:'+i,t,y,12,{tone:'muted',lineHeight:19.8},x,w);y+=n.height+10;}
    for(const row of model.rows.filter(r=>!r.id.startsWith('sound:')&&!feedback.includes(r))){if(row.id.startsWith('guide:')){para(row.id,row.text,13);}else{button(row.id,row.text,y,{skin:'pill'});y+=50;}}bodyEnd=y;
  } else if(doc.kind==='preferences'&&doc.settings){
    add('label','dialog-title','🎭 心仪选角 · 偏好匹配',x+4,13,w-50,24,{skin:'text',fontFace:'display',fontSize:clamp(14,v.width*.042,18),tone:'gold',fixed:true,align:'left'});
    txt('dialog-subtitle','志愿提高机会 · 不保证命中',37,11,{fixed:true},x+4,w-50);
    button(model.web!.backId??'back','×',17.5,{skin:'pill',fixed:true,fontSize:15},x+w-36,32,32);
    add('label','dialog-rule','',ox+1,66,width-2,1,{skin:'rule',fixed:true});
    txt('pref-intent','⭐ 出战意向志愿 ('+(doc.preferences?.length??0)+'/3)',76,12.5,{tone:'gold',fixed:true},x,w-78);
    if(doc.preferences?.length)button('prefClear','清空重选',73,{skin:'pill',fixed:true,fontSize:11,disabled:doc.preferencesDisabled},x+w-76,76,28);
    for(let i=0;i<3;i++){const role=doc.preferences?.[i];button(role?'pref:'+role:'noop',role?roleNames[role]:'待选择',100,{disabled:doc.preferencesDisabled,skin:'preference-slot',fixed:true,count:i+1,selected:!!role,image:role?'roles/'+defaultRoleArtPrefix(role)+'-160.webp':undefined},x+i*(w+8)/3,(w-16)/3,38);}
    add('label','pref-slot-rule','',ox+1,148,width-2,1,{skin:'rule',fixed:true});y=158;bodyStart=y;footerH=55;
    if(doc.preferencesDisabled)para('pref-disabled','本局已开始或房主已关闭心仪选角，暂不可修改。');
    for(const team of ['blue','red'] as const){const roles=[...new Set(ROLE_CONFIG[doc.settings.playerCount]??[])].filter(r=>getRoleGalleryItem(r).team===team);
      txt('pref-team:'+team,(team==='blue'?'🔵 护经正道 · 神佛仙圣':'🔴 乱道妖魔 · 混世群妖')+' ('+roles.length+')',y,12.5,{tone:team});y+=24.9375;
      for(const [i,role] of roles.entries()){const item=getRoleGalleryItem(role);add('button','pref:'+role,roleNames[role],x+(i%2)*(w+6)/2,y+Math.floor(i/2)*56,(w-6)/2,50,{skin:'preference-choice',image:'roles/'+defaultRoleArtPrefix(role)+'-160.webp',team,selected:doc.preferences?.includes(role),disabled:doc.preferencesDisabled,detail:roleTitles[role]+'|'+roleMottos[role],badge:doc.preferences?.includes(role)?['①','②','③'][doc.preferences.indexOf(role)]+' 志愿':''});}y+=Math.ceil(roles.length/2)*56+3;
    }
    const help=txt('pref-help','💡 心仪角色加权说明：第一、第二、第三志愿及其他角色的基础权重为 8 / 4 / 2 / 1。近期重复角色会降低权重，系统结合本局角色数量与保护条件随机发牌，不保证命中志愿。选角意向不向其他玩家公开。',y+10,11,{tone:'gold',lineHeight:16},x+12,w-24);const helpFrame=panel('pref-help-frame',y,help.height+20,'preference-note');nodes.splice(nodes.indexOf(helpFrame),1);nodes.splice(nodes.indexOf(help),0,helpFrame);y+=helpFrame.height+10;bodyEnd=y;
  } else if(doc.kind==='guanyin-window'&&game){
    y=19;bodyStart=y;const active=doc.self?.role==='guinevere',seconds=doc.remainingSeconds??0;
    txt('mirror-kicker',active?'✨ 慈航至宝 · 照妖神镜':'🪞 佛光初现 · 仙魔辨察',y,11.5,{weight:'700',tone:'gold',letterSpacing:.5,lineHeight:16.1},x,w-78);
    txt('mirror-title',active?'辨察出征车队心性':'观音菩萨正在审视出征车队',y+18.1,clamp(15,v.width*.042,20),{fontFace:'calligraphy',lines:[active?'辨察出征车队心性':'观音菩萨正在审视出征车队'],lineHeight:clamp(15,v.width*.042,20)*1.25},x,w-78);
    add('label','mirror-timer','⏱️ '+seconds+'s',x+w-66,y+5,66,30,{skin:'mirror-timer',fontSize:13});y+=50.46875;add('label','mirror-rule','',x,y,w,1,{skin:'rule'});y+=15;
    if(active){
      const prompt=txt('mirror-prompt','本轮组队表决已通过！你可在 '+seconds+' 秒 内私密照耀车队中 1 位队员 的心性纯浊，亦可保留宝镜后续再用。',y,13,{align:'center',lineHeight:20.15});y+=prompt.height+14;
      txt('mirror-candidates-title','—◇ 点击选择欲辨察的车队仙友 ◇—',y,12,{tone:'gold',align:'center',letterSpacing:.5});y+=30;
      const candidates=game.players.filter(p=>game.rounds.at(-1)?.team.includes(p.id)&&p.id!==doc.user?.id),cols=Math.max(1,Math.floor((w+10)/140)),cw=(w-(cols-1)*10)/cols;
      y+=14;
      for(let start=0;start<candidates.length;start+=cols){
        const row=candidates.slice(start,start+cols),diameters=row.map(p=>p.avatar||p.avatarUrl||p.wechatAvatarUrl?cw-18:40),height=Math.max(...diameters)+71;
        row.forEach((p,i)=>{const px=x+i*(cw+10),py=y,d=diameters[i]!,contentY=py+(height-d-45)/2;
          panel('mirror-candidate:'+p.id,py,height,'mirror-candidate',px,cw);
          add('portrait','mirror-avatar:'+p.id,'',px+(cw-d)/2,contentY,d,d,{skin:'avatar',image:p.avatarUrl??p.wechatAvatarUrl??'emblems/'+(p.avatar??'cards')+'.png'});
          add('label','mirror-seat:'+p.id,p.seat+'号',px+(cw+d)/2-20,contentY+d-14,26,18,{skin:'mirror-seat',fontSize:10.5});
          txt('mirror-name:'+p.id,p.nickname,contentY+d+8,13,{weight:'700',align:'center',lines:[p.nickname],lineHeight:19},px+8,cw-16);
          txt('mirror-action:'+p.id,'🪞 照耀此仙心性',contentY+d+29,11,{weight:'600',tone:'gold',align:'center',lineHeight:16},px+8,cw-16);
          add('button','treasure:guanyinPick:'+p.id,'',px,py,cw,height,{skin:'hitbox',disabled:!doc.self?.treasures?.guanyinMirror?.available});
        });y+=height+24;
      }y+=6;
      button('treasure:guanyinSkip','暂不发动 · 保留宝镜',y,{skin:'mirror-skip',fontSize:13},x,w,48);y+=60;
    }else{
      y+=10;add('label','mirror-aura','',x+(w-64)/2,y,64,64,{skin:'mirror-aura'});y+=92.5;
      const waiting=txt('mirror-waiting','车队表决已准行，天机流转，佛光微显。',y,14.5,{align:'center',weight:'700',lineHeight:25.375},x+8,w-16);y+=waiting.height+19;
      const detail=txt('mirror-waiting-detail','观音菩萨正在审视出征车队（'+seconds+'s），稍后即将开启取经出难试炼…',y,13,{align:'center',lineHeight:22.75},x+8,w-16);y+=detail.height+14;
      const lineup=txt('mirror-lineup','本轮出征车队：'+game.rounds.at(-1)?.team.map(id=>{const p=game.players.find(p=>p.id===id);return p?p.seat+'号 '+p.nickname:'';}).join('、'),y+9,12,{align:'center',lineHeight:17},x+21,w-42);
      const lineupPanel=panel('mirror-lineup-frame',y,lineup.height+18,'mirror-lineup',x+8,w-16);nodes.splice(nodes.indexOf(lineupPanel),1);nodes.splice(nodes.indexOf(lineup),0,lineupPanel);y+=lineup.height+32;
      panel('mirror-progress-track',y,4,'mirror-track',x+8,w-16);panel('mirror-progress',y,4,'mirror-progress',x+8,(w-16)*Math.min(1,seconds*1000/GUANYIN_WINDOW_MS));y+=18;
    }
    const footnote=txt('mirror-footnote',active?'※ 超时自动保留宝镜，后续轮次仍可使用。照耀心性纯属观音私密心证，绝不公开。':'※ 照妖宝镜仅限观音菩萨私密心证，不公开结果，不影响任务出牌，亦不会暴露仙友身份。',y,11,{tone:'muted',align:'center',lineHeight:16.5},x+(active?0:8),w-(active?0:16));y+=footnote.height+(active?6:12);bodyEnd=y;
  } else if(doc.kind==='private-notice'&&doc.self&&game){
    const kind=doc.noticeKind,t=doc.self.treasures; y=pad;bodyStart=pad;
    if(kind==='jingu'){
      // The web header is a three-column flex row, including its responsive wrapping.
      const haloW=114.86,titleW=(w-haloW-28)*.5442,subW=w-haloW-titleW-28;
      txt('notice-halo','✨ 📿 ✨',y,24,{align:'center',lines:['✨ 📿 ✨']},x,haloW);
      const title=txt('notice-title','金箍显圣 · 护法归位',y,24,{fontFace:'display',tone:'gold',align:'center',letterSpacing:1,lineHeight:36},x+haloW+14,titleW);
      const subtitle=txt('notice-subtitle','阿弥陀佛！绝境之中，真同修舍身自证',y+2,12,{tone:'muted',align:'center',lineHeight:21},x+haloW+titleW+28,subW);
      y+=Math.max(40,title.height,subtitle.height+2)+14;add('label','notice-header-rule','',x,y,w,1,{skin:'rule'});y+=17;
      const ally=game.players.find(p=>p.id===t?.jinguAllyId);panel('notice-ally',y,78.5,'jingu-ally');add('portrait','notice-avatar','',x+15,y+17.25,44,44,{skin:'avatar',image:ally?.avatarUrl??ally?.wechatAvatarUrl??'emblems/'+(ally?.avatar??'cards')+'.png'});
      txt('notice-seat',(ally?.seat??'')+' 号位',y+11,11,{tone:'gold',weight:'700',lineHeight:15.5},x+73,w-88);txt('notice-name',ally?.nickname??'护法同修',y+28.5,15,{weight:'700',lineHeight:21},x+73,w-88);txt('notice-role','🌟 取经护法同修（纯正蓝方）',y+51.5,11.5,{tone:'blue',weight:'600',lineHeight:16},x+73,w-88);y+=90.5;
      const block=panel('notice-proof',y,1,'jingu-proof');y+=12;
      for(const [i,copy] of ['仙友 '+(ally?ally.seat+' 号 '+ally.nickname+(ally.id===doc.user?.id?'（你）':''):'护法同修')+' 已在暗中捏动紧箍佛印向你自证！','唐三藏圣僧慧眼洞开：此仙友确系百分之百纯正取经护法同修，绝非妖魔潜伏！','💡 提示：该仙友头上已标注【📿 护法】金印，请全力倚重其发言与投票，护送车队通关。'].entries()){
        if(i===2){add('label','notice-tip-rule','',x+12,y,w-24,1,{skin:'rule'});y+=7;}
        const n=txt('notice-proof:'+i,copy,y,i===2?12:13.5,{tone:i===1?'blue':i===2?'muted':undefined,lineHeight:i===2?21:23.625},x+12,w-24);y+=n.height+(i===2?0:8);
      }y+=12;block.height=y-block.y;y+=52;
      button('overlayClose','阿弥陀佛，贫僧知晓了',y,{skin:'jingu-confirm',fontSize:14.5},x,w,48);y+=66;
    }else{
      const mirror=kind==='mirror',gap=mirror&&v.width<=360?8:12;txt('notice-title',mirror?'慈航照妖镜':'同心铃 · 私密传音',y,mirror?clamp(20,v.width*.05,24):clamp(18,v.width*.05,22),{fontFace:'display'},x,w-72);txt('notice-private','仅你可见',y+7,12,{tone:'muted',align:'right'},x+w-70,70);y+=mirror?43:42.25;add('label','notice-header-rule','',x,y,w,1,{skin:'rule'});y+=gap;
      if(mirror&&t?.guanyinMirror?.result){const r=t.guanyinMirror.result,p=game.players.find(p=>p.id===r.targetId),pure=r.alignment==='pure';txt('notice-kicker','查验已完成',y,14,{align:'center',tone:'muted',lineHeight:24.5});y+=24.5+gap;const d=clamp(64,v.height*.14,108);add('portrait','notice-avatar','',x+(w-d)/2,y,d,d,{skin:'avatar',image:p?.avatarUrl??p?.wechatAvatarUrl??'emblems/'+(p?.avatar??'cards')+'.png'});y+=d+gap;
        const name=txt('notice-name',p?String(p.seat).padStart(2,'0')+'号 · '+p.nickname:'本轮查验的仙友',y,20,{weight:'600',align:'center',lineHeight:28});y+=name.height+gap;
        const ph=v.width<=360?82.4:90.4;panel('notice-alignment',y,ph,pure?'notice-pure':'notice-evil');txt('notice-alignment-label',pure?'心性纯良':'妖气内伏',y+(v.width<=360?9:13),26,{fontFace:'display',align:'center',tone:pure?'green':'red',lineHeight:36.4});txt('notice-team',pure?'取经阵营 · 好人':'妖魔阵营 · 恶妖',y+(v.width<=360?48.2:52.2),16,{align:'center',tone:pure?'green':'red',lineHeight:22.4});y+=ph+gap;
        const note=txt('notice-note','仅知阵营，不揭示具体角色。其他玩家正常继续对局。',y,16,{align:'center',lineHeight:24});y+=note.height+gap;
      }else if(t?.incomingHeartBell){const msg=t.incomingHeartBell,card=panel('notice-message',y,1,'bell-message');y+=15;txt('notice-round','第 '+msg.mission+' 难 · 第 '+msg.roundNumber+' 次组队',y,14,{align:'center',lineHeight:21});y+=29;txt('notice-advice',msg.advice==='protect'?'建议护经':'建议作祟',y,28,{fontFace:'display',tone:'gold',align:'center',lineHeight:39.2});y+=47.2;const body=txt('notice-message-text',msg.active?'一位已相认同伙发来的建议，如何出牌由你决定。':'此传音已过出牌时机，仅供回看。',y,14,{align:'center',lineHeight:21},x+15,w-30);y+=body.height+15;card.height=y-card.y;y+=12;
        const hint=txt('notice-note','无需回复，不改变任何出牌。其他玩家正常继续对局。',y,14,{tone:'muted',lineHeight:21});y+=hint.height+12;
      }
      button('overlayClose','已阅，返回对局',y,{skin:'treasure-confirm',fontSize:14},x,w,46);y+=46+gap;const footer=txt('notice-footer',mirror?'稍后可点击对局页「法宝」再次查看':'可从对局页「法宝」回看',y,12,{align:'center',tone:'muted',lineHeight:17});y+=footer.height;
    }y+=pad-13;bodyEnd=y;
  } else if(doc.kind==='identity'&&doc.self&&game) {
    const self=doc.self,item=getRoleGalleryItem(self.role,self.loyalGuardian,self.femaleDemon), knowledge=identityKnowledge(self,game.players.length);
    modalHeader('真身法相底牌');y+=2;
    const bx=x+2,bw=w-4;
    add('button','identityArt',item.name,bx,y,bw,110,{skin:'identity-card',image:'roles/'+item.artPrefix+'-160.webp',team:self.team,detail:item.title+'|'+item.motto,badge:(self.team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道')});y+=116;
    const candidatePlayers=knowledge.candidates.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>!!p);
    const columns=Math.max(1,Math.min(4,candidatePlayers.length)),tokenRows=Math.ceil(candidatePlayers.length/columns);
    const descLines=wrapText(knowledge.description,bw-24,t=>measure(t,11.5));
    const visionDiameter=clamp(32,v.height*.055,42),visionStep=visionDiameter+22;
    const kh=36+(candidatePlayers.length?tokenRows*visionStep:0)+descLines.length*16.675+11.825;
    panel('identity-knowledge',y,kh,'knowledge',bx,bw);
    txt('identity-vision-title',knowledge.title,y+9,14,{fontFace:'display',align:'center',lineHeight:18.2},bx+10,bw-20);
    candidatePlayers.forEach((p,i)=>{const tw=candidatePlayers.length<=2?60:(bw-24)/columns;const sx=candidatePlayers.length<=2?bx+bw/2-(candidatePlayers.length*tw+(candidatePlayers.length-1)*16)/2:bx+12;token('vision:'+p.id,p,sx+(i%columns)*(tw+(candidatePlayers.length<=2?16:0)),y+32+Math.floor(i/columns)*visionStep,tw,visionDiameter+16);const node=nodes.at(-1)!;node.detail='vision';node.fontSize=visionDiameter;});
    txt('identity-vision-description',knowledge.description,y+30+(candidatePlayers.length?tokenRows*visionStep:0),11.5,{lineHeight:16.675,align:'center',tone:'muted'},bx+12,bw-24);y+=kh+6;
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
    y+=4;const ruleText='准行多于封驳即准予出征 · 平票或封驳视为流局',ruleLines=wrapText(ruleText,w-22,t=>measure(t,12)),ruleHeight=ruleLines.length*21+10;panel('vote-rule',y,ruleHeight,'vote-prompt').fixed=true;txt('guide:vote-rule',ruleText,y+5,12,{align:'center',lineHeight:21,lines:ruleLines,fixed:true},x+10,w-20);y+=ruleHeight+12;bodyStart=y;const voteBodyStart=nodes.length;
    const round=game.rounds.at(-1),party=(round?.team??[]).map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>!!p), captain=game.players.find(p=>p.id===game.captainId);
    const columns=Math.min(3,party.length)||1, slotW=Math.min(115,(w-32-(columns-1)*10)/columns),slotH=92;
    const teamH=66+18+Math.ceil(party.length/columns)*slotH+(Math.ceil(party.length/columns)-1)*10+4;
    panel('vote-team-panel',y,teamH,'expedition');
    add('label','vote-captain',captain?'队长：'+captain.seat+'号 '+captain.nickname+(captain.id===doc.user?.id?'（你）':''):'队长：待定',x+2,y+2,w-4,66,{skin:'captain-banner',image:captain?.avatarUrl??'emblems/'+(captain?.avatar??'cards')+'.png',fontSize:clamp(17,v.width*.05,22),fontFace:'calligraphy',tone:'gold'});
    party.forEach((p,i)=>token('party:'+p.id,p,x+(w-columns*slotW-(columns-1)*10)/2+(i%columns)*(slotW+10),y+74+Math.floor(i/columns)*(slotH+10),slotW,slotH,'出征'+(p.id===doc.user?.id?'|我':'')));
    y+=teamH+15;
    add('label','vote-party-rule','',x+2,y,w-4,1,{skin:'rule'});y+=18;
    if(!doc.submitted) {
      for(const [i,key,label,sub,icon] of [[0,'approve','准行','赞同出征','✓'],[1,'reject','封驳','异议阻滞','×'],[2,'abstain','旁观','默许中立','−']] as const) add('choice','vote-choice:'+key,label,x+i*(w+8)/3,y,(w-16)/3,86.4,{skin:'vote-choice',detail:sub,badge:icon,selected:doc.voteChoice===(key==='approve'?true:key==='reject'?false:'abstain'),tone:key==='approve'?'green':key==='reject'?'red':'gold'});
      y+=98.4;button('submitVote','📜 落印法旨 · 提交表决',y,{skin:'vote-submit',fontFace:'calligraphy',letterSpacing:.5,fontSize:clamp(13,v.width*.038,17),primary:true,disabled:doc.voteChoice===undefined},x,w,48);y+=58;
    } else {panel('vote-submitted',y,100,'submitted');txt('submitted','📜 法旨已落印，静候众仙表决\n全员完成表决后，将自动揭晓结果并返回法坛',y+18,14,{align:'center'},x+12,w-24);y+=108;}
    const completed=game.rounds.filter(r=>r.result);
    txt('vote-history-heading','📜 往难功过簿（'+(completed.length?'已历 '+completed.length+' 难':'初难暂无记录')+'）',y,12,{tone:'gold',lineHeight:16.8});y+=30.8;
    if(!completed.length){txt('vote-history-empty','此乃西行首难，尚无往难战况记录，凭慧眼明断！',y+4,11,{align:'center'});y+=45.25;}
    else for(const r of completed){para('vote-history:'+r.number,'第'+r.mission+'难 · '+(r.result?.passed?'🪷 护经功成':'🔥 妖魔作祟')+'\n领队：'+(game.players.find(p=>p.id===r.captainId)?.nickname??'')+' · 出征：'+r.team.map(id=>game.players.find(p=>p.id===id)?.nickname??'').join('、'),12);}
    const columnsV=v.width<360?2:3,rows=Math.ceil(game.players.length/columnsV),progressH=58.83+rows*25+10;
    panel('vote-progress',y,progressH,'progress');txt('progress','投票进度',y+10,12,{},x+10,96);txt('progress-total',(game.teamVote?.votedIds.length??0)+' / '+game.players.length+' 人已投',y+10,13,{tone:'gold',weight:'700',align:'right'},x+110,w-120);
    game.players.forEach((p,i)=>{const done=game.teamVote?.votedIds.includes(p.id),ballot=game.teamVote?.ballots?.[p.id];add('label','ballot:'+p.id,p.seat+'号 '+p.nickname+'  '+(ballot==='abstain'?'− 旁观':ballot===true?'✓ 准行':ballot===false?'× 封驳':done?'已落印':'待落印'),x+10+i%columnsV*((w-14)/columnsV),y+32+Math.floor(i/columnsV)*25,(w-20-(columnsV-1)*6)/columnsV,22,{skin:'voter-chip',fontSize:9.5,tone:done?'green':'gold'});});
    txt('vote-privacy',game.teamVote?.ballots?'🔓 公开表决：提交后全员可见票型':'🔒 匿名表决：仅公开落印进度，不公开个人票型',y+progressH-25,10.5,{align:'center'},x+5,w-10);y+=progressH+6;for(const n of nodes.slice(voteBodyStart)){if(n.x===x&&n.width===w){n.x+=2;n.width-=4;}if(n.id.startsWith('vote-choice:')){const i=['approve','reject','abstain'].indexOf(n.id.slice(12));n.x=x+2+i*(w+4)/3;n.width=(w-20)/3;}if(n.id==='vote-captain'){n.x+=2;n.width-=4;}}bodyEnd=y;
  } else if(doc.kind==='art'&&doc.roleItem) {
    const item=doc.roleItem;y=20;
    add('label','art-faction',(item.team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道')+' · '+item.title,x,y+3,Math.min(w-88,200),26,{skin:'art-faction',team:item.team,fontSize:11});
    button(model.web!.backId??'overlayClose','✕ 关闭',y,{skin:'pill',fontSize:13},x+w-76,76,32);add('label','art-header-rule','',x,y+44,w,1,{skin:'rule'});y+=64;
    const diameter=Math.min(v.width*.72,300);
    add('portrait','role-large',item.fullName,(v.width-diameter)/2,y,diameter,diameter,{skin:'art-circle',image:'/art/roles/'+item.artPrefix+'-640.webp',team:item.team});
    if(model.web?.backId==='guideArtClose'){button('guideArtPrev','⟨',y+diameter/2-22,{skin:'pill',fontSize:22},x+6,44,44);button('guideArtNext','⟩',y+diameter/2-22,{skin:'pill',fontSize:22},x+w-50,44,44);}y+=diameter+14;
    add('label','art-name',item.fullName,x,y,w,33.6,{skin:'art-name',fontFace:'display',fontSize:28});y+=41.6;
    const motto=txt('art-motto','“'+item.motto+'”',y,14,{align:'center',tone:'gold',lineHeight:21});y+=motto.height+10;
    const story=txt('art-story',item.story,y+11,13,{lineHeight:21.45,skin:'art-story-copy'},x+15,w-30);const storyPanel=panel('art-story-panel',y,story.height+22,'art-story');nodes.splice(nodes.indexOf(storyPanel),1);nodes.splice(nodes.indexOf(story),0,storyPanel);y+=storyPanel.height+31;bodyEnd=y;
  } else if(doc.kind==='report'&&game){
    const r=game.rounds.find(r=>r.mission===doc.reportMission&&r.result);
    y=19;modalHeader('第 '+doc.reportMission+' 难 · 战报落定',WUYUE_MISSIONS[(doc.reportMission??1)-1]?.title??'取经战报');y+=4;
    if(r?.result){const passed=r.result.passed;
      panel('report-hero',y,140,passed?'report-success-hero':'report-failure-hero');
      txt('report-outcome-icon',passed?'🪷':'🔥',y+18,24,{lineHeight:34},x+12,34);
      txt('report-kicker',passed?'MISSION SUCCESS · 取经护持':'MISSION FAILED · 妖魔作祟',y+10,10,{tone:passed?'green':'red'},x+46,w-58);
      txt('report-result',passed?'✓ 护经成功 · 此难化解':'取经失利 · 妖魔作祟',y+28,17,{fontFace:'calligraphy',letterSpacing:.5,lineHeight:22.1,tone:passed?'green':'red'},x+46,w-58);
      panel('report-success',y+58,34,'report-stat-success',x+12,(w-30)/2);panel('report-fail',y+58,34,'report-stat-failure',x+18+(w-30)/2,(w-30)/2);
      txt('report-success-total','🪷 成功牌 '+r.result.successes+' 张',y+65,14,{align:'center'},x+12,(w-30)/2);
      txt('report-fail-total','🔥 失败牌 '+r.result.failures+' 张',y+65,14,{align:'center'},x+18+(w-30)/2,(w-30)/2);
      txt('report-rule',(failuresRequiredFor(game.players.length,doc.reportMission??game.mission)===2?'本难规则：需 2 张及以上失败牌方判定失败':'本难规则：只要出现 1 张失败牌即判定失败')+'，出牌过程始终匿名。',y+100,11,{align:'center',lineHeight:15.4},x+12,w-24);y+=150;
      const party=r.team.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>!!p),ph=82+Math.ceil(party.length/2)*34+8;
      panel('report-party',y,ph,'report-section');txt('report-party-title','出征领队与执行阵容',y+10,13,{tone:'gold',fontFace:'calligraphy'},x+38,w-48);
      add('label','report-crown','',x+10,y+8,22,22,{skin:'guide-emblem',image:'emblems/crown.png'});
      const captain=game.players.find(p=>p.id===r.captainId);
      txt('report-captain','领队：'+(captain?captain.seat+'号 '+captain.nickname:'')+' · '+(r.direction==='counterclockwise'?'逆时针':'顺时针')+'发言',y+36,12,{tone:'gold',weight:'600',lineHeight:16.8},x+10,w-20);
      txt('report-party-label','同行出征仙众（'+party.length+'人）：',y+59,12,{},x+10,w-20);
      party.forEach((p,i)=>add('label','report-player:'+p.id,p.seat+'号 '+(p.id===doc.user?.id?'（你） ':'')+p.nickname,x+10+i%2*(w-14)/2,y+82+Math.floor(i/2)*34,(w-26)/2,34,{skin:'report-person',fontSize:12,image:p.avatarUrl??p.wechatAvatarUrl??'emblems/'+(p.avatar??'cards')+'.png'}));y+=ph+10;
      const publicBallots=!model.web?.underlay?.web?.room?.settings.anonymousTeamVote&&r.vote?.ballots;
      const reportColumns=game.players.length===6?3:game.players.length===7||game.players.length===8?4:5;
      const voteHeight=publicBallots?96+Math.ceil(game.players.length/reportColumns)*122:146;
      panel('report-vote',y,voteHeight,'report-section');txt('report-vote-title','全员组队表决记录',y+10,13,{tone:'gold',fontFace:'calligraphy'},x+38,w-48);
      add('label','report-record-icon','',x+10,y+8,22,22,{skin:'guide-emblem',image:'emblems/chronicle.png'});
      for(const [i,total,label,tone] of [[0,r.vote?.approvals??0,'准行','green'],[1,r.vote?.rejections??0,'封驳','red'],[2,r.vote?.abstentions??0,'旁观','gold']] as const){add('label','report-vote-total:'+i,['✓','×','−'][i]+' '+total+' '+label,x+10+i*71,y+37,63,24,{skin:'report-vote-chip',tone,fontSize:12});}
      txt('report-vote-pass','【组队表决通过 · 准予启程】',y+72,13,{tone:'green',align:'right'},x+10,w-20);
      if(publicBallots){const cw=(w-14)/reportColumns;game.players.forEach((p,i)=>{const ballot=publicBallots[p.id];add('portrait','report-ballot:'+p.id,p.nickname,x+10+i%reportColumns*cw,y+96+Math.floor(i/reportColumns)*122,cw-6,104,{skin:'report-ballot',fontSize:Math.min(46,Math.max(40,v.width*.105)),image:p.avatarUrl??p.wechatAvatarUrl??'emblems/'+(p.avatar??'cards')+'.png',count:p.seat,badge:ballot===true?'✓':ballot===false?'×':ballot==='abstain'?'−':'?',selected:p.id===doc.user?.id,detail:ballot===true?'准行':ballot===false?'封驳':ballot==='abstain'?'旁观':'未记录',tone:ballot===true?'green':ballot===false?'red':'gold'});});}
      else txt('report-vote-privacy',model.web?.underlay?.web?.room?.settings.anonymousTeamVote?'🛡️ 本局开启了「匿名组队表决」，仅展示总票数，不公开个人选票。':'本次未记录全员公开票型。',y+102,12,{align:'center',lineHeight:21},x+12,w-24);y+=voteHeight+10;
    }
    for(const n of nodes)if(!n.fixed){n.x=x+2+(n.x-x)*(w-4)/w;n.width*= (w-4)/w;}
    bodyEnd=y;footerH=60;
  } else if(doc.kind==='history'&&game){
    const rounds=doc.reportMission?game.rounds.filter(r=>r.mission===doc.reportMission):game.rounds;
    const heading=doc.reportMission?WUYUE_MISSIONS[doc.reportMission-1]!.title+' 详情（需 '+game.missionSizes[doc.reportMission-1]+' 人 · '+failuresRequiredFor(game.players.length,doc.reportMission)+'张失败牌'+(failuresRequiredFor(game.players.length,doc.reportMission)===1?'即':'才')+'失败）':'取经劫难全录（共 '+rounds.length+' 次提案）';
    const title=txt('dialog-title',heading,y,20,{fontFace:'display',weight:'700',letterSpacing:1,lineHeight:27,tone:'gold',fixed:true},x,w-76);
    headerH=Math.max(32,title.height)+11;
    button(model.web!.backId??'overlayClose','返回法坛',y,{skin:'pill',fontSize:12,fixed:true},x+w-66,66,32);
    add('label','dialog-rule','',x,y+headerH-1,w,1,{skin:'rule',fixed:true});y+=headerH+8;bodyStart=y;
    if(doc.reportMission){WUYUE_MISSIONS.forEach((m,i)=>button('historyMission:'+(i+1),m.shortLabel,y,{skin:'pill',fontSize:12,selected:doc.reportMission===i+1},x+i*w/5,w/5-4,44));y+=54;}
    if(!rounds.length){const empty=txt('empty',doc.reportMission?WUYUE_MISSIONS[doc.reportMission-1]!.title+' 尚未产生组队提案记录。':'尚无已完成的组队提案。',y+26,16,{tone:'muted',lineHeight:28});y=empty.y+empty.height+14;}
    else{
      const navStart=y;let nx=x,ny=y;
      for(const [id,label] of [['round-jump:'+rounds.at(-1)!.number,'最近一轮'],...rounds.map(r=>['round-jump:'+r.number,'第'+r.number+'次 · 第'+r.mission+'难'])]){const bw=measure(label!,12)+20;if(nx+bw>x+w){nx=x;ny+=42;}button(id!,label!,ny,{skin:'pill',fontSize:12},nx,bw,34);nx+=bw+6;}
      y=ny+48;renderRounds(rounds,game.players,model.web?.underlay?.web?.room?.settings.anonymousTeamVote??true);
    }
    if(!doc.reportMission&&game.earlyAssassination?.windows.length){
      button('earlyHistory',(doc.earlyHistoryExpanded?'▾':'▸')+' 轮间确认记录（'+game.earlyAssassination.windows.length+' 次）',y,{skin:'accordion'});y+=48;
      if(doc.earlyHistoryExpanded)for(const [i,window] of game.earlyAssassination.windows.entries()){
        const item=txt('early-window:'+i,'已完成 '+window.afterMission+' 个任务 · 第 '+window.afterProposal+' 次提案后：'+(window.decision==='attempt'?'发起提前刺杀':'本次跳过')+'。',y,14);y+=item.height+12;
      }
    }
    bodyEnd=y;
  } else if(doc.kind==='treasures'&&doc.self&&game){
    modalHeader('📿 本命法宝 · 仙家神兵');y+=6;
    const self=doc.self,t=self.treasures,disabled=model.rows.find(r=>r.id==='treasure-disabled'||r.id==='empty');
    if(disabled&&self.role!=='assassin'&&(!t?.enabled||t.disabledReason==='guardian_perks'||game.players.length<8)){const card=panel('treasure-empty',y,1,'card');txt('treasure-empty-icon','🏮',y+18,36,{align:'center'});txt('treasure-empty-title','仙家法宝 · 隐而不出',y+78,18,{fontFace:'display',tone:'gold',align:'center'});const hint=txt('treasure-empty-description',disabled.id==='treasure-disabled'?disabled.text:game.players.length<8?'专属法宝需至少 8 人且房间开启法宝模式。红孩儿仍可使用刺客神兵。':'当前房间未开启【8-12人专属法宝模式】。唯有红孩儿可在终局刺杀阶段祭出火尖枪。',y+112,13,{tone:'muted',align:'center'},x+18,w-36);y=hint.y+hint.height+24;card.height=y-card.y;}
    else{
      const copy=webTreasureCopy[self.role],card=panel('treasure-role-card',y,1,'treasure-card');
      const badgeW=Math.min(96,measure(copy.badge,11)+18);
      add('label','treasure-badge',copy.badge,x+15,y+15,badgeW,22,{skin:'treasure-badge',fontSize:11});
      txt('treasure-role-name',copy.title,y+15,16,{fontFace:'display',tone:'gold',align:'right',lineHeight:20.8},x+15+badgeW+8,w-38-badgeW);
      add('label','treasure-header-rule','',x+15,y+45,w-30,1,{skin:'rule'});
      const [intro,...notes]=(copy.description||roleTreasures[self.role]).split('\n');
      const description=txt('treasure-role-description',intro!,y+56,self.role==='minion'?14:13,{lineHeight:self.role==='minion'?21.7:20.15,tone:'muted'},x+15,w-30);y=description.y+description.height;
      if(notes.length){const note=txt('treasure-role-note',notes.join('\n'),y,14,{lineHeight:21.7,tone:'muted'},x+15,w-30);y+=note.height;}y+=12;
      let actionBox:WebNode|undefined;
      const targets=model.rows.filter(r=>r.id.startsWith('player:')),selected=targets.find(r=>r.id==='player:'+model.web?.targetId);
      if(targets.length&&self.role!=='minion'){actionBox=panel('treasure-action-box',y,1,'treasure-action-box',x+15,w-30);y+=26;txt('treasure-target-label',self.role==='assassin'?'请选择刺杀目标：':self.role==='mordred'?'请选择欲收入袋中禁选的仙友：':'请选择查验目标（盲区仙友）：',y,13,{},x+25,w-50);y+=28;button('treasureTargets',(selected?.text.replace(' · 已选目标','')??(self.role==='mordred'?'点击选择禁锢目标':'点击选择待查验仙友'))+' ▾',y,{skin:'treasure-select',fontSize:13},x+25,w-50,48);y+=58;
        if(doc.treasureTargetsExpanded){for(const r of targets){button(r.id,r.text,y,{skin:'target',selected:r===selected,fontSize:12},x+25,w-50,36);y+=42;}}
      }
      if(self.role==='minion'&&!t?.heartBell?.sent){
        const box=panel('bell-action-box',y,1,'treasure-action-box',x+15,w-30);y+=22;
        txt('bell-target-label','选择同车同伙',y,13,{tone:'gold'},x+25,w-50);y+=38;
        button(targets.length?'treasureTargets':'noop',(selected?.text.replace(' · 已选目标','')??(targets.length?'点击选择同车同伙':'当前没有可传音的同伙'))+' ▾',y,{skin:'treasure-select',fontSize:13,disabled:!targets.length},x+25,w-50,48);y+=58;
        if(doc.treasureTargetsExpanded)for(const r of targets){button(r.id,r.text,y,{skin:'target',selected:r===selected,fontSize:12},x+25,w-50,36);y+=42;}
        const bw=(w-60)/2;for(const [i,[id,text]] of [['treasure:heartProtect','建议护经'],['treasure:heartSabotage','建议作祟']].entries())button(id!,text!,y,{skin:'treasure-confirm',fontSize:16,disabled:!t?.heartBell?.available||!selected},x+25+i*(bw+10),bw,46);y+=56;
        const info=txt('bell-consumption','点击即发送并消耗本局次数。只能发送固定建议，不能指定对方实际出牌。',y,14,{lineHeight:21,tone:'muted'},x+25,w-50);y+=info.height+10;
        if(!t?.heartBell?.available){const hint=txt('bell-unavailable','需已进入出牌阶段、你与已相认同伙同车且双方未出牌；两张失败牌才失败的轮次不可用。',y,14,{lineHeight:21,tone:'muted'},x+25,w-50);y+=hint.height+12;}
        box.height=y-box.y;y+=10;
      }
      const resultRows=new Set<string>();
      const treasureName=(id:string)=>{const p=game.players.find(p=>p.id===id);return p?String(p.seat).padStart(2,'0')+'号 · '+p.nickname:'未知仙友';};
      const treasureResult=(id:string,title:string,content:string)=>{const box=panel(id+':result',y,1,'treasure-result',x+15,w-30);txt(id+':result-title',title,y+10,12,{tone:'gold',weight:'700'},x+27,w-54);const body=txt(id+':result-body',content,y+32,13,{lineHeight:19.5,tone:'muted'},x+27,w-54);y=body.y+body.height+10;box.height=y-box.y;y+=10;resultRows.add(id);};
      if(t?.tinStaff?.result)treasureResult('treasure:tinStaff','【锡杖显灵秘录】','仙友：'+treasureName(t.tinStaff.result.targetId)+'\n气息：'+(t.tinStaff.result.team==='blue'?'✨ 取经正道（蓝方）':'🔥 混世妖魔（红方）'));
      if(t?.guanyinMirror?.result)treasureResult('treasure:guanyinMirror','【照妖镜显圣】','车队队员：'+treasureName(t.guanyinMirror.result.targetId)+'\n心性照映：'+(t.guanyinMirror.result.alignment==='pure'?'✨ 心性纯良（好人）':'🔥 妖气内伏（恶妖）'));
      if(t?.humanBag?.used)treasureResult('treasure:humanBag','【袋中乾坤】','已在本局祭出后天人种袋！\n禁锢仙友：'+treasureName(t.humanBag.targetId??''));
      if(t?.jinguSeal?.used)treasureResult('treasure:jinguSeal','【佛印已传达】','你已捏动金箍向大唐圣僧亮明护法真身！\n圣僧已在暗中锁定你的座次，请全力辅佐圣僧逆转战局！');
      if(t?.bananaFan?.used)treasureResult('treasure:bananaFan','【芭蕉扇已出】','神扇狂风已在先前轮次成功吹散发车，本局法宝已消耗完毕。');
      if(t?.jinguAllyId)treasureResult('treasure:ally','👑【紧箍佛印 · 同修来投】',treasureName(t.jinguAllyId)+'\n此仙友确系忠良取经护法同修，绝非妖魔！可全力倚重！');
      const rows=model.rows.filter(r=>!resultRows.has(r.id)&&!r.id.startsWith('player:')&&!['back','overlayClose','empty','treasure:heartProtect','treasure:heartSabotage'].includes(r.id));
      if(!rows.length&&self.role==='assassin')rows.push({id:'assassin-idle',text:copy.idle});
      for(const row of rows){
        const actionable=row.id==='treasure:tinStaff'?t?.tinStaff?.available:row.id==='treasure:guanyinMirror'?t?.guanyinMirror?.available:row.id==='treasure:humanBag'?t?.humanBag?.available:row.id==='treasure:jinguSeal'?t?.jinguSeal?.available:row.id==='treasure:bananaFan'?t?.bananaFan?.available:/^(early|assassinate|treasure:heart|treasure:guanyinSkip)/.test(row.id);
        const idle=row.id==='treasure:tinStaff'&&!t?.tinStaff?.used&&!t?.tinStaff?.result||row.id==='treasure:guanyinMirror'&&!t?.guanyinMirror?.used&&!t?.guanyinMirror?.result||row.id==='treasure:humanBag'&&!t?.humanBag?.used||row.id==='treasure:jinguSeal'&&!t?.jinguSeal?.used;
        const text=!actionable&&idle&&copy.idle?copy.idle:row.text,lines=wrapText(text,w-50,v=>measure(v,actionable?13:12)),h=Math.max(38,lines.length*(actionable?20:18)+16);
        if(actionable)button(row.id,({'treasure:humanBag':'🎒 祭起后天人种袋 · 禁选上车','treasure:tinStaff':'📿 祭出九环锡杖 · 私密查验'} as Record<string,string>)[row.id]??text,y,{skin:'treasure-confirm',fontSize:13,lines,disabled:targets.length>0&&!selected&& !['earlyAttempt','earlySkip','treasure:guanyinSkip'].includes(row.id)},x+(actionBox?25:15),w-(actionBox?50:30),h);
        else{panel(row.id+':frame',y,h,'treasure-idle',x+15,w-30);txt(row.id,text,y+8,12,{lineHeight:18,align:'center',tone:'muted'},x+25,w-50);}y+=h+10;
      }
      if(actionBox){y+=1;actionBox.height=y-actionBox.y;y+=15;}
      y+=5;card.height=y-card.y;y+=1;
    }bodyEnd=y;
  } else if(doc.kind==='abort-confirm'){
    y=pad;bodyStart=y;
    const title=txt('abort-title',model.title,y,24,{fontFace:'display',tone:'gold',lineHeight:36},x,w-90);
    button('confirm:back','返回对局',y,{skin:'pill',fontSize:12},x+w-66,66,32);y+=Math.max(title.height,32)+14;
    add('label','abort-rule','',x,y,w,1,{skin:'rule'});y+=17;
    for(const row of model.rows.filter(r=>!r.id.startsWith('confirm:'))){const paragraph=txt(row.id,row.text,y,16,{lineHeight:28});y+=paragraph.height+16;}
    const actions=model.rows.filter(r=>r.id.startsWith('confirm:')),bw=(w-10*(actions.length-1))/Math.max(1,actions.length),lines=actions.map(r=>wrapText(r.text,bw-38,t=>measure(t,16,'sans','700'))),bh=Math.max(48,...lines.map(l=>l.length*24+26));
    if(actions.length){y+=14;actions.forEach((row,i)=>button(row.id,row.text,y,{skin:row.id==='confirm:yes'?'abort-primary':'abort-secondary',fontSize:16,lines:lines[i],lineHeight:24},x+i*(bw+10),bw,bh));y+=bh;}
    y+=pad-13;bodyEnd=y;
  } else if(['confirm','tools'].includes(doc.kind)) {
    modalHeader(model.title);
    const ignored=new Set(['back','overlayClose']);
    if(doc.kind==='confirm')for(const r of model.rows){if(r.id.startsWith('confirm:'))continue;para(r.id,r.text);}
    else for(const r of model.rows){if(ignored.has(r.id)||r.id==='result'||r.id==='rematch')continue;if(r.id==='report-result')continue;
      if(feedback.includes(r))continue;
      const actionable=!r.id.startsWith('guide:')&&(doc.kind==='tools'||r.id==='confirmInspection');
      if(actionable){button(r.id,r.text,y,{skin:r.id.startsWith('player:')?'target':'button',selected:r.text.includes('已选'),primary:!r.id.startsWith('player:')});y+=50;}else para(r.id,r.text,12.5,r.id.startsWith('replay:mission:')?'tip':'card');
    }
    if(doc.kind==='confirm'){rowButtons([{id:'confirm:no',text:'取消'},{id:'confirm:yes',text:'确认执行',primary:true}],y);y+=50;}
    else {button(model.web!.backId??'overlayClose',doc.kind==='report'?'📜 知道了 · 继续取经':'返回法坛',y,{skin:'dragon-button',primary:true});y+=52;}
    bodyEnd=y;
  } else {
    // Full pages share the original web header, sections and input/card primitives.
    const title=doc.kind==='account'||doc.kind==='presets'?'取经功果':doc.kind==='guide'||doc.kind==='guide-role'?'嘻游识妖谱':model.title;
    if(!modal&&!['account','presets','guide','guide-role'].includes(doc.kind)&&!(doc.kind==='settings'&&doc.activeTab==='setup')){add('label','page-title',title,x,doc.kind==='replay'?39:y,w,doc.kind==='replay'?71:54,{skin:doc.kind==='replay'?'replay-heading':'page-heading',fontSize:doc.kind==='replay'?30:26,fontFace:'display',align:doc.kind==='replay'?'left':'center'});y+=72;}
    if(doc.kind==='account'||doc.kind==='presets') {
      y=18;
      const user=doc.user!,nameSpace=w-90,nameWidth=Math.min(nameSpace,Math.max(48,measure(user.nickname,22)+4)),nameLines=wrapText(user.nickname,nameSpace,t=>measure(t,22)),codeBelow=nameWidth+120>nameSpace,profileExtra=(nameLines.length-1)*30+(codeBelow?30:0);panel('account-profile',y,174.4375+profileExtra,'account-profile');
      add('portrait','account-avatar',user.nickname,x+12,y+36,56,56,{skin:'avatar',image:user.avatarUrl??user.wechatAvatarUrl??'emblems/'+(user.avatar??'leaf')+'.png'});
      txt('account-kicker','嘻游 · 真假猴王 / 个人中心',y+12,10,{tone:'gold'},x+78,w-90);
      add('label','account-name',user.nickname,x+78,y+38,nameWidth,nameLines.length*30,{skin:'text',fontSize:22,fontFace:'display',lines:nameLines,lineHeight:30,align:'left'});
      button('copyCode','#'+(user.playerCode??'')+' 📋 复制',y+42+(codeBelow?nameLines.length*30:0),{skin:'code-badge',fontSize:11},codeBelow?x+78:x+84+nameWidth,Math.min(110,nameSpace),24);
      txt('account-help','专属仙友码全局唯一 · 微信小程序静默对应 · 换号凭此码随时找回战绩',y+74+profileExtra,11.5,{},x+78,w-90);
      button('switch','🚪 更换身份',y+124+profileExtra,{skin:'pill',fontSize:12},x+12,88,38);button('back','返回原页面',y+124+profileExtra,{skin:'pill',fontSize:12},x+108,88,38);y+=184.4375+profileExtra;
      button('profileToggle','修改昵称与头像',y,{skin:'pill',fontSize:13},x,(w-8)/2,40);button('sound','声音设置',y,{skin:'pill',fontSize:13},x+(w+8)/2,(w-8)/2,40);y+=50;
      const tabs=[['stats','我的战绩'],['history','历史对局'],['favorites','我的收藏'],['presets','常用设置']];
      panel('account-tab-frame',y,56,'tabs');tabs.forEach(([id,text],i)=>button('page:'+id,text!,y+4,{skin:'account-tab',selected:id===doc.activeTab,fontSize:14},x+4+i*(w-8)/4,(w-8)/4,48));y+=70;
      if(doc.kind==='presets') {
        const hint=txt('preset-hint','最多 10 个；同名保存会更新原预设。只保存玩法，不包含房间、成员或接纳开关。',y,14,{lineHeight:25.2});y+=hint.height+20;
        button('preset:new',doc.roomPreset?'保存当前房间为预设':'新建常用设置',y,{skin:'pill',fontSize:14},x,w,46);y+=74;
        for(const preset of doc.presets??[]){
          const card=panel('preset:'+preset.id,y,1,'preset-card');const title=txt('preset-name:'+preset.id,preset.name,y+19,22,{fontFace:'display'},x+21,w-42);
          const summary=txt('preset-settings:'+preset.id,settingsText(preset.settings),title.y+title.height+8,14,{lineHeight:25.2},x+21,w-42),by=summary.y+summary.height+14;
          button('apply:'+preset.id,(doc.roomPreset?'应用 ':'编辑 ')+preset.name,by,{skin:'pill',fontSize:13,disabled:!!doc.roomPreset&&!doc.canApplyPreset},x+21,(w-50)/2,44);button('delete:'+preset.id,'删除 '+preset.name,by,{skin:'quiet-button',fontSize:13},x+29+(w-50)/2,(w-50)/2,44);card.height=by+65-y;y+=card.height+12;
        }
        if(!doc.presets?.length)para('empty','还没有常用设置。',13);txt('preset-apply-help','应用预设需要房主在等待区操作，并会清除全员准备；人数不足以容纳现有座位时不能应用。',y,14,{lineHeight:25.2});y+=70;
      } else if(doc.activeTab==='history'||doc.activeTab==='favorites') {
        const games=doc.games??[];
        if(!games.length)para('empty',doc.activeTab==='favorites'?'暂无收藏，可在复盘中收藏对局':'暂无已完成的对局');
        const infoY=y;const info=txt('history-info','只显示你参与且已结束的对局，按结束时间倒序。'+(doc.activeTab==='favorites'?'取消收藏不会删除对局。':'中断局也保留记录。'),y+12,14,{lineHeight:25.2},x+14,w-28);const infoFrame=panel('history-info-panel',infoY,info.height+24,'hint');nodes.splice(nodes.indexOf(infoFrame),1);nodes.splice(nodes.indexOf(info),0,infoFrame);y+=info.height+40;
        for(const g of games){const expanded=doc.expanded?.includes(g.id),h=expanded?310:242;panel('history:'+g.id,y,h,'history-card');
          txt('history-outcome:'+g.id,(g.result.winner===null?'中断':g.result.winner===g.self.team?'胜利':'失败'),y+14,22,{fontFace:'display'},x+12,50);txt('history-player-count:'+g.id,g.playerCount+' 人局',y+19,14,{tone:'muted'},x+64,w-152);
          add('label','history-status:'+g.id,g.favorite?'已收藏':'已结束',x+w-63,y+14,50,30,{skin:'history-status',fontSize:12});
          txt('history-role:'+g.id,formatRoleName(g.self.role)+' · '+(g.self.team==='blue'?'蓝方':'红方')+' · '+(reasons[g.result.reason]??''),y+61,16,{},x+12,w-24);
          button('game:'+g.id,'查看复盘 · '+formatDate(g.endedAt),y+111,{skin:'pill',fontSize:16},x+12,w-24,48);
          button('details:'+g.id,(expanded?'▾':'▸')+' 对局信息',y+169,{skin:'accordion'},x+12,w-24,60);
          if(expanded)txt('history-id:'+g.id,'当时昵称：'+g.self.nickname+'\n对局编号 ID：'+g.id,y+237,13,{},x+22,w-44);
          y+=h+12;
        }
        if(model.rows.some(r=>r.id==='more')){button('more','加载更多',y);y+=50;}
      } else if(doc.stats){
        y-=6;const s=doc.stats;const metrics=[[s.completed,'完成对局'],[s.wins,'胜利'],[s.losses,'失败'],[s.winRate==null?'—':Math.round(s.winRate*100)+'%','总胜率']];
        panel('stat-grid',y,58,'metrics');metrics.forEach(([value,label],i)=>add('label','metric:'+i,String(value),x+i*w/4,y,w/4,58,{skin:'metric',detail:String(label),fontSize:20}));y+=72;
        const statHint=txt('statistics-aborted','另有 '+s.aborted+' 局中断，不计入胜负与胜率。统计以最终获胜阵营为准，包含提前刺杀。',y+12,14,{lineHeight:25.2},x+14,w-28);const statFrame=panel('statistics-aborted:panel',y,statHint.height+24,'hint');nodes.splice(nodes.indexOf(statFrame),1);nodes.splice(nodes.indexOf(statHint),0,statFrame);y+=statHint.height+24+14;
        heading('faction-heading','阵营战绩');y-=2;
        for(const [i,team] of ['blue','red'].entries()){const score=s.byTeam[team as 'blue'|'red'];scoreCard('team:'+team,team==='blue'?'蓝方阵营':'红方阵营',score,x+i*(w+8)/2,y,(w-8)/2,team==='blue'?'emblems/blue-faction.png':'emblems/red-faction.png',team as 'blue'|'red');}y+=205.875;
        heading('role-heading','角色战绩');
        Object.entries(roleNames).forEach(([role,name],i)=>{scoreCard('role:'+role,name,s.byRole[role as Role],x+(i%2)*(w+8)/2,y+Math.floor(i/2)*161.125,(w-8)/2,'roles/'+defaultRoleArtPrefix(role as Role)+'-160.webp',teamOf(role as Role));});y+=Math.ceil(Object.keys(roleNames).length/2)*161.125;
      }
      if(model.rows.some(r=>r.id==='admin')){button('admin','管理员入口',y,{skin:'pill'});y+=52;}
    } else if(doc.kind==='friends') {
      modalHeader('仙友录 · 召集与好友');


      const pending=(doc.friends??[]).filter(f=>f.status==='pending'&&!f.isSender).length;
      const tabs=[['invite','📜 房间召集'],['friends','👥 我的仙友'],['add','✨ 添加仙友']];tabs.forEach(([id,text],i)=>button('friendTab:'+id,text!,y,{skin:'social-tab',count:id==='friends'?pending:undefined,selected:doc.friendTab===id,fontSize:13,weight:'600'},x+i*(w+6)/3,(w-12)/3,38));
      add('label','friends-tabs-rule','',x,y+46,w,1,{skin:'rule'});y+=76;
      if(doc.friendTab==='invite') {
        if(doc.roomCode){
          panel('invite-code-card',y,214,'social-code');txt('invite-title','当前对局房间号',y+18,13,{align:'center',tone:'muted'});add('label','invite-room',doc.roomCode,x,y+48,w,48,{skin:'social-code-number'});
          button('copyRoom','🔗 复制对局邀请链接',y+108,{skin:'social-primary',fontSize:14,weight:'600'},x+19,(w-48)/2,42);button('copyRoomCode','📋 复制房间号',y+108,{skin:'social-tab',fontSize:14,weight:'600'},x+29+(w-48)/2,(w-48)/2,42);
          txt('invite-hint','复制后可直接发送到微信、QQ 等群聊，朋友点击链接即可一键入席！',y+160,12.5,{align:'center',tone:'muted',lineHeight:17.5},x+19,w-38);y+=226;
          txt('invite-friends-heading','一键召集在线仙友',y,14,{tone:'gold',weight:'700'});button('refresh:friends','↻',y,{skin:'social-tab',fontSize:12},x+w-24,24,24);y+=30;
          const friends=doc.friends?.filter(f=>f.status==='accepted')??[];
          if(!friends.length){const empty=txt('invite-empty','暂无好友，前往「添加仙友」结识道友吧！',y,12,{tone:'muted'});y+=empty.height+12;}
          for(const f of friends){const inRoom=doc.roomMemberIds?.includes(f.id);add('label','invite-friend:'+f.id,f.nickname,x,y,w-4,84,{skin:'friend-card',textRightInset:174,online:f.online,image:f.avatarUrl??'emblems/'+(f.avatar??'cards')+'.png',badge:f.playerCode,detail:inRoom?'已在当前房间':f.online?'大厅闲逛中':'离线'});button('friend:'+f.id,'✉️ 密札',y+24,{skin:'social-chat',fontSize:12,weight:'700'},x+w-162,92,48);if(inRoom)add('label','invite-in-room:'+f.id,'已在房中',x+w-64,y+20,44,42,{skin:'social-status'});else button('inviteFriend:'+f.id,'一键召集',y+22,{skin:'pill',fontSize:10.5},x+w-66,60,32);y+=84;}
        }else para('no-room','🏯 当前尚未进入对局房间\n先创建或加入房间，再邀请仙友一起取经。',16);
      } else if(doc.friendTab==='add') {
        panel('friend-code-card',y,148,'card');txt('friend-code-label','我的专属仙友号',y+18,11,{align:'center',tone:'muted'});
        txt('friend-code',doc.user?.playerCode??'------',y+54,24,{tone:'gold'},x+16,112);button('copyCode','复制仙友号',y+50,{skin:'social-copy',fontSize:12},x+136,w-152,48);
        txt('friend-code-tip','把你的仙友号分享给好友，好友可直接搜索添加你！',y+116,10,{align:'center',tone:'muted'},x+8,w-16);y+=176;
        txt('friend-search-label','搜索添加仙友',y,13,{tone:'gold'});y+=28;
        button('input:friend',doc.friendQuery||'输入好友 6 位数字仙友号 或 完整昵称',y,{skin:'input',fontSize:11},x,w-88,42);button('friend:add','发送申请',y,{skin:'gold-button',fontSize:12,primary:true,disabled:!doc.friendQuery?.trim()},x+w-80,80,42);y+=52;
      }
      else {
        const groups=[['incoming','待处理的仙缘申请'],['outgoing','已发送的申请'],['accepted','仙友列表']];
        for(const [key,label] of groups){const list=(doc.friends??[]).filter(f=>key==='accepted'?f.status==='accepted':f.status==='pending'&&f.isSender===(key==='outgoing'));if(!list.length){if(key==='accepted'){para('friends-accepted-empty','还没有仙友，前往「添加仙友」发送申请吧。');}continue;}
          txt('friend-group:'+key,label+' ('+list.length+')',y,14,{tone:'gold',fontFace:'display',weight:'700'});y+=26;
          for(const friend of list){if(key==='outgoing'){const name=txt('outgoing-name:'+friend.id,friend.nickname+'  '+(friend.playerCode??''),y+10,13,{tone:'gold'},x+12,w-24);const waiting=txt('outgoing-waiting:'+friend.id,'等待对方回应...',name.y+name.height+4,12,{tone:'muted'},x+12,w-24);y=waiting.y+waiting.height+18;continue;}const extra=key==='accepted'&&friend.online&&(doc.canInvite?!doc.roomMemberIds?.includes(friend.id):!!friend.roomCode),extraWidth=extra?(doc.canInvite?50:76):0;add('label','friend-card:'+friend.id,friend.nickname,x,y,w-4,84,{skin:'friend-card',textRightInset:key==='incoming'?104:key==='accepted'?142+extraWidth+(extra?6:0):14,online:key==='accepted'?friend.online:undefined,selected:key==='incoming',image:friend.avatarUrl??'emblems/'+(friend.avatar??'cards')+'.png',detail:friend.status==='pending'?'申请与你结为仙友':friend.online?(friend.roomCode?'在房间 '+friend.roomCode:'大厅闲逛'):'离线',badge:friend.playerCode});
            if(key==='incoming')button('acceptFriend:'+friend.id,'结为仙友',y+22,{skin:'social-primary',fontSize:12.5,weight:'700'},x+w-96,76,48);
            else if(key==='accepted'){button('friend:'+friend.id,'✉ 密札',y+22,{skin:'social-chat',fontSize:12.5,weight:'700'},x+w-134-extraWidth-(extra?6:0),70,48);button('removeFriend:'+friend.id,'✕',y+22,{skin:'social-remove',tone:'red'},x+w-56,36,48);}
            if(key==='accepted'&&doc.canInvite&&friend.online&&!doc.roomMemberIds?.includes(friend.id)){button('inviteFriend:'+friend.id,'召集',y+22,{skin:'social-primary',fontSize:12.5},x+w-62-extraWidth,extraWidth,48);}
            if(key==='accepted'&&!doc.canInvite&&friend.online&&friend.roomCode){button('joinFriend:'+friend.id,'加入对局',y+22,{skin:'social-primary',fontSize:12.5},x+w-62-extraWidth,extraWidth,48);}
            y+=92;
          }
        }
        if(!doc.friends?.length)para('empty','还没有仙友，前往「添加仙友」发送申请吧。');
      }

      y+=doc.friendTab==='friends'?-8:6;
    } else if(doc.kind==='chat') {
      const direct=doc.activeTab==='direct';modalHeader(direct?'仙友录 · 召集与好友':'法坛传音');
      if(direct){panel('direct-topbar',y,104,'direct-topbar');button('page:friends','← 返回仙友录',y+34,{skin:'direct-back',fontSize:12},x+14,104,48);const f=doc.chatFriend;if(f){add('portrait','direct-friend','',x+118,y+8,92,92,{skin:'direct-avatar',image:f.avatarUrl??'emblems/'+(f.avatar??'cards')+'.png'});txt('direct-name',f.nickname,y+22,13.5,{tone:'gold',weight:'700'},x+214,24);}button('refresh:direct','🔄',y+34,{skin:'direct-back',fontSize:12},x+w-110,96,48);y+=104;}
      const streamStart=y,streamMin=direct?142:120;
      for(const msg of doc.messages??[]){const tw=Math.min(w*.78,Math.max(60,measure(msg.text,13)+26)),lines=wrapText(msg.text,tw-26,t=>measure(t,13)),h=lines.length*(direct?18.2:20)+(direct?18:38);add('label','chat:'+msg.id,msg.text,msg.self?x+w-tw-12:x+12,y+(direct?12:0),tw,h,{skin:direct?'direct-message':'message',lines,fontSize:13,detail:direct?'':msg.name,selected:msg.self,align:'left'});y+=h+(direct?15:0);if(direct&&msg.timestamp){const time=new Date(msg.timestamp).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});txt('chat-time:'+msg.id,time,y,10.5,{tone:'muted',lineHeight:15},msg.self?x+w-tw-8:x+16,tw-8);y+=15;}y+=12;}
      if(!doc.messages?.length){const n=txt('empty',direct?'📜 暂无密札往来，发送快捷密语或打字开始交谈吧！':'法坛尚无传音，发送文字与仙友论道。',y+20,12,{tone:'muted',align:'center'});y=n.y+n.height+12;}y=Math.max(y,streamStart+streamMin);
      if(direct){const quick=model.rows.filter(r=>r.id.startsWith('quick:')),widths=quick.map(r=>measure(r.text,11.5)+20),max=Math.max(0,widths.reduce((a,b)=>a+b+6,0)-6-w+24),offset=Math.min(max,Math.max(0,model.horizontalScroll??0));let qx=x+12-offset;panel('direct-quick-strip',y,80,'direct-quick-strip');quick.forEach((r,i)=>{button(r.id,r.text,y+22,{skin:'direct-quick',fontSize:11.5,clipLeft:x+12,clipRight:x+w-12,scrollMaxX:max},qx,widths[i]!,48);qx+=widths[i]!+6;});y+=80;}
      else if(doc.quickExpanded){let qx=x,qy=y;for(const r of model.rows.filter(r=>r.id.startsWith('quick:'))){const qw=Math.min(w,measure(r.text,11)+20);if(qx+qw>x+w){qx=x;qy+=40;}button(r.id,r.text,qy,{skin:'pill',fontSize:11},qx,qw,34);qx+=qw+6;}y=qy+46;}
      else{button('quickToggle','📜 快捷密语',y,{skin:'accordion'});y+=48;}
      if(direct)panel('direct-input-bar',y,54,'direct-input-bar');
      button('chat:input',doc.chatDraft||(direct?'向 '+(doc.chatFriend?.nickname??'仙友')+' 发送密札…':'向仙友发送密札…'),y+(direct?8:0),{skin:direct?'direct-input':'input',fontSize:13.5},x+(direct?12:0),w-(direct?90:68),38);button(direct?'chat:send':'chat:sendroom',direct?'传札':'发送',y+(direct?8:0),{skin:direct?'direct-send':'gold-button',primary:true,fontSize:14,disabled:!doc.chatDraft?.trim()},x+w-(direct?70:60),58,38);y+=direct?54:50;
    } else if(doc.kind==='guide'||doc.kind==='guide-role') {
      y=14;
      panel('guide-toolbar',y,50,'card');
      button('back','返回',y+5,{skin:'pill',fixed:true,fontSize:12},x+4,38,40);
      button('guide:rules','规则',y+5,{skin:'pill',fixed:true,fontSize:12,selected:doc.activeTab!=='roles'},x+46,42,40);
      button('guide:roles','角色',y+5,{skin:'pill',fixed:true,fontSize:12,selected:doc.activeTab==='roles'},x+92,42,40);
      button('guide:chapters','章节跳转 ▾',y+5,{skin:'input',fixed:true,fontSize:12},x+138,Math.max(40,w-194),40);
      button('guide:directory','目录↑',y+5,{skin:'pill',fixed:true,fontSize:12},x+w-52,48,40);
      nodes.find(n=>n.id==='guide-toolbar')!.fixed=true;
      y+=58;panel('guide-brand',y,86,'profile');txt('guide-brand-title','《嘻游 · 真假猴王》',y+12,20,{fontFace:'display'},x+14,w-28);txt('guide-brand-tagline','一念佛魔皆幻相，谁是修道取经人',y+53,13,{},x+14,w-28);y+=86;
      const chapters=doc.activeTab==='roles'?Object.entries(roleNames).map(([role,label])=>({id:'guide-anchor:'+role,label})):['胜负条件','对局流程','人数配置','房主设置','刺杀与天机','专属法宝'].map((label,i)=>({id:'guide-anchor:'+(i+1),label}));
      if(doc.guideChaptersOpen){
        const menuY=54,menuW=Math.min(240,w-4),menuX=x+w-menuW-2,itemH=Math.min(34,(available-menuY-12)/chapters.length);
        panel('guide-chapter-menu',menuY,chapters.length*itemH+4,'input',menuX,menuW).fixed=true;
        chapters.forEach((c,i)=>button('guide-jump:'+c.id,c.label,menuY+2+i*itemH,{skin:'chapter-option',fixed:true,fontSize:13},menuX+2,menuW-4,itemH));
      }
      const dh=36+Math.ceil(chapters.length/3)*46;
      panel('guide-directory',y,dh,'card');txt('guide-index-label',doc.activeTab==='roles'?'角色目录':'规则目录',y+10,12,{tone:'gold'},x+8,w-16);
      chapters.forEach((c,i)=>button('guide-jump:'+c.id,c.label,y+32+Math.floor(i/3)*46,{skin:'pill',fontSize:12},x+8+i%3*(w-10)/3,(w-22)/3,40));y+=dh+12;
      if(doc.roleItem){const item=doc.roleItem;add('button','guideArt',item.fullName,x,y,w,142,{skin:'identity-card',image:'roles/'+item.artPrefix+'-160.webp',detail:item.title+'|'+item.motto,team:item.team});y+=156;
        for(const r of model.rows.filter(r=>r.id.startsWith('role-')))para(r.id,r.text,14);
      } else if(doc.activeTab==='roles') {
        const introPrivacy=txt('guide-privacy','这里介绍《嘻游 · 真假猴王》全部神魔人物的通用规则，不显示本局谁拿到了什么身份。准确角色仅由本人查看，终局才公开。点击任意法相可鉴赏高清立绘大图。',y-4,13,{lineHeight:19.5});y+=introPrivacy.height+4;
        for(const team of ['blue','red'] as const){add('label','guide-faction:'+team,team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道',x,y,w,38,{skin:'guide-faction',team});y+=48;
          for(const role of Object.keys(roleNames).filter(r=>teamOf(r as Role)===team) as Role[]){
            const item=getRoleGalleryItem(role),frame=panel('guide-anchor:'+role,y,1,team==='blue'?'guide-role-blue':'guide-role-red');y+=10;
            const title=roleNames[role]+(role==='loyal'?'（白龙 / 猪八戒 / 沙悟净 / 金刚）':role==='minion'?'（玉兔精 / 白骨精 / 老鼠精 / 蜘蛛精）':''),titleLines=wrapText(title,w-82,v=>measure(v,18)),headH=90+(titleLines.length-1)*21;add('button','guide-role:'+item.id,title,x+12,y,w-24,headH,{skin:'guide-role-heading',image:'roles/'+defaultRoleArtPrefix(role)+'-160.webp',team,detail:roleTitles[role]+'|'+roleMottos[role],lines:titleLines});y+=headH+6;
            for(const [key,label] of [['ability','能力与视野'],['visibility','谁能看见你'],['treasure','专属法宝'],['tip','玩法提示']] as const){
              const value=key==='treasure'?roleTreasures[role]:roleDescriptions[role][key],lines=wrapText(value,w-116,t=>measure(t,12.5)),h=10+lines.length*17.25;
              panel('guide:'+role+':'+key+':frame',y,h,'guide-step',x+12,w-24);txt('guide:'+role+':'+key+':label',label,y+5,11.5,{tone:'gold'},x+20,64);txt('guide:'+role+':'+key,value,y+5,12.5,{lineHeight:17.25},x+92,w-112);y+=h+4;
            }
            const variants=ALL_GALLERY_ROLES.filter(r=>r.role===role);if(variants.length>1){y+=14;const gallery=panel('guide-variants-frame:'+role,y,1,'guide-gallery',x+12,w-24);y+=12;const n=txt('guide-variants:'+role,'✦ '+(role==='loyal'?'四位取经护法使者':'四位绝色妖仙')+'法相（点击鉴赏高清立绘大图）：',y,13,{tone:'gold'},x+24,w-48);y+=n.height+10;variants.forEach((r,i)=>add('button','guide-role:'+r.id,r.name,x+24+i%2*(w-40)/2,y+Math.floor(i/2)*178,(w-56)/2,154,{skin:'guide-variant',image:'roles/'+r.artPrefix+'-160.webp',team,detail:r.title}));y+=Math.ceil(variants.length/2)*178-12;gallery.height=y-gallery.y;}
            y+=6;frame.height=y-frame.y;y+=16;
          }
        }
        const privacy=txt('guide-end-privacy','蓝方所有角色的任务牌都只能选成功，红方所有角色都可以选成功或失败。红方互认仅显示阵营，不揭示队友的具体角色。',y,12.5,{tone:'muted'});y+=privacy.height+12;
      }
      else {
        webGuideSections.forEach((section,si)=>{
          const frame=panel('guide-anchor:'+(si+1),y,1,'card',x-5,w+10);y+=12;
          txt('guide-eyebrow:'+si,section.eyebrow,y,12,{tone:'muted'},x+7,w-14);y+=24;
          const title=txt('guide-title:'+si,section.title,y,16,{fontFace:'display',tone:'gold'},x+7,w-14);y+=title.height+10;
          for(const [bi,block] of section.blocks.entries()){
            const id='guide-block:'+si+':'+bi;
            const paragraph=(key:string,text:string,muted=false)=>{const n=txt(key,text,y,13,{lineHeight:19.5,tone:muted?'muted':undefined},x+7,w-14);y+=n.height+7;};
            if(block.kind==='victories')for(const [i,item] of block.items.entries()){
              const h=44+wrapText(item.text,w-38,t=>measure(t,12)).length*18,card=panel(id+':'+i,y,h,item.team==='blue'?'profile':'faction-red',x+7,w-14);
              add('label',id+':emblem:'+i,'',x+20,y+12,24,24,{skin:'guide-emblem',image:'emblems/'+item.team+'-faction.png'});
              txt(id+':title:'+i,item.title,y+13,14,{fontFace:'display',tone:item.team==='blue'?'blue':'red'},x+57,w-76);
              txt(id+':text:'+i,item.text,y+42,12,{lineHeight:18},x+17,w-34);y=card.y+card.height+8;
            }
            else if(block.kind==='steps')for(const [i,item] of block.items.entries()){
              const card=panel(id+':'+i,y,1,'guide-step',x+7,w-14);y+=10;
              add('label',id+':emblem:'+i,'',x+16,y+2,26,26,{skin:'guide-emblem',image:'emblems/'+['cards','crown','chronicle','blue','assassin'][i]+'.png'});
              txt(id+':title:'+i,item.title,y,14,{tone:'gold'},x+50,w-68);txt(id+':sub:'+i,item.subtitle,y+20,11.5,{tone:'muted'},x+50,w-68);y+=38;
              for(const [pi,p] of item.paragraphs.entries()){const n=txt(id+':'+i+':p:'+pi,p.text,y,13,{lineHeight:19.5},x+15,w-30);y+=n.height+6;}y+=4;card.height=y-card.y;y+=10;
            }
            else if(block.kind==='configs')for(const [i,item] of block.items.entries()){
              const card=panel(id+':'+i,y,1,'guide-step',x+7,w-14);y+=12;txt(id+':title:'+i,item.title,y,16,{fontFace:'display',tone:'gold'},x+17,w-34);y+=30;
              for(const [pi,p] of item.paragraphs.entries()){const n=txt(id+':'+i+':p:'+pi,p.text,y,13,{lineHeight:19.5},x+17,w-34);y+=n.height+8;}
              item.missions.forEach((m,mi)=>add('label',id+':'+i+':mission:'+mi,m.text,x+17+mi*(w-34)/5,y,(w-44)/5,48,{skin:'guide-mission',fontSize:11,detail:m.count,badge:m.label}));y+=60;card.height=y-card.y;y+=10;
            }
            else if(block.kind==='options')for(const [i,item] of block.items.entries()){
              if(item.tag==='dt'){const n=txt(id+':'+i,item.text,y+6,14,{tone:'gold'},x+7,w-14);y+=n.height+12;}else paragraph(id+':'+i,item.text);
            }
            else if(block.kind==='list')for(const [i,item] of block.items.entries())paragraph(id+':'+i,'• '+item.text);
            else if(block.kind==='paragraph')paragraph(id,block.text,block.style==='hint');
          }
          y+=5;frame.height=y-frame.y;y+=28;
        });

      }
    } else if(doc.kind==='settings') {
      if(doc.activeTab==='setup'&&doc.settings){
        y=12;button('cancelSettings','❮',y,{skin:'pill'},16,38,38);button('sound','♫',y,{skin:'pill'},v.width-94,32,32);button('guide','规则',y,{skin:'pill'},v.width-56,40,32);add('label','setup-title',doc.settings.voiceChatEnabled?'开启网页语音房':'🏛 开启常规房',62,y,v.width-162,40,{skin:'text',fontSize:22,fontFace:'sans',weight:'700',tone:'gold',align:'center'});y=76;
        button('setup:offline','线下常规房\n同桌或外部通话',y,{skin:'setup-mode',selected:!doc.settings.voiceChatEnabled},16,(v.width-42)/2,52);button('setup:web','网页语音房\n建房后全员转网页',y,{skin:'setup-mode',selected:doc.settings.voiceChatEnabled},26+(v.width-42)/2,(v.width-42)/2,52);y=145;
        para('setup-voice-guide',roomVoiceGuidance({settings:doc.settings})+' 微信语音当前关闭。',12.5);
        const countD=clamp(48,v.width*.12,58),countW=4*countD+92,countX=(v.width-countW)/2;panel('setup-count-frame',y,2*countD+24,'setup-count-frame',countX,countW);
        for(let count=5;count<=12;count++)button('count:'+count,String(count),y+10+Math.floor((count-5)/4)*(countD+8),{skin:'count',selected:doc.settings.playerCount===count,fontSize:18},countX+19+(count-5)%4*(countD+18),countD,countD);y+=2*countD+39;
        const accessRows=model.rows.filter(r=>['chooseDedicated','creationPassword'].includes(r.id));
        if(accessRows.length){const room=accessRows.find(r=>r.id==='chooseDedicated'),password=accessRows.find(r=>r.id==='creationPassword');button('setupAccessToggle',(model.web?.setupAccessExpanded?'▾ ':'▸ ')+(room?.text.startsWith('普通房')?'普通房 · 随机房号':room?.text??'普通房')+' · '+(password?.text.includes('已设置')?'已设密码':password?.text.includes('沿用')?'沿用密码设置':'无密码')+'\n房号与密码设置',y,{skin:'setup-access',fontSize:13},18,v.width-36,68);y+=88;
          if(model.web?.setupAccessExpanded)for(const r of accessRows){button(r.id,r.text,y,{skin:'input',fontSize:13});y+=48;}
        }
        for(const r of model.rows.filter(r=>['createRoom','startPractice'].includes(r.id))){const main=r.id==='createRoom';button(r.id,main?(doc.settings.voiceChatEnabled?'开启网页语音房':'开启线下常规房'):'幻境单人演练 '+doc.settings.playerCount+' 人取经牌局 ›',y,{primary:main,skin:main?'waiting-primary':'setup-practice',fontSize:main?15:12},(v.width-(main?220:166.703125))/2,main?220:166.703125,main?44:32);y+=main?50:44;}
        y+=2;txt('setup-role-preview','本局角色配置（'+doc.settings.playerCount+' 人）',y,14,{tone:'gold',weight:'700'});y+=32;
        for(const team of ['blue','red'] as const){
          const roles=ROLE_CONFIG[doc.settings.playerCount].filter(role=>teamOf(role)===team),unique=[...new Set(roles)],rows=Math.ceil(unique.length/3);
          const cw=Math.min(80,(v.width-90)/3), cardH=cw+52, gh=48+rows*cardH+(rows-1)*8+18;
          panel('setup-faction:'+team,y,gh,team==='blue'?'faction-blue':'faction-red',16,v.width-32);
          add('label','faction-heading:'+team,(team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道')+'（'+roles.length+'人）',28,y+12,v.width-56,28,{skin:'text',fontSize:17,fontFace:'display',tone:'gold',align:'center'});
          unique.forEach((role,i)=>{
            const cols=Math.min(3,unique.length),px=v.width/2-(cols*cw+(cols-1)*10)/2+i%3*(cw+10);
            add('button','setupRole:'+role,roleNames[role],px,y+48+Math.floor(i/3)*(cardH+8),cw,cardH,{skin:'setup-role',image:'roles/'+defaultRoleArtPrefix(role as Role)+'-160.webp',team,detail:roleTitles[role],badge:roles.filter(r=>r===role).length>1?'x'+roles.filter(r=>r===role).length:undefined});
          });
          y+=gh+14;
        }

      } else {if(modal)modalHeader('房间设置');settingsForm(doc.settings);for(const r of model.rows.filter(r=>['apply','createRoom','startPractice'].includes(r.id))){button(r.id,r.text,y,{primary:true,skin:'gold-button'});y+=52;}}
    }
    else if(doc.kind==='replay'&&doc.replay){
      const g=doc.replay,name=(id:string)=>{const p=g.players.find(p=>p.id===id);return p?p.seat+' 号 '+p.nickname:'未知成员';};
      y=124;const replayFrame=panel('replay-frame',22,1,'card',13,v.width-26);nodes.splice(nodes.indexOf(replayFrame),1);nodes.unshift(replayFrame);
      button(model.web?.backId??'back','返回记录',47,{skin:'pill',fixed:true,fontSize:14},x+w-102,94,48);
      for(const row of model.rows.filter(r=>r.id==='favorite')){button(row.id,row.text,y-.5,{skin:'pill'},x,90,45);y+=50;}
      y+=19;panel('replay-result-panel',y,135,'replay-hero');txt('replay-result',g.result.winner===null?'本局中断':g.result.winner==='blue'?'蓝方获胜':'红方获胜',y+20,24,{fontFace:'display',tone:'gold'},x+24,w-48);txt('replay-reason',(reasons[g.result.reason]??g.result.reason)+(g.result.targetId?' · 刺杀目标：'+name(g.result.targetId):''),y+74,15,{},x+24,w-48);y+=155;
      const metadataOpen=doc.expanded?.includes('metadata')||!doc.user,identitiesOpen=doc.expanded?.includes('identities')||!doc.user;
      const metadata=panel('replay-metadata',y,70,'replay-details');button('details:metadata',(metadataOpen?'▾':'▸')+' 时间、编号与规则配置',y+10,{skin:'plain-summary',fontSize:13},x+12,w-24,30);y+=70;
      if(metadataOpen){const result=g.result.winner===null?'中断':g.result.winner===g.self.team?'胜利':'失败';const date=txt('replay-date','开始 '+formatDate(g.startedAt)+'\n结束 '+formatDate(g.endedAt)+' · 你的结果：'+result,y+10,14,{lineHeight:21},x+12,w-24);y=date.y+date.height+14;
        const uid=txt('replay-uid','对局编号 ID：'+g.id,y,11.5,{lineHeight:18},x+12,w-24);y+=uid.height+14;
        const settings=txt('replay-settings',settingsText(g.settings,g.rulesetVersion)+'\n规则版本：'+g.rulesetVersion,y,14,{lineHeight:21},x+12,w-24);y+=settings.height+14;
        const privacy=txt('replay-privacy','仅本局参与者可看。'+(g.settings.anonymousTeamVote?'组队投票仅展示总数。':'组队投票展示当时公开的个人赞反。')+'任务出牌始终不对应个人。',y+12,16,{lineHeight:26,tone:'muted'},x+24,w-48),notice=panel('replay-privacy-frame',y,privacy.height+24,'replay-notice',x+12,w-24);nodes.splice(nodes.indexOf(notice),1);nodes.splice(nodes.indexOf(privacy),0,notice);y+=notice.height+26;metadata.height=y-metadata.y;
      }y+=8;
      const identities=panel('replay-identities',y,70,'replay-details');button('details:identities',(identitiesOpen?'▾':'▸')+' 全员最终身份（'+g.players.length+' 人）',y+10,{skin:'plain-summary',fontSize:13},x+12,w-24,30);y+=70;
      const guardians=assignLoyalGuardians(g.id,g.players,g.roles,g.rulesetVersion),demons=assignFemaleDemons(g.id,g.players,g.roles);
      if(identitiesOpen){for(const p of g.players){const role=g.roles[p.id];if(!role)continue;const item=getRoleGalleryItem(role,guardians[p.id],demons[p.id]);add('label','replay-player:'+p.id,name(p.id),x+12,y,w-24,76,{skin:'replay-identity',image:'roles/'+item.artPrefix+'-160.webp',detail:formatRoleName(role,guardians[p.id],demons[p.id]),team:item.team});y+=76;}y+=12;identities.height=y-identities.y;}y+=18;
      txt('replay-rounds','逐轮记录',y,21,{fontFace:'display'});y+=42;
      panel('round-navigation',y,50,'card');let jumpX=x+8,jumpY=y+7;
      for(const [id,label] of [['round-jump:'+g.rounds.at(-1)?.number,'最近一轮'],...g.rounds.map(r=>['round-jump:'+r.number,'第'+r.number+'次 · 第'+r.mission+'难'])]){const bw=measure(label!,12)+20;if(jumpX+bw>x+w-8){jumpX=x+8;jumpY+=40;}button(id!,label!,jumpY,{skin:'pill',fontSize:12},jumpX,bw,36);jumpX+=bw+6;}nodes.find(n=>n.id==='round-navigation')!.height=jumpY-y+43;y=jumpY+66;
      renderRounds(g.rounds,g.players,g.settings.anonymousTeamVote);
      for(const row of model.rows.filter(r=>r.id.startsWith('audit:')))para(row.id,row.text,12);

      if(doc.user){const hint=txt('replay-favorite-hint','收藏只在你的个人中心可见，不会创建公开链接。取消收藏保留历史对局。',y,14,{lineHeight:21,tone:'muted'});y+=hint.height+14;}replayFrame.height=y-22;
    }
    else {
      if(model.subtitle)para('subtitle',model.subtitle,13);
      for(const r of model.rows){if(r.id==='back')continue;
        if(/^(stats:|replay:|guide:|empty|summary|notice|error)/.test(r.id)){para(r.id,r.text,13,/^stats:/.test(r.id)?'profile':'card');}
        else if(/^(user:|room:|game:|code:)/.test(r.id)){button(r.id,r.text,y,{skin:'table-row',fontSize:12});y+=52;}
        else {button(r.id,r.text,y,{skin:/^(search|input|codeDraft:)/.test(r.id)?'input':'button',tone:/^(delete|ban|cleanup)/.test(r.id)?'red':undefined});y+=50;}
      }
      button(model.web!.backId??'back','返回原页面',y,{skin:'pill'});y+=50;
    }
    bodyEnd=y;
  }
  const appendSettingChoices=()=>{
    const choice=doc.settingChoice;if(!choice)return;const anchor=nodes.find(n=>n.id===choice.id);if(!anchor)return;
    const options=settingOptions[choice.key],height=options.length*40,py=Math.max(top+8,Math.min(bottom-height-8,anchor.y+anchor.height+height<bottom-8?anchor.y+anchor.height:anchor.y-height)),px=Math.max(8,anchor.x),pw=Math.min(v.width-16,anchor.width);
    add('button','settingChoice:close','',0,top,v.width,available,{skin:'hitbox',fixed:true});
    panel('setting-options',py,height,'select-menu',px,pw).fixed=true;
    options.forEach(([value,label],i)=>button('settingChoice:value:'+value,label,py+i*40,{skin:'select-option',fontSize:13,selected:value===choice.value,fixed:true},px,pw,40));
  };
  if(!bodyEnd)bodyEnd=y;
  if(modal) {
    const identity=doc.kind==='identity',profile=doc.kind==='account'&&doc.profileEditing,preset=doc.kind==='presets'&&doc.presetEditing,report=doc.kind==='report';
    const intrinsic=doc.kind==='art'?bodyEnd:profile?bodyEnd+94:identity?bodyEnd+footerH+16.85:preset||report?bodyEnd+footerH+23:y+(doc.kind==='code-editor'?19:sound?13:social?socialPad:13);
    const h=doc.kind==='art'?Math.min(available*.94,760,intrinsic):adminFriends?Math.min(available*.8,intrinsic):preferences?Math.min(available*.88,620):doc.kind==='history'?Math.min(available-20,Math.max(Math.min(available*.82,760),intrinsic)):Math.min(drawer?available*.6:available-(identity?24:28),intrinsic),fy=drawer?bottom-h:top+(available-h)/2-(adminFriends?10:0);
    const frame=add('panel','dialog-frame','',ox,fy,width,h,{team:doc.roleItem?.team,skin:doc.kind==='guanyin-window'?'mirror-frame':doc.kind==='private-notice'?(doc.noticeKind==='jingu'?'jingu-frame':'notice-frame'):profile?'profile-frame':doc.kind==='art'?'art-frame':adminFriends?'admin-card':auth?'auth-frame':sound?'sound-frame':doc.kind==='treasures'?'treasure-frame':doc.kind==='special-editor'||doc.kind==='code-editor'?'admin-card':doc.kind==='preferences'?'preference-frame':doc.kind==='vote'?'vote-frame':'dialog-frame',fixed:true});
    nodes.splice(nodes.indexOf(frame),1);nodes.unshift(frame);
    const maxScroll=Math.max(0,intrinsic+(preferences?footerH:0)-h),scroll=Math.min(model.scroll??0,maxScroll);
    const clipTop=fy+(bodyStart||12),clipBottom=fy+h-(preferences?footerH:profile?94:identity||preset||report?footerH+17:12);
    for(const node of nodes){if(node===frame)continue;node.y+=fy;if(node.fixed||identity&&node.y<fy+bodyStart){node.fixed=true;}else {node.y-=scroll;node.clipTop=clipTop;node.clipBottom=clipBottom;}}
    if(preferences){const fyButtons=fy+h-47;add('label','pref-footer-rule','',ox+1,fy+h-55,width-2,1,{skin:'rule',fixed:true});button(model.web!.backId??'back','取消',fyButtons,{skin:'preference-cancel',fixed:true},x,(w-8)/2.6,38);button('prefSave',doc.preferences?.length?'确认出战偏好 ('+doc.preferences.length+'/3)':'盲选出战 (不设偏好)',fyButtons,{skin:'preference-submit',fixed:true,disabled:doc.preferencesDisabled},x+(w-8)/2.6+8,(w-8)*1.6/2.6,38);}
    if(report)button(model.web!.backId??'overlayClose','📜 知道了 · 继续取经',fy+h-67,{skin:'report-ack',fontSize:17,fontFace:'calligraphy',fixed:true,primary:true},x,w,48);
    if(preset)button('preset:save',doc.roomPreset?'保存当前房间设置':'保存预设',fy+h-82,{skin:'gold-button',fixed:true,primary:true,disabled:!doc.presetName?.trim()},x,w,44);
    if(profile){add('label','profile-footer-rule','',x,fy+h-84,w,1,{skin:'rule',fixed:true});button('profile:save','保存资料',fy+h-76,{skin:'gold-button',fontSize:15,weight:'700',fixed:true,primary:true},x,w,47);}
    if(identity){const footerY=fy+h-footerH-11;add('label','identity-footer-rule','',x,footerY,w,1,{skin:'rule',fixed:true});txt('identity-permission','出牌权限：'+(doc.self?.team==='blue'?'仅能护经（成功）':'可护经（成功）/ 作祟（失败）')+' · 离页自动收起',footerY+8,10,{align:'center',fixed:true,tone:'muted',letterSpacing:2,fontFace:'display',lineHeight:14});button(model.web!.backId??'overlayClose','返回对局页面',footerY+27,{skin:'identity-return',fontSize:14,weight:'700',fixed:true,primary:true},x,w,38);}
    feedback.slice(0,1).forEach(r=>add('button',r.id==='error'?'error':'dismissFeedback',r.text,x,fy+Math.min(60,h-70),w,56,{skin:'toast',tone:r.id==='error'?'red':'gold',fixed:true,fontSize:12}));
    // Block taps within the sheet; only its outer backdrop dismisses it.
    add('hitbox','noop','',ox,fy,width,h,{skin:'hitbox',fixed:true});add('hitbox',model.web!.backId??'back','',0,top,v.width,available,{skin:'hitbox',fixed:true});
    appendSettingChoices();
    return {nodes,maxScroll,contentTop:clipTop,contentBottom:clipBottom};
  }
  const maxScroll=Math.max(0,y+(['guide','guide-role'].includes(doc.kind)?12:40)-available),scroll=Math.min(model.scroll??0,maxScroll);
  for(const node of nodes){node.y+=top-(node.fixed?(['guide','guide-role'].includes(doc.kind)?Math.min(scroll,14):0):scroll);node.clipTop=top;node.clipBottom=bottom;}
  feedback.slice(0,1).forEach(r=>add('button',r.id==='error'?'error':'dismissFeedback',r.text,18,top+58,v.width-36,56,{skin:'toast',tone:r.id==='error'?'red':'gold',fixed:true,fontSize:12}));
  appendSettingChoices();
  return {nodes,maxScroll,contentTop:top,contentBottom:bottom};

  function settingsForm(settings=doc.settings) {
    if(!settings)return;
    if(doc.kind==='special-editor'){
      txt('special-count-label','对局人数',y,12.5,{lineHeight:18.75});y+=24.75;for(let count=5;count<=12;count++)button('special:setting:count:'+count,String(count),y,{skin:'admin-count',fontSize:13,selected:settings.playerCount===count},x+(count-5)*(w+3)/8,(w-21)/8,32);y+=52;
      for(const [key,label,value] of [['voiceChatEnabled','房间类型',settings.voiceChatEnabled?'网页语音房（全员用网页）':'普通房，线下或外部通话'],['captainMode','队长分配',settings.captainMode==='seat_order'?'按座位循环':'开局打乱一次，整局循环'],['rejectionScope','流局计数',settings.rejectionScope==='game'?'全局累计，5 次判负':'单次任务累计，5 次判负']]){txt('special-setting-label:'+key,label!,y,12.5,{weight:'600',lineHeight:18.75});y+=24.75;button('special:setting:'+key,value!,y,{skin:'admin-select',fontSize:13.5},x,w,38);y+=38;}
      for(const [key,label] of [['anonymousTeamVote','匿名组队投票'],['earlyAssassinationEnabled','提前刺杀'],['guardianPerksEnabled','护法天机（建议7-12人）'],['autoRevealRoleEnabled','倒计时后亮明真身'],['treasuresEnabled','专属法宝（8-12人专属）'],['rolePreferenceEnabled','心仪选角（偏好匹配模式）']] as const){button('special:setting:'+key,label,y+4,{skin:'admin-toggle',fontSize:13,selected:settings[key]},x,w,38);y+=47;}return;
    }
    const prefix=doc.kind==='presets'?'preset:':'';
    txt('settings-count-title','对局人数',y,16);y+=42;
    for(let count=5;count<=12;count++)button(prefix+'count:'+count,String(count),y+Math.floor((count-5)/4)*58,{skin:doc.kind==='presets'?'preset-count':'count',fontSize:18,selected:settings.playerCount===count},x+((count-5)%4+.5)*(w+12)/4-29,46,48);y+=130;
    const fields=[['voiceChatEnabled','房间类型',settings.voiceChatEnabled?'网页语音房（全员用网页）':'普通房（线下或外部通话）'],['captainMode','队长分配',settings.captainMode==='seat_order'?'按座位循环':'开局打乱一次，整局循环'],['rejectionScope','流局计数',settings.rejectionScope==='game'?'全局累计，5 次判负':'单次任务累计，5 次判负']];
    for(const [id,label,value] of fields){txt('field:'+id,label!,y,16);y+=32;button(prefix+id,value!,y,{skin:'web-select',fontSize:16},x,w,52);y+=68;if(id==='voiceChatEnabled')para('settings-voice-guide',roomVoiceGuidance({settings}),12.5);}
    for(const [id,label] of [['anonymousTeamVote','匿名组队投票'],['earlyAssassinationEnabled','提前刺杀'],['guardianPerksEnabled','护法天机（建议7-12人）'],['autoRevealRoleEnabled','倒计时后亮明真身'],['treasuresEnabled','专属法宝（8-12人专属）'],['rolePreferenceEnabled','心仪选角（偏好匹配模式）']] as const){button(prefix+id,label,y,{skin:'preset-toggle',fontSize:16,selected:settings[id]},x,w,42);y+=75;}
    if(settings.treasuresEnabled && settings.playerCount >= 8)para('settings-treasure-rule',settings.guardianPerksEnabled?'新局同时开启护法天机时，蓝方法宝禁用，仅红方法宝生效。':'新局未开启护法天机时，双方按角色保留专属法宝。',12);
    y+=36;
  }
  function scoreCard(id:string,name:string,score:Score|undefined,px:number,py:number,pw:number,image:string,team:'blue'|'red') {
    add('label',id,name,px,py,pw,id.startsWith('role:')?154.125:181.875,{skin:'score-card',image,team,detail:(score?.winRate==null?'—':Math.round(score.winRate*100)+'%')+'|'+(score?.wins??0)+' 胜 · '+(score?.losses??0)+' 负|'+(score?.completed??0)+' 局完成 · '+(score?.aborted??0)+' 局中断'});
  }
}
