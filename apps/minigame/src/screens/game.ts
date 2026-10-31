import type { Command, GameView, RoomView, User } from '@avalon/contracts';
import { commandId } from './lobby.js';
import { formatRoleName } from '../../../web/src/roles.js';
import type { ScreenModel } from '../ui/widgets.js';
import { roleDescriptions } from '../../../web/src/role-descriptions.js';
import { getRoleGalleryItem, WUYUE_MISSIONS } from '../../../web/src/roles.js';
import { GUARDIAN_TREASURE_DISABLED_REASON } from '../../../web/src/treasure-access.js';

export interface GameUiState {
  heartBellReadKey?:string;
  guanyinResultReadKey?:string;
  privateRoleVisible: boolean;
  ballotVisible: boolean;
  selectedIds?: string[];
  direction?: 'clockwise' | 'counterclockwise';
  targetId?: string;
  treasureTargetsExpanded?:boolean;
  snapshotKey?: string;
  draftKey?: string;
  overlay?: 'identity' | 'vote' | 'mission' | 'history' | 'report' | 'treasures' | 'result' | 'more' | 'art';
  overlayReturn?: 'identity'|'treasures';
  earlyHistoryExpanded?: boolean;
  voteChoice?: boolean | 'abstain';
  missionChoice?: boolean;
  reportMission?: number;
  completedCount?: number;
  warning?: string;
}

export function syncGameUi(ui: GameUiState, room: RoomView, allowAutoReveal = true, userId?: string): void {
  const game = room.game;
  if (!game) { ui.snapshotKey = undefined; ui.draftKey = undefined; ui.selectedIds = []; ui.targetId = undefined; return; }
  const key = `${game.id}:${game.mission}:${game.captainId}:${game.phase}`;
  const changed = ui.snapshotKey !== key;
  if (changed) {
    ui.privateRoleVisible = Boolean(allowAutoReveal && room.settings.autoRevealRoleEnabled && game.phase === 'role_reveal' && game.self);
    ui.ballotVisible = false;
    ui.targetId = undefined;ui.treasureTargetsExpanded=false;
    ui.selectedIds = [];
    ui.direction = 'clockwise';
    ui.snapshotKey = key;
    ui.voteChoice = undefined; ui.missionChoice = undefined; ui.warning = undefined; ui.overlayReturn = undefined; ui.earlyHistoryExpanded = false;
    if(allowAutoReveal&&game.phase==='guanyin_window'&&game.self?.treasures?.guanyinMirror?.available)ui.privateRoleVisible=true;
    ui.overlay = game.phase==='guanyin_window'&&ui.privateRoleVisible?'treasures':ui.privateRoleVisible ? 'identity' : game.phase === 'team_vote' && game.self ? 'vote' : undefined;
  }
  const completed = game.rounds.filter(round => round.result).length;
  if (ui.completedCount !== undefined && completed > ui.completedCount && !game.result) { ui.overlay = 'report'; ui.reportMission = game.rounds.filter(round => round.result).at(-1)?.mission; }
  ui.completedCount = completed;
  const bell=game.self?.treasures?.incomingHeartBell;
  const bellKey=bell?`${game.id}:${bell.roundNumber}:${bell.mission}:${bell.advice}`:undefined;
  const mirror=game.self?.treasures?.guanyinMirror?.result;
  const mirrorKey=mirror?`${game.id}:${mirror.targetId}:${mirror.alignment}`:undefined;
  if(allowAutoReveal&&((bellKey&&ui.heartBellReadKey!==bellKey)||(mirrorKey&&ui.guanyinResultReadKey!==mirrorKey))){
    ui.privateRoleVisible=true;ui.overlay='treasures';ui.heartBellReadKey=bellKey;ui.guanyinResultReadKey=mirrorKey;
  }
  const submitted = game.phase === 'discussion' ? game.rounds.at(-1) : undefined;
  const draft = game.draftTeam ?? (submitted ? { playerIds: submitted.team, direction: submitted.direction } : undefined);
  const draftKey = draft ? JSON.stringify(draft) : '';
  if (changed || ui.draftKey !== draftKey) {
    ui.selectedIds = [...(draft?.playerIds ?? [])];
    ui.direction = draft?.direction ?? 'clockwise';
    ui.draftKey = draftKey;
  }
}

