export const errors: Record<string, string> = {
  DEAL_PENDING: '正在发牌倒计时，请稍候，身份尚未开放查看。',
  GAME_NOT_FOUND: '这局尚未结束，或你没有查看权限。只有参与过的对局才会出现在历史中。', PRESET_LIMIT: '最多保存 10 个预设，请先删除不用的预设。',
  NOT_LADY_HOLDER: '本次只能由照妖宝镜的执镜人选择查验对象。', NOT_INSPECTOR: '本次只能由刚才的查验者确认结果。', INVALID_INSPECTION_TARGET: '不能查验自己或曾经执掌照妖宝镜的玩家，请重新选择。',
  NOT_READY: '需要人数到齐且所有人准备后，房主才能开局。',
  GAME_IN_PROGRESS: '本局已开始，人数、设置与席位已锁定。请先完成本局，或请房主结束游戏。',
  WRONG_PHASE: '当前已进入其他步骤，请查看最新对局进度。', GAME_ENDED: '本局已经结束。',
  NOT_CAPTAIN: '此操作需要当前队长完成。', NOT_ASSASSIN: '只有刺客能提交刺杀目标。',
  INVALID_TEAM: '请选择正确数量且不重复的任务成员。', INVALID_TARGET: '请选择有效的刺杀目标。',
  NOT_ON_TEAM: '你不在本次任务队伍中，无需出牌。', BLUE_MUST_SUCCEED: '蓝方只能提交任务成功，请重新选择。',
  ALREADY_SUBMITTED: '你已完成本次提交，不能更改。', ABORT_PENDING: '已有中断请求，请先处理。', NO_ABORT_POLL: '中断请求已取消，请查看最新进度。',
  UNAUTHENTICATED: '登录已失效，请刷新页面重新进入。', ROOM_NOT_FOUND: '没有找到房间，请检查房间码或邀请链接。',
  ROOM_FULL: '房间已满，请联系房主。', ALREADY_IN_ROOM: '你已在另一个房间，请先回到该房间退出。',
  FORBIDDEN: '你没有进行此操作的权限。', VERSION_CONFLICT: '房间刚刚更新，已同步最新状态，请重新操作。',
  SEATS_OCCUPIED: '目标人数中有座位已被占用，不能缩减。', INVALID_INPUT: '输入格式不正确，请检查后重试。',
  ROOM_CLOSED: '房间已关闭，请重新创建或加入其他房间。', JOIN_DISABLED: '房主已关闭新成员加入，请联系房主。',
  USER_NOT_FOUND: '未找到该玩家，请核对6位仙友码或昵称。',
  USER_BANNED: '此账号已被系统封禁。',
  INVALID_PLAYER_CODE: '请输入6位有效数字仙友码。',
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
