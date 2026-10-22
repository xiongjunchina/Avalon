import type { AdminGameSummary, AdminOverview, AdminRoomSummary, AdminUserSummary, RedemptionCodeItem, Replay, SystemAnnouncement } from '@avalon/contracts';
import type { ScreenModel } from '../../ui/widgets.js';

const navigation = [
  { id: 'page:overview', text: '总览' }, { id: 'page:users', text: '用户' },
  { id: 'page:rooms', text: '房间' }, { id: 'page:games', text: '对局记录' },
  { id: 'page:codes', text: '兑换码' }, { id: 'page:settings', text: '运营设置' },
  { id: 'back', text: '返回游戏' },
];

export function adminOverviewScreen(data: AdminOverview): ScreenModel {
  return { title: '管理总览', rows: [
    ...navigation,
    { id: 'stats:users', text: `用户 ${data.totalUsers} · 今日新增 ${data.todayNewUsers}` },
    { id: 'stats:rooms', text: `活跃房间 ${data.activeRoomsCount} · 在线 ${data.onlineConnections}` },
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
    ...navigation,
    ...rooms.map(room => ({ id: `room:${room.id}`, text: `${room.code} · ${room.hostNickname} · ${room.memberCount}/${room.playerCount} · ${room.phase}${room.voiceChatEnabled ? ' · 语音开' : ''}` })),
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
  const name = (id: string) => {
    const player = replay.players.find(item => item.id === id);
    return player ? `${player.seat}号${player.nickname}` : '未知成员';
  };
  return { title: '对局复盘', subtitle: `${replay.playerCount}人 · ${replay.result.winner === 'blue' ? '蓝方获胜' : replay.result.winner === 'red' ? '红方获胜' : '中止'}`, rows: [
    { id: 'replay:reason', text: `结案：${replay.result.reason}${replay.result.targetId ? ` · 目标${name(replay.result.targetId)}` : ''}` },
    { id: 'replay:rules', text: `规则 ${replay.rulesetVersion} · ${replay.settings.anonymousTeamVote ? '匿名组队投票' : '公开组队投票'}` },
    ...replay.players.map(player => ({ id: `replay:player:${player.id}`, text: `${name(player.id)} · ${replay.roles[player.id] ?? '未知身份'}` })),
    ...replay.rounds.flatMap(round => [
      { id: `replay:round:${round.number}`, text: `第${round.number}轮 / 任务${round.mission} · 队长${name(round.captainId)}` },
      { id: `replay:team:${round.number}`, text: `出征：${round.team.map(name).join('、') || '未确定'}` },
      ...(round.vote ? [{ id: `replay:vote:${round.number}`, text: `组队投票：赞成${round.vote.approvals} · 反对${round.vote.rejections} · 弃权${round.vote.abstentions ?? 0} · ${round.vote.passed ? '通过' : '否决'}` }] : []),
      ...(round.result ? [{ id: `replay:mission:${round.number}`, text: `任务：成功${round.result.successes} · 失败${round.result.failures} · ${round.result.passed ? '成功' : '失败'}` }] : []),
      ...replay.inspections.filter(item => item.afterMission === round.mission && round.result).map((item, index) => ({ id: `replay:inspection:${round.number}:${index}`, text: `宝镜：${name(item.inspectorId)} 查验 ${name(item.targetId)}` })),
      ...replay.earlyWindows.filter(item => item.afterProposal === round.number).map((item, index) => ({ id: `replay:early:${round.number}:${index}`, text: `提前刺杀窗口：${item.decision === 'attempt' ? '发起' : '跳过'}` })),
    ]),
    { id: 'page:games', text: '返回对局记录' },
  ] };
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
