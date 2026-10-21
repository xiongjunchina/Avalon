import type { AdminGameSummary, AdminOverview, AdminRoomSummary, AdminUserSummary, RedemptionCodeItem, SystemAnnouncement } from '@avalon/contracts';
import type { ScreenModel } from '../../ui/widgets.js';

const navigation = [
  { id: 'page:overview', text: '总览' }, { id: 'page:users', text: '用户' },
  { id: 'page:rooms', text: '房间' }, { id: 'page:games', text: '对局记录' },
  { id: 'page:codes', text: '兑换码' }, { id: 'page:settings', text: '运营设置' },
  { id: 'back', text: '返回游戏' },
];

export function adminOverviewScreen(data: AdminOverview): ScreenModel {
  return { title: '管理总览', rows: [
    { id: 'stats:users', text: `用户 ${data.totalUsers} · 今日新增 ${data.todayNewUsers}` },
    { id: 'stats:rooms', text: `活跃房间 ${data.activeRoomsCount} · 在线 ${data.onlineConnections}` },
    { id: 'stats:games', text: `对局 ${data.totalGames} · 今日 ${data.todayGames}` },
    { id: 'stats:mode', text: data.freeAccessMode ? '当前全员免费' : '当前商业模式' },
    ...navigation,
  ] };
}

export function adminUsersScreen(users: AdminUserSummary[], query = '', hasMore = false): ScreenModel {
  return { title: '管理用户', subtitle: query ? `搜索：${query}` : '点击用户查看管理操作', rows: [
    { id: 'search', text: '搜索昵称 / 仙友码 / ID' },
    ...users.map(user => ({ id: `user:${user.id}`, text: `${user.nickname} ${user.playerCode} ${user.isBanned ? '已封禁' : ''} ${user.isVip ? 'VIP' : ''}` })),
    ...(hasMore ? [{ id: 'more:users', text: '加载更多用户' }] : []),
    { id: 'cleanup', text: '清理无对局的空账户' },
    ...navigation,
  ] };
}

export function adminUserScreen(user: AdminUserSummary): ScreenModel {
  return { title: user.nickname, subtitle: `仙友码 ${user.playerCode} · ${user.gamesCount} 局`, rows: [
    { id: `ban:${user.id}`, text: user.isBanned ? '解除封禁' : '封禁用户' },
    { id: `vip:${user.id}`, text: '赠送 VIP 天数' },
    { id: `friends:${user.id}`, text: `查看仙友（${user.friendsCount}）` },
    { id: `reset:${user.id}`, text: '重置昵称及头像' },
    { id: `delete:${user.id}`, text: '删除此用户' },
    { id: 'page:users', text: '返回用户列表' },
  ] };
}

export function adminRoomsScreen(rooms: AdminRoomSummary[]): ScreenModel {
  return { title: '活跃房间', rows: [
    ...rooms.map(room => ({ id: `room:${room.id}`, text: `${room.code} · ${room.hostNickname} · ${room.memberCount}/${room.playerCount} · ${room.phase}` })),
    ...navigation,
  ] };
}

export function adminGamesScreen(games: AdminGameSummary[], hasMore = false): ScreenModel {
  return { title: '对局记录', rows: [
    ...games.map(game => ({ id: `replay:${game.id}`, text: `${game.roomCode} · ${game.playerCount}人 · ${game.winner ?? '中止'}` })),
    ...(hasMore ? [{ id: 'more:games', text: '加载更多对局' }] : []),
    ...navigation,
  ] };
}

export function adminCodesScreen(codes: RedemptionCodeItem[]): ScreenModel {
  return { title: '兑换码', rows: [
    { id: 'generate', text: '生成兑换码' },
    ...codes.map(code => ({ id: `code:${code.code}`, text: `${code.code} · ${code.days}天 · ${code.redeemedBy ? '已兑换' : '未兑换'}` })),
    ...navigation,
  ] };
}

export function adminSettingsScreen(settings: { freeAccessMode: boolean; adRewardHours: number; announcement: SystemAnnouncement }): ScreenModel {
  return { title: '运营设置', rows: [
    { id: 'mode', text: `全员免费：${settings.freeAccessMode ? '开' : '关'}` },
    { id: 'reward', text: `广告奖励：${settings.adRewardHours} 小时` },
    { id: 'broadcast', text: `公告：${settings.announcement.enabled ? settings.announcement.text : '关闭'}` },
    ...navigation,
  ] };
}
