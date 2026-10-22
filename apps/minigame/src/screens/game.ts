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
  snapshotKey?: string;
  draftKey?: string;
}

export function syncGameUi(ui: GameUiState, room: RoomView, allowAutoReveal = true): void {
  const game = room.game;
  if (!game) { ui.snapshotKey = undefined; ui.draftKey = undefined; ui.selectedIds = []; ui.targetId = undefined; return; }
  const key = `${game.id}:${game.mission}:${game.captainId}:${game.phase}`;
  const changed = ui.snapshotKey !== key;
  if (changed) {
    ui.privateRoleVisible = Boolean(allowAutoReveal && room.settings.autoRevealRoleEnabled && game.phase === 'role_reveal' && game.self);
    ui.ballotVisible = false;
    ui.targetId = undefined;
    ui.selectedIds = [];
    ui.direction = 'clockwise';
    ui.snapshotKey = key;
  }
  const draftKey = game.draftTeam ? JSON.stringify(game.draftTeam) : '';
  if (changed || ui.draftKey !== draftKey) {
    ui.selectedIds = [...(game.draftTeam?.playerIds ?? [])];
    ui.direction = game.draftTeam?.direction ?? 'clockwise';
    ui.draftKey = draftKey;
  }
}

const phaseName: Record<GameView['phase'], string> = {
  dealing: '正在发牌', role_reveal: '查看身份', proposing: '队长提名', discussion: '商议队伍',
  team_vote: '表决队伍', mission: '执行任务', lady: '照妖宝镜', lady_reveal: '查验结果',
  early_window: '提前刺杀', assassination: '终局刺杀', finished: '对局结束', aborted: '对局中止',
};

