import type { AdminGameSummary, AdminOverview, AdminRoomSummary, AdminUserSummary, RedemptionCodeItem, Replay, SystemAnnouncement } from '@avalon/contracts';
import type { ScreenModel } from '../../ui/widgets.js';
import {formatRoleName} from '../../../../web/src/roles.js';
import type {Role} from '@avalon/contracts';
import { replayScreen } from '../replay.js';

const navigation = [
  { id: 'page:overview', text: '总览' }, { id: 'page:users', text: '用户' },
  { id: 'page:rooms', text: '房间' }, { id: 'page:games', text: '对局记录' },
  { id: 'page:codes', text: '兑换码' }, { id: 'page:settings', text: '运营设置' },
  {id:'page:special',text:'专属房与靓号'},
  { id: 'back', text: '返回游戏' },
];

export function adminOverviewScreen(data: AdminOverview): ScreenModel {
  return { title: '管理总览', rows: [
    ...navigation,
    { id: 'stats:users', text: `用户 ${data.totalUsers} · 今日新增 ${data.todayNewUsers}` },
    { id: 'stats:rooms', text: `未关闭房间 ${data.activeRoomsCount} · 在线 ${data.onlineConnections}` },
    { id: 'stats:games', text: `对局 ${data.totalGames} · 今日 ${data.todayGames}` },
    { id: 'stats:mode', text: data.freeAccessMode ? '当前全员免费' : '当前商业模式' },
  ] };
}

export function adminUsersScreen(users: AdminUserSummary[], query = '', hasMore = false): ScreenModel {
  return { title: '管理用户', subtitle: query ? `搜索：${query}` : '点击用户查看管理操作', rows: [
    ...navigation,
    { id: 'search', text: '搜索昵称 / 仙友码 / ID' },
    ...users.map(user => ({ id: `user:${user.id}`, text: `${user.nickname} ${user.playerCode} ${user.isBanned ? '已封禁' : ''} ${user.isVip ? 'VIP' : ''}` })),
    ...(hasMore ? [{ id: 'more:users', text: '加载更多用户' }] : []),
    { id: 'cleanup', text: '清理无对局的空账户' },
  ] };
}

export function adminUserScreen(user: AdminUserSummary): ScreenModel {
  return { title: user.nickname, subtitle: `仙友码 ${user.playerCode} · ${user.gamesCount} 局`, rows: [
    { id: 'stats:user:status', text: `状态：${user.isBanned ? `已封禁 ${user.bannedReason || ''}` : '正常'} · ${user.isVip ? `VIP 至 ${user.vipUntil || '有效'}` : '非 VIP'}` },
    { id: 'stats:user:created', text: `注册时间：${user.createdAt}` },
    {id:`playerCode:${user.id}`,text:'改仙友码'},
    { id: `ban:${user.id}`, text: user.isBanned ? '解除封禁' : '封禁用户' },
    { id: `vip:${user.id}`, text: '赠送 VIP 天数' },
    { id: `friends:${user.id}`, text: `查看仙友（${user.friendsCount}）` },
    { id: `reset:${user.id}`, text: '重置昵称及头像' },
    { id: `delete:${user.id}`, text: '删除此用户' },
    { id: 'page:users', text: '返回用户列表' },
  ] };
}

export function adminRoomsScreen(rooms: AdminRoomSummary[]): ScreenModel {
  return { title: '未关闭房间', rows: [
    ...navigation,
    ...rooms.map(room => ({ id: `room:${room.id}`, text: `${room.code} · ${room.hostNickname} · ${room.memberCount}/${room.playerCount} · ${{waiting:'等待入席',playing:'对局进行中',finished:'已结束 · 待续局',closed:'已关闭'}[room.phase] ?? room.phase}${room.voiceChatEnabled ? ' · 语音开' : ''}` })),
  ] };
}

export function adminGamesScreen(games: AdminGameSummary[], hasMore = false): ScreenModel {
  return { title: '对局记录', rows: [
    ...navigation,
    ...games.map(game => ({ id: `replay:${game.id}`, text: `${game.roomCode} · ${game.playerCount}人 · ${game.winner ?? '中止'} · ${game.reason || '无结案原因'}` })),
    ...(hasMore ? [{ id: 'more:games', text: '加载更多对局' }] : []),
  ] };
}

export function adminReplayScreen(replay: Replay): ScreenModel {
  const model=replayScreen(replay, 'page:games');
  const audit=replay.roleAssignmentAudit;
  if(replay.endedAt&&replay.result&&audit){
    model.rows.push({id:'audit:meta',text:`发牌依据 · 算法 ${audit.algorithmVersion} · 权重 ${audit.weightVersion} · 保护退让 ${audit.protectionLevel}`},{id:'audit:order',text:'角色区间顺序：'+(audit.roleOrder??[]).map(role=>formatRoleName(role)).join(' → ')},{id:'audit:note',text:'权重是相对抽取机会，并非命中概率；完整分配还需满足本局角色数量与保护约束。'});
    for(const id of audit.playerOrder){const e=audit.players[id];if(!e)continue;const p=replay.players.find(p=>p.id===id),d=audit.draws.find(d=>d.userId===id);model.rows.push({id:'audit:player:'+id,text:`${p?p.seat+'号 '+p.nickname:'未知玩家'} · 最终：${formatRoleName(e.assignedRole)}
心仪志愿：${e.preferences.map(role=>formatRoleName(role)).join(' / ')||'未设置'}
最近角色：${e.recentRoles.map(role=>formatRoleName(role)).join(' → ')||'无历史记录'}
保护条件：${[e.protections.visionGuaranteed&&'视野角色保护',e.protections.blueGuaranteed&&'蓝方保护',e.protections.bossCooldown&&'特殊角色冷却'].filter(Boolean).join('、')||'无'}
相对权重：${Object.entries(e.weights).map(([r,n])=>formatRoleName(r as Role)+' '+n).join(' / ')}${d?'\n随机票值 '+d.ticket+' / 区间总权重 '+d.totalWeight:''}`});}
  }
  return model;
}

export function adminCodesScreen(codes: RedemptionCodeItem[]): ScreenModel {
  return { title: '兑换码', subtitle: `库存 ${codes.length} · 未使用 ${codes.filter(code => !code.redeemedAt).length}`, rows: [
    ...navigation,
    { id: 'generate', text: '生成兑换码' },
    { id: 'copy:unused', text: '复制全部未使用兑换码' },
    ...codes.map(code => ({ id: `code:${code.code}`, text: `${code.code} · ${code.days}天 · ${code.redeemedAt ? '已兑换' : '未兑换'}${code.note ? ` · ${code.note}` : ''}` })),
  ] };
}

export function adminSettingsScreen(settings: { freeAccessMode: boolean; adRewardHours: number; announcement: SystemAnnouncement }): ScreenModel {
  return { title: '运营设置', rows: [
    ...navigation,
    { id: 'mode', text: `全员免费：${settings.freeAccessMode ? '开' : '关'}` },
    { id: 'reward', text: `广告奖励：${settings.adRewardHours} 小时` },
    { id: 'broadcast', text: `公告：${settings.announcement.enabled ? settings.announcement.text : '关闭'}` },
  ] };
}
