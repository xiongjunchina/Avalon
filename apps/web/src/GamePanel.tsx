import { PrivateExtensions, ExtensionStep, ExtensionHistory } from './Extensions';
import { useEffect, useRef, useState } from 'react';
import type { Command, GameView, Player, RoomView, RoundView } from '@avalon/contracts';
import { ROLE_CONFIG, assignFemaleDemons, assignLoyalGuardians, failuresRequiredFor } from '@avalon/game-core';
import { Emblem, PlayerAvatar, WuYueBackdrop, roleTeam, CloudFlourish, DragonPlinthDecor } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { WUYUE_MISSIONS, formatRoleName, roleNames } from './roles';
import { DealCountdown } from './DealCountdown';
import { QuestMedallion } from './QuestMedallion';
import { BattleHistory } from './BattleRound';
import { TeamVoteDialog } from './TeamVoteDialog';
import { MissionReportDialog } from './MissionReportDialog';
import { PartyBanner } from './PlayerToken';
import { Modal } from './Modal';
import { IdentityDetails } from './IdentityDetails';
import type { EffectCue } from './audio-events';
export { roleNames } from './roles';

const phaseNames: Record<GameView['phase'], string> = {
  dealing: '即将发牌',
  role_reveal: '查看身份',
  proposing: '队长组队',
  discussion: '真假论道',
  team_vote: '组队表决',
  mission: '取经出征',
  lady: '照妖宝镜查验',
  lady_reveal: '确认查验结果',
  early_window: '轮间确认中',
  assassination: '刺杀孙悟空',
  finished: '本局结束',
  aborted: '本局中断',
};

const reasons: Record<string, string> = {
  three_failures: '三次取经任务失败',
  five_rejections: '累计五次组队未通过',
  merlin_found: '红孩儿刺中了孙悟空',
  merlin_survived: '孙悟空躲过了刺杀',
  early_merlin_found: '提前刺杀命中孙悟空',
  early_merlin_survived: '提前刺杀未命中孙悟空',
  unanimous_abort: '在线成员一致同意中断',
  host_ended: '房主结束游戏',
  offline_timeout: '全员离线超过 24 小时',
};

