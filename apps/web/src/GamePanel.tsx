import { PrivateExtensions, ExtensionStep, ExtensionHistory } from './Extensions';
import { useEffect, useState } from 'react';
import type { Command, GameView, RoomView } from '@avalon/contracts';
import { ROLE_CONFIG, failuresRequiredFor } from '@avalon/game-core';
import { Emblem, PlayerAvatar, WuYueBackdrop, roleTeam } from './Heraldry';
import { IdentityCard, RolePortrait } from './RolePortrait';
import { WUYUE_MISSIONS, roleNames } from './roles';
import { DealCountdown } from './DealCountdown';
export { roleNames } from './roles';

const phaseNames: Record<GameView['phase'], string> = {
  dealing: '即将发牌',
  role_reveal: '查看身份',
  proposing: '队长组队',
  discussion: '围桌论剑',
  team_vote: '组队表决',
  mission: '五岳会盟',
  lady: '少林明镜查验',
  lady_reveal: '确认查验结果',
  early_window: '轮间确认中',
  assassination: '刺杀风清扬',
  finished: '本局结束',
  aborted: '本局中断',
};

const reasons: Record<string, string> = {
  three_failures: '三次会盟任务失败',
  five_rejections: '累计五次组队未通过',
  merlin_found: '林平之刺中了风清扬',
  merlin_survived: '风清扬躲过了刺杀',
  early_merlin_found: '提前刺杀命中风清扬',
  early_merlin_survived: '提前刺杀未命中风清扬',
  unanimous_abort: '在线成员一致同意中断',
  offline_timeout: '全员离线超过 24 小时',
};

function QuestStarBadge({ kind }: { kind: 'blue' | 'red' }) {
  return (
    <svg className="quest-star-svg" viewBox="0 0 64 64" aria-hidden="true">
      {/* 8-point compass star */}
      <polygon
        points="32,3 38,21 57,15 43,29 61,32 43,35 57,49 38,43 32,61 26,43 7,49 21,35 3,32 21,29 7,15 26,21"
        fill={kind === 'blue' ? '#e7bf62' : '#d8c3a5'}
        stroke={kind === 'blue' ? '#8c6218' : '#6e4c36'}
        strokeWidth="1.5"
      />
      <circle
        cx="32"
        cy="32"
        r="14"
        fill={kind === 'blue' ? '#1c64b5' : '#a8181e'}
        stroke="#fff1cc"
        strokeWidth="1.8"
      />
      {kind === 'blue' ? (
        <path
          d="M26 36c2-6 5-9 6-13 1 4 4 7 6 13-3-2-9-2-12 0Z"
          fill="#f7d783"
        />
      ) : (
        <path
          d="M25 27l7 5 7-5-2 10H27l-2-10Z"
          fill="#f2d6c9"
        />
      )}
    </svg>
  );
}

