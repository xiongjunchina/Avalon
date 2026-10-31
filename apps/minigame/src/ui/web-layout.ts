import { reasons } from '../../../web/src/game-presentation.js';
import type { WebDocument } from './web-document.js';
import { layoutDocument } from './web-document-layout.js';
import type { RoomView, Settings, User } from '@avalon/contracts';
import { MISSION_SIZES, ROLE_CONFIG, failuresRequiredFor, teamOf, assignLoyalGuardians, assignFemaleDemons } from '@avalon/game-core';
import { defaultRoleArtPrefix, roleNames, roleMottos, WUYUE_MISSIONS, getRoleGalleryItem, formatRoleName } from '../../../web/src/roles.js';
import { wrapText, type HitRegion, type SafeViewport } from './layout.js';
import { MINI_GAME_VOICE_ENABLED } from '../features.js';
import type { ScreenModel } from './widgets.js';

export interface WebSurface {
  page: 'home' | 'setup' | 'table' | 'sheet';
  background?: 'gate' | 'pavilion' | 'sword' | 'library' | 'mirror' | 'dawn';
  user?: User; room?: RoomView; settings?: Settings;
  authIntent?:'create'|'join';roleIndex?: number; selectedIds?: string[]; targetId?: string;
  guestHome?:boolean;
  setupAccessExpanded?:boolean;
  nickname?: string; authMode?: 'create' | 'switch'; switchCode?: string;
  waitingMissionsExpanded?:boolean;
  friendRequests?:number;freeAccess?: boolean; practice?: boolean; sheet?: string;
  backId?: string;
  activeTab?: string;
  document?: WebDocument;
  underlay?: ScreenModel;
  missionChoice?: boolean;
  ownTeam?: 'blue'|'red';
  warning?: string;
  knownAccounts?: { nickname: string; playerCode: string }[];
}
export interface WebNode extends HitRegion {
  kind: 'label' | 'button' | 'input' | 'portrait' | 'quest' | 'seat' | 'altar' | 'panel' | 'choice' | 'tab' | 'metric' | 'hitbox';
  fixed?: boolean; primary?: boolean; selected?: boolean; disabled?: boolean; muted?: boolean;
  skin?: string; letterSpacing?:number; fontSize?: number; lineHeight?: number; fontFace?: 'sans'|'display'|'calligraphy'|'system'; weight?: string; align?: 'left'|'center'|'right'; tone?: 'blue'|'red'|'gold'|'muted'|'green';
  textRightInset?: number; image?: string; detail?: string; badge?: string; selfPlayer?: boolean; online?: boolean; team?: 'blue' | 'red'; passed?: boolean; count?: number;
  micState?: 'live' | 'speaking' | 'muted' | 'unjoined';
  teamStatus?: '已选' | '出征';
}
export interface WebLayout { nodes: WebNode[]; maxScroll: number; contentTop: number; contentBottom: number }
const cssClamp = (min: number, value: number, max: number) => Math.max(min, Math.min(value, max));

