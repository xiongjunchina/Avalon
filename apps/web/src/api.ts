export const errors: Record<string, string> = {
  NOT_MINION: '同心铃仅限女妖精使用。',
  TREASURES_DISABLED: '本局未启用专属法宝。', ALREADY_USED: '此法宝本局已使用。',
  HEART_BELL_TWO_FAILURES: '本轮需两张失败牌才会失败，不可使用同心铃。',
  HEART_BELL_UNAVAILABLE: '传音条件已变化：双方须同车、已相认且都未出牌，请重新选择。',
  DEAL_PENDING: '正在发牌倒计时，请稍候，身份尚未开放查看。',
  GAME_NOT_FOUND: '这局尚未结束，或你没有查看权限。只有参与过的对局才会出现在历史中。', PRESET_LIMIT: '最多保存 10 个预设，请先删除不用的预设。',
  ROOM_PASSWORD_REQUIRED: '请输入房间密码。', ROOM_PASSWORD_INVALID: '房间密码不正确。',
  ROOM_CODE_TAKEN: '房号已被占用，请更换。', DEDICATED_ROOM_ACTIVE: '专属房已开桌，请关闭本次房间后修改配置。',
  PLAYER_CODE_TAKEN: '该仙友码已被占用。', PLAYER_CODE_RETIRED: '该号码关联历史对局，已保留，不能重新分配。',
  PLAYER_CODE_CHANGED: '玩家号码已被更新，请刷新后重试。', ACCOUNT_CODE_CHANGED: '原仙友码已变更，已停止快捷切换，请使用新仙友码。',
  USER_IN_ACTIVE_GAME: '玩家正在对局中，请结束本局后改号。', MANAGES_DEDICATED_ROOMS: '该玩家管理专属房，请先转移房主管理权。',
  NOT_READY: '需要人数到齐且所有人准备后，房主才能开局。',
  GAME_IN_PROGRESS: '本局已开始，人数、设置与席位已锁定。请先完成本局，或请房主结束游戏。',
  GAME_FINISHED: '本局已结束，请房主返回等待区；如无法返回，可由管理员结束本次房间后重新开桌。',
  WRONG_PHASE: '当前已进入其他步骤，请查看最新对局进度。', GAME_ENDED: '本局已经结束。',
  NOT_CAPTAIN: '此操作需要当前队长完成。', NOT_ASSASSIN: '只有刺客能提交刺杀目标。',
  INVALID_TEAM: '请选择正确数量且不重复的任务成员。', INVALID_TARGET: '请选择有效的刺杀目标。',
  NOT_ON_TEAM: '你不在本次任务队伍中，无需出牌。', BLUE_MUST_SUCCEED: '蓝方只能提交任务成功，请重新选择。',
  ALREADY_SUBMITTED: '你已完成本次提交，不能更改。', ABORT_PENDING: '已有中断请求，请先处理。', NO_ABORT_POLL: '中断请求已取消，请查看最新进度。',
  UNAUTHENTICATED: '登录已失效，请刷新页面重新进入。', ROOM_NOT_FOUND: '没有找到房间，请检查房间码或邀请链接。',
  ROOM_FULL: '房间已满，请联系房主。', ALREADY_IN_ROOM: '你已在另一个房间，请先回到该房间退出。',
  FORBIDDEN: '你没有进行此操作的权限。', VERSION_CONFLICT: '房间刚刚更新，已同步最新状态，请重新操作。',
  COMMAND_PENDING: '上一项操作正在确认，请稍候重试。', CONNECTION_STOPPED: '房间连接已结束，请重新进入。',
  CONNECTION_REPLACED: '其他页面已接管此账号，请在当前页面重连后重试。',
  SEATS_OCCUPIED: '目标人数中有座位已被占用，不能缩减。', INVALID_INPUT: '输入格式不正确，请检查后重试。',
  ROOM_CLOSED: '房间已关闭，请重新创建或加入其他房间。', JOIN_DISABLED: '房主已关闭新成员加入，请联系房主。',
  USER_NOT_FOUND: '未找到该玩家，请核对6位仙友码或昵称。',
  NICKNAME_ALREADY_IN_ROOM: '房间里已有这个昵称的玩家。若是你，请用原仙友码找回账号；若是另一位朋友，请换个昵称。',
  NICKNAME_LOOKS_LIKE_ROOM_CODE: '这是房间号，请在昵称里填写朋友认识的称呼，例如“小陈”或“阿辉”。',
  INVALID_ROOM_ENTRY: '请在房间号一栏填写朋友发来的 6 位号码，或粘贴完整邀请链接。',
  USER_BANNED: '此账号已被系统封禁。',
  INVALID_PLAYER_CODE: '请输入6位有效数字仙友码。',
  HAS_GAME_RECORDS: '该用户存在对局记录，为维护对局复盘与数据完整性不可删除。如需限制其访问可使用封禁功能。',
  USER_IN_ACTIVE_ROOM: '该用户当前正处于活跃房间中，请先将其移出房间再执行删除。',
  CANNOT_ADD_SELF: '不能添加自己为仙友。',
  ALREADY_FRIENDS: '你们已经是仙友了。',
  REQUEST_ALREADY_SENT: '已发送过好友请求，等待对方确认中。',
  REQUEST_NOT_FOUND: '未找到对应的好友申请。',
  RATE_LIMITED: '操作过于频繁，请稍后再试。', NETWORK: '连接失败，请检查网络后重试。',
};
export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000);
  try {
    const response = await fetch(`/api${path}`, { method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(method === 'GET' ? {} : { 'X-Avalon-Request': '1' }) },
      body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal:controller.signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'NETWORK'); return data;
  } finally {clearTimeout(timer);}

}
export const describe = (err: unknown) => errors[err instanceof Error ? err.message : 'NETWORK'] ?? '操作未完成，请稍后重试。';