export function gameScreen(room: RoomView, user: User, ui: GameUiState, now = Date.now()): ScreenModel {
  const game = room.game;
  if (!game) return { title: '等待牌局', rows: [{ id: 'back', text: '返回房间' }] };
  const self = game.self;
  const round = game.rounds?.at(-1);
  const playerLabel = (id: string) => { const player = game.players.find(value => value.id === id); return player ? `${player.seat}号 ${player.nickname}` : '未知玩家'; };
  const rows = [
    { id: 'status', text: `第${game.mission}轮 · ${phaseName[game.phase]}` },
    ...(game.phase === 'dealing' && game.dealEndsAt ? [{ id: 'dealCountdown', text: `正在发牌，还需${Math.max(0, Math.ceil((Date.parse(game.dealEndsAt) - now) / 1000))}秒` }] : []),
    { id: 'progress', text: `流局 ${game.rejectionCount}/5 · 本轮需${game.missionSizes[game.mission - 1] ?? 0}人 · ${game.failuresRequired}张失败牌才失败` },
    ...game.rounds.filter(value => value.result).map(value => ({ id: `round:${value.number}`, text: `第${value.number}轮任务${value.result!.passed ? '成功' : '失败'} · ${value.result!.failures}张失败牌` })),
    ...(round?.team.length ? [{ id: 'team', text: `出征队伍：${round.team.map(playerLabel).join('、')}` }] : []),
    ...(game.phase === 'team_vote' ? [{ id: 'teamVoteProgress', text: `组队表决 ${game.progress.teamVotes}/${game.players.length}` }] : []),
    ...(game.phase === 'mission' ? [{ id: 'missionProgress', text: `任务投票 ${game.progress.missionVotes}/${round?.team.length ?? 0}` }] : []),
    ...(game.humanBagBannedPlayerId ? [{ id: 'treasure:banNotice', text: `本轮人种袋禁选：${playerLabel(game.humanBagBannedPlayerId)}` }] : []),
    ...(game.bananaFanNotice ? [{ id: 'treasure:fanNotice', text: game.bananaFanNotice }] : []),
    ...game.players.map(player => ({ id: `player:${player.id}`, text: `${player.seat}号 ${player.nickname}${player.id === game.captainId ? ' · 队长' : ''}${ui.selectedIds?.includes(player.id) ? ' · 已选队员' : ''}${ui.targetId === player.id ? ' · 已选目标' : ''}` })),
    { id: 'role', text: ui.privateRoleVisible && self ? `你的身份：${formatRoleName(self.role, self.loyalGuardian, self.femaleDemon)} · ${self.team === 'blue' ? '取经阵营' : '妖魔阵营'}` : '点此查看自己的身份' },
  ];
  if (ui.privateRoleVisible && self?.guardianClue) rows.push({ id: 'clue', text: self.guardianClue.description });
  if (ui.privateRoleVisible && self?.evilIds.length) rows.push({ id: 'evil', text: `已知妖魔：${self.evilIds.map(playerLabel).join('、')}` });
  if (ui.privateRoleVisible && self?.merlinCandidates.length) rows.push({ id: 'merlinCandidates', text: `真假悟空候选：${self.merlinCandidates.map(playerLabel).join('、')}` });
  if (ui.privateRoleVisible && self?.guinevereCandidates?.length) rows.push({ id: 'guinevereCandidates', text: `线索候选：${self.guinevereCandidates.map(playerLabel).join('、')}` });
  if (ui.privateRoleVisible && self?.inspections.length) rows.push(...self.inspections.map(value => ({ id: `inspection:${value.afterMission}`, text: `查验结果：${playerLabel(value.targetId)}属${value.team === 'red' ? '妖魔' : '取经'}阵营` })));
  if (ui.privateRoleVisible && room.settings.treasuresEnabled && game.players.length >= 9 && self?.treasures?.enabled) {
    const treasure = self.treasures;
    if (treasure.tinStaff) rows.push({ id: 'treasure:tinStaff', text: treasure.tinStaff.result
      ? `锡杖查验：${playerLabel(treasure.tinStaff.result.targetId)}属${treasure.tinStaff.result.team === 'red' ? '妖魔' : '取经'}阵营`
      : treasure.tinStaff.available ? '九环锡杖：选一名非候选仙友查验' : `九环锡杖：${treasure.tinStaff.used ? '已使用' : '完成两轮任务后可用'}` });
    if (treasure.guanyinMirror) rows.push({ id: 'treasure:guanyinMirror', text: treasure.guanyinMirror.result
      ? `观音镜查验：${playerLabel(treasure.guanyinMirror.result.targetId)}心性${treasure.guanyinMirror.result.alignment === 'evil' ? '妖魔' : '纯良'}`
      : treasure.guanyinMirror.available ? '观音镜：选一名出征队员查验' : `观音镜：${treasure.guanyinMirror.used ? '已使用' : '发车后可用'}` });
    if (treasure.humanBag) rows.push({ id: 'treasure:humanBag', text: treasure.humanBag.targetId
      ? `人种袋已禁选：${playerLabel(treasure.humanBag.targetId)}`
      : treasure.humanBag.available ? '人种袋：选一名非队长仙友禁选' : `人种袋：${treasure.humanBag.used ? '已使用' : '第三轮提名前可用'}` });
    if (treasure.jinguSeal) rows.push({ id: 'treasure:jinguSeal', text: treasure.jinguSeal.available ? '紧箍佛印：向圣僧自证身份'
      : `紧箍佛印：${treasure.jinguSeal.used ? '已使用' : '两次任务失败后可用'}` });
    if (treasure.jinguAllyId) rows.push({ id: 'treasure:ally', text: `紧箍佛印盟友：${playerLabel(treasure.jinguAllyId)}` });
    if (treasure.bananaFan) rows.push({ id: 'treasure:bananaFan', text: treasure.bananaFan.used ? '芭蕉扇：已使用'
      : `芭蕉扇：${treasure.bananaFan.armed ? '已蓄力，点击取消' : '点击蓄力'}` });
  }
  if (game.abortPoll) rows.push({ id: 'abortPoll', text: `终止投票 ${game.abortPoll.approvals}/${game.abortPoll.required}` });
  if (game.phase === 'role_reveal' && self?.confirmed) rows.push({ id: 'submitted', text: `身份已确认，等待其余仙友（${game.progress.confirmed}/${game.players.length}）` });
  if (game.phase === 'team_vote' && self?.teamVoted) rows.push({ id: 'submitted', text: '已提交组队投票，等待其余仙友' });
  if (game.phase === 'mission') rows.push({ id: 'submitted', text: self?.missionVoted ? '已提交任务牌，等待其余队员' : round?.team.includes(user.id) ? '请提交本次任务牌' : '本轮无需出牌，等待出征队员完成任务' });
  const ballots = game.teamVote?.ballots ?? round?.vote?.ballots;
  if (ballots) rows.push(...Object.entries(ballots).map(([id, ballot]) => ({ id: `ballot:${id}`, text: `${playerLabel(id)}：${ballot === 'abstain' ? '弃权' : ballot ? '赞成' : '反对'}` })));
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
  if (ui.privateRoleVisible && self?.canDecideEarly) {
    rows.push({ id: 'earlyAttempt', text: '启用提前刺杀（刺错立即失败）' });
    if (game.phase === 'early_window') rows.push({ id: 'earlySkip', text: '继续对局' });
  }
  if (game.phase === 'assassination' && self?.role === 'assassin') rows.push({ id: 'assassinate', text: `刺杀所选玩家${ui.targetId ? ' ✓' : ''}` });
  if (game.phase === 'finished' || game.phase === 'aborted') rows.push(
    { id: 'result', text: `结果：${game.result?.winner === 'blue' ? '取经阵营获胜' : game.result?.winner === 'red' ? '妖魔阵营获胜' : '对局中止'} · ${game.result?.reason ?? ''}` },
    ...Object.entries(game.revealedRoles ?? {}).map(([id, role]) => ({ id: `revealed:${id}`, text: `${playerLabel(id)} · ${formatRoleName(role)}` })),
    ...(room.hostId === user.id ? [{ id: 'rematch', text: '返回房间再来一局' }] : [{ id: 'result:waiting', text: '等待房主返回房间' }]),
  );
  if (!['finished', 'aborted'].includes(game.phase)) {
    if (room.hostId === user.id) rows.push(...(game.abortPoll ? [
      { id: 'approveAbort', text: '同意结束对局' }, { id: 'rejectAbort', text: '拒绝结束对局' },
    ] : [{ id: 'endGame', text: '结束游戏并关闭房间' }]));
    else if (!game.abortPoll) rows.push({ id: 'requestAbort', text: '向房主申请结束对局' });
  }
  rows.push({ id: 'chat', text: '房间聊天' });
  // Keep the current decision and private identity above the seat board on small phones.
  const first = new Set(['status', 'dealCountdown', 'progress', 'role', 'confirmRole', 'submitted', 'approve', 'reject', 'abstain', 'missionSuccess', 'missionFail', 'confirmInspection', 'earlyAttempt', 'earlySkip']);
  const ordered = [...rows.filter(row => first.has(row.id)), ...rows.filter(row => !first.has(row.id))];
  return { title: `房间 ${room.code}`, subtitle: `${game.players.length}人 · ${phaseName[game.phase]}`, rows: ordered };
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
  if (ui.privateRoleVisible && self?.canDecideEarly && !['dealing', 'role_reveal', 'assassination', 'finished', 'aborted'].includes(game.phase)
    && (action === 'earlyAttempt' || action === 'earlySkip' && game.phase === 'early_window'))
    command = { type: 'earlyAssassinationDecision', payload: { attempt: action === 'earlyAttempt' } };
  if (action === 'assassinate' && game.phase === 'assassination' && self?.role === 'assassin' && ui.targetId && ui.targetId !== user.id) command = { type: 'assassinate', payload: { targetId: ui.targetId } };
  const treasures = self?.treasures;
  if (action.startsWith('treasure:') && ui.privateRoleVisible && room.settings.treasuresEnabled && game.players.length >= 9 && self && treasures?.enabled) {
    const targetId = ui.targetId;
    const validTarget = Boolean(targetId && game.players.some(player => player.id === targetId) && targetId !== user.id);
    if (action === 'treasure:tinStaff' && treasures.tinStaff?.available && validTarget && !self.merlinCandidates.includes(targetId!))
      command = { type: 'useTreasure', payload: { action: 'tinStaff', targetId: targetId! } };
    if (action === 'treasure:guanyinMirror' && treasures.guanyinMirror?.available && validTarget && round?.team.includes(targetId!))
      command = { type: 'useTreasure', payload: { action: 'guanyinMirror', targetId: targetId! } };
    if (action === 'treasure:humanBag' && treasures.humanBag?.available && validTarget && targetId !== game.captainId)
      command = { type: 'useTreasure', payload: { action: 'humanBag', targetId: targetId! } };
    if (action === 'treasure:jinguSeal' && treasures.jinguSeal?.available)
      command = { type: 'useTreasure', payload: { action: 'jinguSeal' } };
    if (action === 'treasure:bananaFan' && treasures.bananaFan?.available)
      command = { type: 'useTreasure', payload: { action: 'bananaFan', armed: !treasures.bananaFan.armed } };
  }
  if (action === 'rematch' && (game.phase === 'finished' || game.phase === 'aborted') && room.hostId === user.id) command = { type: 'returnToLobby', payload: {} };
  if (action === 'requestAbort' && !['finished', 'aborted'].includes(game.phase)) command = { type: 'requestAbort', payload: {} };
  if (action === 'endGame' && room.hostId === user.id && !['finished', 'aborted'].includes(game.phase)) command = { type: 'endGame', payload: {} };
  if (room.hostId === user.id && game.abortPoll && !['finished', 'aborted'].includes(game.phase) && ['approveAbort', 'rejectAbort'].includes(action)) command = { type: 'voteAbort', payload: { approve: action === 'approveAbort' } };
  if (!command) return undefined;
  return { ...command, commandId: commandId(), expectedVersion: room.version } as Command;
}