export function layoutWebScreen(model: ScreenModel, v: SafeViewport): WebLayout {
  if (model.web?.document) return layoutDocument(model,v);
  const web = model.web!, nodes: WebNode[] = [];
  const w = v.width, bottom = v.height - v.bottom - 10, pad = 16, full = w - pad * 2;
  let top = v.top + 12, y = top + 60, contentBottom = bottom;
  const add = (kind: WebNode['kind'], id: string, text: string, x: number, py: number, width: number, height: number, extra: Partial<WebNode> = {}) => {
    nodes.push({ kind, id, text, x, y: py, width, height, ...extra });
  };
  const label = (id: string, text: string, py: number, extra: Partial<WebNode> = {}) => add('label', id, text, pad, py, full, 28, extra);
  if (web.page === 'home') {
    const compact=v.height-v.top-v.bottom<=660,homePad=compact?12:16,homeW=w-homePad*2,fg=compact?7:10,toolbarH=w<=380||compact?36:40;
    top=v.top+(compact?8:12);
    add('label','home-duel','',0,0,w,v.height,{skin:'home-duel',image:'home/duel-mobile.jpg',clipTop:0,clipBottom:v.height});
    const avatarW=Math.min(122,Math.max(74,50+(web.user?.nickname.length??4)*12));
    add('button',web.user?'account':'loginOpen',web.user?.nickname??'游客浏览',homePad,top,avatarW,toolbarH,{fixed:true,badge:'home-avatar',image:web.user?.avatarUrl??web.user?.wechatAvatarUrl??'emblems/'+(web.user?.avatar??'cards')+'.png'});
    const soundW=web.user&&w<=380?36:74,friendW=w<=380?65:80,switchW=w<=380?53:61.2,toolsW=web.user?friendW+soundW+switchW+12:soundW;
    let toolX=w-homePad-toolsW;
    for(const [id,title,width] of (web.user?[['friends','♟ 仙友',friendW],['sound','静音',soundW],['switch','▣ 换号',switchW]]:[['sound','静音',soundW]]) as [string,string,number][]){add('button',id,title,toolX,top,width,toolbarH,{fixed:true,fontSize:13,count:id==='friends'?web.friendRequests:undefined});toolX+=width+6;}
    const logoTop=top+(compact?36:40)+(compact?5:8),logoSize=compact?28:cssClamp(28,w*.088,36),logoH=logoSize*1.2,subSize=compact?11:cssClamp(11,w*.033,14);
    add('label','brand','嘻游 · 真假猴王',homePad,logoTop,homeW,logoH,{fontSize:logoSize});
    add('label','home-subtitle','一念佛魔皆幻相，谁是修道取经人',homePad,logoTop+logoH+(compact?5:8),homeW,subSize*1.45,{skin:'home-copy',fontSize:subSize});
    const hasInvitation=model.rows.some(r=>r.id==='invitation'),promotion=web.freeAccess!==false,inviteH=hasInvitation?16.8+fg:0,footerH=(compact?202:230)+inviteH+(promotion?0:-5),footer=v.height-v.bottom-(compact?8:14)-footerH;
    const headlineSize=compact?cssClamp(29,w*.088,34):cssClamp(34,w*.108,44),headlineH=headlineSize*1.06*2,descSize=compact?12:cssClamp(12,w*.036,15),copyH=headlineH+(compact?6:10)+descSize*1.45,copyY=footer-(compact?11:20)-copyH;
    add('label','home-headline','两个悟空，\n你信哪一个？',homePad,copyY,homeW,headlineH,{skin:'home-copy',fontFace:'calligraphy',fontSize:headlineSize});
    add('label','home-description','组队、表决、暗中试探，找出取经路上的妖。',homePad,copyY+headlineH+(compact?6:10),homeW,descSize*1.45,{skin:'home-copy',fontSize:descSize});
    add('panel','mode-frame','',homePad,footer,homeW,52);
    const modeSize=cssClamp(12,w*.036,15);
    add('tab','mode:offline','🏛️ 线下常规房',homePad+4,footer+4,(homeW-14)/2,44,{selected:true,fontSize:modeSize});
    add('tab','mode:voice',MINI_GAME_VOICE_ENABLED?'🎙️ 微信语音说明':'实时语音暂不提供',w/2+3,footer+4,(homeW-14)/2,44,{disabled:!MINI_GAME_VOICE_ENABLED,fontSize:modeSize});
    if(hasInvitation)add('label','home-invite-hint','已收到朋友邀请，点击加入即可继续入座。',homePad,footer+52+fg,homeW,16.8,{skin:'home-copy',fontSize:12});
    const actionsY=footer+52+fg+inviteH,actionH=compact?46:52,actionSize=cssClamp(16,w*.045,19),practiceH=compact?34:40;
    add('button','create','开常规房',homePad,actionsY,(homeW-10)/2,actionH,{primary:true,fontSize:actionSize,image:'emblems/mountain.png'});
    add('button',hasInvitation?'invitation':'join',hasInvitation?'加入邀请房间':'加入房间',homePad+(homeW+10)/2,actionsY,(homeW-10)/2,actionH,{fontSize:actionSize,image:'emblems/crown.png'});
    add('button','practice','🐒 幻境单人试玩 ›',w/2-72,actionsY+actionH+fg,144,practiceH,{fontSize:14});
    const linksY=actionsY+actionH+fg+practiceH+fg+1,linkW=Math.min(homeW,280),linkX=(w-linkW)/2,linkSize=cssClamp(11,w*.0325,14),linkH=compact?34:38;
    add('label','footer-rule','',homePad,linksY-1,homeW,1);
    add('button','guide','玩法与角色',linkX,linksY,linkW*.3,linkH,{muted:true,fontSize:linkSize});
    add('label','footer-dot','·',linkX+linkW*.3,linksY,12,linkH);
    add('button',web.user?'account':'loginOpen','📜 功果簿',linkX+linkW*.35,linksY,linkW*.3,linkH,{muted:true,fontSize:linkSize});
    add('label','footer-dot','·',linkX+linkW*.63,linksY,12,linkH);
    add('button',web.user?'logout':'loginOpen',web.user?'🚪 退出登录':'登录 / 注册',linkX+linkW*.68,linksY,linkW*.32,linkH,{muted:true,fontSize:linkSize});
    if(promotion)add('label','home-promotion','公测盛典 · 全特权限时免费畅玩中',homePad,linksY+linkH+4,homeW,13,{skin:'home-copy',fontSize:10});
    const last = nodes.filter(n=>n.id!=='home-duel').reduce((max, node) => Math.max(max, node.y + node.height), 0);
    const maxScroll = Math.max(0, last - (v.height - v.bottom));
    const scroll = Math.min(model.scroll ?? 0, maxScroll);
    for (const node of nodes) if (!node.fixed&&node.id!=='home-duel') { node.y -= scroll; node.clipTop = top + (web.user ? 42 : 0); node.clipBottom = bottom; }
    appendAlerts();
    return { nodes, maxScroll, contentTop: top, contentBottom: bottom };
  }
  add('button', web.backId ?? (web.page === 'table' ? web.practice ? 'exitPractice' : 'leave' : web.page === 'setup' ? 'cancelSettings' : 'back'), '‹', pad, top, 34, 36, { fixed: true });
  add('label', 'page-title', web.page === 'table' ? '嘻游 · 真假猴王' : model.title, 58, top, w - 120, 36, { fixed: true });
  if (web.page === 'table' && web.room) {
    nodes.length = 0;
    const room = web.room, game = room.game, count = room.settings.playerCount;
    const availableH = v.height - v.top - v.bottom;
    top = Math.max(6, v.top);
    add('button', web.practice ? 'exitPractice' : 'leave', '↶', 16, top + 3, 26, 26, { fixed: true });
    add('button', 'copyRoom', web.practice ? '幻境演练' : '房号 ' + room.code, 45, top + 3, Math.min(112,w - 235), 26, { fixed: true, detail: room.members.length + '/' + count + '人 · 复制' });
    const toolScale = Math.min(1, (w - 175) / 195);
    let tx = w - 21 - 189.8 * toolScale;
    (web.practice ? [['bot','代操',26], ['rematch','重开',51.6], ['practiceSettings','配置',51.6], ['guide','📖 规则',51.6]] : [['sound','sound',26], ['chat','💬 传音',51.6], ['more','⚙️ 设置',51.6], ['guide','📖 规则',51.6]]).forEach(([id,title,width]) => {
      add('button', String(id), String(title), tx, top + 3, Number(width) * toolScale, 26, { fixed: true }); tx += (Number(width) + 3) * toolScale;
    });
    y = top + (game?34:48);
    const boardX = 12, boardW = w - 24, questW = (boardW - 24) / 5;
    const questH = 67.3 + cssClamp(36, availableH * .055, 44);
    const drawQuests = (atY: number) => {
      (game?.missionSizes ?? MISSION_SIZES[count]).forEach((size, index) => {
      const result = game?.rounds.find(round => round.mission === index + 1 && round.result)?.result;
      add('quest', 'mission:' + (index + 1), WUYUE_MISSIONS[index]?.title ?? '', boardX + index * (questW + 6), atY, questW, questH,
        { count: size, passed: result?.passed, selected: game?.mission === index + 1 && !game.result,
          detail: failuresRequiredFor(count, index + 1) >= 2 ? '需2败' : game?.mission === index + 1 ? '进行中' : '第' + (index + 1) + '难' });
    });
    };
    if (!game) {
      const host=room.hostId===web.user?.id, me=room.members.find(m=>m.id===web.user?.id);
      y=top+34;
      add('button','settings',count+' 人局 · '+(room.settings.anonymousTeamVote?'匿名表决':'公开表决')+' · '+(room.settings.voiceChatEnabled?'语音房':'线下房')+' · 房间设置',10,y,w-20,30,{skin:'pill',fontSize:12});y+=38;
      add('label','ribbon','等待仙友入座 '+room.members.length+'/'+count,10,y,w-20,24);y+=32;
      const cols=count>8?4:3, cellW=(w-24)/cols, cellH=133;
      for(let i=0;i<count;i++){
        const m=room.members.find(p=>p.seat===i+1);
        add('seat',m?'member:'+m.id:'share',m?m.nickname+(m.id===web.user?.id?'（你）':''):'虚位以待',12+i%cols*cellW,y+Math.floor(i/cols)*cellH,cellW,cellH,{skin:'waiting-seat',disabled:!!m,count:i+1,selected:!!m?.ready,selfPlayer:m?.id===web.user?.id,online:m?.online,badge:m?.id===room.hostId?'房主':host&&m?'踢出':undefined,detail:m?(m.ready?'✓ 已准备':'未准备'):'邀请仙友',image:m?(m.avatarUrl??m.wechatAvatarUrl??'emblems/'+(m.avatar??'cards')+'.png'):undefined});
      }
      if(host)for(const m of room.members.filter(m=>m.id!==web.user?.id)){const i=m.seat-1;add('hitbox','member:'+m.id,'踢出',12+i%cols*cellW+cellW/2-24,y+Math.floor(i/cols)*cellH+7,48,17,{skin:'hitbox'});}
      y+=Math.ceil(count/cols)*cellH+4;
      const canStart=host&&room.members.length===count&&room.members.every(m=>m.ready);
      const naturalDockY=y+8,dockY=Math.min(naturalDockY,bottom-76),pinned=dockY<naturalDockY;
      add('panel','action-dock','',10,dockY,w-20,68,{fixed:pinned});
      const actions=[['ready',me?.ready?'取消取经':'✋ 出发取经'],...(room.settings.rolePreferenceEnabled?[['rolePreferences','🎭 心仪角色']]:[]),[canStart?'start':'practice',canStart?'📜 仙友齐聚 · 敕令发牌':'🐒 幻化分身试玩 ('+count+'人局)']];
      const aw=(w-40-8*(actions.length-1))/actions.length;
      actions.forEach(([id,title],i)=>add('button',id!,title!,20+i*(aw+8),dockY+10,aw,48,{skin:'waiting-primary',selected:id==='ready'&&!!me?.ready,fixed:pinned}));
      y=naturalDockY+76;
      add('panel','waiting-tools','',10,y,w-20,44,{skin:'tabs'});
      add('label','waiting-mode',room.settings.voiceChatEnabled?(MINI_GAME_VOICE_ENABLED?'🎙️ 微信语音':'实时语音未启用'):'🏛️ 线下房',18,y+6,w*.33,32,{skin:'text',fontSize:11,lineHeight:32});
      add('button','chat','💬 传音',w*.4,y+6,w*.265,32,{skin:'pill',fontSize:11});add('button','friends','👥 仙友',w*.686,y+6,w*.265,32,{skin:'pill',fontSize:11});y+=52;
      add('button','waiting:missions',(web.waitingMissionsExpanded?'▾':'▸')+' 五难人数与本局配置',10,y,w-20,42,{skin:'accordion',fontSize:13});y+=50;
      if(web.waitingMissionsExpanded){drawQuests(y);y+=questH+8;}
      const listBottom=pinned?dockY-8:bottom,maxScroll=Math.max(0,y-listBottom),offset=Math.min(model.scroll??0,maxScroll);
      for(const n of nodes)if(!n.fixed){n.y-=offset;n.clipTop=top+38;n.clipBottom=listBottom;}
      appendAlerts();return {nodes,maxScroll,contentTop:top+38,contentBottom:listBottom};
    }
    const wins = game?.rounds.filter(round => round.result?.passed).length ?? 0;
    const losses = game?.rounds.filter(round => round.result && !round.result.passed).length ?? 0;
    const blue = ROLE_CONFIG[count].filter(role => teamOf(role) === 'blue').length;
    const scoreH = w < 360 ? 43 : 24;
    const drawScore = (scoreY: number) => add('label', 'score', '⚔ 护经 ' + wins + ':' + losses + ' 群妖  ◇  ♨ 流局 ' + (game?.rejectionCount ?? 0) + '/5  ◇  👥 ' + count + '人局  ◇  仙' + blue + ' 妖' + (count - blue), boardX, scoreY, boardW, scoreH);
    const selected = ['discussion','team_vote','guanyin_window','mission'].includes(game.phase) ? game.rounds.at(-1)?.team ?? [] : web.selectedIds ?? game.draftTeam?.playerIds ?? [];
    const captain = game?.players.find(player => player.id === game.captainId);
    const size = game?.missionSizes[(game?.mission ?? 1) - 1] ?? 0;
    const stage = game?.phase;
    const proposing = stage === 'proposing' || stage === 'discussion';
    const phaseText = proposing ? (stage === 'proposing' ? '👑 队长【' : '🗣️ 论道中【') + (captain ? captain.seat + '号 ' + captain.nickname : '') + '】\n' + (stage === 'proposing' ? '正在点将' : '真假论道') + '（已选 ' + selected.length + '/' + size + '人）'
      : stage==='mission'?'⚔ 取经进行中 · 已出牌 '+(game?.progress.missionVotes??0)+'/'+(game?.rounds.at(-1)?.team.length??0)+' 人':model.rows.find(row => row.id === 'status')?.text ?? '仙友齐聚，静候敕令发牌';
    add('label','current-round','第 '+game.mission+' 难 · '+size+' 人出征'+(game.failuresRequired>=2?' · 需2败':'')+'    护经 '+wins+':'+losses+' 群妖',12,y,w-24,30,{skin:'current-summary',fontSize:12});
    const ribbonY = y + 34, ribbonH=proposing?47.8125:36;
    add('label','ribbon', phaseText, 10, ribbonY, w - 20, ribbonH);
    const ended=Boolean(game?.result);
    if(ended&&game){
      const role=game.revealedRoles?.[web.user?.id??''];const ownTeam=role?teamOf(role):web.ownTeam;
      const headline=game.result!.winner===null?'本局不计胜负':game.result!.winner===ownTeam?'本局胜利！':'本局失败';
      const guardian=game.revealedRoles?assignLoyalGuardians(game.id,game.players,game.revealedRoles,game.rulesetVersion):{};
      const demons=game.revealedRoles?assignFemaleDemons(game.id,game.players,game.revealedRoles):{};
      nodes.splice(nodes.findIndex(n=>n.id==='ribbon'),1);
      add('label','result-hero',headline,10,ribbonY-2,w-20,120,{skin:'result-hero',team:game.result!.winner??undefined,
        detail:JSON.stringify({won:game.result!.winner===ownTeam,self:role?formatRoleName(role,guardian[web.user?.id??''],demons[web.user?.id??'']):'',reason:reasons[game.result!.reason]??game.result!.reason,teams:['blue','red'].map(team=>({team,players:game.players.filter(p=>game.revealedRoles?.[p.id]&&teamOf(game.revealedRoles[p.id]!)===team).map(p=>p.seat+'号 '+p.nickname+' · '+formatRoleName(game.revealedRoles![p.id]!,guardian[p.id],demons[p.id]))}))})});
    }
    const arenaTop = ended?ribbonY-2+120+138:ribbonY + ribbonH + 4;
    const flankRows = Math.ceil(count / 2), cellH = 37.5208333333, gap = 14;
    const avatarSize = 40;
    const flankH = flankRows * cellH + (flankRows - 1) * gap;
    const arenaH = flankH + 30, arenaInset = 9;
    const altarW = w < 360 ? 36 : cssClamp(48,w*.15,72);
    const flankW = (w - 20 - 2 * arenaInset - altarW - 8) / 2;
    const seatW = Math.min(flankW,avatarSize+5+105);
    const rightEnd = w-10-arenaInset;
    add('panel', 'arena-frame', '', 10, arenaTop, w - 20, arenaH);
    for (let index = 0; index < count; index++) {
      const member = game?.players[index] ?? room.members.find(item => item.seat === index + 1);
      const left = index % 2 === 0, row = Math.floor(index / 2);
      const px = left ? 10 + arenaInset : rightEnd - seatW;
      const py = arenaTop + 19 + row * (cellH + gap);
      const memberView = room.members.find(item => item.id === member?.id);
      const revealed = game?.revealedRoles?.[member?.id ?? ''];
      const ballot = game?.phase === 'team_vote' && !room.settings.anonymousTeamVote ? game.teamVote?.ballots?.[member?.id ?? ''] : undefined;
          const isWinnerSeat = ended && Boolean(game?.result?.winner && revealed && teamOf(revealed) === game.result.winner);
          const micState = room.settings.voiceChatEnabled && member ? 'unjoined' : undefined;
          add('seat', member ? (game ? 'player:' : 'member:') + member.id : 'share', member?.nickname ?? '虚位以待', px, py, seatW, cellH,
            { count: index + 1, selected: Boolean(member && (selected.includes(member.id) || web.targetId === member.id)), selfPlayer: member?.id === web.user?.id, online: memberView?.online,
              micState,
              teamStatus: !ended && member && selected.includes(member.id) && ['proposing','discussion','team_vote','guanyin_window','mission'].includes(stage) ? (['guanyin_window','mission'].includes(stage) ? '出征' : '已选') : undefined,
              badge: isWinnerSeat ? '🏆 胜' : (!ended && member?.id === game?.captainId ? '👑 队长' : (!game && member?.id === room.hostId ? '房主' : undefined)),
              detail: !game ? memberView?.ready ? '已就位' : '待出发' : ballot === true ? '✓' : ballot === false ? '×' : ballot === 'abstain' ? '−' : undefined,
              image: revealed ? 'roles/' + getRoleGalleryItem(revealed,assignLoyalGuardians(game!.id,game!.players,game!.revealedRoles!,game!.rulesetVersion)[member!.id],assignFemaleDemons(game!.id,game!.players,game!.revealedRoles!)[member!.id]).artPrefix + '-160.webp' : memberView?.avatarUrl ?? memberView?.wechatAvatarUrl ?? (member ? 'emblems/' + (memberView?.avatar ?? 'cards') + '.png' : undefined) });
        }
        add('altar','altar','☯',(10+arenaInset+rightEnd-altarW)/2,arenaTop + (arenaH - altarW)/2,altarW,altarW,{ detail: ended ? '胜负已分' : (game?.draftTeam?.direction === 'counterclockwise' ? '⟲ 逆时针' : '⟳ 顺时针'), count: ended ? undefined : (game?.mission ?? 1) });
    const missionEligible=game?.phase==='mission'&&model.rows.some(row=>row.id==='mission-choice:success');
    const dockY = arenaTop + arenaH + 4, dockH = ended?68:missionEligible?220.890625+(web.warning?44:0):w < 360 ? 170 : 154.890625;
    add('panel','action-dock','',10,dockY,w-20,dockH);
    const panelX = 20, panelW = w - 40, panelY = dockY + 8, panelH = dockH - 76;
    if(!ended)add('panel','dock-inner','',panelX,panelY,panelW,panelH);
    if(game?.result){
      const ry=ribbonY+126;
      add('panel','result-actions','',10,ry,w-20,126,{skin:'card'});
      add('label','result-summary',game.result.winner===null?'本局不计胜负':game.result.winner==='blue'?'蓝方获胜':'红方获胜',22,ry+12,w-44,25,{skin:'text',fontSize:18,fontFace:'display',tone:'gold',align:'left'});
      add('label','result-reason',reasons[game.result.reason]??'',22,ry+42,w-44,20,{skin:'text',fontSize:13,align:'left'});
      const replayW=Math.min(112,(w-48)*.38);
      if(!web.practice)add('button','openReplay','查看完整复盘',22,ry+70,replayW,44,{skin:'pill',fontSize:13});
      if(room.hostId===web.user?.id)add('button','rematch','回到仙境等待区，再开一局',web.practice?22:30+replayW,ry+70,web.practice?w-44:w-52-replayW,44,{skin:'gold-button',fontSize:13,primary:true});
    } else if(missionEligible&&game){
      add('label','mission-hint','—◇ '+(game.failuresRequired===2?'需至少 2 张失败牌，任务方告失败':'只要出现 1 张失败牌，任务即失败')+' ◇—',panelX+4,panelY+8,panelW-8,22,{skin:'text',fontSize:13,fontFace:'display',tone:'gold',align:'center'});
      const cw=(panelW-28)/2,cardY=panelY+29.890625;
      add('choice','mission-choice:success','任务成功',panelX+9,cardY,cw,54,{skin:'mission-card',selected:web.missionChoice===true,tone:'green',detail:'诚心助道 · 愿力圆满'});
      add('choice','mission-choice:fail','任务失败',panelX+19+cw,cardY,cw,54,{skin:'mission-card',selected:web.missionChoice===false,tone:'red',detail:web.ownTeam==='blue'?'蓝方阵营不可出失败牌':'妖魔作祟 · 破坏任务'});
      if(web.warning)add('label','mission-warning',web.warning,panelX+13,cardY+112,panelW-26,36,{skin:'warning',fontSize:11,tone:'red'});
      const submit=model.rows.find(row=>row.id==='submitMission');
      add('button','submitMission',submit?.text??'确认提交任务牌',panelX+9,cardY+60+(web.warning?44:0),panelW-18,48,{skin:'dragon-button',primary:true,disabled:web.missionChoice===undefined});
    } else if (proposing && captain?.id === web.user?.id) {
      add('label','dock-rule',stage === 'proposing' ? '—◇ 点击头像选人 · 预选阵容后进入论道 ◇—' : '—◇ 真假论道 · 听取陈述后发起表决 ◇—',panelX+4,panelY+10,panelW-8,17);
      const directionW=cssClamp(100,w*.28,118), controlsX=panelX+13, controlsW=panelW-26;
      add('button','direction',(game?.draftTeam?.direction === 'counterclockwise' ? '逆时针' : '顺时针')+'发言',controlsX,panelY+28,directionW,48);
      add('button',stage === 'proposing' ? 'propose' : 'startTeamVote',stage === 'proposing' ? (selected.length===size?'确认阵容':'待选队员')+' ('+selected.length+'/'+size+')' : '锁定阵容 · 发起表决', controlsX+directionW+10,panelY+28,controlsW-directionW-10,48,{ primary:true,disabled:selected.length!==size });
    } else {
      const actions=model.rows.filter(row => ['confirmRole','openVote','openMission','inspect','confirmInspection','assassinate','rematch',...(!game?['ready',...(room.hostId===web.user?.id?['start']:['practice'])]:[])].includes(row.id)).slice(0,2);
      if (actions.length) actions.forEach((action,index)=>add('button',action.id,action.text,panelX+10+index*(panelW-14)/actions.length,panelY+21,(panelW-20)/actions.length-4,48,{primary:true}));
      else add('label','dock-waiting',proposing ? '⏳ 候任静观 · 正在点将\n等待领队 '+(captain?.nickname??'')+' 钦点同行人，方案实时同步' : model.rows.find(row=>row.id==='submitted')?.text??'静候仙友完成当前操作',panelX+8,panelY+10,panelW-16,panelH-20);
    }
    const utilityY=dockY+dockH-53;
    add('label','dock-divider','',26,utilityY-9,w-52,1);
    const utility=game ? [...(!ended?[['role','真身'],['treasures','法宝']]:[['treasures','法宝']]),['history','取经录'],['chat','传音'],[web.practice?'practiceSeats':'guide',web.practice?'切换视角':'识妖谱'],...(!ended?[[web.practice?'exitPractice':room.hostId===web.user?.id?'endGame':'requestAbort',web.practice?'结束演练':room.hostId===web.user?.id?'结束':'申请结束']]:[])]
      : [['settings','房间设置'],['share','邀请仙友'],['chat','传音'],['friends','仙友']];
    const uw=(w-40-(utility.length-1)*6)/utility.length;
    utility.forEach(([id,title],index)=>add('button',id!,title!,20+index*(uw+6),utilityY,uw,44,{badge:'utility'}));
    const historyY=dockY+dockH+16.390625;
    add('label','mission-overview-heading','五难进度 · 点击任务查看记录',12,historyY,w-24,30,{skin:'current-summary',fontSize:12});
    drawQuests(historyY+41);
    drawScore(historyY+41+questH+8);
    const maxScroll=Math.max(0,historyY+41+questH+8+scoreH+24-(v.height-v.bottom));
    const scroll=Math.min(model.scroll??0,maxScroll);
    for(const node of nodes) if(!node.fixed){node.y-=scroll;node.clipTop=top+36;node.clipBottom=v.height-v.bottom;}
    contentBottom=v.height-v.bottom;
    appendAlerts();
    return {nodes,maxScroll,contentTop:top+36,contentBottom};
  }
  // Setup and secondary pages use the same lacquer sheet, tabs, fields and portrait cards as web.
  add('panel', 'sheet-frame', '', 8, top + 46, w - 16, bottom - top - 44, { fixed: true });
  y = top + 66;
  if (web.page === 'setup' && web.settings) {
    const settings = web.settings;
    label('setup-mode', '线下常规房 · 同桌聚会', y);
    y += 42;
    for (let count = 5; count <= 12; count++) add('choice', 'count:' + count, String(count), pad + (count - 5) * (full / 8), y, full / 8 - 4, 44, { selected: count === settings.playerCount });
    y += 66;
    for (const team of ['blue', 'red'] as const) {
      const roles = ROLE_CONFIG[settings.playerCount].filter(role => teamOf(role) === team);
      label('faction:' + team, (team === 'blue' ? '蓝方 · 取经正果' : '红方 · 群妖乱道') + '（' + roles.length + '人）', y, { team });
      y += 38;
      const unique = [...new Set(roles)], cardW = (full - 18) / 3;
      unique.forEach((role, index) => add('portrait', 'setupRole:' + role, roleNames[role] + (roles.filter(item => item === role).length > 1 ? ' ×' + roles.filter(item => item === role).length : ''), pad + index % 3 * (cardW + 9), y + Math.floor(index / 3) * 145, cardW, 118, { image: 'roles/' + defaultRoleArtPrefix(role) + '-160.webp', team }));
      y += Math.ceil(unique.length / 3) * 145 + 8;
    }
  } else if (model.portrait) {
    const width = Math.min(178, full * .55);
    add('portrait', 'identity-art', model.rows.find(row => row.id === 'role-name')?.text.split(' · ')[0] ?? model.title, (w - width) / 2, y, width, width, { image: 'roles/' + model.portrait });
    y += width + 52;
  }
  const tabs = model.rows.filter(row => row.id.startsWith('page:') && row.id !== 'page:account');
  if (tabs.length) {
    const columns = tabs.length <= 4 ? tabs.length : 3, tabW = (full - (columns - 1) * 6) / columns;
    tabs.forEach((row, index) => add('tab', row.id, row.text, pad + index % columns * (tabW + 6), y + Math.floor(index / columns) * 46, tabW, 38, { selected: row.id === web.activeTab }));
    y += Math.ceil(tabs.length / columns) * 46 + 10;
  }
  let choiceColumn = 0, choiceHeight = 110, galleryColumn = 0, metricColumn = 0;
  for (const row of model.rows) {
    if (['back', 'cancelSettings'].includes(row.id) || tabs.some(tab => tab.id === row.id) || web.page === 'setup' && ['playerCount', 'voiceChatEnabled'].includes(row.id)) continue;
    if (row.id.startsWith('metric:')) {
      add('metric', row.id, row.text, pad + metricColumn * (full + 6) / 4, y, (full - 18) / 4, 78);
      metricColumn++;
      if (metricColumn === 4) { metricColumn = 0; y += 92; }
      continue;
    }
    if (metricColumn) { metricColumn = 0; y += 92; }
    if (row.id.startsWith('guide-role:')) {
      const cardW = (full - 12) / 2;
      add('portrait', row.id, row.text, pad + galleryColumn * (cardW + 12), y, cardW, 152, { image: 'roles/' + row.id.slice(11) + '-160.webp' });
      galleryColumn++;
      if (galleryColumn === 2) { galleryColumn = 0; y += 195; }
      continue;
    }
    if (galleryColumn) { galleryColumn = 0; y += 195; }
    const choice = row.id.startsWith('vote-choice:') || row.id.startsWith('mission-choice:');
    const kind = choice ? 'choice' : row.id.startsWith('page:') ? 'tab'
      : /^(input:|nickname$|search$)/.test(row.id) ? 'input'
      : /^(stats:|replay:|guide:|role-|team$|status$|summary$|notice$|error$|empty$|submitted$|ballot:|result$|progress$|clue$|evil$|.*Candidates$|inspection:)/.test(row.id) ? 'label' : 'button';
    const lines = wrapText(row.text, full - 32);
    const height = Math.max(44, lines.length * 22 + 20);
    if (choice) {
      const columns = row.id.startsWith('mission-choice:') ? 2 : 3, height = columns === 2 ? 148 : 94;
      choiceHeight = height + 16;
      add('choice', row.id, row.text.replace(/^✓ /, ''), pad + choiceColumn * ((full + 8) / columns), y, (full - (columns - 1) * 8) / columns, height, { selected: row.text.startsWith('✓ ') });
      choiceColumn++;
    } else {
      if (choiceColumn) { y += choiceHeight; choiceColumn = 0; }
      add(kind, row.id, row.text, pad, y, full, height, { lines, disabled: ['submitVote', 'submitMission'].includes(row.id) && row.text.startsWith('请先'), primary: ['apply', 'createRoom', 'joinSubmit', 'submitVote', 'submitMission', 'confirmRole', 'confirm:yes', 'generate'].includes(row.id), selected: row.text.includes('：开') || row.text.includes('：顺时针') });
      y += height + 10;
    }
  }
  if (choiceColumn) y += choiceHeight;
  const maxScroll = Math.max(0, y - bottom);
  const scroll = Math.min(model.scroll ?? 0, maxScroll);
  for (const node of nodes) if (!node.fixed) { node.y -= scroll; node.clipTop = top + 54; node.clipBottom = bottom; }
  appendAlerts();
  return { nodes, maxScroll, contentTop: top + 54, contentBottom: bottom };

  function appendAlerts() {
    if (web.page === 'sheet' || web.page === 'setup') return;
    const alerts = model.rows.filter(row => !(web.page==='home'&&row.id==='invitation')&&['notice', 'error', 'announcement', 'invitation'].includes(row.id));
    alerts.slice(0, 2).forEach((row, index) => add('button', row.id, row.text, pad, v.top + 48 + index * 52, full, 48, { fixed: true, lines: wrapText(row.text, full - 24).slice(0, 2) }));
  }
}