const phaseName: Record<GameView['phase'], string> = {
  dealing: '正在发牌', role_reveal: '查看身份', proposing: '队长提名', discussion: '商议队伍',
  team_vote: '表决队伍', mission: '执行任务', guanyin_window: '慈航照妖镜',
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
  if (ui.privateRoleVisible && room.settings.treasuresEnabled && game.players.length >= 8 && self?.treasures?.enabled) {
    const treasure = self.treasures;
    if (treasure.tinStaff) rows.push({ id: 'treasure:tinStaff', text: treasure.tinStaff.result
      ? `锡杖查验：${playerLabel(treasure.tinStaff.result.targetId)}属${treasure.tinStaff.result.team === 'red' ? '妖魔' : '取经'}阵营`
      : treasure.tinStaff.available ? '九环锡杖：选一名非候选仙友查验' : `九环锡杖：${treasure.tinStaff.used ? '已使用' : '完成两轮任务后可用'}` });
    if (treasure.guanyinMirror) rows.push({ id: 'treasure:guanyinMirror', text: treasure.guanyinMirror.result
      ? `观音镜查验：${playerLabel(treasure.guanyinMirror.result.targetId)}心性${treasure.guanyinMirror.result.alignment === 'evil' ? '妖魔' : '纯良'}`
      : treasure.guanyinMirror.available ? '观音镜：选一名出征队员查验' : `观音镜：${treasure.guanyinMirror.used ? '已使用' : '发车后可用'}` });
    if(treasure.guanyinMirror?.available&&game.phase==='guanyin_window')rows.push({id:'treasure:guanyinSkip',text:'跳过本次查验'});
    if(treasure.heartBell?.available)rows.push({id:'treasure:heartProtect',text:'同心铃 · 建议所选同伙护经'},{id:'treasure:heartSabotage',text:'同心铃 · 建议所选同伙作祟'});
    for(const [key,msg] of [['sent',treasure.heartBell?.sent],['incoming',treasure.incomingHeartBell]] as const)if(msg)rows.push({id:'treasure:bell-'+key,text:`同心铃 · 第${msg.mission}难 · ${msg.advice==='protect'?'建议护经':'建议作祟'} · ${msg.active?'仅私密建议，不改变出牌':'已过出牌时机，仅供回看'}`});
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
  if (game.phase === 'mission' && self && round?.team.includes(user.id) && !self.missionVoted) rows.push(
    { id:'mission-choice:success',text:(ui.missionChoice===true?'✓ ':'')+'任务成功' },
    { id:'mission-choice:fail',text:(ui.missionChoice===false?'✓ ':'')+'任务失败' },
    { id:'submitMission',text:ui.missionChoice===undefined?'请先点击选择【任务成功】或【任务失败】':ui.missionChoice?'✨ 确认提交【任务成功】':'🔥 确认提交【任务失败】' },
    ...(ui.warning?[{id:'error',text:ui.warning}]:[]),
  );
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
  if (game.phase === 'team_vote') ordered.push({ id: 'openVote', text: self?.teamVoted ? '查看表决进度' : '全员落印表决' });
  if (game.phase === 'mission' && self && round?.team.includes(user.id)) ordered.push({ id: 'openMission', text: self.missionVoted ? '任务牌已提交' : '祭出任务牌' });
  ordered.push({ id: 'history', text: '取经战况' }, { id: 'guide', text: '识妖谱' });
  const base: ScreenModel = { title: `房间 ${room.code}`, subtitle: `${game.players.length}人 · ${phaseName[game.phase]}`, rows: ordered,
    web: { page: 'table', room: { ...room, game: { ...game, self: undefined } }, user, selectedIds: ui.selectedIds, targetId: ui.targetId, missionChoice: ui.missionChoice, ownTeam:self?.team, warning:ui.warning } };
  if (game.phase === 'dealing') return { title: '即将发牌', rows: ordered.filter(row => ['dealCountdown', 'status'].includes(row.id)),
    web: { page: 'sheet', sheet: 'dealing', background: 'sword', backId: 'noop' } };
  return ui.overlay && ui.overlay!=='result' ? gameOverlayScreen(room, user, ui, base) : base;
}

export function handleGameOverlay(ui: GameUiState, room: RoomView, id: string): boolean {
  if(id==='treasureTargets'&&ui.overlay==='treasures'){ui.treasureTargetsExpanded=!ui.treasureTargetsExpanded;return true;}
  if(id.startsWith('player:'))ui.treasureTargetsExpanded=false;
  if (id === 'overlayClose') { ui.overlay = ui.overlayReturn; ui.overlayReturn = undefined; ui.privateRoleVisible = ui.overlay === 'identity' || ui.overlay === 'treasures'; ui.ballotVisible = false; ui.warning = undefined; return true; }
  if (id === 'identityArt' && ui.privateRoleVisible && room.game?.self) { ui.overlayReturn='identity'; ui.overlay='art'; return true; }
  if (id === 'earlyHistory') { ui.earlyHistoryExpanded=!ui.earlyHistoryExpanded; return true; }
  if (id === 'role') { ui.overlay = 'identity'; ui.privateRoleVisible = true; return true; }
  const overlays: Record<string, GameUiState['overlay']> = { openVote: 'vote', openMission: 'mission', history: 'history', treasures: 'treasures', more: 'more' };
  if (overlays[id]) { if(id==='treasures'&&ui.overlay==='identity')ui.overlayReturn='identity';else ui.overlayReturn=undefined; if(id==='history')ui.reportMission=undefined; ui.overlay = overlays[id]; ui.ballotVisible = id === 'openVote'; ui.privateRoleVisible = id === 'treasures'; return true; }
  if (id.startsWith('historyMission:')) { ui.reportMission=Number(id.slice(15)); ui.overlay='history'; return true; }
  if (id.startsWith('mission:')) { ui.reportMission = Number(id.slice(8)); ui.overlay = room.game?.rounds.some(r=>r.mission===ui.reportMission&&r.result)?'report':'history'; return true; }
  if (id.startsWith('vote-choice:') && room.game?.phase === 'team_vote' && room.game.self && !room.game.self.teamVoted) {
    ui.voteChoice = id.endsWith('approve') ? true : id.endsWith('reject') ? false : 'abstain'; return true;
  }
  if (id.startsWith('mission-choice:') && room.game?.phase === 'mission' && room.game.self && !room.game.self.missionVoted) {
    if (id.endsWith('fail') && room.game.self?.team === 'blue') { ui.warning = '⚠️ 蓝方（好人）阵营只能出成功牌，不可出失败牌'; ui.missionChoice = undefined; return true; }
    ui.missionChoice = !id.endsWith('fail'); ui.warning = undefined; return true;
  }
  return false;
}

function gameOverlayScreen(room: RoomView, user: User, ui: GameUiState, base: ScreenModel): ScreenModel {
  const game = room.game!, self = game.self;
  const name = (id: string) => { const player = game.players.find(item => item.id === id); return player ? `${player.seat}号 ${player.nickname}` : '未知成员'; };
  const round = game.rounds.at(-1);
  let title = '', rows: ScreenModel['rows'] = [], portrait: string | undefined;
  if (ui.overlay === 'identity' && self && ui.privateRoleVisible) {
    title = '我的身份法相';
    portrait = (self.loyalGuardian ? self.loyalGuardian + '-loyal' : self.femaleDemon ? 'minion-' + self.femaleDemon : self.role) + '-160.webp';
    const description = roleDescriptions[self.role];
    rows = [{ id: 'role-name', text: formatRoleName(self.role, self.loyalGuardian, self.femaleDemon) + ' · ' + (self.team === 'blue' ? '取经正果' : '群妖乱道') },
      { id: 'role-ability', text: '身份能力：' + description.ability }, { id: 'role-visibility', text: '身份关联：' + description.visibility },
      ...base.rows.filter(row => row.id === 'clue' || row.id === 'evil' || row.id.endsWith('Candidates') || row.id.startsWith('inspection:')),
      { id: 'role-tip', text: '取经锦囊：' + description.tip }, { id: 'treasures', text: '专属法宝与神兵' },
      ...base.rows.filter(row => ['confirmRole','confirmInspection','earlyAttempt','earlySkip'].includes(row.id))];
  } else if (ui.overlay === 'vote') {
    title = '出征组队表决';
    rows = [{ id: 'notice', text: `第${game.mission}难 · ${WUYUE_MISSIONS[game.mission - 1]?.subtitle ?? ''}` },
      { id: 'team', text: '领队：' + name(game.captainId) + '\n出征阵容：' + (round?.team.map(name).join('、') ?? '') },
      { id: 'guide:vote-rule', text: '准行多于封驳即准予出征；平票或全员旁观记为流局。' },
      ...(!self?.teamVoted ? [
        { id: 'vote-choice:approve', text: (ui.voteChoice === true ? '✓ ' : '') + '准行' },
        { id: 'vote-choice:reject', text: (ui.voteChoice === false ? '✓ ' : '') + '封驳' },
        { id: 'vote-choice:abstain', text: (ui.voteChoice === 'abstain' ? '✓ ' : '') + '旁观' },
        { id: 'submitVote', text: ui.voteChoice === undefined ? '请先选择落印' : '确认落印 · 不可更改' },
      ] : [{ id: 'submitted', text: '你已落印，等待其余仙友' }]),
      { id: 'progress', text: `已落印 ${game.progress.teamVotes}/${game.players.length}` },
      ...game.players.map(player => ({ id: 'ballot:' + player.id, text: name(player.id) + ' · ' + (game.teamVote?.votedIds.includes(player.id) ? '已落印' : '待落印') })),
      { id: 'history', text: '往难前情 · 查看历史' }];
  } else if (ui.overlay === 'mission') {
    title = '取经出征 · 任务牌';
    rows = [{ id: 'team', text: '出征阵容：' + (round?.team.map(name).join('、') ?? '') },
      { id: 'guide:mission-rule', text: `本轮需${game.failuresRequired}张失败牌才失败；任务牌始终匿名。` },
      ...(!self?.missionVoted ? [{ id: 'mission-choice:success', text: (ui.missionChoice === true ? '✓ ' : '') + '取经成功' },
        { id: 'mission-choice:fail', text: (ui.missionChoice === false ? '✓ ' : '') + '阻断取经' },
        { id: 'submitMission', text: ui.missionChoice === undefined ? '请先选择任务牌' : '确认出牌 · 不可更改' }] : [{ id: 'submitted', text: '任务牌已提交，等待其余队员' }]),
      ...(ui.warning ? [{ id: 'error', text: ui.warning }] : [])];
  } else if (ui.overlay === 'treasures') {
    title = '专属法宝与神兵';
    const t=self?.treasures;
    const targetIds=new Set<string>();
    if(t?.tinStaff?.available)game.players.filter(p=>p.id!==user.id&&!self?.merlinCandidates.includes(p.id)).forEach(p=>targetIds.add(p.id));
    if(t?.guanyinMirror?.available)game.rounds.at(-1)?.team.filter(id=>id!==user.id).forEach(id=>targetIds.add(id));
    if(t?.humanBag?.available)game.players.filter(p=>p.id!==game.captainId).forEach(p=>targetIds.add(p.id));
    t?.heartBell?.available&&t.heartBell.targetIds.forEach(id=>targetIds.add(id));
    if(base.rows.some(r=>['earlyAttempt','assassinate'].includes(r.id)))game.players.filter(p=>p.id!==user.id&&!self?.evilIds.includes(p.id)).forEach(p=>targetIds.add(p.id));
    rows = self?.treasures?.disabledReason === 'guardian_perks'
      ? [{ id: 'treasure-disabled', text: GUARDIAN_TREASURE_DISABLED_REASON }]
      : [...base.rows.filter(row => row.id.startsWith('treasure:') || ['earlyAttempt', 'earlySkip', 'assassinate'].includes(row.id)),
        ...game.players.filter(player => targetIds.has(player.id)).map(player => ({ id: 'player:' + player.id, text: name(player.id) + (ui.targetId === player.id ? ' · 已选目标' : '') }))];
    if (!rows.length) rows.push({ id: 'empty', text: '本局未开启专属法宝或当前尚未解锁。' });
  } else if (ui.overlay === 'more') {
    title = '法坛工具';
    rows = base.rows.filter(row => ['endGame', 'requestAbort', 'approveAbort', 'rejectAbort', 'chat', 'guide', 'rematch'].includes(row.id));
  } else {
    title = ui.overlay === 'result' ? '本局功果' : ui.overlay === 'report' ? `第${ui.reportMission}难 · 取经战报` : '取经战况';
    const rounds = ui.overlay === 'report' ? game.rounds.filter(item => item.mission === ui.reportMission) : game.rounds;
    rows = rounds.flatMap(item => [
      { id: 'replay:round:' + item.number, text: `第${item.mission}难 · 第${item.number}次组队\n领队：${name(item.captainId)}\n出征：${item.team.map(name).join('、')}` },
      ...(item.vote ? [{ id: 'replay:vote:' + item.number, text: `准行${item.vote.approvals} · 封驳${item.vote.rejections} · 旁观${item.vote.abstentions ?? 0} · ${item.vote.passed ? '通过' : '流局'}` }] : []),
      ...(!room.settings.anonymousTeamVote&&item.vote?.ballots?Object.entries(item.vote.ballots).map(([id,ballot])=>({id:'replay:ballot:'+item.number+':'+id,text:name(id)+' · '+(ballot==='abstain'?'旁观':ballot?'准行':'封驳')})):[]),
      ...(item.result ? [{ id: 'replay:mission:' + item.number, text: `任务${item.result.passed ? '成功' : '失败'} · 成功牌${item.result.successes} / 失败牌${item.result.failures}` }] : []),
    ]);
    if (!rows.length) rows.push({ id: 'empty', text: '这一难尚无组队记录' });
    if (ui.overlay === 'result') rows.unshift(...base.rows.filter(row => row.id === 'result' || row.id.startsWith('revealed:') || row.id === 'rematch'));
  }
  const kind = ui.overlay === 'more' ? 'tools' : ui.overlay === 'mission' ? 'history' : ui.overlay === 'result' ? 'history' : ui.overlay!;
  const underlay = ui.overlayReturn === 'identity' && ui.overlay !== 'identity'
    ? gameOverlayScreen(room,user,{...ui,overlay:'identity',overlayReturn:undefined,privateRoleVisible:true},base) : base;
  return { title, rows, portrait, web: { page:'sheet',sheet:ui.overlay,targetId:ui.targetId,background:ui.overlay==='identity'?'mirror':game.phase==='finished'?'dawn':'sword',backId:'overlayClose',underlay,
    document: {kind,modal:true,treasureTargetsExpanded:ui.treasureTargetsExpanded,game:{...game,self:undefined},...(ui.privateRoleVisible && ['identity','treasures','art'].includes(ui.overlay??'')?{self}:{}),user,
      roleItem:ui.overlay==='art'&&self?getRoleGalleryItem(self.role,self.loyalGuardian,self.femaleDemon):undefined,
      voteChoice:ui.voteChoice,submitted:self?.teamVoted,earlyHistoryExpanded:ui.earlyHistoryExpanded,reportMission:ui.reportMission} } };

}

export function gameAction(room: RoomView, user: User, action: string, ui: Partial<GameUiState> = {}): Command | undefined {
  if (action === 'submitVote') return ui.voteChoice === undefined ? undefined : gameAction(room, user, ui.voteChoice === 'abstain' ? 'abstain' : ui.voteChoice ? 'approve' : 'reject', ui);
  if (action === 'submitMission') return ui.missionChoice === undefined ? undefined : gameAction(room, user, ui.missionChoice ? 'missionSuccess' : 'missionFail', ui);
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
  if (ui.privateRoleVisible && self?.canDecideEarly && !['dealing', 'role_reveal', 'assassination', 'finished', 'aborted'].includes(game.phase)
    && (action === 'earlyAttempt' || action === 'earlySkip' && game.phase === 'early_window'))
    command = { type: 'earlyAssassinationDecision', payload: { attempt: action === 'earlyAttempt' } };
  if (action === 'assassinate' && game.phase === 'assassination' && self?.role === 'assassin' && ui.targetId && ui.targetId !== user.id) command = { type: 'assassinate', payload: { targetId: ui.targetId } };
  const treasures = self?.treasures;
  if (action.startsWith('treasure:') && ui.privateRoleVisible && room.settings.treasuresEnabled && game.players.length >= 8 && self && treasures?.enabled) {
    const targetId = ui.targetId;
    const validTarget = Boolean(targetId && game.players.some(player => player.id === targetId) && targetId !== user.id);
    if (action === 'treasure:tinStaff' && treasures.tinStaff?.available && validTarget && !self.merlinCandidates.includes(targetId!))
      command = { type: 'useTreasure', payload: { action: 'tinStaff', targetId: targetId! } };
    if (action === 'treasure:guanyinMirror' && treasures.guanyinMirror?.available && validTarget && round?.team.includes(targetId!))
      command = { type: 'useTreasure', payload: { action: 'guanyinMirror', targetId: targetId! } };
    if(action==='treasure:guanyinSkip'&&treasures.guanyinMirror?.available&&game.phase==='guanyin_window')command={type:'useTreasure',payload:{action:'guanyinMirror',skip:true}};
    if(['treasure:heartProtect','treasure:heartSabotage'].includes(action)&&treasures.heartBell?.available&&validTarget&&treasures.heartBell.targetIds.includes(targetId!))command={type:'useTreasure',payload:{action:'heartBell',targetId:targetId!,advice:action==='treasure:heartProtect'?'protect':'sabotage'}};
    if (action === 'treasure:humanBag' && treasures.humanBag?.available && targetId && game.players.some(p=>p.id===targetId) && targetId !== game.captainId)
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
