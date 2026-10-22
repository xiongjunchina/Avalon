import { reasons } from '../../../web/src/game-presentation.js';
import type { WebDocument } from './web-document.js';
import { layoutDocument } from './web-document-layout.js';
import type { RoomView, Settings, User } from '@avalon/contracts';
import { MISSION_SIZES, ROLE_CONFIG, failuresRequiredFor, teamOf, assignLoyalGuardians, assignFemaleDemons } from '@avalon/game-core';
import { roleNames, roleMottos, WUYUE_MISSIONS, getRoleGalleryItem, formatRoleName } from '../../../web/src/roles.js';
import { wrapText, type HitRegion, type SafeViewport } from './layout.js';
import type { ScreenModel } from './widgets.js';

export interface WebSurface {
  page: 'home' | 'setup' | 'table' | 'sheet';
  background?: 'gate' | 'pavilion' | 'sword' | 'library' | 'mirror' | 'dawn';
  user?: User; room?: RoomView; settings?: Settings;
  roleIndex?: number; selectedIds?: string[]; targetId?: string;
  nickname?: string; authMode?: 'create' | 'switch'; switchCode?: string;
  freeAccess?: boolean; practice?: boolean; sheet?: string;
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
  skin?: string; fontSize?: number; lineHeight?: number; fontFace?: 'sans'|'display'|'calligraphy'; weight?: string; align?: 'left'|'center'|'right'; tone?: 'blue'|'red'|'gold'|'muted'|'green';
  image?: string; detail?: string; badge?: string; selfPlayer?: boolean; online?: boolean; team?: 'blue' | 'red'; passed?: boolean; count?: number;
}
export interface WebLayout { nodes: WebNode[]; maxScroll: number; contentTop: number; contentBottom: number }
const cssClamp = (min: number, value: number, max: number) => Math.max(min, Math.min(value, max));
const showcase = ['merlin', 'assassin', 'percival', 'morgana', 'guinevere', 'mordred', 'oberon', 'loyal', 'minion'] as const;

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
    top = v.top + 14;
    if (web.user) {
      const scale = Math.min(1, (w - 120) / 242.6);
      add('button', 'account', web.user.nickname, pad, top, 74, 34, { fixed: true, image: 'emblems/' + (web.user.avatar ?? 'cards') + '.png' });
      let toolX = w - 16 - 242.6 * scale;
      for (const [id, title, width] of [['friends', '👥 仙友', 61.2], ['sound', 'sound', 32], ['switch', '🚪 换号', 61.2], ['guide', '📖 识妖谱', 73.2]] as const) {
        add('button', id, title, toolX, top + 1, width * scale, 32, { fixed: true });
        toolX += (width + 5) * scale;
      }
    }
    const logoTop = v.top + (web.user ? 68 : 50);
    const logoH = cssClamp(24, w * .068, 40) * 1.35;
    add('label', 'brand', '嘻游 · 真假猴王', pad, logoTop, full, logoH, { detail: '一念佛魔皆幻相，谁是修道取经人' });
    if (web.user) {
      const subtitleH = cssClamp(12, w * .034, 15) * 1.75;
      const bannerY = logoTop + logoH + 5 + subtitleH + 6;
      const bannerH = Math.min(29, 26 + Math.max(0,(w-320)/35));
      const bannerW = Math.min(full,cssClamp(11.5,w*.032,13)*16.49+45.1);
      if (web.freeAccess !== false) add('label', 'free-access', '🎉 公测盛典 · 全特权限时免费畅玩中', (w-bannerW)/2, bannerY, bannerW, bannerH);
      const role = showcase[(web.roleIndex ?? 0) % showcase.length]!;
      const diameter = cssClamp(120, w * .34, 160);
      const portraitY = bannerY + (web.freeAccess !== false ? bannerH+16 : 10);
      add('portrait', 'showcase', roleNames[role], (w - diameter) / 2, portraitY, diameter, diameter,
        { image: 'roles/' + role + '-160.webp', detail: roleMottos[role], team: teamOf(role) });
      const actionH = cssClamp(42, w * .11, 48);
      const footer = Math.max(portraitY + diameter + 74, v.height - v.bottom - 12 - (141 + actionH));
      add('panel', 'mode-frame', '', 35, footer + 2, w - 70, 40);
      add('tab', 'mode:offline', '🏛️ 线下常规房', 39, footer + 6, (w - 84) / 2, 32, { selected: true });
      add('tab', 'mode:voice', '🎙️ 远端语音房', w / 2 + 3, footer + 6, (w - 84) / 2, 32, { disabled: true });
      add('button', 'create', '开常规房', pad, footer + 54, (full - 8) / 2, actionH, { primary: true, image: 'emblems/mountain.png' });
      add('button', 'join', '加入房间', pad + (full + 8) / 2, footer + 54, (full - 8) / 2, actionH, { image: 'emblems/crown.png' });
      add('button', 'practice', '🐒 幻境单人试玩 ›', w / 2 - 67.5, footer + 62 + actionH, 135, 32);
      add('label', 'footer-rule', '', pad, footer + 104 + actionH, full, 1);
      add('button', 'account', '📜 功果簿', w / 2 - 98.4, footer + 109 + actionH, 76, 28, { muted: true });
      add('label', 'footer-dot', '·', w / 2 - 12, footer + 109 + actionH, 24, 28);
      add('button', 'logout', '🚪 退出登录', w / 2 + 9.5, footer + 109 + actionH, 89, 28, { muted: true });
    } else {
      if (web.backId) add('button', web.backId, '‹', pad, top, 32, 32, { fixed: true });
      y = top + 132;
      const panelHeight = 322;
      add('panel', 'login-panel', web.authMode === 'switch' ? '仙友归位' : '请留取经尊号', pad, y, full, panelHeight);
      add('tab', 'auth:create', '新入仙途', pad + 14, y + 50, (full - 36) / 2, 40, { selected: web.authMode !== 'switch' });
      add('tab', 'auth:switch', '仙友归位', w / 2 + 4, y + 50, (full - 36) / 2, 40, { selected: web.authMode === 'switch' });
      add('label', 'auth-help', web.authMode === 'switch' ? '输入6位仙友码，寻回历史功果簿' : '微信验证身份，取名踏入取经大道', pad + 16, y + 105, full - 32, 42, { muted: true });
      add('input', web.authMode === 'switch' ? 'input:switch' : 'input:nickname', web.authMode === 'switch' ? web.switchCode || '6位专属仙友码' : web.nickname || '你的尊号（昵称）', pad + 16, y + 158, full - 32, 48);
      add('label', 'auth-note', '仙友码永久关联个人战绩与复盘', pad + 16, y + 218, full - 32, 28, { muted: true });
      add('button', 'login', web.authMode === 'switch' ? '微信验证并归位' : '踏入取经大道', pad + 16, y + 258, full - 32, 48, { primary: true });
      add('button', 'practice', '幻境单人试玩', pad, y + panelHeight + 18, (full - 10) / 2, 44);
      add('button', 'guide', '嘻游识妖谱', w / 2 + 5, y + panelHeight + 18, (full - 10) / 2, 44);
      for (const [index, account] of (web.knownAccounts ?? []).entries()) add('button', 'known:' + account.playerCode, account.nickname + ' · #' + account.playerCode, pad, y + panelHeight + 74 + index * 48, full, 40);
    }
    const last = nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0);
    const maxScroll = Math.max(0, last + 4 - (v.height - v.bottom));
    const scroll = Math.min(model.scroll ?? 0, maxScroll);
    for (const node of nodes) if (!node.fixed) { node.y -= scroll; node.clipTop = top + (web.user ? 42 : 0); node.clipBottom = bottom; }
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
    y = top + 48;
    const boardX = 12, boardW = w - 24, questW = (boardW - 24) / 5;
    const questH = 67.3 + cssClamp(36, availableH * .055, 44);
    (game?.missionSizes ?? MISSION_SIZES[count]).forEach((size, index) => {
      const result = game?.rounds.find(round => round.mission === index + 1 && round.result)?.result;
      add('quest', 'mission:' + (index + 1), WUYUE_MISSIONS[index]?.title ?? '', boardX + index * (questW + 6), y, questW, questH,
        { count: size, passed: result?.passed, selected: game?.mission === index + 1 && !game.result,
          detail: failuresRequiredFor(count, index + 1) >= 2 ? '需2败' : game?.mission === index + 1 ? '进行中' : '第' + (index + 1) + '难' });
    });
    const wins = game?.rounds.filter(round => round.result?.passed).length ?? 0;
    const losses = game?.rounds.filter(round => round.result && !round.result.passed).length ?? 0;
    const blue = ROLE_CONFIG[count].filter(role => teamOf(role) === 'blue').length;
    const scoreY = y + questH + 8, scoreH = w < 360 ? 43 : 24;
    add('label', 'score', '⚔ 护经 ' + wins + ':' + losses + ' 群妖  ◇  ♨ 流局 ' + (game?.rejectionCount ?? 0) + '/5  ◇  👥 ' + count + '人局  ◇  仙' + blue + ' 妖' + (count - blue), boardX, scoreY, boardW, scoreH);
    const selected = game&&['mission','team_vote'].includes(game.phase)?game.rounds.at(-1)?.team??[]:web.selectedIds ?? game?.draftTeam?.playerIds ?? [];
    const captain = game?.players.find(player => player.id === game.captainId);
    const size = game?.missionSizes[(game?.mission ?? 1) - 1] ?? 0;
    const stage = game?.phase;
    const proposing = stage === 'proposing' || stage === 'discussion';
    const phaseText = proposing ? (stage === 'proposing' ? '👑 队长【' : '🗣️ 论道中【') + (captain ? captain.seat + '号 ' + captain.nickname : '') + '】 · ' + (stage === 'proposing' ? '正在点将' : '真假论道') + '（已选 ' + selected.length + '/' + size + '人）'
      : stage==='mission'?'⚔ 取经进行中 · 已出牌 '+(game?.progress.missionVotes??0)+'/'+(game?.rounds.at(-1)?.team.length??0)+' 人':model.rows.find(row => row.id === 'status')?.text ?? '仙友齐聚，静候敕令发牌';
    const ribbonY = scoreY + scoreH + 20;
    add('label','ribbon', phaseText, 10, ribbonY, w - 20, 34);
    const ended=Boolean(game?.result);
    if(ended&&game){
      const role=game.revealedRoles?.[web.user?.id??''];const ownTeam=role?teamOf(role):web.ownTeam;
      const headline=game.result!.winner===null?'本局中断':game.result!.winner===ownTeam?'本局胜利！':'本局惜败';
      const guardian=game.revealedRoles?assignLoyalGuardians(game.id,game.players,game.revealedRoles):{};
      const demons=game.revealedRoles?assignFemaleDemons(game.id,game.players,game.revealedRoles):{};
      nodes.splice(nodes.findIndex(n=>n.id==='ribbon'),1);
      add('label','result-hero',headline,10,ribbonY-2,w-20,279,{skin:'result-hero',team:game.result!.winner??undefined,
        detail:JSON.stringify({won:game.result!.winner===ownTeam,self:role?formatRoleName(role,guardian[web.user?.id??''],demons[web.user?.id??'']):'',reason:reasons[game.result!.reason]??game.result!.reason,teams:['blue','red'].map(team=>({team,players:game.players.filter(p=>game.revealedRoles?.[p.id]&&teamOf(game.revealedRoles[p.id]!)===team).map(p=>p.seat+'号 '+p.nickname+' · '+formatRoleName(game.revealedRoles![p.id]!,guardian[p.id],demons[p.id]))}))})});
    }
    const arenaTop = ended?ribbonY-2+279+18:ribbonY + 56;
    const flankRows = Math.ceil(count / 2), cellH = cssClamp(38, availableH * .05, 46), gap = cssClamp(6, availableH * .013, 14);
    const avatarSize = cssClamp(38, availableH * .05, 44);
    const flankH = flankRows * cellH + (flankRows - 1) * gap;
    const arenaH = Math.max(cssClamp(250, availableH * .36, 360), flankH + 22);
    const arenaInset = cssClamp(4,w * .015,10) + 1;
    const flankW = Math.min(cssClamp(124,w * .36,150), (w - 20 - 2 * arenaInset - 82) / 2);
    const seatW = avatarSize + 5 + Math.min(cssClamp(82,w*.23,105),flankW-avatarSize-5);
    const rightEnd = w>=360 ? Math.max(w-10-arenaInset,10+arenaInset+flankW*2+cssClamp(74,w*.18,96)+8) : w-10-arenaInset;
    add('panel', 'arena-frame', '', 10, arenaTop, w - 20, arenaH);
    for (let index = 0; index < count; index++) {
      const member = game?.players[index] ?? room.members.find(item => item.seat === index + 1);
      const left = index % 2 === 0, row = Math.floor(index / 2);
      const px = left ? 10 + arenaInset : rightEnd - seatW;
      const py = arenaTop + (arenaH - flankH) / 2 + row * (cellH + gap);
      const memberView = room.members.find(item => item.id === member?.id);
      const revealed = game?.revealedRoles?.[member?.id ?? ''];
      const ballot = game?.phase === 'team_vote' && !room.settings.anonymousTeamVote ? game.teamVote?.ballots?.[member?.id ?? ''] : undefined;
      add('seat', member ? (game ? 'player:' : 'member:') + member.id : 'share', member?.nickname ?? '虚位以待', px, py, seatW, cellH,
        { count: index + 1, selected: Boolean(member && (selected.includes(member.id) || web.targetId === member.id)), selfPlayer: member?.id === web.user?.id, online: memberView?.online,
          badge: member?.id === game?.captainId ? '👑 队长' : !game && member?.id === room.hostId ? '房主' : undefined,
          detail: !game ? memberView?.ready ? '已就位' : '待出发' : ballot === true ? '✓' : ballot === false ? '×' : ballot === 'abstain' ? '−' : undefined,
          image: revealed ? 'roles/' + getRoleGalleryItem(revealed,assignLoyalGuardians(game!.id,game!.players,game!.revealedRoles!)[member!.id],assignFemaleDemons(game!.id,game!.players,game!.revealedRoles!)[member!.id]).artPrefix + '-160.webp' : memberView?.avatarUrl ?? memberView?.wechatAvatarUrl ?? (member ? 'emblems/' + (memberView?.avatar ?? 'cards') + '.png' : undefined) });
    }
    const altarW = cssClamp(74,w * .19,92);
    add('altar','altar','☯',(10+arenaInset+rightEnd-altarW)/2,arenaTop + (arenaH - altarW)/2,altarW,altarW,{ detail: (game?.draftTeam?.direction === 'counterclockwise' ? '⟲ 逆时针' : '⟳ 顺时针'), count: game?.mission ?? 1 });
    const missionEligible=game?.phase==='mission'&&model.rows.some(row=>row.id==='mission-choice:success');
    const dockY = arenaTop + arenaH + 18, dockH = ended?215:missionEligible?307.4+(web.warning?44:0):w < 360 ? 196 : 181;
    add('panel','action-dock','',10,dockY,w-20,dockH);
    const panelX = 26, panelW = w - 52, panelY = dockY + 14, panelH = dockH - 94;
    add('panel','dock-inner','',panelX,panelY,panelW,panelH);
    if(game?.result){
      add('label','result-summary',game.result.winner===null?'本局不计胜负':game.result.winner==='blue'?'蓝方获胜':'红方获胜',panelX+10,panelY+8,panelW-20,24,{skin:'text',fontSize:17,fontFace:'display',tone:'gold'});
      add('label','result-reason',reasons[game.result.reason]??'',panelX+10,panelY+37,panelW-20,24,{skin:'text',fontSize:12});
      if(!web.practice)add('button','openReplay','查看完整复盘',panelX+10,panelY+69,(panelW-26)/2,42,{skin:'button'});
      if(room.hostId===web.user?.id)add('button','rematch','回到仙境等待区，再开一局',web.practice?panelX+10:panelX+16+(panelW-26)/2,panelY+69,web.practice?panelW-20:(panelW-26)/2,42,{skin:'gold-button',primary:true});
    } else if(missionEligible&&game){
      add('label','mission-hint','—◇ '+(game.failuresRequired===2?'需至少 2 张失败牌，任务方告失败':'只要出现 1 张失败牌，任务即失败')+' ◇—',panelX+4,panelY+8,panelW-8,22,{skin:'text',fontSize:13,fontFace:'display',tone:'gold',align:'center'});
      const cw=(panelW-36)/2,cardY=panelY+37.9;
      add('choice','mission-choice:success','任务成功',panelX+13,cardY,cw,106.5,{skin:'mission-card',selected:web.missionChoice===true,tone:'green',detail:'诚心助道 · 愿力圆满'});
      add('choice','mission-choice:fail','任务失败',panelX+23+cw,cardY,cw,106.5,{skin:'mission-card',selected:web.missionChoice===false,tone:'red',detail:web.ownTeam==='blue'?'蓝方阵营不可出失败牌':'妖魔作祟 · 破坏任务'});
      if(web.warning)add('label','mission-warning',web.warning,panelX+13,cardY+112,panelW-26,36,{skin:'warning',fontSize:11,tone:'red'});
      const submit=model.rows.find(row=>row.id==='submitMission');
      add('button','submitMission',submit?.text??'确认提交任务牌',panelX+13,cardY+120.5+(web.warning?44:0),panelW-26,48,{skin:'dragon-button',primary:true,disabled:web.missionChoice===undefined});
    } else if (proposing && captain?.id === web.user?.id) {
      add('label','dock-rule',stage === 'proposing' ? '—◇ 可调整同行人，确认后进入讨论 ◇—' : '—◇ 真假论道 · 听取陈述后发起表决 ◇—',panelX+4,panelY+10,panelW-8,17);
      const directionW=cssClamp(100,w*.28,118), controlsX=panelX+13, controlsW=panelW-26;
      add('button','direction',(game?.draftTeam?.direction === 'counterclockwise' ? '逆时针' : '顺时针')+'发言',controlsX,panelY+28,directionW,48);
      add('button',stage === 'proposing' ? 'propose' : 'startTeamVote',stage === 'proposing' ? '确认阵容 ('+selected.length+'/'+size+')' : '锁定阵容 · 发起表决', controlsX+directionW+10,panelY+28,controlsW-directionW-10,48,{ primary:true,disabled:selected.length!==size });
    } else {
      const actions=model.rows.filter(row => ['confirmRole','openVote','openMission','inspect','confirmInspection','assassinate','rematch',...(!game?['ready',...(room.hostId===web.user?.id?['start']:['practice'])]:[])].includes(row.id)).slice(0,2);
      if (actions.length) actions.forEach((action,index)=>add('button',action.id,action.text,panelX+10+index*(panelW-14)/actions.length,panelY+21,(panelW-20)/actions.length-4,48,{primary:true}));
      else add('label','dock-waiting',proposing ? '⏳ 候任静观 · 正在点将\n等待领队 '+(captain?.nickname??'')+' 钦点同行人，方案实时同步' : model.rows.find(row=>row.id==='submitted')?.text??'静候仙友完成当前操作',panelX+8,panelY+10,panelW-16,panelH-20);
    }
    const utilityY=dockY+dockH-59;
    add('label','dock-divider','',26,utilityY-9,w-52,1);
    const utility=game ? [...(!ended?[['role','查验真身']]:[]),['history','取经录'],['chat','💬 传音'],[web.practice?'practiceSeats':'guide',web.practice?'切换视角':'识妖谱'],...(!ended?[[web.practice?'exitPractice':room.hostId===web.user?.id?'endGame':'requestAbort',web.practice?'结束演练':room.hostId===web.user?.id?'结束游戏':'申请结束']]:[])]
      : [['settings','房间设置'],['share','邀请仙友'],['chat','传音'],['friends','仙友录']];
    const uw=(w-52-(utility.length-1)*6)/utility.length;
    utility.forEach(([id,title],index)=>add('button',id!,title!,26+index*(uw+6),utilityY,uw,44,{badge:'utility'}));
    const maxScroll=Math.max(0,dockY+dockH+48-(v.height-v.bottom));
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
      unique.forEach((role, index) => add('portrait', 'setupRole:' + role, roleNames[role] + (roles.filter(item => item === role).length > 1 ? ' ×' + roles.filter(item => item === role).length : ''), pad + index % 3 * (cardW + 9), y + Math.floor(index / 3) * 145, cardW, 118, { image: 'roles/' + role + '-160.webp', team }));
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
    const alerts = model.rows.filter(row => ['notice', 'error', 'announcement', 'invitation'].includes(row.id));
    alerts.slice(0, 2).forEach((row, index) => add('button', row.id, row.text, pad, v.top + 48 + index * 52, full, 48, { fixed: true, lines: wrapText(row.text, full - 24).slice(0, 2) }));
  }
}
