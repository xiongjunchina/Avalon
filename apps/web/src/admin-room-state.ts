import type { DedicatedRoom } from '@avalon/contracts';

export function adminRoomPhaseLabel(phase: string | undefined): string {
  return ({ waiting: '等待入席', playing: '对局进行中', finished: '已结束 · 待续局', closed: '已关闭' } as Record<string, string>)[phase ?? ''] ?? '状态待刷新';
}

export async function closeDedicatedRoomSession(
  room: DedicatedRoom,
  request: (path: string, body: object) => Promise<unknown>,
  confirmClose: (prompt: string) => boolean,
): Promise<boolean> {
  const roomId = room.activeRoomId;
  const effect = room.activePhase === 'playing' ? '当前对局仍在进行，继续将中止本局。' : room.activePhase === 'finished' ? '本局已结束，此操作仅释放本次房间占用。' : '';
  if (!roomId || !confirmClose(`确认结束专属房【${room.code} · ${room.name}】的本次房间？${effect}在席玩家将返回大厅；专属房号、配置、密码与历史对局均保留，之后可重新开桌。`)) return false;
  await request(`/rooms/${roomId}/kill`, {});
  return true;
}
