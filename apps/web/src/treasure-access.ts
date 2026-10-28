import type { GameView } from '@avalon/contracts';

export const GUARDIAN_TREASURE_DISABLED_REASON = '已开启护法天机，蓝方法宝本局禁用；红方法宝保留。';

/** Entry visibility is shared by all seats; permissions come from the private self view. */
export function treasureAccess(game: Pick<GameView, 'self' | 'players'>, enabled: boolean) {
  const self = game.self;
  if (!self) return { canOpen: false, reason: '身份尚未发放', status: '待发牌' };
  if (self.treasures?.disabledReason === 'guardian_perks') {
    return { canOpen: false, reason: GUARDIAN_TREASURE_DISABLED_REASON, status: '天机限制' };
  }
  if (enabled && self.treasures?.enabled && self.treasures.incomingHeartBell) {
    return { canOpen: true, reason: '查看同心铃私密传音与本命法宝', status: '私密传音' };
  }
  // The assassin's lance is the existing assassination action, not an expansion treasure.
  if (self.role === 'assassin') return { canOpen: true, reason: '查看火尖枪与刺杀时机', status: '神兵' };
  if (game.players.length < 8) return { canOpen: false, reason: '专属法宝需至少 8 人且房间开启法宝模式', status: '人数不足' };
  if (!enabled) return { canOpen: false, reason: '本局未开启法宝模式', status: '未开启' };
  if (!self.treasures?.enabled) return { canOpen: false, reason: '本局未开启法宝模式', status: '未开启' };
  if (!['percival', 'guinevere', 'mordred', 'loyal', 'oberon', 'minion'].includes(self.role)) {
    return { canOpen: false, reason: '当前角色没有专属主动法宝', status: '无专属' };
  }
  if (self.role === 'minion') return { canOpen: true, reason: '查看同心铃与传音时机', status: self.treasures.heartBell?.used ? '已传音' : self.treasures.heartBell?.available ? '可传音' : '同心铃' };
  const hasResult = Boolean(self.treasures.guanyinMirror?.result || self.treasures.tinStaff?.result);
  return { canOpen: true, reason: hasResult ? '直接查看私密查验结果' : '查看本命法宝与使用时机', status: hasResult ? '查验结果' : '本命法宝' };
}