export function GamePanel({
  room,
  userId,
  disabled,
  connected,
  send,
  onOpenGuide,
  onOpenReplay,
}: {
  room: RoomView;
  userId: string;
  disabled: boolean;
  connected: boolean;
  send: (action: Pick<Command, 'type' | 'payload'>) => void;
  onOpenGuide?: () => void;
  onOpenReplay?: (gameId: string) => void;
}) {
  const g = room.game!;
  const self = g.self;
  const round = g.rounds.at(-1);
  const ended = !!g.result;
  const [identityOpen, setIdentityOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectMission, setInspectMission] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [direction, setDirection] = useState<'clockwise' | 'counterclockwise'>('clockwise');
  const [choice, setChoice] = useState<boolean | null>(null);
  const [target, setTarget] = useState('');
  const [abortConfirm, setAbortConfirm] = useState(false);

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
    setSelected([]);
    setChoice(null);
    setTarget('');
    setAbortConfirm(false);
    setIdentityOpen(false);
  }, [g.id, g.phase, round?.number]);

  const name = (id: string) => {
    const p = g.players.find(p => p.id === id);
    return p ? `${p.seat} 号 ${p.nickname}${id === userId ? '（你）' : ''}` : '未知成员';
  };
  const names = (ids: string[]) => ids.map(name).join('、');
  const captain = g.captainId === userId;
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
    return <DealCountdown deadline={g.dealEndsAt} serverTime={room.serverTime} connected={connected} />;
  }

  const needsIdentityAction =
    !ended && Boolean(self?.canConfirmInspection);

  const lastVotedRound = [...g.rounds].reverse().find(r => r.vote?.ballots);

  function handleSeatTap(playerId: string) {
    if (disabled) return;
    if (effectivePhase === 'proposing' && captain) {
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

  return (
    <div className="game table-game-screen">
      {/* 1. Physical Board-Game Style Quest & Vote Track Board */}
      <div className="avalon-quest-board">
        {/* Top Row: 5 Large Circular Quest Medallions (Clickable to inspect that mission's team & vote history) */}
        <div className="game-score quest-circles-row" aria-label="任务进度（点击对应任务查看组队与投票记录）">
          {g.missionSizes.map((count, i) => {
            const missionNum = i + 1;
            const missionProposals = g.rounds.filter(r => r.mission === missionNum);
            const result = missionProposals.find(r => r.result)?.result;
            const isCurrent = !ended && g.phase !== 'assassination' && missionNum === g.mission;
            const twoFailsRequired = failuresRequiredFor(g.players.length, missionNum) >= 2;
            const stateClass = result
              ? result.passed
                ? 'mission-success'
                : 'mission-failure'
              : isCurrent
                ? 'mission-current'
                : 'mission-pending';

            const wuyue = WUYUE_MISSIONS[i];

            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-label={`查看任务 ${missionNum}（${wuyue?.title ?? ''}）组队与投票详情`}
                onClick={() => setInspectMission(missionNum)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setInspectMission(missionNum);
                  }
                }}
                className={`quest-medallion-wrap ${stateClass}`}
              >
                {twoFailsRequired && (
                  <span className="quest-two-fails-arch">需要2张失败卡</span>
                )}
                <div className="quest-circle">
                  <WuYueBackdrop mission={missionNum} />
                  {result ? (
                    <>
                      <QuestStarBadge kind={result.passed ? 'blue' : 'red'} />
                      <span className="quest-circle-top">{wuyue?.shortLabel ?? `任务 ${missionNum}`}</span>
                      <strong className="quest-result-label">
                        {result.passed ? '成功' : '失败'}
                      </strong>
                    </>
                  ) : (
                    <>
                      <span className="quest-circle-top">{wuyue?.shortLabel ?? `任务 ${missionNum}`}</span>
                      <strong className="quest-circle-num">{count}</strong>
                      <span className="sr-only">人</span>
                    </>
                  )}
                  <small className="sr-only">
                    {twoFailsRequired ? '失败 ≥2' : '失败 ≥1'}
                  </small>
                </div>

                {/* Bottom-Right Quest Shield Token (like the physical board) */}
                <span
                  className={`quest-token-socket ${isCurrent ? 'has-shield-token' : ''} ${
                    missionProposals.length > 0 ? 'has-records' : ''
                  }`}
                  title={isCurrent ? '当前会盟场次' : '点击查看本场记录'}
                >
                  {isCurrent ? '🛡️' : missionProposals.length > 0 ? `${missionProposals.length}次` : ''}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bottom Row of Quest Board: Compact Translucent Vote Track & Faction Pill */}
        <div className="quest-vote-track-zone">
          <div className="quest-vote-track-left">
            <div className="quest-track-head">
              <span className="quest-track-badge">流局轨</span>
              <span className="quest-track-sub">
                蓝 {successes} : 红 {failures} · 流局 {g.rejectionCount}/5
              </span>
              <span className="sr-only">
                投票次数记录（点击上方五岳会盟圆盘可查当轮票型）
              </span>
            </div>
            <div className="quest-vote-circles" aria-label="流局计数轨">
              {[1, 2, 3, 4, 5].map(step => {
                const isMarkerHere =
                  g.rejectionCount === step || (g.rejectionCount === 0 && step === 1);
                const isPassedRejection = step <= g.rejectionCount;
                return (
                  <div
                    key={step}
                    className={[
                      'quest-vote-spot',
                      step === 5 ? 'is-danger-fifth' : '',
                      isPassedRejection ? 'is-rejected-step' : '',
                      g.rejectionCount === step ? 'has-pouch-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="vote-spot-num">{step}</span>
                    {isMarkerHere && (
                      <span
                        className={`vote-pouch-token ${g.rejectionCount === 0 ? 'is-zero-ready' : 'is-counted'}`}
                        title={`当前流局 ${g.rejectionCount} / 5`}
                      >
                        🟣
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="quest-faction-plaque">
            <strong>{g.players.length}位玩家</strong>
            <span>{redCount}名日月暗影</span>
          </div>
        </div>
      </div>

      {/* 2. Hybrid Scheme A: Scheme 3 Ink Ribbon + Scheme 6 Captain & Team Formation Spotlight Banner */}
      {ended && g.result ? (
        (() => {
          const myRevealedRole = g.revealedRoles?.[userId] ?? self?.role;
          const myTeam = myRevealedRole ? roleTeam(myRevealedRole) : self?.team;
          const winnerTeam = g.result.winner;
          const isPersonalWin = winnerTeam && myTeam ? winnerTeam === myTeam : null;
          const targetRole =
            g.result.targetId && g.revealedRoles ? g.revealedRoles[g.result.targetId] : undefined;
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
                      {roleNames[myRevealedRole]}（{myTeam === 'blue' ? '蓝方' : '红方'}）
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
                        targetRole ? `（${roleNames[targetRole]}）` : ''
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
                          {p.seat}号 {p.nickname} · <strong>{roleNames[g.revealedRoles![p.id]]}</strong>
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
                          {p.seat}号 {p.nickname} · <strong>{roleNames[g.revealedRoles![p.id]]}</strong>
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
              : 'FINAL ASSASSINATION · 终局刺杀风清扬'}
          </div>
          <h2 className="assassination-stage-title">
            {g.assassinationMode === 'early'
              ? '林平之已发起提前刺杀！'
              : '蓝方已赢三场会盟 · 进入刺杀阶段！'}
          </h2>
          {assassinPlayer && (
            <div className="assassination-identity-reveal">
              <div className="assassin-reveal-avatar">
                <RolePortrait role="assassin" size="mini" />
              </div>
              <div className="assassin-reveal-info">
                <span className="assassin-reveal-tag">🗡️ 本局刺客（林平之）身份已公开</span>
                <strong className="assassin-reveal-name">
                  {assassinPlayer.seat}号 {assassinPlayer.nickname}
                </strong>
                <small>正在拔出辟邪剑，锁定怀疑是「风清扬」的目标…</small>
              </div>
            </div>
          )}
          <p className="assassination-stage-desc">
            {assassinPlayer
              ? `林平之（${assassinPlayer.seat}号 ${assassinPlayer.nickname}）正在选择怀疑是`
              : '林平之正在暗中锁定怀疑是'}
            <strong>「风清扬」</strong>的玩家，一旦确认目标，全员将立即揭晓本局最终胜负！
          </p>
          <div className="assassination-stakes-grid">
            <div className="stake-card stake-blue">
              <strong>🛡️ 若风清扬躲过刺杀</strong>
              <span>蓝方（正道同盟）全员获胜</span>
            </div>
            <div className="stake-card stake-red">
              <strong>🗡️ 若林平之刺中风清扬</strong>
              <span>红方（日月暗影）绝地翻盘</span>
            </div>
          </div>
          <div className="assassination-waiting-pill" role="status">
            <span className="waiting-dot" aria-hidden="true" />
            {assassinPlayer
              ? `正在等待林平之（${assassinPlayer.seat}号 ${assassinPlayer.nickname}）做出最终刺杀决定…`
              : '正在等待林平之做出最终刺杀决定…'}
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
                  : 'ASSASSIN TURN · 蓝方已完成三场会盟'}
              </div>
              <h2 className="assassin-banner-title">你是林平之 · 请选择要刺杀的风清扬目标</h2>
            </div>
          </div>
          <p className="assassin-banner-sub">
            点击下方玩家卡片锁定目标，再点底部<strong>「确认刺杀」</strong>：刺中风清扬则红方全员胜利，刺错则蓝方全员胜利。
          </p>
        </section>
      ) : (
        (() => {
          const captainPlayer = g.players.find(p => p.id === g.captainId);
          const captainMember = room.members.find(m => m.id === g.captainId);
          const activeTeamIds =
            effectivePhase === 'proposing'
              ? selected
              : ['discussion', 'team_vote', 'mission'].includes(effectivePhase) && round
                ? round.team
                : [];
          const slotBadges = ['⚔️', '🛡️', '🗡️', '🏹', '⚡', '🔥'];

          return (
            <div className="scheme3-middle-zone">
              {/* Scheme 3 Floating Ink-and-Gold Calligraphy Ribbon */}
              <div className="scheme3-ink-ribbon">
                <h2 className="sr-only" aria-live="polite">
                  {phaseNames[effectivePhase]}
                </h2>
                <span className="ink-ribbon-ornament" aria-hidden="true">
                  〰
                </span>
                <p className="ink-ribbon-text">
                  {effectivePhase === 'proposing' ? (
                    <>
                      盟主<strong>{captainPlayer?.nickname ?? ''}</strong> · 正在点将 ({activeTeamIds.length}/{size})
                    </>
                  ) : effectivePhase === 'discussion' ? (
                    <>
                      盟主<strong>{captainPlayer?.nickname ?? ''}</strong> · 围桌论剑 ({activeTeamIds.length}/{size})
                    </>
                  ) : effectivePhase === 'team_vote' ? (
                    <>
                      盟主<strong>{captainPlayer?.nickname ?? ''}</strong> · 组队表决 ({g.progress.teamVotes}/{g.players.length})
                    </>
                  ) : effectivePhase === 'mission' ? (
                    <>
                      <strong>{WUYUE_MISSIONS[g.mission - 1]?.title ?? '五岳会盟'}</strong> · 出征执行 ({g.progress.missionVotes}/{activeTeamIds.length})
                    </>
                  ) : (
                    <>
                      候任盟主<strong>{captainPlayer?.nickname ?? ''}</strong> · {phaseNames[effectivePhase]}
                    </>
                  )}
                </p>
                <span className="ink-ribbon-ornament" aria-hidden="true">
                  〰
                </span>
              </div>

              {/* Scheme 6 Horizontal Captain & Team Formation Spotlight Banner */}
              <div className="scheme6-team-spotlight" aria-label="当前盟主与会盟出征阵位">
                <div className="spotlight-captain-node">
                  <div className="spotlight-captain-ring">
                    <div className="spotlight-captain-avatar">
                      <PlayerAvatar
                        avatar={captainMember?.avatar}
                        avatarUrl={captainMember?.avatarUrl}
                        wechatAvatarUrl={captainMember?.wechatAvatarUrl}
                        fallbackKind="crown"
                      />
                    </div>
                    <span className="spotlight-captain-crest" aria-hidden="true">
                      ⚔️
                    </span>
                    <span className="spotlight-captain-pill">
                      {String(captainPlayer?.seat ?? 1).padStart(2, '0')}号 盟主
                    </span>
                  </div>
                  <strong className="spotlight-captain-title">
                    {captainPlayer?.nickname ?? '盟主'}
                  </strong>
                </div>

                <div className="spotlight-slots-track">
                  <div className="spotlight-energy-line" aria-hidden="true" />
                  {Array.from({ length: size }, (_, slotIdx) => {
                    const slotPlayerId = activeTeamIds[slotIdx];
                    const slotPlayer = slotPlayerId
                      ? g.players.find(p => p.id === slotPlayerId)
                      : undefined;
                    const slotMember = slotPlayerId
                      ? room.members.find(m => m.id === slotPlayerId)
                      : undefined;
                    const canRemoveFromSlot =
                      !disabled && effectivePhase === 'proposing' && captain && Boolean(slotPlayerId);

                    return (
                      <div
                        key={slotIdx}
                        role={canRemoveFromSlot ? 'button' : undefined}
                        tabIndex={canRemoveFromSlot ? 0 : undefined}
                        onClick={() => canRemoveFromSlot && slotPlayerId && handleSeatTap(slotPlayerId)}
                        onKeyDown={e => {
                          if (canRemoveFromSlot && slotPlayerId && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            handleSeatTap(slotPlayerId);
                          }
                        }}
                        className={`spotlight-team-slot ${slotPlayer ? 'is-filled' : 'is-empty'} ${
                          canRemoveFromSlot ? 'is-removable' : ''
                        }`}
                      >
                        <div className="spotlight-slot-ring">
                          {slotPlayer ? (
                            <div className="spotlight-slot-avatar">
                              <PlayerAvatar
                                avatar={slotMember?.avatar}
                                avatarUrl={slotMember?.avatarUrl}
                                wechatAvatarUrl={slotMember?.wechatAvatarUrl}
                                fallbackKind="cards"
                              />
                            </div>
                          ) : (
                            <span className="spotlight-slot-placeholder" aria-hidden="true">
                              +
                            </span>
                          )}
                          <span className="spotlight-slot-badge" aria-hidden="true">
                            {slotBadges[slotIdx % slotBadges.length]}
                          </span>
                        </div>
                        <span className="spotlight-slot-label">
                          {slotPlayer
                            ? `${String(slotPlayer.seat).padStart(2, '0')}号`
                            : `阵位0${slotIdx + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* 3. Scheme 3 Floating Circular Player Avatar Grid (Hidden for non-assassins during assassination phase) */}
      {!(g.phase === 'assassination' && self?.role !== 'assassin') && (
        <div
          className={`table-seats-grid ${
            g.players.length > 10 ? 'grid-12' : g.players.length > 8 ? 'grid-10' : 'grid-8'
          } ${
            ended ? 'is-ended-grid' : g.phase === 'assassination' ? 'is-assassin-picker-grid' : ''
          }`}
          aria-label="对局座位表"
        >
          {g.players.map(p => {
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
              ((effectivePhase === 'proposing' && captain) ||
                (g.phase === 'lady' && Boolean(self?.canInspect) && !g.lady?.holderIds.includes(p.id)) ||
                (g.phase === 'assassination' && self?.role === 'assassin' && p.id !== userId));
            const lastBallot =
              !ended &&
              g.phase !== 'assassination' &&
              !room.settings.anonymousTeamVote &&
              lastVotedRound?.vote?.ballots
                ? lastVotedRound.vote.ballots[p.id]
                : undefined;
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
                onClick={() => canTapSeat && handleSeatTap(p.id)}
                onKeyDown={e => {
                  if (canTapSeat && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleSeatTap(p.id);
                  }
                }}
                className={[
                  'table-seat-card',
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
                <div className="seat-card-top">
                  <div className="seat-top-badges">
                    {ended && revealedTeam ? (
                      <>
                        {isAssassinatedTarget && (
                          <span className="seat-badge badge-assassinated">🎯 被刺</span>
                        )}
                        {isWinnerSeat && <span className="seat-badge badge-winner">🏆 胜</span>}
                      </>
                    ) : g.phase === 'assassination' ? (
                      isTargeted ? (
                        <span className="seat-badge badge-assassinated">🎯 锁定</span>
                      ) : p.id === userId ? (
                        <span className="seat-badge badge-next-captain">🗡️ 刺客</span>
                      ) : null
                    ) : (
                      <>
                        {isCaptain && (
                          <span className={`seat-badge ${isNextCaptain ? 'badge-next-captain' : 'badge-captain'}`}>
                            {isNextCaptain ? '👑 候任' : '👑 队长'}
                          </span>
                        )}
                        {isLadyHolder && <span className="seat-badge badge-lady">☯️ 明镜</span>}
                      </>
                    )}
                  </div>
                </div>

                <div className="seat-card-avatar-wrap">
                  <div className="seat-card-avatar">
                    {revealedRole ? (
                      <RolePortrait role={revealedRole} size="mini" />
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
                  <span className="seat-num-badge">{String(p.seat).padStart(2, '0')}</span>
                  {isProposed && (
                    <span className="seat-avatar-team-flag" title="已选入本轮任务车队">
                      🛡️
                    </span>
                  )}
                </div>

                <strong className="seat-card-name">
                  {p.nickname}
                  {p.id === userId ? '（你）' : ''}
                </strong>

                <div className="seat-card-bottom">
                  {revealedRole ? (
                    <span className={`revealed-role allegiance-${roleTeam(revealedRole)}`}>
                      {roleTeam(revealedRole) === 'blue' ? '🛡️ ' : '🗡️ '}
                      {roleNames[revealedRole]}
                    </span>
                  ) : isProposed ? (
                    <span className="seat-chip chip-team">🛡️ 入阵</span>
                  ) : isTargeted ? (
                    <span className="seat-chip chip-target">
                      {g.phase === 'lady' ? '☯️ 查验' : '🗡️ 目标'}
                    </span>
                  ) : canTapSeat ? (
                    <span className="seat-chip chip-hint">
                      {effectivePhase === 'proposing'
                        ? '点击上车'
                        : g.phase === 'lady'
                          ? '点击查验'
                          : '🎯 刺杀'}
                    </span>
                  ) : lastBallot !== undefined ? (
                    <span className={`seat-chip ${lastBallot ? 'chip-approve' : 'chip-reject'}`}>
                      {lastBallot ? '👍 赞成' : '👎 反对'}
                    </span>
                  ) : (
                    <span className="sr-only">
                      {g.phase === 'assassination' && p.id === userId
                        ? '刺客本人'
                        : member?.online === false
                          ? '离线'
                          : '在线'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Bottom Dynamic Action Dock */}
      <div className="table-action-dock">
        <div className="dock-utility-row">
          {!ended && self && (
            <section className="identity-box" aria-label="我的私密身份">
              <button
                type="button"
                className={`secondary tool-pill identity-trigger-btn ${needsIdentityAction ? 'pulse-action' : ''}`}
                disabled={!connected}
                aria-expanded={identityVisible}
                onClick={() => setIdentityOpen(v => !v)}
              >
                {identityVisible
                  ? '收起身份'
                  : self?.canConfirmInspection
                    ? '👁️ 私下查看我的身份（确认查验结果）'
                    : '👁️ 私下查看我的身份'}
              </button>
            </section>
          )}
          <button
            type="button"
            className="secondary tool-pill"
            onClick={() => setHistoryOpen(v => !v)}
          >
            📊 战况 ({g.rounds.length})
          </button>
          {onOpenGuide && (
            <button type="button" className="secondary tool-pill" onClick={onOpenGuide}>
              📖 规则
            </button>
          )}
        </div>

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
              className="dock-panel"
              onSubmit={e => {
                e.preventDefault();
                send({ type: 'proposeTeam', payload: { playerIds: selected, direction } });
              }}
            >
              <fieldset disabled={disabled}>
                <legend>
                  点击上方座位选人（已选 {selected.length} / {size} 人，可选自己）
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
                  <label htmlFor="direction" className="sr-only">
                    发言方向
                  </label>
                  <select
                    id="direction"
                    value={direction}
                    onChange={e => setDirection(e.target.value as typeof direction)}
                  >
                    <option value="clockwise">顺时针发言</option>
                    <option value="counterclockwise">逆时针发言</option>
                  </select>
                  <button disabled={selected.length !== size}>确认 {size} 人队伍</button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="dock-panel">
              <p>等待队长选择 {size} 位玩家执行任务。</p>
            </div>
          ))}

        {['discussion', 'team_vote', 'mission'].includes(g.phase) && round && (
          <p className="team-summary">本次队伍：{names(round.team)}</p>
        )}

        {g.phase === 'discussion' && (
          <div className="dock-panel">
            <p className="dock-compact-text">发言顺序：{names(speakingOrder())}。</p>
            {captain ? (
              <button disabled={disabled} onClick={() => send({ type: 'startTeamVote', payload: {} })}>
                讨论结束，开始表决
              </button>
            ) : (
              <p role="status">等待队长结束讨论。</p>
            )}
          </div>
        )}

        {g.phase === 'team_vote' && (
          <div className="dock-panel">
            <p role="status">
              已收到 {g.progress.teamVotes} / {g.players.length} 票；必须超过半数赞成，平票不通过。
            </p>
            {self?.teamVoted ? (
              <p className="notice">你已提交，请等待其余玩家。</p>
            ) : (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (choice !== null) send({ type: 'teamVote', payload: { approve: choice } });
                }}
              >
                <fieldset disabled={disabled}>
                  <legend className="sr-only">是否赞成这支队伍？提交后不可更改</legend>
                  <div className="vote-card-pair">
                    <label className={`choice vote-card ${choice === true ? 'is-selected-approve' : ''}`}>
                      <input
                        type="radio"
                        name="team-choice"
                        checked={choice === true}
                        onChange={() => setChoice(true)}
                      />
                      <span>👍 赞成</span>
                    </label>
                    <label className={`choice vote-card ${choice === false ? 'is-selected-reject' : ''}`}>
                      <input
                        type="radio"
                        name="team-choice"
                        checked={choice === false}
                        onChange={() => setChoice(false)}
                      />
                      <span>👎 反对</span>
                    </label>
                  </div>
                  <button disabled={choice === null}>确认提交表决</button>
                </fieldset>
              </form>
            )}
          </div>
        )}

        {g.phase === 'mission' && (
          <div className="dock-panel">
            <p role="status">
              已收到 {g.progress.missionVotes} / {round!.team.length} 张任务牌。
              {g.failuresRequired === 2 ? '本任务需要至少 2 张失败牌才会失败。' : '出现 1 张失败牌，任务即失败。'}
            </p>
            {!round!.team.includes(userId) ? (
              <p>你不在任务队伍中，请等待任务结果。</p>
            ) : self?.missionVoted ? (
              <p className="notice">任务牌已提交，请等待结果。</p>
            ) : (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (choice !== null) send({ type: 'missionVote', payload: { success: choice } });
                }}
              >
                <fieldset disabled={disabled}>
                  <legend className="sr-only">私下选择任务牌，提交后不可更改</legend>
                  <div className="vote-card-pair">
                    <label className={`choice vote-card ${choice === true ? 'is-selected-approve' : ''}`}>
                      <input
                        type="radio"
                        name="mission-choice"
                        checked={choice === true}
                        onChange={() => setChoice(true)}
                      />
                      <span>⚔️ 任务成功</span>
                    </label>
                    <label className={`choice vote-card ${choice === false ? 'is-selected-reject' : ''}`}>
                      <input
                        type="radio"
                        name="mission-choice"
                        checked={choice === false}
                        onChange={() => setChoice(false)}
                      />
                      <span>🔥 任务失败</span>
                    </label>
                  </div>
                  <button disabled={choice === null}>确认提交任务牌</button>
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
                    🗡️ 确认刺杀{target ? `：${name(target)}` : ''}
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
                    回到等待区，再开一局
                  </button>
                ) : (
                  <span className="hint">等待房主返回等待区</span>
                )}
              </div>
            </div>
          </section>
        )}

        {!ended && (
          <div className="abort-area">
            {g.abortPoll ? (
              <div className="abort-poll-bar">
                <span>
                  中断请求：{g.abortPoll.approvals} / {g.abortPoll.required} 同意
                </span>
                {!g.abortPoll.voted && (
                  <div className="action-pair">
                    <button
                      className="secondary"
                      disabled={disabled}
                      onClick={() => send({ type: 'voteAbort', payload: { approve: false } })}
                    >
                      继续对局
                    </button>
                    <button
                      disabled={disabled}
                      onClick={() => send({ type: 'voteAbort', payload: { approve: true } })}
                    >
                      同意中断
                    </button>
                  </div>
                )}
              </div>
            ) : abortConfirm ? (
              <div role="alertdialog" aria-label="确认请求中断" className="abort-confirm-bar">
                <span>确认发起中断本局请求？（需在线成员全员同意）</span>
                <div className="action-pair">
                  <button className="secondary" onClick={() => setAbortConfirm(false)}>
                    取消
                  </button>
                  <button
                    disabled={disabled}
                    onClick={() => {
                      setAbortConfirm(false);
                      send({ type: 'requestAbort', payload: {} });
                    }}
                  >
                    发起中断
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-button abort-trigger"
                disabled={disabled}
                onClick={() => setAbortConfirm(true)}
              >
                无法继续？请求中断本局
              </button>
            )}
          </div>
        )}
      </div>

      {/* Private Identity Modal Overlay */}
      {!ended && self && identityVisible && (
        <div className="table-modal-backdrop" role="dialog" aria-modal="true" aria-label="我的私密身份详情">
          <div className="table-modal-sheet identity-content">
            <div className="table-modal-head">
              <strong>私密身份底牌</strong>
              <button type="button" className="secondary tool-pill" onClick={() => setIdentityOpen(false)}>
                关闭底牌
              </button>
            </div>
            <IdentityCard role={self.role} />
            {self.merlinCandidates.length > 0 && (
              <p>风清扬与东方不败是：{names(self.merlinCandidates)}。你不知道谁是真正的风清扬。</p>
            )}
            {(self.guinevereCandidates?.length ?? 0) > 0 && (
              <p>
                你听闻的两道传闻指向：{names(self.guinevereCandidates!)}。其中一人是岳不群，另一人是蓝方同伴，但你不知道具体对应关系。
              </p>
            )}
            {self.evilIds.length > 0 && (
              <p>
                {self.role === 'merlin' ? '你看到的红方成员（不含岳不群）' : '你看到的红方队友（不含左冷禅）'}：
                {names(self.evilIds)}。不显示具体角色。
              </p>
            )}
            {!self.merlinCandidates.length &&
              !(self.guinevereCandidates?.length ?? 0) &&
              !self.evilIds.length && <p>你的角色没有其他初始身份视野。</p>}
            <p className="hint">
              {self.team === 'blue' ? '任务只能提交成功。' : '任务可以提交成功或失败。'}切到其他页面或断线时会自动收起。
            </p>
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
        </div>
      )}

      {/* Per-Mission Detail Modal (Triggered when tapping any of the 5 Mission Circles) */}
      {inspectMission !== null && (
        <div
          className="table-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`任务 ${inspectMission} 组队与投票详情`}
          onClick={() => setInspectMission(null)}
        >
          <div className="table-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="table-modal-head">
              <strong>
                {WUYUE_MISSIONS[inspectMission - 1]?.shortLabel ?? `任务 ${inspectMission}`} 详情（需 {g.missionSizes[inspectMission - 1]} 人
                {failuresRequiredFor(g.players.length, inspectMission) === 2
                  ? ' · 2张失败牌才失败'
                  : ' · 1张失败牌即失败'}）
              </strong>
              <button type="button" className="secondary tool-pill" onClick={() => setInspectMission(null)}>
                关闭
              </button>
            </div>

            {/* Quick switcher between Mission 1..5 inside the modal */}
            <div className="mission-modal-tabs">
              {g.missionSizes.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`secondary tool-pill ${inspectMission === idx + 1 ? 'pulse-action' : ''}`}
                  onClick={() => setInspectMission(idx + 1)}
                >
                  {WUYUE_MISSIONS[idx]?.shortLabel ?? `任务 ${idx + 1}`}
                </button>
              ))}
            </div>

            {missionRounds.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>
                {WUYUE_MISSIONS[inspectMission - 1]?.shortLabel ?? `任务 ${inspectMission}`} 尚未产生组队提案记录。
              </p>
            ) : (
              <div className="game-history-list" style={{ marginTop: 10 }}>
                {missionRounds.map(r => (
                  <article key={r.number} className="history-round-card">
                    <h3>
                      第 {r.number} 次组队提案（{WUYUE_MISSIONS[r.mission - 1]?.shortLabel ?? `任务 ${r.mission}`}）
                    </h3>
                    <p>
                      <strong>👑 队长：</strong>
                      {name(r.captainId)}（{r.direction === 'clockwise' ? '顺时针' : '逆时针'}发言）
                    </p>
                    <p>
                      <strong>🛡️ 出征队员：</strong>
                      {names(r.team)}
                    </p>
                    {r.vote ? (
                      <div className="round-vote-box">
                        <p>
                          <strong>🗳️ 组队表决：</strong>
                          <span className={r.vote.passed ? 'text-approve' : 'text-reject'}>
                            {r.vote.approvals} 赞成 / {r.vote.rejections} 反对 —{' '}
                            {r.vote.passed ? '组队通过' : '组队未通过（流局）'}
                          </span>
                        </p>
                        {!room.settings.anonymousTeamVote && r.vote.ballots ? (
                          <div className="ballot-chip-grid">
                            {g.players.map(p => {
                              const approved = r.vote!.ballots![p.id];
                              return (
                                <span
                                  key={p.id}
                                  className={`ballot-chip ${approved ? 'chip-approve' : 'chip-reject'}`}
                                >
                                  {p.seat}号 {p.nickname}: {approved ? '👍赞成' : '👎反对'}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="hint">（本房间开启了匿名组队投票，仅展示总票数）</p>
                        )}
                      </div>
                    ) : (
                      <p className="hint">正在讨论或表决中，尚未公布票型。</p>
                    )}
                    {r.result && (
                      <p className={`mission-outcome-line ${r.result.passed ? 'is-pass' : 'is-fail'}`}>
                        <strong>⚔️ 任务结算：</strong>
                        任务{r.result.passed ? '成功' : '失败'}（收到 {r.result.successes} 张成功牌，
                        {r.result.failures} 张失败牌）
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Battle Log / Rounds History Modal */}
      {historyOpen && (
        <div
          className="table-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="战况与提案记录"
          onClick={() => setHistoryOpen(false)}
        >
          <div className="table-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="table-modal-head">
              <strong>全部战况记录（共 {g.rounds.length} 次提案）</strong>
              <button type="button" className="secondary tool-pill" onClick={() => setHistoryOpen(false)}>
                关闭
              </button>
            </div>
            {g.rounds.length === 0 ? (
              <p className="muted">尚无已完成的组队提案。</p>
            ) : (
              <div className="game-history-list">
                {g.rounds.map(r => (
                  <article key={r.number} className="history-round-card">
                    <h3>
                      任务 {r.mission} · 第 {r.number} 次提案
                    </h3>
                    <p>
                      队长 {name(r.captainId)} · {r.direction === 'clockwise' ? '顺' : '逆'}时针发言
                    </p>
                    <p>队伍：{names(r.team)}</p>
                    {r.vote ? (
                      <>
                        <p>
                          {r.vote.approvals} 赞成 / {r.vote.rejections} 反对，
                          {r.vote.passed ? '组队通过' : '组队未通过'}。
                        </p>
                        {!room.settings.anonymousTeamVote && r.vote.ballots ? (
                          <div className="ballot-chip-grid">
                            {g.players.map(p => {
                              const approved = r.vote!.ballots![p.id];
                              return (
                                <span
                                  key={p.id}
                                  className={`ballot-chip ${approved ? 'chip-approve' : 'chip-reject'}`}
                                >
                                  {p.seat}号 {p.nickname}: {approved ? '👍赞成' : '👎反对'}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="hint">（匿名组队投票，仅显示总票数）</p>
                        )}
                      </>
                    ) : (
                      <p className="hint">尚未完成组队表决</p>
                    )}
                    {r.result && (
                      <p>
                        任务{r.result.passed ? '成功' : '失败'}：{r.result.successes} 张成功，
                        {r.result.failures} 张失败。
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
            <ExtensionHistory game={g} name={name} />
          </div>
        </div>
      )}
    </div>
  );
}
