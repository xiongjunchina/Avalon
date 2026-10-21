import type { Command, GameView, RoomView, User } from '@avalon/contracts';
import { commandId } from './lobby.js';
import { formatRoleName } from '../../../web/src/roles.js';
import type { ScreenModel } from '../ui/widgets.js';

export interface GameUiState {
  privateRoleVisible: boolean;
  ballotVisible: boolean;
  selectedIds?: string[];
  direction?: 'clockwise' | 'counterclockwise';
  targetId?: string;
}

const phaseName: Record<GameView['phase'], string> = {
  dealing: '正在发牌', role_reveal: '查看身份', proposing: '队长提名', discussion: '商议队伍',
  team_vote: '表决队伍', mission: '执行任务', lady: '照妖宝镜', lady_reveal: '查验结果',
  early_window: '提前刺杀', assassination: '终局刺杀', finished: '对局结束', aborted: '对局中止',
};

export function gameScreen(room: RoomView, user: User, ui: GameUiState): ScreenModel {
  const game = room.game;
  if (!game) return { title: '等待牌局', rows: [{ id: 'back', text: '返回房间' }] };
  const self = game.self;
  const round = game.rounds?.at(-1);
  const rows = [
    { id: 'status', text: `第${game.mission}轮 · ${phaseName[game.phase]}` },
    ...game.players.map(player => ({ id: `player:${player.id}`, text: `${player.seat}号 ${player.nickname}${player.id === game.captainId ? ' · 队长' : ''}${ui.selectedIds?.includes(player.id) ? ' · 已选队员' : ''}${ui.targetId === player.id ? ' · 已选目标' : ''}` })),
    { id: 'role', text: ui.privateRoleVisible && self ? `你的身份：${formatRoleName(self.role, self.loyalGuardian, self.femaleDemon)} · ${self.team === 'blue' ? '取经阵营' : '妖魔阵营'}` : '点此查看自己的身份' },
  ];
  if (ui.privateRoleVisible && self?.guardianClue) rows.push({ id: 'clue', text: self.guardianClue.description });
  if (game.abortPoll) rows.push({ id: 'abortPoll', text: `终止投票 ${game.abortPoll.approvals}/${game.abortPoll.required}` });
  if (game.phase === 'role_reveal' && self && !self.confirmed) rows.push({ id: 'confirmRole', text: '已看清身份' });
  if (game.phase === 'proposing' && game.captainId === user.id) rows.push(
    { id: 'direction', text: `方向：${ui.direction === 'counterclockwise' ? '逆时针' : '顺时针'}` },
    { id: 'draft', text: `同步队伍草稿 ${ui.selectedIds?.length ?? 0}人` },
    { id: 'propose', text: `提交队伍 ${ui.selectedIds?.length ?? 0}/${game.missionSizes?.[game.mission - 1] ?? 0}` },
  );
  if (game.phase === 'discussion' && game.captainId === user.id) rows.push(
    { id: 'direction', text: `方向：${ui.direction === 'counterclockwise' ? '逆时针' : '顺时针'}` },
    { id: 'draft', text: `同步队伍草稿 ${ui.selectedIds?.length ?? 0}人` },
    { id: 'startTeamVote', text: '发起组队表决' },
  );
  if (game.phase === 'team_vote' && self && !self.teamVoted) rows.push(
    { id: 'approve', text: '赞成队伍' }, { id: 'reject', text: '反对队伍' }, { id: 'abstain', text: '弃权' },
  );
  if (game.phase === 'mission' && self && !self.missionVoted && round?.team.includes(user.id)) rows.push(
    { id: 'missionSuccess', text: '任务成功' }, ...(self.team === 'red' ? [{ id: 'missionFail', text: '任务失败' }] : []),
  );
  if (game.phase === 'lady' && self?.canInspect) rows.push({ id: 'inspect', text: `查验所选玩家${ui.targetId ? ' ✓' : ''}` });
  if (game.phase === 'lady_reveal' && self?.canConfirmInspection) rows.push({ id: 'confirmInspection', text: '确认查验结果' });
  if (game.phase === 'early_window' && self?.canDecideEarly) rows.push(
    { id: 'earlyAttempt', text: '提前刺杀' }, { id: 'earlySkip', text: '继续对局' },
  );
  if (game.phase === 'assassination' && self?.role === 'assassin') rows.push({ id: 'assassinate', text: `刺杀所选玩家${ui.targetId ? ' ✓' : ''}` });
  if (game.phase === 'finished' || game.phase === 'aborted') rows.push(
    { id: 'result', text: `结果：${game.result?.winner ?? '无'} · ${game.result?.reason ?? ''}` },
    { id: 'rematch', text: '返回房间再来一局' },
  );
  if (!['finished', 'aborted'].includes(game.phase)) {
    if (room.hostId === user.id) rows.push(...(game.abortPoll ? [
      { id: 'approveAbort', text: '同意结束对局' }, { id: 'rejectAbort', text: '拒绝结束对局' },
    ] : [{ id: 'endGame', text: '结束游戏并关闭房间' }]));
    else if (!game.abortPoll) rows.push({ id: 'requestAbort', text: '向房主申请结束对局' });
  }
  return { title: `房间 ${room.code}`, subtitle: `${game.players.length}人 · ${phaseName[game.phase]}`, rows };
}

