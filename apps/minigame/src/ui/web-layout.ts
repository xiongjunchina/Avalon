import type { RoomView, Settings, User } from '@avalon/contracts';
import { MISSION_SIZES, ROLE_CONFIG, failuresRequiredFor, teamOf } from '@avalon/game-core';
import { roleNames, roleMottos, WUYUE_MISSIONS } from '../../../web/src/roles.js';
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
  knownAccounts?: { nickname: string; playerCode: string }[];
}
export interface WebNode extends HitRegion {
  kind: 'label' | 'button' | 'input' | 'portrait' | 'quest' | 'seat' | 'altar' | 'panel' | 'choice' | 'tab' | 'metric';
  fixed?: boolean; primary?: boolean; selected?: boolean; disabled?: boolean; muted?: boolean;
  image?: string; detail?: string; badge?: string; team?: 'blue' | 'red'; passed?: boolean; count?: number;
}
export interface WebLayout { nodes: WebNode[]; maxScroll: number; contentTop: number; contentBottom: number }
const showcase = ['merlin', 'assassin', 'percival', 'morgana', 'guinevere', 'mordred', 'oberon', 'loyal', 'minion'] as const;

export function layoutWebScreen(model: ScreenModel, v: SafeViewport): WebLayout {
  const web = model.web!, nodes: WebNode[] = [];
  const w = v.width, bottom = v.height - v.bottom - 10, pad = 16, full = w - pad * 2;
  let top = v.top + 12, y = top + 60, contentBottom = bottom;
  const add = (kind: WebNode['kind'], id: string, text: string, x: number, py: number, width: number, height: number, extra: Partial<WebNode> = {}) => {
    nodes.push({ kind, id, text, x, y: py, width, height, ...extra });
  };
  const label = (id: string, text: string, py: number, extra: Partial<WebNode> = {}) => add('label', id, text, pad, py, full, 28, extra);
  if (web.page === 'home') {
    top = v.top + 8;
    if (web.user) {
      add('button', 'account', '◈ ' + web.user.nickname, pad, top, 76, 32, { fixed: true });
      const toolScale = Math.min(1, (w - 120) / 258);
      let toolX = w - 16 - 242 * toolScale;
      for (const [id, text, width] of [['friends', '仙友', 58], ['sound', '♫', 30], ['switch', '换号', 54], ['guide', '识妖谱', 82]] as const) {
        add('button', id, text, toolX, top, width * toolScale, 32, { fixed: true });
        toolX += (width + 6) * toolScale;
      }
    }
    label('brand', '嘻游 · 真假猴王', top + (web.user ? 55 : 28), { detail: '一念佛魔皆幻相，谁是修道取经人' });
    if (web.user) {
      if (web.freeAccess !== false) label('free-access', '公测盛典 · 全特权限时免费畅玩中', top + 117, { muted: true });
      const role = showcase[(web.roleIndex ?? 0) % showcase.length]!;
      const diameter = Math.min(146, w * .37, (bottom - top) * .23);
      const portraitY = top + 142;
      add('portrait', 'showcase', roleNames[role], (w - diameter) / 2, portraitY, diameter, diameter,
        { image: 'roles/' + role + '-160.webp', detail: roleMottos[role], team: teamOf(role) });
      const footer = Math.max(portraitY + diameter + 82, bottom - 170);
      add('tab', 'mode:offline', '线下常规房', pad + 20, footer, (full - 40) / 2, 34, { selected: true });
      add('tab', 'mode:voice', '语音暂不提供', w / 2, footer, (full - 40) / 2, 34, { disabled: true });
      add('button', 'create', '开常规房', pad, footer + 46, (full - 12) / 2, 46, { primary: true });
      add('button', 'join', '加入房间', pad + (full + 12) / 2, footer + 46, (full - 12) / 2, 46);
      add('button', 'practice', '幻境单人试玩 ›', w / 2 - 82, footer + 102, 164, 34);
      add('button', 'account', '功果簿', pad + 25, footer + 146, full / 2 - 30, 28, { muted: true });
      add('button', 'logout', '退出登录', w / 2 + 4, footer + 146, full / 2 - 30, 28, { muted: true });
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
    const maxScroll = Math.max(0, last + 12 - bottom);
    const scroll = Math.min(model.scroll ?? 0, maxScroll);
    for (const node of nodes) if (!node.fixed) { node.y -= scroll; node.clipTop = top + (web.user ? 42 : 0); node.clipBottom = bottom; }
    appendAlerts();
    return { nodes, maxScroll, contentTop: top, contentBottom: bottom };
  }
  add('button', web.backId ?? (web.page === 'table' ? web.practice ? 'exitPractice' : 'leave' : web.page === 'setup' ? 'cancelSettings' : 'back'), '‹', pad, top, 34, 36, { fixed: true });
  add('label', 'page-title', web.page === 'table' ? '嘻游 · 真假猴王' : model.title, 58, top, w - 120, 36, { fixed: true });
  if (web.page === 'table' && web.room) {
    const room = web.room, game = room.game, count = room.settings.playerCount;
    nodes.find(node => node.id === 'page-title')!.text = '房号 ' + room.code;
    nodes.find(node => node.id === 'page-title')!.width = Math.min(140, w - 220);
    const sizes = game?.missionSizes ?? MISSION_SIZES[count];
    (web.practice ? [['bot', '代操'], ['rematch', '重开'], ['practiceSettings', '配置']] : [['chat', '传音'], ['more', '设置'], ['guide', '规则']]).forEach(([id, title], index) => add('button', id!, title!, w - 154 + index * 46, top, 43, 32, { fixed: true }));
    if (web.practice) nodes.find(node => node.id === 'page-title')!.text = '幻境演练';
    y = top + 48;
    sizes.forEach((size, index) => {
      const result = game?.rounds.find(round => round.mission === index + 1 && round.result)?.result;
      add('quest', 'mission:' + (index + 1), WUYUE_MISSIONS[index]?.title ?? '', pad + index * (full / 5), y, full / 5 - 5, 108,
        { count: size, passed: result?.passed, selected: game?.mission === index + 1, detail: failuresRequiredFor(count, index + 1) >= 2 ? '双败' : '' });
    });
    const wins = game?.rounds.filter(round => round.result?.passed).length ?? 0;
    const losses = game?.rounds.filter(round => round.result && !round.result.passed).length ?? 0;
    const blue = ROLE_CONFIG[count].filter(role => teamOf(role) === 'blue').length;
    label('score', '护经 ' + wins + ':' + losses + ' 群妖  ◇  流局 ' + (game?.rejectionCount ?? 0) + '/5  ◇  仙' + blue + ' 妖' + (count - blue), y + 115, { fixed: false });
    const phase = model.rows.find(row => row.id === 'status')?.text ?? '仙友齐聚，静候敕令发牌';
    label('ribbon', phase, y + 154, { detail: model.rows.find(row => row.id === 'team')?.text });
    const arenaTop = y + 216, rowsPerFlank = Math.floor(count / 2);
    const cellH = count >= 9 ? 58 : 70;
    const seatW = Math.min(138, (w - 112) / 2);
    add('panel', 'arena-frame', '', pad - 5, arenaTop - 16, full + 10, (rowsPerFlank + count % 2) * cellH + 46);
    for (let index = 0; index < count; index++) {
      const member = game?.players[index] ?? room.members.find(item => item.seat === index + 1);
      const left = index < rowsPerFlank, foot = count % 2 === 1 && index === count - 1;
      const row = foot ? rowsPerFlank : left ? index : index - rowsPerFlank;
      const px = foot ? (w - seatW) / 2 : left ? pad : w - pad - seatW;
      const ballot = game?.phase === 'team_vote' && !room.settings.anonymousTeamVote ? game.teamVote?.ballots?.[member?.id ?? ''] : undefined;
      const status = !member ? '虚位以待 · 邀请' : !game ? room.members.find(m => m.id === member.id)?.ready ? '已就位' : '待出发'
        : ballot === 'abstain' ? '旁观' : ballot === true ? '准行' : ballot === false ? '封驳' : game.phase === 'team_vote' ? game.teamVote?.votedIds.includes(member.id) ? '已落印' : '待落印' : member.id === game.captainId ? '领队' : '取经仙友';
      const memberView = room.members.find(item => item.id === member?.id);
      const revealed = game?.revealedRoles?.[member?.id ?? ''];
      add('seat', member ? (game ? 'player:' : 'member:') + member.id : 'share', member?.nickname ?? '虚位以待', px, arenaTop + 16 + row * cellH, seatW, cellH - 7,
        { count: index + 1, selected: Boolean(member && (web.selectedIds?.includes(member.id) || web.targetId === member.id)), detail: status,
          badge: member?.id === room.hostId ? '房主' : member?.id === game?.captainId ? '领队' : undefined, image: revealed ? 'roles/' + revealed + '-160.webp' : memberView?.avatarUrl ?? memberView?.wechatAvatarUrl ?? (member ? 'emblems/' + (memberView?.avatar ?? 'cards') + '.png' : undefined) });
    }
    add('altar', 'altar', '☯', w / 2 - 36, arenaTop + Math.max(38, rowsPerFlank * cellH / 2 - 40), 72, 82, { detail: '取经法坛' });
    const arenaEnd = arenaTop + (rowsPerFlank + (count % 2)) * cellH + 42;
    contentBottom = bottom - 142;
    const actionIds = game
      ? ['confirmRole', 'direction', 'propose', 'startTeamVote', 'openVote', 'openMission', 'inspect', 'confirmInspection', 'assassinate', 'rematch']
      : ['ready', ...(room.hostId === web.user?.id ? ['start'] : ['practice'])];
    const actions = model.rows.filter(row => actionIds.includes(row.id));
    const dockY = bottom - 132;
    add('panel', 'action-dock', '', pad, dockY, full, 132, { fixed: true });
    const primaryActions = actions.slice(0, 3);
    const buttonW = (full - 20 - (primaryActions.length - 1) * 6) / Math.max(1, primaryActions.length);
    primaryActions.forEach((action, index) => add('button', action.id, action.text, pad + 10 + index * (buttonW + 6), dockY + 12, buttonW, 48, { fixed: true, primary: action.id !== 'direction' }));
    const utility = game ? [['role', '身份法相'], ['history', '取经战况'], ['chat', '传音'], [web.practice ? 'practiceSeats' : 'guide', web.practice ? '切换视角' : '识妖谱']]
      : [['settings', '房间设置'], ['share', '邀请仙友'], ['chat', '传音'], ['friends', '仙友录']];
    utility.forEach(([id, title], index) => add('button', id!, title!, pad + 10 + index * ((full - 20) / 4), dockY + 76, (full - 20) / 4 - 4, 36, { fixed: true }));
    const maxScroll = Math.max(0, arenaEnd + 10 - contentBottom);
    const scroll = Math.min(model.scroll ?? 0, maxScroll);
    for (const node of nodes) if (!node.fixed) { node.y -= scroll; node.clipTop = top + 44; node.clipBottom = contentBottom; }
    appendAlerts();
    return { nodes, maxScroll, contentTop: top + 44, contentBottom };
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