export function GamePanel({
  room,
  userId,
  disabled,
  connected,
  send,
  onOpenGuide,
  onOpenReplay,
  onSound,
}: {
  room: RoomView;
  userId: string;
  disabled: boolean;
  connected: boolean;
  send: (action: Pick<Command, 'type' | 'payload'>) => void;
  onOpenGuide?: () => void;
  onOpenReplay?: (gameId: string) => void;
  onSound?: (cue: EffectCue) => void;
}) {
  const g = room.game!;
  const self = g.self;
  const round = g.rounds.at(-1);
  const ended = !!g.result;
  const [identityOpen, setIdentityOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectMission, setInspectMission] = useState<number | null>(null);
  const selected = g.phase === 'discussion' ? round?.team ?? [] : g.draftTeam?.playerIds ?? [];
  const direction = g.phase === 'discussion' ? round?.direction ?? 'clockwise' : g.draftTeam?.direction ?? 'clockwise';
  const setSelected = (update: (ids: string[]) => string[]) => send({ type: 'updateTeamDraft', payload: { playerIds: update(selected), direction } });
  const setDirection = (value: 'clockwise' | 'counterclockwise') => send({ type: 'updateTeamDraft', payload: { playerIds: selected, direction: value } });
  const [voteDismissed, setVoteDismissed] = useState(false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [blueFailWarning, setBlueFailWarning] = useState(false);
  const [target, setTarget] = useState('');
  const [abortConfirm, setAbortConfirm] = useState(false);
  const completedMissions = g.rounds.filter(r => r.result);
  const lastCompletedRound = completedMissions.at(-1);
  const [missionReportRound, setMissionReportRound] = useState<RoundView | null>(null);
  const prevCompletedCountRef = useRef<number | null>(null);


  useEffect(() => {
    if (prevCompletedCountRef.current === null) {
      prevCompletedCountRef.current = completedMissions.length;
      return;
    }
    if (completedMissions.length > prevCompletedCountRef.current && lastCompletedRound) {
      prevCompletedCountRef.current = completedMissions.length;
      setMissionReportRound(lastCompletedRound);
    }
  }, [completedMissions.length, lastCompletedRound]);


  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== 'visible') setIdentityOpen(false);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  useEffect(() => {
    if (!connected) setIdentityOpen(false);
  }, [connected]);

  useEffect(() => {
    setVoteDismissed(false);
    setChoice(null);
    setBlueFailWarning(false);
    setTarget('');
    setIdentityOpen(false);
  }, [g.id, g.phase, round?.number]);

  const abortRequester = g.abortPoll?.requestedBy;
  useEffect(() => {
    setAbortConfirm(Boolean(abortRequester));
    if (abortRequester) {
      setIdentityOpen(false);
      setHistoryOpen(false);
      setInspectMission(null);
    }
  }, [g.id, abortRequester, room.hostId, userId]);

  const name = (id: string) => {
    const p = g.players.find(p => p.id === id);
    return p ? `${p.seat} 号 ${p.nickname}${id === userId ? '（你）' : ''}` : '未知成员';
  };
  const names = (ids: string[]) => ids.map(name).join('、');
  const publicPlayers = g.players.map(p => ({ ...room.members.find(m => m.id === p.id), ...p }));
  const captain = g.captainId === userId;
  const captainPlayer = g.players.find(p => p.id === g.captainId);
  const size = g.missionSizes[g.mission - 1];
  const identityVisible = identityOpen && connected;
  const successes = g.rounds.filter(r => r.result?.passed).length;
  const failures = g.rounds.filter(r => r.result && !r.result.passed).length;
  const redCount = (ROLE_CONFIG[g.players.length] ?? []).filter(r => roleTeam(r) === 'red').length;
  const effectivePhase: GameView['phase'] =
    g.phase === 'role_reveal' ? 'proposing' : g.phase;
  const assassinPlayer = g.assassinId ? g.players.find(p => p.id === g.assassinId) : undefined;

  const speakingOrder = () => {
    const start = g.players.findIndex(p => p.id === g.captainId);
    const delta = round?.direction === 'counterclockwise' ? -1 : 1;
    return g.players.map((_, i) => g.players[(start + delta * i + g.players.length) % g.players.length].id);
  };

  if (g.phase === 'dealing') {
    return <DealCountdown deadline={g.dealEndsAt} serverTime={room.serverTime} connected={connected} onTick={() => onSound?.('tick')} />;
  }

  const needsIdentityAction =
    !ended && Boolean(self?.canConfirmInspection);

  // Only compute and display team vote status during active team voting or immediately upon mission resolution.
  // CRITICAL FIX: During 'proposing' and 'discussion', no vote has taken place on the new proposed team.
  // Historical ballots from previous missions must NEVER bleed into the new proposal!
  const voteStatusMap: Record<string, { label: string; icon: string; className: string; text: string }> = {};

  if (!ended && effectivePhase === 'team_vote') {
    g.players.forEach(p => {
      const hasVotedInLiveVote = Boolean(g.teamVote?.votedIds?.includes(p.id));
      const liveBallot =
        !room.settings.anonymousTeamVote
          ? g.teamVote?.ballots?.[p.id]
          : undefined;
      if (liveBallot !== undefined) {
        voteStatusMap[p.id] = {
          className:
            liveBallot === 'abstain'
              ? 'chip-abstain'
              : liveBallot
                ? 'chip-approve'
                : 'chip-reject',
          label:
            liveBallot === 'abstain'
              ? '− 旁观'
              : liveBallot
                ? '✓ 准行'
                : '× 封驳',
          icon:
            liveBallot === 'abstain'
              ? '−'
              : liveBallot
                ? '✓'
                : '×',
          text:
            liveBallot === 'abstain'
              ? '旁观'
              : liveBallot
                ? '准行'
                : '封驳',
        };
      } else if (hasVotedInLiveVote) {
        voteStatusMap[p.id] = { className: 'chip-approve', label: '✓ 已落印', icon: '✓', text: '已投' };
      } else {
        voteStatusMap[p.id] = { className: 'chip-pending', label: '⏳ 待落印', icon: '⏳', text: '待投' };
      }
    });
  } else if (!ended && effectivePhase === 'mission' && round?.vote?.ballots && !room.settings.anonymousTeamVote) {
    g.players.forEach(p => {
      const b = round.vote?.ballots?.[p.id];
      if (b !== undefined) {
        voteStatusMap[p.id] = {
          className:
            b === 'abstain'
              ? 'chip-abstain'
              : b
                ? 'chip-approve'
                : 'chip-reject',
          label:
            b === 'abstain'
              ? '− 旁观'
              : b
                ? '✓ 准行'
                : '× 封驳',
          icon:
            b === 'abstain'
              ? '−'
              : b
                ? '✓'
                : '×',
          text:
            b === 'abstain'
              ? '旁观'
              : b
                ? '准行'
                : '封驳',
        };
      }
    });
  }

  function handleSeatTap(playerId: string) {
    if (disabled) return;
    if (['proposing', 'discussion'].includes(effectivePhase) && captain) {
      setSelected(ids =>
        ids.includes(playerId)
          ? ids.filter(id => id !== playerId)
          : ids.length < size
            ? [...ids, playerId]
            : ids
      );
      return;
    }
    if (g.phase === 'lady' && self?.canInspect && !g.lady?.holderIds.includes(playerId)) {
      setTarget(prev => (prev === playerId ? '' : playerId));
      return;
    }
    if (g.phase === 'assassination' && self?.role === 'assassin' && playerId !== userId) {
      setTarget(prev => (prev === playerId ? '' : playerId));
    }
  }

  const missionRounds = inspectMission
    ? g.rounds.filter(r => r.mission === inspectMission)
    : [];
  const revealedLoyalGuardians = g.revealedRoles
    ? assignLoyalGuardians(g.id, g.players, g.revealedRoles)
    : {};
  const revealedFemaleDemons = g.revealedRoles
    ? assignFemaleDemons(g.id, g.players, g.revealedRoles)
    : {};

  return (
    <div className="game table-game-screen" data-sound="tap" data-phase={effectivePhase} data-player-count={g.players.length}>
      {/* 1. Physical Board-Game Style Quest & Vote Track Board */}
      <div className="avalon-quest-board" data-sound="page">
        {/* Top Row: 5 Large Circular Quest Medallions (Clickable to inspect that mission's team & vote history) */}
        <div className="game-score quest-circles-row" aria-label="任务进度（点击对应任务查看组队与投票记录）">
          {g.missionSizes.map((count, i) => {
            const missionNum = i + 1;
            const missionProposals = g.rounds.filter(r => r.mission === missionNum);
            const result = missionProposals.find(r => r.result)?.result;
            const isCurrent = !ended && g.phase !== 'assassination' && missionNum === g.mission;
            const twoFailsRequired = failuresRequiredFor(g.players.length, missionNum) >= 2;
            return (
              <QuestMedallion
                key={missionNum}
                mission={missionNum}
                count={count}
                current={isCurrent}
                passed={result?.passed}
                twoFailsRequired={twoFailsRequired}
                onInspect={() => {
                  const settled = missionProposals.find(r => r.result);
                  if (settled) {
                    setMissionReportRound(settled);
                  } else {
                    setInspectMission(missionNum);
                  }
                }}
              />
            );
          })}
        </div>

        {/* Bottom Row of Quest Board: Compact Imperial Summary Track matching Scheme A-2 */}
        <div className="quest-vote-track-zone" aria-label={`护经进度：${successes}胜${failures}负，流局${g.rejectionCount}/5`}>
          <span className="quest-summary-item">⚔ 护经 <strong>{successes}:{failures}</strong> 群妖</span>
          <span className="quest-summary-divider">◇</span>
          <span className="quest-summary-item">♨ 流局 <strong>{g.rejectionCount}/5</strong></span>
          <span className="quest-summary-divider">◇</span>
          <span className="quest-summary-item">👥 <strong>{g.players.length}</strong>人局</span>
        </div>
      </div>

      {/* 2. Hybrid Scheme A: Scheme 3 Ink Ribbon + Scheme 6 Captain & Team Formation Spotlight Banner */}
      {ended && g.result ? (
        (() => {
          const myRevealedRole = g.revealedRoles?.[userId] ?? self?.role;
          const myLoyalGuardian = revealedLoyalGuardians[userId] ?? self?.loyalGuardian;
          const myTeam = myRevealedRole ? roleTeam(myRevealedRole) : self?.team;
          const winnerTeam = g.result.winner;
          const isPersonalWin = winnerTeam && myTeam ? winnerTeam === myTeam : null;
          const targetRole =
            g.result.targetId && g.revealedRoles ? g.revealedRoles[g.result.targetId] : undefined;
          const targetLoyalGuardian = g.result.targetId ? revealedLoyalGuardians[g.result.targetId] : undefined;
          const bluePlayers = g.players.filter(
            p => g.revealedRoles?.[p.id] && roleTeam(g.revealedRoles[p.id]) === 'blue'
          );
          const redPlayers = g.players.filter(
            p => g.revealedRoles?.[p.id] && roleTeam(g.revealedRoles[p.id]) === 'red'
          );

          return (
            <section
              className={[
                'ended-hero-banner',
                isPersonalWin === true
                  ? 'outcome-victory'
                  : isPersonalWin === false
                    ? 'outcome-defeat'
                    : 'outcome-draw',
                winnerTeam === 'blue'
                  ? 'winner-blue'
                  : winnerTeam === 'red'
                    ? 'winner-red'
                    : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-live="polite"
            >
              <div className="ended-hero-top">
                <div className="ended-outcome-emblem" aria-hidden="true">
                  {isPersonalWin === true ? '🏆' : isPersonalWin === false ? '💔' : '⚖️'}
                </div>
                <div className="ended-outcome-titles">
                  <div className="ended-outcome-kicker">
                    {isPersonalWin === true
                      ? 'VICTORY · 你的阵营获胜'
                      : isPersonalWin === false
                        ? 'DEFEAT · 你的阵营落败'
                        : 'MATCH ABORTED · 本局中断'}
                  </div>
                  <h2 className="ended-outcome-headline">
                    {isPersonalWin === true
                      ? '本局胜利！'
                      : isPersonalWin === false
                        ? '本局失败'
                        : '本局不计胜负'}
                  </h2>
                </div>
                {myRevealedRole && (
                  <div className={`ended-my-role-pill team-${myTeam}`}>
                    <span>我的底牌</span>
                    <strong>
                      {formatRoleName(myRevealedRole, myLoyalGuardian)}（{myTeam === 'blue' ? '蓝方' : '红方'}）
                    </strong>
                  </div>
                )}
              </div>

              <div className="ended-verdict-strip">
                <span
                  className={`ended-winner-tag ${
                    winnerTeam === 'blue'
                      ? 'tag-blue'
                      : winnerTeam === 'red'
                        ? 'tag-red'
                        : 'tag-neutral'
                  }`}
                >
                  {winnerTeam
                    ? winnerTeam === 'blue'
                      ? '🛡️ 蓝方获胜'
                      : '🗡️ 红方获胜'
                    : '⚖️ 未分胜负'}
                </span>
                <p className="ended-verdict-reason">
                  {reasons[g.result.reason]}
                  {g.result.targetId
                    ? `，刺杀目标为 ${name(g.result.targetId)}${
                        targetRole ? `（${formatRoleName(targetRole, targetLoyalGuardian)}）` : ''
                      }`
                    : ''}
                  。
                </p>
              </div>

              {g.revealedRoles && (
                <div className="ended-factions-roster">
                  <div className="ended-faction-row faction-blue">
                    <span className="faction-row-label">
                      🛡️ 蓝方阵营 {winnerTeam === 'blue' ? '· 🏆胜' : ''}
                    </span>
                    <div className="faction-row-chips">
                      {bluePlayers.map(p => (
                        <span
                          key={p.id}
                          className={`faction-player-chip ${p.id === userId ? 'is-self' : ''} ${
                            g.result?.targetId === p.id ? 'is-target' : ''
                          }`}
                        >
                          {p.seat}号 {p.nickname} · <strong>{formatRoleName(g.revealedRoles![p.id], revealedLoyalGuardians[p.id], revealedFemaleDemons[p.id])}</strong>
                          {g.result?.targetId === p.id ? ' 🎯' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ended-faction-row faction-red">
                    <span className="faction-row-label">
                      🗡️ 红方阵营 {winnerTeam === 'red' ? '· 🏆胜' : ''}
                    </span>
                    <div className="faction-row-chips">
                      {redPlayers.map(p => (
                        <span
                          key={p.id}
                          className={`faction-player-chip ${p.id === userId ? 'is-self' : ''}`}
                        >
                          {p.seat}号 {p.nickname} · <strong>{formatRoleName(g.revealedRoles![p.id], revealedLoyalGuardians[p.id], revealedFemaleDemons[p.id])}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        })()
      ) : g.phase === 'assassination' && self?.role !== 'assassin' ? (
        <section className="assassination-waiting-stage" aria-live="polite">
          <div className="assassination-stage-glow" aria-hidden="true" />
          <div className="assassination-stage-emblem" aria-hidden="true">
            🗡️
          </div>
          <div className="assassination-stage-kicker">
            {g.assassinationMode === 'early'
              ? 'EARLY ASSASSINATION · 提前刺杀阶段'
              : 'FINAL ASSASSINATION · 终局刺杀孙悟空'}
          </div>
          <h2 className="assassination-stage-title">
            {g.assassinationMode === 'early'
              ? '红孩儿已发起提前刺杀！'
              : '蓝方已赢三场取经 · 进入刺杀阶段！'}
          </h2>
          {assassinPlayer && (
            <div className="assassination-identity-reveal">
              <div className="assassin-reveal-avatar">
                <RolePortrait role="assassin" size="mini" />
              </div>
              <div className="assassin-reveal-info">
                <span className="assassin-reveal-tag">🗡️ 本局刺客（红孩儿）身份已公开</span>
                <strong className="assassin-reveal-name">
                  {assassinPlayer.seat}号 {assassinPlayer.nickname}
                </strong>
                <small>正在催动三昧真火，锁定怀疑是「孙悟空」的目标…</small>
              </div>
            </div>
          )}
          <p className="assassination-stage-desc">
            {assassinPlayer
              ? `红孩儿（${assassinPlayer.seat}号 ${assassinPlayer.nickname}）正在选择怀疑是`
              : '红孩儿正在暗中锁定怀疑是'}
            <strong>「孙悟空」</strong>的玩家，一旦确认目标，全员将立即揭晓本局最终胜负！
          </p>
          <div className="assassination-stakes-grid">
            <div className="stake-card stake-blue">
              <strong>🛡️ 若孙悟空躲过刺杀</strong>
              <span>蓝方（取经正果）全员获胜</span>
            </div>
            <div className="stake-card stake-red">
              <strong>🗡️ 若红孩儿刺中孙悟空</strong>
              <span>红方（群妖乱道）绝地翻盘</span>
            </div>
          </div>
          <div className="assassination-waiting-pill" role="status">
            <span className="waiting-dot" aria-hidden="true" />
            {assassinPlayer
              ? `正在等待红孩儿（${assassinPlayer.seat}号 ${assassinPlayer.nickname}）做出最终刺杀决定…`
              : '正在等待红孩儿做出最终刺杀决定…'}
          </div>
        </section>
      ) : g.phase === 'assassination' && self?.role === 'assassin' ? (
        <section className="assassination-assassin-banner" aria-live="polite">
          <div className="assassin-banner-top">
            <span className="assassin-banner-icon" aria-hidden="true">
              🎯
            </span>
            <div>
              <div className="assassin-banner-kicker">
                {g.assassinationMode === 'early'
                  ? 'ASSASSIN TURN · 提前刺杀已启动'
                  : 'ASSASSIN TURN · 蓝方已完成三场取经'}
              </div>
              <h2 className="assassin-banner-title">你是红孩儿 · 请选择要刺杀的孙悟空目标</h2>
            </div>
          </div>
          <p className="assassin-banner-sub">
            点击下方玩家卡片锁定目标，再点底部<strong>「确认刺杀」</strong>：刺中孙悟空则红方全员胜利，刺错则蓝方全员胜利。
          </p>
        </section>
      ) : (
        (() => {
          const captainPlayer = g.players.find(p => p.id === g.captainId);
          const activeTeamIds =
            effectivePhase === 'proposing'
              ? selected
              : ['discussion', 'team_vote', 'mission'].includes(effectivePhase) && round
                ? round.team
                : [];

          const statusText =
            effectivePhase === 'proposing'
              ? '正在点将'
              : effectivePhase === 'discussion'
                ? '真假论道'
                : effectivePhase === 'team_vote'
                  ? `表决中 (${g.progress.teamVotes}/${g.players.length})`
                  : effectivePhase === 'mission'
                    ? `出征中 (${g.progress.missionVotes}/${activeTeamIds.length})`
                    : phaseNames[effectivePhase];

          return (
            <div className="scheme3-middle-zone">
              <h2 className="sr-only" aria-live="polite">
                {phaseNames[effectivePhase]}
              </h2>
              {/* Slim Game Status Bar (Lightweight Ink-and-Gold Ribbon) */}
              <div className="slim-game-status-bar" role="status">
                <span className="slim-status-ornament left" aria-hidden="true">
                  <CloudFlourish side="left" />
                </span>
                <div className="slim-status-content">
                  {effectivePhase === 'proposing' ? (
                    <p className="slim-status-text">
                      <span className="slim-status-captain">
                        👑 队长【{captainPlayer ? `${captainPlayer.seat}号 ${captainPlayer.nickname}` : ''}】
                      </span>
                      <span className="slim-status-divider">·</span>
                      <span className="slim-status-phase">
                        {selected.length === size ? (
                          <strong className="text-gold">已选齐 {size} 人 · 待确认提交</strong>
                        ) : (
                          <>正在点将（已选 <strong>{selected.length}</strong>/{size} 人）</>
                        )}
                      </span>
                    </p>
                  ) : effectivePhase === 'discussion' ? (
                    <p className="slim-status-text">
                      <span className="slim-status-captain">
                        🗣️ 论道中【{captainPlayer ? `${captainPlayer.seat}号 ${captainPlayer.nickname}` : ''}】
                      </span>
                      <span className="slim-status-divider">·</span>
                      <span className="slim-status-phase">阵容 {activeTeamIds.length}/{size} 人</span>
                    </p>
                  ) : effectivePhase === 'team_vote' ? (
                    <p className="slim-status-text">
                      <span className="slim-status-captain">⚖️ 出征表决</span>
                      <span className="slim-status-divider">·</span>
                      <span className="slim-status-phase">
                        已投 <strong>{g.progress.teamVotes}</strong>/{g.players.length} 人
                      </span>
                    </p>
                  ) : effectivePhase === 'mission' ? (
                    <p className="slim-status-text">
                      <span className="slim-status-captain">⚔️ 取经出征中</span>
                      <span className="slim-status-divider">·</span>
                      <span className="slim-status-phase">
                        已出牌 <strong>{g.progress.missionVotes}</strong>/{activeTeamIds.length} 人
                      </span>
                    </p>
                  ) : (
                    <p className="slim-status-text">
                      候任领队 <strong>{captainPlayer?.nickname ?? ''}</strong> · {phaseNames[effectivePhase]}
                    </p>
                  )}
                </div>
                <span className="slim-status-ornament right" aria-hidden="true">
                  <CloudFlourish side="right" />
                </span>
              </div>
            </div>
          );
        })()
      )}

      {/* 3. Scheme A: Dual-Flank Altar Arena (Hidden for non-assassins during assassination phase) */}
      {!(g.phase === 'assassination' && self?.role !== 'assassin') && (() => {
        const leftPlayers = g.players.filter((_, idx) => idx % 2 === 0);
        const rightPlayers = g.players.filter((_, idx) => idx % 2 === 1);

        const renderSeat = (p: Player, flank: 'left' | 'right') => {
          const member = room.members.find(m => m.id === p.id);
          const isCaptain = !ended && g.phase !== 'assassination' && p.id === g.captainId;
          const isNextCaptain = isCaptain && ['early_window', 'lady', 'lady_reveal'].includes(effectivePhase);
          const isLadyHolder = !ended && g.phase !== 'assassination' && g.lady?.holderId === p.id;
          const isProposed =
            !ended &&
            (effectivePhase === 'proposing'
              ? selected.includes(p.id)
              : ['discussion', 'team_vote', 'mission'].includes(effectivePhase) && Boolean(round?.team.includes(p.id)));
          const isTargeted =
            (g.phase === 'lady' || g.phase === 'assassination') && target === p.id;
          const canTapSeat =
            !disabled &&
            ((['proposing', 'discussion'].includes(effectivePhase) && captain) ||
              (g.phase === 'lady' && Boolean(self?.canInspect) && !g.lady?.holderIds.includes(p.id)) ||
              (g.phase === 'assassination' && self?.role === 'assassin' && p.id !== userId));
          const seatVoteChip = voteStatusMap[p.id] ?? null;
          const revealedRole = ended && g.revealedRoles ? g.revealedRoles[p.id] : undefined;
          const revealedTeam = revealedRole ? roleTeam(revealedRole) : undefined;
          const isWinnerSeat =
            ended && Boolean(g.result?.winner && revealedTeam && g.result.winner === revealedTeam);
          const isAssassinatedTarget = ended && g.result?.targetId === p.id;

          return (
            <div
              key={p.id}
              role={canTapSeat ? 'button' : undefined}
              tabIndex={canTapSeat ? 0 : undefined}
              aria-label={`${p.seat}号 ${p.nickname}${isCaptain ? '，队长' : ''}${isProposed ? '，已入阵' : ''}${isTargeted ? '，已锁定' : ''}`}
              aria-pressed={canTapSeat ? isProposed || isTargeted : undefined}
              onClick={() => canTapSeat && handleSeatTap(p.id)}
              onKeyDown={e => {
                if (canTapSeat && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  handleSeatTap(p.id);
                }
              }}
              className={[
                'table-seat-card',
                'flank-seat-card',
                flank === 'left' ? 'flank-seat-left' : 'flank-seat-right',
                p.id === userId ? 'is-me' : '',
                isCaptain ? 'is-captain' : '',
                isProposed ? 'is-on-team' : '',
                isTargeted ? 'is-targeted' : '',
                canTapSeat ? 'is-interactive' : '',
                ended ? 'is-ended-card' : '',
                revealedTeam ? `is-revealed-${revealedTeam}` : '',
                isWinnerSeat ? 'is-winner-seat' : '',
                isAssassinatedTarget ? 'is-assassinated-seat' : '',
                !ended && member?.online === false ? 'is-offline' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* 1. Avatar Container */}
              <div className="flank-avatar-wrap">
                {(isProposed || isCaptain) && (
                  <span
                    className={`seat-aura-ring ${isProposed ? 'aura-cyan' : 'aura-gold'}`}
                    aria-hidden="true"
                  />
                )}
                <div className="seat-card-avatar">
                  {revealedRole ? (
                    <RolePortrait role={revealedRole} loyalGuardian={revealedLoyalGuardians[p.id]} femaleDemon={revealedFemaleDemons[p.id]} size="mini" />
                  ) : (
                    <PlayerAvatar
                      avatar={member?.avatar}
                      avatarUrl={member?.avatarUrl}
                      wechatAvatarUrl={member?.wechatAvatarUrl}
                      fallbackKind="cards"
                    />
                  )}
                </div>
                <span
                  className={`seat-online-dot ${member?.online === false ? 'is-offline' : 'is-online'}`}
                  title={member?.online === false ? '离线' : '在线'}
                />
                {/* Floating role/captain badge over avatar */}
                {isCaptain && (
                  <span className={`seat-badge ${isNextCaptain ? 'badge-next-captain' : 'badge-captain'}`} title={isNextCaptain ? '候任领队' : '当前队长'}>
                    {isNextCaptain ? '👑 候任' : '👑 队长'}
                  </span>
                )}
                {isLadyHolder && (
                  <span className="seat-badge badge-lady" title="持有湖中女神（照妖宝镜）">
                    ☯️ 宝镜
                  </span>
                )}
                {isTargeted && (
                  <span className="seat-badge badge-assassinated">🎯 锁定</span>
                )}
                {ended && isWinnerSeat && (
                  <span className="seat-badge badge-winner">🏆 胜</span>
                )}
                {ended && isAssassinatedTarget && (
                  <span className="seat-badge badge-assassinated">🎯 被刺</span>
                )}
                {seatVoteChip && (
                  <span className={`seat-card-vote-badge ${seatVoteChip.className} flank-vote-chip`} title={seatVoteChip.text}>
                    {seatVoteChip.icon}
                  </span>
                )}
              </div>

              {/* 2. Horizontal Capsule Nameplate */}
              <div className="flank-nameplate">
                <span className="flank-seat-num">{p.seat}号</span>
                <span className="flank-name-sep">·</span>
                <span className="flank-nickname" title={name(p.id)}>
                  {p.nickname}
                </span>
                {p.id === userId && <span className="flank-me-pill">我</span>}
                {isProposed && <span className="flank-tag-proposed">⚔️</span>}
              </div>

              {/* Hidden interactive prompt for screen-readers & test assertions */}
              <div className="seat-card-bottom sr-only">
                {isProposed && <span className="seat-chip chip-team">已入阵</span>}
                {canTapSeat && (
                  <span className="seat-chip chip-hint">
                    {effectivePhase === 'proposing'
                      ? (isProposed ? '移出阵容' : '点击上车')
                      : effectivePhase === 'discussion'
                        ? (isProposed ? '移出阵容' : '点击入阵')
                        : g.phase === 'lady'
                          ? '点击查验'
                          : g.phase === 'assassination'
                            ? '🎯 刺杀'
                            : ''}
                  </span>
                )}
                {revealedRole ? (
                  <span className={`revealed-role allegiance-${roleTeam(revealedRole)}`}>
                    {roleTeam(revealedRole) === 'blue' ? '🛡️ ' : '🗡️ '}
                    {formatRoleName(revealedRole, revealedLoyalGuardians[p.id], revealedFemaleDemons[p.id])}
                  </span>
                ) : isTargeted ? (
                  <span className="seat-chip chip-target">
                    {g.phase === 'lady' ? '☯️ 查验' : '🗡️ 目标'}
                  </span>
                ) : null}
              </div>
            </div>
          );
        };

        return (
          <div
            className={`table-seats-grid ${
              g.players.length > 10 ? 'grid-12' : g.players.length > 8 ? 'grid-10' : 'grid-8'
            } altar-dual-flank-arena scheme-a-stage ${
              ended ? 'is-ended-grid' : g.phase === 'assassination' ? 'is-assassin-picker-grid' : ''
            }`}
            data-player-count={g.players.length}
            aria-label="对局座位表"
          >
            <div className="scheme-a-main-arena">
              <div className="scheme-a-flank flank-left">
                {leftPlayers.map(p => renderSeat(p, 'left'))}
              </div>

              {/* Central BaGua Altar Core (中央八卦伏魔台) */}
              <div className="scheme-a-center-altar" aria-hidden="true">
                <div className="altar-bagua-disc">
                  <span className="altar-core-taichi">☯</span>
                  <span className="altar-direction-tag">
                    {direction === 'clockwise' ? '⟳ 顺时针' : '⟲ 逆时针'}
                  </span>
                  <span className="altar-mission-tag">
                    第 {g.mission} 难
                  </span>
                </div>
              </div>

              <div className="scheme-a-flank flank-right">
                {rightPlayers.map(p => renderSeat(p, 'right'))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. Bottom Dynamic Action Dock */}
      <div className="table-action-dock">
        <ExtensionStep
          key={`${g.id}:${g.phase}:${g.rounds.length}`}
          game={g}
          disabled={disabled}
          name={name}
          send={send}
          selectedTarget={target}
          onSelectTarget={setTarget}
        />

        {effectivePhase === 'proposing' &&
          (captain ? (
            <form
              className="dock-panel dock-propose-form"
              onSubmit={e => {
                e.preventDefault();
                send({ type: 'proposeTeam', payload: { playerIds: selected, direction } });
              }}
            >
              <fieldset disabled={disabled} className="dock-propose-fieldset">
                <legend className="dock-rule-hint">
                  —◇ 可调整同行人，确认后进入讨论 ◇—
                </legend>
                <div className="team-picker sr-only">
                  {g.players.map(p => (
                    <label className="choice" key={p.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        disabled={!selected.includes(p.id) && selected.length >= size}
                        onChange={e =>
                          setSelected(ids =>
                            e.target.checked ? [...ids, p.id] : ids.filter(id => id !== p.id)
                          )
                        }
                      />
                      {name(p.id)}
                    </label>
                  ))}
                </div>
                <div className="dock-inline-controls">
                  <button
                    type="button"
                    className="btn-direction-toggle"
                    data-sound="tap"
                    aria-label={`发言方向：${direction === 'clockwise' ? '顺时针' : '逆时针'}，点击切换`}
                    onClick={() => setDirection(direction === 'clockwise' ? 'counterclockwise' : 'clockwise')}
                  >
                    {direction === 'clockwise' ? '顺时针发言' : '逆时针发言'}
                  </button>
                  <button
                    type="submit"
                    data-sound="confirm"
                    disabled={disabled || selected.length !== size}
                    className="btn-primary-cta btn-dragon-cta"
                  >
                    <span className="btn-cloud-flourish left" aria-hidden="true"><CloudFlourish side="left" /></span>
                    <span className="btn-cta-text">确认阵容 ({selected.length}/{size})</span>
                    <span className="btn-cloud-flourish right" aria-hidden="true"><CloudFlourish side="right" /></span>
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="dock-panel dock-panel-waiting">
              <div className="dock-waiting-hero">
                <span className="dock-waiting-icon" aria-hidden="true">⏳</span>
                <div className="dock-waiting-body">
                  <strong className="dock-waiting-title">候任静观 · 正在点将</strong>
                  <p className="dock-waiting-desc">
                    等待领队 <strong>{captainPlayer?.nickname}</strong> 钦点同行人，方案实时同步
                  </p>
                </div>
              </div>
            </div>
          ))}

        {g.phase === 'discussion' && (
          <div className="dock-panel">
            {captain && <p className="dock-rule-hint">—◇ 真假论道 · 点击头像可调整阵容 · 听取陈述后锁定发起表决 ◇—</p>}
            <p className="dock-compact-text" aria-label={`发言顺序：${names(speakingOrder())}`}>
              论道：{speakingOrder().map(id => g.players.find(p => p.id === id)?.seat).join('→')}
            </p>
            {captain ? (
              <button
                disabled={disabled || selected.length !== size}
                className="btn-primary-cta btn-dragon-cta"
                onClick={() => send({ type: 'startTeamVote', payload: {} })}
              >
                <span className="btn-cloud-flourish left" aria-hidden="true"><CloudFlourish side="left" /></span>
                <span className="btn-cta-text">
                  {selected.length === size
                    ? '锁定阵容 · 发起全员表决'
                    : `待补全人选（${selected.length}/${size}）`}
                </span>
                <span className="btn-cloud-flourish right" aria-hidden="true"><CloudFlourish side="right" /></span>
              </button>
            ) : (
              <div className="dock-waiting-hero">
                <span className="dock-waiting-icon" aria-hidden="true">🗣️</span>
                <div className="dock-waiting-body">
                  <strong className="dock-waiting-title">真假论道 · 各抒己见</strong>
                  <p className="dock-waiting-desc">领队可随时调整阵容并实时同步，论道完毕后锁定表决</p>
                </div>
              </div>
            )}
          </div>
        )}

        {g.phase === 'team_vote' && (
          <div className="dock-panel">
            <button className="btn-primary-cta btn-dragon-cta" onClick={() => setVoteDismissed(false)}>
              <span className="btn-cloud-flourish left" aria-hidden="true"><CloudFlourish side="left" /></span>
              <span className="btn-cta-text">🗳️ 打开组队表决 · {g.progress.teamVotes}/{g.players.length} 已投</span>
              <span className="btn-cloud-flourish right" aria-hidden="true"><CloudFlourish side="right" /></span>
            </button>
          </div>
        )}

        {g.phase === 'mission' && (
          <div className="dock-panel mission-vote-dock">
            <p className="dock-rule-hint" role="status">
              —◇ {g.failuresRequired === 2 ? '需至少 2 张失败牌，任务方告失败' : '只要出现 1 张失败牌，任务即失败'} ◇—
            </p>
            {!round!.team.includes(userId) ? (
              <p className="dock-waiting-desc">你未入本难出征队伍，请静候众仙取经结果。</p>
            ) : self?.missionVoted ? (
              <div className="mission-submitted-card" role="status">
                <span className="submitted-icon" aria-hidden="true">✓</span>
                <strong className="submitted-title">任务牌已暗中投出 · 静候全员结果</strong>
                <p className="submitted-desc">你已完成本轮出牌，全员出牌完毕后将揭晓任务吉凶。</p>
              </div>
            ) : (
              <form
                className="mission-vote-form"
                onSubmit={e => {
                  e.preventDefault();
                  if (choice !== null) send({ type: 'missionVote', payload: { success: choice } });
                }}
              >
                <fieldset disabled={disabled} className="ballot-controls mission-vote-fieldset">
                  <legend className="sr-only">私下选择任务牌，提交后不可更改</legend>

                  <div className="mission-cards-pair">
                    {/* Card 1: 任务成功 */}
                    <button
                      type="button"
                      className={`mission-card card-success ${choice === true ? 'is-selected' : ''}`}
                      onClick={() => {
                        setChoice(true);
                        setBlueFailWarning(false);
                      }}
                      aria-pressed={choice === true}
                    >
                      <div className="mission-card-inner">
                        <span className="mission-card-icon" aria-hidden="true">🪷</span>
                        <strong className="mission-card-title">任务成功</strong>
                        <span className="mission-card-desc">诚心助道 · 愿力圆满</span>
                        <span className="mission-card-status">
                          {choice === true ? '✓ 已选中' : '点击选择'}
                        </span>
                      </div>
                    </button>

                    {/* Card 2: 任务失败 */}
                    <button
                      type="button"
                      className={`mission-card card-fail ${choice === false ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (self?.team === 'blue') {
                          setBlueFailWarning(true);
                          setChoice(null);
                        } else {
                          setBlueFailWarning(false);
                          setChoice(false);
                        }
                      }}
                      aria-pressed={choice === false}
                    >
                      <div className="mission-card-inner">
                        <span className="mission-card-icon" aria-hidden="true">🔥</span>
                        <strong className="mission-card-title">任务失败</strong>
                        <span className="mission-card-desc">
                          {self?.team === 'blue' ? '蓝方阵营不可出失败牌' : '妖魔作祟 · 破坏任务'}
                        </span>
                        <span className="mission-card-status">
                          {choice === false ? '✓ 已选中' : '点击选择'}
                        </span>
                      </div>
                    </button>
                  </div>

                  {blueFailWarning && (
                    <div className="mission-blue-warning" role="alert">
                      ⚠️ 蓝方（好人）阵营只能出成功牌，不可出失败牌
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={choice === null}
                    aria-label="确认提交任务牌"
                    className={`btn-primary-cta btn-dragon-cta mission-submit-btn ${
                      choice === false ? 'is-fail-btn' : ''
                    }`}
                  >
                    <span className="btn-cloud-flourish left" aria-hidden="true"><CloudFlourish side="left" /></span>
                    <span className="btn-cta-text">
                      {choice === null
                        ? '请先点击选择【任务成功】或【任务失败】'
                        : choice === true
                          ? '✨ 确认提交【任务成功】'
                          : '🔥 确认提交【任务失败】'}
                    </span>
                    <span className="btn-cloud-flourish right" aria-hidden="true"><CloudFlourish side="right" /></span>
                  </button>
                </fieldset>
              </form>
            )}
          </div>
        )}

        {g.phase === 'assassination' && self?.role === 'assassin' && (
          <div className="dock-panel assassin-confirm-dock">
            <form
              onSubmit={e => {
                e.preventDefault();
                if (target) send({ type: 'assassinate', payload: { targetId: target } });
              }}
            >
              <fieldset disabled={disabled}>
                <label htmlFor="assassin-target" className="sr-only">
                  刺杀目标（确认后立即结算）
                </label>
                <div className="dock-inline-controls">
                  <select
                    id="assassin-target"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                  >
                    <option value="">请点击上方玩家卡片或下拉选择目标</option>
                    {g.players
                      .filter(p => p.id !== userId)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {name(p.id)}
                        </option>
                      ))}
                  </select>
                  <button className="assassin-execute-btn" disabled={!target}>
                    🔥 三昧真火 · 确认刺杀{target ? `：${name(target)}` : ''}
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        )}

        {g.result && (
          <section className="result-box dock-panel">
            <div className="result-summary-row">
              <div>
                <h3>
                  {g.result.winner
                    ? g.result.winner === 'blue'
                      ? '蓝方获胜'
                      : '红方获胜'
                    : '本局不计胜负'}
                </h3>
                <p>
                  {reasons[g.result.reason]}
                  {g.result.targetId ? `，目标为 ${name(g.result.targetId)}` : ''}。
                </p>
              </div>
              <div className="result-actions">
                {onOpenReplay && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onOpenReplay(g.id)}
                  >
                    查看完整复盘
                  </button>
                )}
                {room.hostId === userId ? (
                  <button disabled={disabled} onClick={() => send({ type: 'returnToLobby', payload: {} })}>
                    回到仙境等待区，再开一局
                  </button>
                ) : (
                  <span className="hint">等待房主返回等待区</span>
                )}
              </div>
            </div>
          </section>
        )}
        {/* Scheme A-2 Bottom 4-Action Utility Dock */}
        <div className="dock-utility-row">
          {!ended && self && (
            <section className="identity-box" aria-label="我的私密身份">
              <button
                type="button"
                className={`secondary tool-pill dock-utility-btn identity-trigger-btn ${needsIdentityAction ? 'pulse-action' : ''}`}
                disabled={!connected}
                aria-expanded={identityVisible}
                aria-label={self?.canConfirmInspection ? '私下查看我的身份（确认查验结果）' : '私下查看我的身份'}
                onClick={() => setIdentityOpen(v => !v)}
              >
                {identityVisible
                  ? '◇ 收起真身 ◇'
                  : self?.canConfirmInspection
                    ? '◇ 查验结果 ◇'
                    : '◇ 查验真身 ◇'}
              </button>
            </section>
          )}
          <button
            type="button"
            className="secondary tool-pill dock-utility-btn"
            data-sound="page"
            onClick={() => setHistoryOpen(v => !v)}
          >
            ◇ 取经录 ◇
          </button>
          {onOpenGuide && (
            <button type="button" className="secondary tool-pill dock-utility-btn" onClick={onOpenGuide}>
              ◇ 识妖谱 ◇
            </button>
          )}
          {!ended && (
            <button
              type="button"
              className="secondary tool-pill dock-utility-btn"
              disabled={disabled}
              aria-label={room.hostId === userId ? '结束游戏' : '申请中止游戏'}
              onClick={() => setAbortConfirm(true)}
            >
              ◇ 结束游戏 ◇
            </button>
          )}
        </div>

        <DragonPlinthDecor side="left" />
        <DragonPlinthDecor side="right" />
      </div>

      {g.phase === 'team_vote' && !voteDismissed && <TeamVoteDialog game={g} players={publicPlayers} anonymous={room.settings.anonymousTeamVote} userId={userId} serverTime={room.serverTime} disabled={disabled} send={send} onClose={() => setVoteDismissed(true)} />}
      {!ended && abortConfirm && (
        <Modal label={room.hostId === userId ? '结束游戏' : '申请中止游戏'} scene="sword" onClose={() => setAbortConfirm(false)}>
          <div className="table-modal-sheet">
            <div className="table-modal-head"><strong>{room.hostId === userId ? '结束游戏' : '申请中止游戏'}</strong><button type="button" className="secondary tool-pill" onClick={() => setAbortConfirm(false)}>返回对局</button></div>
            <p>结束后关闭本房间，所有玩家返回大厅；本局不计胜负。</p>
            {room.hostId === userId ? <>
              {g.abortPoll && <p role="status">{name(g.abortPoll.requestedBy)} 申请中止，请房主处理。</p>}
              <div className="action-pair">
                <button className="secondary" disabled={disabled} onClick={() => { if (g.abortPoll) send({type:'voteAbort',payload:{approve:false}}); setAbortConfirm(false); }}>继续游戏</button>
                <button disabled={disabled} onClick={() => send(g.abortPoll ? {type:'voteAbort',payload:{approve:true}} : {type:'endGame',payload:{}})}>{g.abortPoll ? '同意结束' : '结束游戏并关闭房间'}</button>
              </div>
            </> : g.abortPoll ? <p role="status">已提出中止申请，等待房主决定。</p> : <button disabled={disabled} onClick={() => send({type:'requestAbort',payload:{}})}>向房主申请中止</button>}
          </div>
        </Modal>
      )}

      {/* Private Identity Modal Overlay */}
      {!ended && self && identityVisible && (
        <Modal label="我的私密身份详情" scene="mirror" onClose={() => setIdentityOpen(false)}>
          <div className="table-modal-sheet identity-content">
            <div className="table-modal-head">
              <strong>真身法相底牌</strong>
              <button type="button" className="secondary tool-pill" onClick={() => setIdentityOpen(false)}>
                关闭底牌
              </button>
            </div>
            <div className="identity-body">
              <IdentityDetails self={self} players={publicPlayers} />
            <PrivateExtensions
              game={g}
              disabled={disabled}
              name={name}
              send={action => {
                setIdentityOpen(false);
                send(action);
              }}
            />
            </div>
            <footer className="identity-footer">
              <p title="身份仅你可见，切换页面或断线时会自动收起">出牌权限：{self.team === 'blue' ? '仅能护经（成功）' : '可护经（成功）/ 作祟（失败）'} · 离页自动收起</p>
              {!self.canConfirmInspection && <button type="button" onClick={() => setIdentityOpen(false)}>收起真身，返回对局</button>}
            </footer>
          </div>
        </Modal>
      )}

      {/* Settled Mission Report Modal (Auto-pops up upon mission completion or tapping completed mission circle) */}
      {missionReportRound && missionReportRound.result && (
        <MissionReportDialog
          round={missionReportRound}
          players={publicPlayers}
          anonymous={room.settings.anonymousTeamVote}
          userId={userId}
          onClose={() => setMissionReportRound(null)}
        />
      )}

      {/* Per-Mission Detail Modal (Triggered when tapping any of the 5 Mission Circles) */}
      {inspectMission !== null && (
        <Modal label={`任务 ${inspectMission} 组队与投票详情`} scene={ended ? 'dawn' : 'sword'} onClose={() => setInspectMission(null)}>
          <div className="table-modal-sheet battle-sheet" onClick={e => e.stopPropagation()}>
            <div className="table-modal-head">
              <strong>
                {WUYUE_MISSIONS[inspectMission - 1]?.title ?? `任务 ${inspectMission}`} 详情（需 {g.missionSizes[inspectMission - 1]} 人
                {failuresRequiredFor(g.players.length, inspectMission) === 2
                  ? ' · 2张失败牌才失败'
                  : ' · 1张失败牌即失败'}）
              </strong>
              <button type="button" className="secondary tool-pill" onClick={() => setInspectMission(null)}>
                返回法坛
              </button>
            </div>

            {/* Quick switcher between Mission 1..5 inside the modal */}
            <div className="mission-modal-tabs" data-sound="page">
              {g.missionSizes.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`secondary tool-pill ${inspectMission === idx + 1 ? 'pulse-action' : ''}`}
                  aria-pressed={inspectMission === idx + 1}
                  onClick={() => setInspectMission(idx + 1)}
                >
                  <WuYueBackdrop mission={idx + 1} />{WUYUE_MISSIONS[idx]?.shortLabel ?? `第${idx + 1}难`}
                </button>
              ))}
            </div>

            {missionRounds.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                {WUYUE_MISSIONS[inspectMission - 1]?.title ?? `任务 ${inspectMission}`} 尚未产生组队提案记录。
              </p>
            ) : (
              <BattleHistory rounds={missionRounds} players={publicPlayers} anonymous={room.settings.anonymousTeamVote} userId={userId} />
            )}
          </div>
        </Modal>
      )}

      {/* Full Battle Log / Rounds History Modal */}
      {historyOpen && (
        <Modal label="战况与提案记录" scene={ended ? 'dawn' : 'sword'} onClose={() => setHistoryOpen(false)}>
          <div className="table-modal-sheet battle-sheet" onClick={e => e.stopPropagation()}>
            <div className="table-modal-head">
              <strong>取经劫难全录（共 {g.rounds.length} 次提案）</strong>
              <button type="button" className="secondary tool-pill" onClick={() => setHistoryOpen(false)}>
                返回法坛
              </button>
            </div>
            {g.rounds.length === 0 ? (
              <p className="muted">尚无已完成的组队提案。</p>
            ) : (
              <BattleHistory rounds={g.rounds} players={publicPlayers} anonymous={room.settings.anonymousTeamVote} userId={userId} />
            )}
            <ExtensionHistory game={g} name={name} />
          </div>
        </Modal>
      )}
    </div>
  );
}