export function gameAction(room: RoomView, user: User, action: string, ui: Partial<GameUiState> = {}): Command | undefined {
  const game = room.game;
  if (!game || !game.players.some(player => player.id === user.id)) return undefined;
  const self = game.self;
  const round = game.rounds?.at(-1);
  let command: { type: Command['type']; payload: Command['payload'] } | undefined;
  if (action === 'confirmRole' && game.phase === 'role_reveal' && self && !self.confirmed) command = { type: 'confirmRole', payload: {} };
  if (action === 'draft' && ['role_reveal', 'proposing', 'discussion'].includes(game.phase) && game.captainId === user.id && (ui.selectedIds?.length ?? 0) <= game.missionSizes[game.mission - 1]) command = { type: 'updateTeamDraft', payload: { playerIds: ui.selectedIds ?? [], direction: ui.direction ?? 'clockwise' } };
  if (action === 'propose' && game.phase === 'proposing' && game.captainId === user.id && ui.selectedIds?.length === game.missionSizes[game.mission - 1]) command = { type: 'proposeTeam', payload: { playerIds: ui.selectedIds, direction: ui.direction ?? 'clockwise' } };
  if (action === 'startTeamVote' && game.phase === 'discussion' && game.captainId === user.id) command = { type: 'startTeamVote', payload: {} };
  if (game.phase === 'team_vote' && self && !self.teamVoted && ['approve', 'reject', 'abstain'].includes(action)) command = { type: 'teamVote', payload: { approve: action === 'abstain' ? 'abstain' : action === 'approve' } };
  if (game.phase === 'mission' && self && !self.missionVoted && round?.team.includes(user.id) && ['missionSuccess', 'missionFail'].includes(action) && (action !== 'missionFail' || self.team === 'red')) command = { type: 'missionVote', payload: { success: action === 'missionSuccess' } };
  if (action === 'inspect' && game.phase === 'lady' && self?.canInspect && ui.targetId && ui.targetId !== user.id) command = { type: 'inspectAlignment', payload: { targetId: ui.targetId } };
  if (action === 'confirmInspection' && game.phase === 'lady_reveal' && self?.canConfirmInspection) command = { type: 'confirmInspection', payload: {} };
  if (game.phase === 'early_window' && self?.canDecideEarly && ['earlyAttempt', 'earlySkip'].includes(action)) command = { type: 'earlyAssassinationDecision', payload: { attempt: action === 'earlyAttempt' } };
  if (action === 'assassinate' && game.phase === 'assassination' && self?.role === 'assassin' && ui.targetId && ui.targetId !== user.id) command = { type: 'assassinate', payload: { targetId: ui.targetId } };
  if (action === 'rematch' && (game.phase === 'finished' || game.phase === 'aborted') && room.hostId === user.id) command = { type: 'returnToLobby', payload: {} };
  if (action === 'requestAbort' && !['finished', 'aborted'].includes(game.phase)) command = { type: 'requestAbort', payload: {} };
  if (action === 'endGame' && room.hostId === user.id && !['finished', 'aborted'].includes(game.phase)) command = { type: 'endGame', payload: {} };
  if (room.hostId === user.id && game.abortPoll && !['finished', 'aborted'].includes(game.phase) && ['approveAbort', 'rejectAbort'].includes(action)) command = { type: 'voteAbort', payload: { approve: action === 'approveAbort' } };
  if (!command) return undefined;
  return { ...command, commandId: commandId(), expectedVersion: room.version } as Command;
}
