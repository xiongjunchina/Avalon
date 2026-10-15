import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Label from '@radix-ui/react-label';
import {
  defaultSettings,
  type Command,
  type Player,
  type Role,
  type RoomView,
  type Settings,
  type User,
} from '@avalon/contracts';
import {
  MISSION_SIZES,
  ROLE_CONFIG,
  captain as getCaptainId,
  createGame,
  isEnded,
  projectGame,
  teamOf,
  transition,
  type GameState,
} from '@avalon/game-core';
import './style.css';
import { GamePanel } from './GamePanel';
import { RoomConnection } from './room-connection';
import { api, describe, errors } from './api';
import { AccountPanel } from './AccountPanel';
import { PresetsPanel, SettingsFields, settingsText } from './PresetsPanel';
import { Emblem, roleTeam } from './Heraldry';
import { GuidePanel } from './GuidePanel';
import { RolePortrait } from './RolePortrait';
import { roleMottos, roleNames } from './roles';

const SHOWCASE_ROLES: Role[] = [
  'merlin',
  'assassin',
  'percival',
  'morgana',
  'mordred',
  'oberon',
  'loyal',
  'minion',
];

const ROLE_EN_NAMES: Record<Role, string> = {
  merlin: 'MERLIN',
  percival: 'PERCIVAL',
  loyal: 'LOYAL SERVANT',
  morgana: 'MORGANA',
  assassin: 'ASSASSIN',
  mordred: 'MORDRED',
  oberon: 'OBERON',
  minion: 'MINION',
};

const BOT_NAMES = ['子容', '阿青', '大熊', '云舒', '老周', '晓月', '林深', '北辰', '知秋', '南风'];

function groupRoles(roles: Role[]): Array<{ role: Role; count: number }> {
  const counts = new Map<Role, number>();
  for (const r of roles) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].map(([role, count]) => ({ role, count }));
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function App() {
  const [page, setPage] = useState<'table' | 'account' | 'guide'>('table');
  const guideReturn = useRef<'table' | 'account'>('table');
  const [replayId, setReplayId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [nickname, setNickname] = useState('');
  const initialInvite = new URLSearchParams(location.search).get('invite') ?? '';
  const [key, setKey] = useState(() => initialInvite);
  const [joinOpen, setJoinOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSettings, setSetupSettings] = useState<Settings>(() => ({
    ...defaultSettings,
    playerCount: 6,
    captainMode: 'random_order',
    anonymousTeamVote: true,
    ladyEnabled: false,
    earlyAssassinationEnabled: true,
  }));
  const pendingSettingsRef = useRef<Settings | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [showcaseIndex, setShowcaseIndex] = useState(0);
  const [invite, setInvite] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('连接中');
  const transportRef = useRef<RoomConnection | null>(null);
  const [bootRetry, setBootRetry] = useState(0);

  // Single-player interactive practice game state
  const [practiceGame, setPracticeGame] = useState<GameState | null>(null);
  const [practiceUserId, setPracticeUserId] = useState<string>('p1');

  // Auto-rotate home role showcase every 3.8s
  useEffect(() => {
    if (roomId || setupOpen || practiceGame || page !== 'table') return;
    const timer = setInterval(() => {
      setShowcaseIndex(i => (i + 1) % SHOWCASE_ROLES.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [roomId, setupOpen, practiceGame, page]);

  // Auto-dismiss notice toast after 2 seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let active = true;
    api<{ user: User; roomId: string | null }>('/me')
      .then(data => {
        if (active) {
          setUser(data.user);
          setRoomId(data.roomId);
        }
      })
      .catch(err => {
        if (active && err.message !== 'UNAUTHENTICATED') setError(describe(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bootRetry]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || refreshing) return;
      refreshing = true;
      try {
        await api('/sessions/refresh', {});
      } catch (err) {
        if (active) {
          setError(describe(err));
          if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
            setUser(null);
            setRoomId(null);
            setRoom(null);
          }
        }
      } finally {
        refreshing = false;
      }
    };
    const interval = setInterval(() => void refresh(), 15 * 60 * 1000);
    const resume = () => {
      void refresh();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!roomId) return;
    const transport = new RoomConnection({
      fetchRoom: () => api(`/rooms/${roomId}`),
      socket: () =>
        new WebSocket(
          `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${roomId}/socket`
        ),
      handlers: {
        snapshot: snap => {
          setRoom(snap);
        },
        invite: setInvite,
        status: setConnection,
        busy: setBusy,
        error: code => setError(errors[code] ?? '连接发生问题，请稍后重试。'),
        ended: reason => {
          setRoomId(null);
          setRoom(null);
          setInvite('');
          setBusy(false);
          if (reason === 'expired') {
            setUser(null);
            setError(errors.UNAUTHENTICATED);
          } else if (reason === 'closed') setError(errors.ROOM_CLOSED);
        },
      },
    });
    transportRef.current = transport;
    transport.start();
    const resume = () => {
      if (document.visibilityState === 'visible') transport.resume();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      transport.stop();
      if (transportRef.current === transport) transportRef.current = null;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [roomId]);

  // Apply pre-room setup settings once connected as host
  useEffect(() => {
    if (
      room &&
      connection === '已连接' &&
      !busy &&
      room.phase === 'waiting' &&
      room.hostId === user?.id &&
      pendingSettingsRef.current
    ) {
      const target = pendingSettingsRef.current;
      pendingSettingsRef.current = null;
      const needsSync =
        room.settings.playerCount !== target.playerCount ||
        room.settings.ladyEnabled !== target.ladyEnabled ||
        room.settings.earlyAssassinationEnabled !== target.earlyAssassinationEnabled ||
        room.settings.anonymousTeamVote !== target.anonymousTeamVote ||
        room.settings.captainMode !== target.captainMode ||
        room.settings.rejectionScope !== target.rejectionScope;
      if (needsSync) {
        transportRef.current?.send({
          type: 'updateSettings',
          payload: target,
          commandId: crypto.randomUUID(),
          expectedVersion: room.version,
        });
      }
    }
  }, [room, connection, busy, user?.id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  function command(action: Pick<Command, 'type' | 'payload'>) {
    if (!room || busy) return;
    setError('');
    transportRef.current?.send({
      ...action,
      commandId: crypto.randomUUID(),
      expectedVersion: room.version,
    } as Command);
  }

  function startPracticeGame(customSettings?: Settings) {
    const s = customSettings ?? setupSettings;
    const players: Player[] = Array.from({ length: s.playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      seat: i + 1,
      nickname: i === 0 ? user?.nickname ?? '我' : BOT_NAMES[i - 1],
    }));
    let g = createGame('practice-game', players, s, shuffleArray);
    // Auto-confirm all AI bots so the user only needs to confirm their own role or start proposing
    for (const p of players) {
      if (p.id !== 'p1') {
        g = transition(g, p.id, { type: 'confirmRole', payload: {} }, players.map(x => x.id));
      }
    }
    setPracticeUserId('p1');
    setPracticeGame(g);
    setSetupOpen(false);
  }

  function handlePracticeCommand(action: Pick<Command, 'type' | 'payload'>) {
    if (!practiceGame) return;
    if (action.type === 'returnToLobby') {
      startPracticeGame(practiceGame.settings);
      return;
    }
    try {
      const onlineIds = practiceGame.players.map(p => p.id);
      let next = transition(practiceGame, practiceUserId, action, onlineIds);
      // Automatically let other seats submit votes when in team_vote or mission
      if (next.phase === 'role_reveal') {
        for (const p of next.players) {
          if (!next.confirmed.includes(p.id)) {
            next = transition(next, p.id, { type: 'confirmRole', payload: {} }, onlineIds);
          }
        }
      }
      if (next.phase === 'team_vote') {
        for (const p of next.players) {
          if (p.id !== practiceUserId && !(p.id in next.teamVotes)) {
            next = transition(next, p.id, { type: 'teamVote', payload: { approve: true } }, onlineIds);
          }
        }
      }
      if (next.phase === 'mission') {
        const round = next.rounds.at(-1)!;
        for (const pid of round.team) {
          if (pid !== practiceUserId && !(pid in next.missionVotes)) {
            const isEvil = teamOf(next.roles[pid]) === 'red';
            next = transition(
              next,
              pid,
              { type: 'missionVote', payload: { success: !isEvil || next.mission === 1 } },
              onlineIds
            );
          }
        }
      }
      setPracticeGame(next);
      setError('');
    } catch (err) {
      setError(describe(err));
    }
  }

  function stepPracticeBot() {
    if (!practiceGame || isEnded(practiceGame)) return;
    const onlineIds = practiceGame.players.map(p => p.id);
    let next = structuredClone(practiceGame);
    try {
      if (next.phase === 'role_reveal') {
        for (const p of next.players) {
          if (!next.confirmed.includes(p.id)) {
            next = transition(next, p.id, { type: 'confirmRole', payload: {} }, onlineIds);
          }
        }
      } else if (next.phase === 'proposing') {
        const cap = getCaptainId(next);
        const size = MISSION_SIZES[next.players.length][next.mission - 1];
        const teamIds = next.players.slice(0, size).map(p => p.id);
        next = transition(
          next,
          cap,
          { type: 'proposeTeam', payload: { playerIds: teamIds, direction: 'clockwise' } },
          onlineIds
        );
      } else if (next.phase === 'discussion') {
        const cap = getCaptainId(next);
        next = transition(next, cap, { type: 'startTeamVote', payload: {} }, onlineIds);
      } else if (next.phase === 'team_vote') {
        for (const p of next.players) {
          if (!(p.id in next.teamVotes)) {
            next = transition(next, p.id, { type: 'teamVote', payload: { approve: true } }, onlineIds);
          }
        }
      } else if (next.phase === 'mission') {
        const round = next.rounds.at(-1)!;
        for (const pid of round.team) {
          if (!(pid in next.missionVotes)) {
            const isEvil = teamOf(next.roles[pid]) === 'red';
            next = transition(
              next,
              pid,
              { type: 'missionVote', payload: { success: !isEvil } },
              onlineIds
            );
          }
        }
      } else if (next.phase === 'lady' && next.lady) {
        const holder = next.lady.holderId;
        const target = next.players.find(p => !next.lady!.holderIds.includes(p.id))!;
        next = transition(
          next,
          holder,
          { type: 'inspectAlignment', payload: { targetId: target.id } },
          onlineIds
        );
      } else if (next.phase === 'lady_reveal' && next.lady) {
        const inspector = next.lady.inspections.at(-1)!.inspectorId;
        next = transition(next, inspector, { type: 'confirmInspection', payload: {} }, onlineIds);
      } else if (next.phase === 'early_window') {
        const assassin = next.players.find(p => next.roles[p.id] === 'assassin')!.id;
        next = transition(
          next,
          assassin,
          { type: 'earlyAssassinationDecision', payload: { attempt: false } },
          onlineIds
        );
      } else if (next.phase === 'assassination') {
        const assassin = next.players.find(p => next.roles[p.id] === 'assassin')!.id;
        const target = next.players.find(p => p.id !== assassin)!;
        next = transition(next, assassin, { type: 'assassinate', payload: { targetId: target.id } }, onlineIds);
      }
      setPracticeGame(next);
    } catch (err) {
      setError(describe(err));
    }
  }

  function copyInviteLink() {
    if (!invite) {
      setNotice(`房间号：${room?.code ?? ''}（可告知朋友直接输入房间号加入）`);
      return;
    }
    void run(async () => {
      const link = `${location.origin}/?invite=${encodeURIComponent(invite)}`;
      try {
        await navigator.clipboard.writeText(link);
        setNotice(`已复制房间 ${room?.code} 邀请链接，快发给朋友入座吧！`);
      } catch {
        setNotice(`房间码 ${room?.code} · 邀请链接：${link}`);
      }
    });
  }

  const me = room?.members.find(m => m.id === user?.id);
  const host = room?.hostId === user?.id;
  const disabled = busy || connection !== '已连接';
  const settings = room?.settings;

  function updateSettings(patch: Partial<Settings>) {
    if (settings) command({ type: 'updateSettings', payload: { ...settings, ...patch } });
  }

  const showcaseRole = SHOWCASE_ROLES[showcaseIndex];
  const setupRoles = ROLE_CONFIG[setupSettings.playerCount] ?? ROLE_CONFIG[6];
  const setupBlueRoles = setupRoles.filter(r => roleTeam(r) === 'blue');
  const setupRedRoles = setupRoles.filter(r => roleTeam(r) === 'red');
  const groupedBlue = groupRoles(setupBlueRoles);
  const groupedRed = groupRoles(setupRedRoles);

  const inTableViewport = Boolean((roomId || practiceGame) && page === 'table');

  return (
    <main className={`app-shell ${inTableViewport ? 'is-table-viewport' : ''}`}>
      {/* Toast Alerts */}
      {(error || notice) && (
        <div className="toast-stack">
          {error && (
            <p className="error" role="alert" onClick={() => setError('')}>
              {error}
            </p>
          )}
          {notice && (
            <p className="notice" role="status" onClick={() => setNotice('')}>
              {notice}
            </p>
          )}
        </div>
      )}

      {page === 'guide' ? (
        <GuidePanel onBack={() => setPage(user ? guideReturn.current : 'table')} />
      ) : loading ? (
        <div className="skeleton" aria-label="正在恢复访客身份" />
      ) : !user ? (
        /* Guest Entry Screen */
        <div className="mp-home-screen">
          <div className="mp-logo-block">
            <h1 className="mp-avalon-logo">AVALON</h1>
            <p className="mp-avalon-sub">阿瓦隆线下面杀助手</p>
          </div>
          <section className="panel guest-login-card">
            <h2>先让朋友认出你</h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                void run(async () => {
                  const data = await api<{ user: User }>('/sessions/guest', { nickname });
                  setUser(data.user);
                });
              }}
            >
              <p className="muted" id="nickname-next-step">
                输入昵称即可进入大厅创建房间或加入朋友牌局。
              </p>
              <Label.Root htmlFor="nickname">你的昵称</Label.Root>
              <input
                id="nickname"
                value={nickname}
                maxLength={20}
                required
                autoComplete="nickname"
                aria-describedby="nickname-next-step nickname-identity-hint"
                placeholder="例如：军哥"
                onChange={e => setNickname(e.target.value)}
              />
              <p className="hint" id="nickname-identity-hint">
                访客身份保存在当前浏览器中，无广告与会员限制。
              </p>
              <button className="mp-cyan-pill" disabled={busy || !nickname.trim()} type="submit">
                {busy ? '正在进入…' : '进入大厅'}
              </button>
            </form>
            {error && (
              <button
                className="secondary"
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setBootRetry(n => n + 1);
                }}
              >
                重新检查连接
              </button>
            )}
          </section>
        </div>
      ) : page === 'account' ? (
        <AccountPanel
          key={user.id}
          user={user}
          onUser={setUser}
          initialReplay={replayId}
          onBack={() => setPage('table')}
        />
      ) : practiceGame ? (
        /* Single-Player Interactive Sandbox Game Table */
        <div className="room-table-screen">
          <header className="room-top-bar">
            <div className="room-top-left">
              <button
                type="button"
                className="secondary tool-pill"
                onClick={() => setPracticeGame(null)}
              >
                ← 退出试玩
              </button>
              <select
                aria-label="切换试玩视角"
                className="practice-seat-select"
                value={practiceUserId}
                onChange={e => setPracticeUserId(e.target.value)}
              >
                {practiceGame.players.map(p => (
                  <option key={p.id} value={p.id}>
                    视角: {p.seat}号 {p.nickname} ({roleNames[practiceGame.roles[p.id]]})
                  </option>
                ))}
              </select>
            </div>
            <div className="room-top-right">
              {!isEnded(practiceGame) && (
                <button
                  type="button"
                  className="secondary tool-pill pulse-action"
                  onClick={stepPracticeBot}
                >
                  ⚡ 电脑代操下一步
                </button>
              )}
              <button
                type="button"
                className="secondary tool-pill"
                onClick={() => startPracticeGame(practiceGame.settings)}
              >
                重开
              </button>
            </div>
          </header>

          <GamePanel
            key={`${practiceGame.id}:${practiceUserId}`}
            room={{
              id: 'practice-room',
              code: '演练桌',
              hostId: practiceUserId,
              version: 1,
              phase: isEnded(practiceGame) ? 'finished' : 'playing',
              settings: practiceGame.settings,
              acceptingNewMembers: false,
              members: practiceGame.players.map(p => ({
                ...p,
                ready: true,
                online: true,
              })),
              game: projectGame(practiceGame, practiceUserId),
            }}
            userId={practiceUserId}
            disabled={false}
            connected={true}
            send={handlePracticeCommand}
            onOpenGuide={() => {
              guideReturn.current = 'table';
              setPage('guide');
            }}
          />
        </div>
      ) : !roomId ? (
        setupOpen ? (
          /* Pre-Room Setup View (Exact Screenshot 4 Layout: Shield Selector + Grouped Blue/Red Portrait Cards) */
          <div className="mp-setup-screen">
            <header className="mp-setup-topbar">
              <button
                type="button"
                className="mp-back-chevron"
                aria-label="返回首页"
                onClick={() => setSetupOpen(false)}
              >
                ‹
              </button>
              <span className="mp-setup-title">选择人数</span>
              <button
                type="button"
                className="secondary tool-pill"
                onClick={() => {
                  guideReturn.current = 'table';
                  setPage('guide');
                }}
              >
                规则
              </button>
            </header>

            <div className="mp-shield-row" role="radiogroup" aria-label="选择游戏人数">
              {[5, 6, 7, 8, 9, 10].map(count => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={setupSettings.playerCount === count}
                  className={`mp-shield-btn ${setupSettings.playerCount === count ? 'is-active' : ''}`}
                  onClick={() => setSetupSettings(s => ({ ...s, playerCount: count }))}
                >
                  <span>{count}</span>
                </button>
              ))}
            </div>

            <div className="mp-factions-stack">
              <section className="mp-faction-panel is-blue">
                <h3>蓝方阵营 ({setupBlueRoles.length}人)</h3>
                <div className="mp-role-card-row">
                  {groupedBlue.map(({ role, count }) => (
                    <div key={role} className="mp-portrait-card is-blue">
                      <div className="mp-portrait-img">
                        <RolePortrait role={role} size="tile" />
                      </div>
                      <div className="mp-portrait-label">
                        <strong>
                          {roleNames[role]}
                          {count > 1 && <span className="mp-count-tag">x{count}</span>}
                        </strong>
                        <small>{ROLE_EN_NAMES[role]}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mp-faction-panel is-red">
                <h3>红方阵营 ({setupRedRoles.length}人)</h3>
                <div className="mp-role-card-row">
                  {groupedRed.map(({ role, count }) => (
                    <div key={role} className="mp-portrait-card is-red">
                      <div className="mp-portrait-img">
                        <RolePortrait role={role} size="tile" />
                      </div>
                      <div className="mp-portrait-label">
                        <strong>
                          {roleNames[role]}
                          {count > 1 && <span className="mp-count-tag">x{count}</span>}
                        </strong>
                        <small>{ROLE_EN_NAMES[role]}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <footer className="mp-setup-footer">
              <button
                type="button"
                className="mp-cyan-pill"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    pendingSettingsRef.current = setupSettings;
                    const data = await api<{ room: RoomView }>('/rooms', { settings: setupSettings });
                    setRoom(data.room);
                    setRoomId(data.room.id);
                    setSetupOpen(false);
                  })
                }
              >
                {busy ? '创建中…' : '完成'}
              </button>
              <button
                type="button"
                className="mp-subtle-link"
                onClick={() => startPracticeGame(setupSettings)}
              >
                单人演练 {setupSettings.playerCount} 人对局画面 ›
              </button>
            </footer>
          </div>
        ) : (
          /* Home / Lobby Screen (Exact Screenshot 1 Layout: Red/Blue Split, Top-Left Avatar, Large Center Medallion, Cyan Pill Button) */
          <div className="mp-home-screen">
            <header className="mp-home-topbar">
              <button
                type="button"
                className="mp-avatar-btn"
                aria-label="个人中心"
                title={`${user.nickname} · 点击进入个人中心`}
                onClick={() => {
                  setReplayId(null);
                  setPage('account');
                }}
              >
                <span className="mp-avatar-ring">
                  <Emblem kind={user.avatar ?? 'crown'} />
                </span>
                <span className="mp-avatar-name">{user.nickname}</span>
              </button>

              <button
                type="button"
                className="secondary tool-pill"
                onClick={() => {
                  guideReturn.current = 'table';
                  setPage('guide');
                }}
              >
                玩法指南
              </button>
            </header>

            <div className="mp-logo-block">
              <h1 className="mp-avalon-logo">AVALON</h1>
              <p className="mp-avalon-sub">阿瓦隆线下面杀助手</p>
            </div>

            {/* Center Single Role Medallion (Auto-rotates one role at a time, tap to switch next) */}
            <section
              className="mp-medallion-stage"
              aria-label="角色展示"
              onClick={() => setShowcaseIndex(i => (i + 1) % SHOWCASE_ROLES.length)}
            >
              <div className={`mp-medallion-circle allegiance-${roleTeam(showcaseRole)}`}>
                <RolePortrait role={showcaseRole} size="card" />
              </div>
              <h2 className="mp-medallion-name">{roleNames[showcaseRole]}</h2>
              <p className="mp-medallion-motto">{roleMottos[showcaseRole]}</p>
            </section>

            {/* Bottom Actions */}
            <footer className="mp-home-footer">
              <button
                type="button"
                className="mp-cyan-pill"
                disabled={busy}
                onClick={() => setSetupOpen(true)}
              >
                创建房间
              </button>
              <div className="mp-home-subactions">
                <button
                  type="button"
                  className="mp-subtle-link"
                  onClick={() => setJoinOpen(true)}
                >
                  输入房号加入房间
                </button>
                <span>·</span>
                <button
                  type="button"
                  className="mp-subtle-link"
                  onClick={() => startPracticeGame(setupSettings)}
                >
                  单人试玩对局桌
                </button>
              </div>
            </footer>

            {/* Join Room Modal */}
            {joinOpen && (
              <div className="table-modal-backdrop" role="dialog" aria-modal="true" aria-label="加入朋友房间">
                <div className="table-modal-sheet">
                  <div className="table-modal-head">
                    <strong>加入朋友的房间</strong>
                    <button
                      type="button"
                      className="secondary tool-pill"
                      onClick={() => setJoinOpen(false)}
                    >
                      关闭
                    </button>
                  </div>
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      void run(async () => {
                        let value = key.trim();
                        try {
                          value = new URL(value).searchParams.get('invite') ?? value;
                        } catch {
                          /* room code */
                        }
                        const data = await api<{ room: RoomView }>('/rooms/join', { key: value });
                        setRoom(data.room);
                        setRoomId(data.room.id);
                        setJoinOpen(false);
                        history.replaceState(null, '', '/');
                      });
                    }}
                  >
                    <Label.Root htmlFor="room-key">输入房间号或粘贴邀请链接</Label.Root>
                    <input
                      id="room-key"
                      value={key}
                      required
                      placeholder="例如：1028264E 或完整邀请链接"
                      onChange={e => setKey(e.target.value)}
                      autoComplete="off"
                    />
                    <button className="mp-cyan-pill" disabled={busy || !key.trim()} type="submit">
                      {busy ? '正在入座…' : '立即入座'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )
      ) : !room ? (
        <div className="skeleton" aria-label="正在恢复房间" />
      ) : (
        /* Single-Screen Room & Game Table Viewport */
        <div className="room-table-screen">
          {/* Compact Top Header Bar */}
          <header className="room-top-bar">
            <div className="room-top-left">
              {room.phase !== 'playing' && (
                <button
                  type="button"
                  className="secondary tool-pill"
                  disabled={disabled}
                  onClick={() => command({ type: 'leaveRoom', payload: {} })}
                >
                  ← 退出
                </button>
              )}
              <button
                type="button"
                className="room-code-badge"
                onClick={copyInviteLink}
                title="点击复制房间邀请链接"
              >
                <span className="room-code-line">
                  <i
                    className={`conn-inline-dot ${connection === '已连接' ? 'is-online' : 'is-offline'}`}
                    aria-hidden="true"
                  />
                  房号 {room.code}
                </span>
                <small>
                  {room.members.length}/{room.settings.playerCount}人 · 复制邀请
                </small>
              </button>
            </div>

            <div className="room-top-right">
              {connection !== '已连接' && (
                <button
                  type="button"
                  className="secondary tool-pill pulse-action"
                  onClick={() => transportRef.current?.reconnect()}
                >
                  重连
                </button>
              )}
              <button
                type="button"
                className="secondary tool-pill"
                aria-label="房间设置"
                onClick={() => setSettingsModalOpen(true)}
              >
                ⚙️ 设置
              </button>
              <button
                type="button"
                className="secondary tool-pill"
                aria-label="规则说明"
                onClick={() => {
                  guideReturn.current = 'table';
                  setPage('guide');
                }}
              >
                📖 规则
              </button>
            </div>
          </header>

          {/* Main Table Body: Either Waiting Room Table or Active GamePanel Table */}
          {room.game ? (
            <GamePanel
              key={room.game.id}
              room={room}
              userId={user.id}
              disabled={disabled}
              connected={connection === '已连接'}
              send={command}
              onOpenGuide={() => {
                guideReturn.current = 'table';
                setPage('guide');
              }}
              onOpenReplay={gameId => {
                setReplayId(gameId);
                setPage('account');
              }}
            />
          ) : (
            /* Waiting Room Single-Screen Table with Physical Quest Board at Top */
            <div className="waiting-table-body">
              {/* Top Physical 5-Mission Quest Board Preview for Current Player Count */}
              <div className="avalon-quest-board">
                <div className="game-score quest-circles-row" aria-label="本局五轮任务配置">
                  {(MISSION_SIZES[room.settings.playerCount] ?? MISSION_SIZES[6]).map((count, i) => {
                    const twoFailsRequired = i === 3 && room.settings.playerCount >= 7;
                    return (
                      <div
                        key={i}
                        className={`quest-medallion-wrap ${i === 0 ? 'mission-current' : 'mission-pending'}`}
                      >
                        {twoFailsRequired && (
                          <span className="quest-two-fails-arch">需要2张失败卡</span>
                        )}
                        <div className="quest-circle">
                          <span className="quest-circle-top">任务 {i + 1}</span>
                          <strong className="quest-circle-num">{count}</strong>
                        </div>
                        <span className={`quest-token-socket ${i === 0 ? 'has-shield-token' : ''}`}>
                          {i === 0 ? '🛡️' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="quest-vote-track-zone">
                  <div className="quest-vote-track-left">
                    <div className="quest-track-head">
                      <span className="quest-track-badge">投票次数记录</span>
                      <span className="quest-track-sub">{settingsText(room.settings)}</span>
                    </div>
                    <div className="quest-vote-circles" aria-label="流局计数轨">
                      {[1, 2, 3, 4, 5].map(step => (
                        <div
                          key={step}
                          className={`quest-vote-spot ${step === 5 ? 'is-danger-fifth' : ''}`}
                        >
                          <span className="vote-spot-num">{step}</span>
                          {step === 1 && <span className="vote-pouch-token is-zero-ready">🟣</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="quest-faction-plaque">
                    <strong>{room.settings.playerCount}位玩家</strong>
                    <span>
                      {(ROLE_CONFIG[room.settings.playerCount] ?? []).filter(r => roleTeam(r) === 'red').length}
                      名莫德雷德爪牙
                    </span>
                  </div>
                </div>
              </div>

              {/* Phase & Host Hint Banner */}
              <div className="table-phase-banner">
                <div className="table-phase-head-row">
                  <h2>等待玩家入座 ({room.members.length} / {room.settings.playerCount})</h2>
                  <p className="hint">
                    点击空位可复制邀请链接；人齐准备后发牌，也可点底部「补满电脑试玩」直接体验
                  </p>
                </div>
              </div>

              {/* 5–10 Player Compact Seat Grid */}
              <div
                className={`table-seats-grid ${room.settings.playerCount > 8 ? 'grid-10' : 'grid-8'}`}
                aria-label="房间座位"
              >
                {Array.from({ length: room.settings.playerCount }, (_, i) => {
                  const m = room.members.find(member => member.seat === i + 1);
                  const isRoomHost = m && m.id === room.hostId;
                  return (
                    <div
                      key={i}
                      role={!m ? 'button' : undefined}
                      tabIndex={!m ? 0 : undefined}
                      onClick={() => {
                        if (!m) copyInviteLink();
                      }}
                      className={[
                        'table-seat-card',
                        m ? 'occupied' : 'is-empty',
                        m?.id === user.id ? 'is-me' : '',
                        isRoomHost ? 'is-captain' : '',
                        m?.ready ? 'is-ready' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="seat-card-top">
                        <span className="seat-num-badge">{String(i + 1).padStart(2, '0')}</span>
                        <div className="seat-top-badges">
                          {isRoomHost && <span className="seat-badge badge-captain">👑 房主</span>}
                        </div>
                      </div>
                      <div className="seat-card-avatar-wrap">
                        <div className="seat-card-avatar">
                          <Emblem kind={m?.avatar ?? 'cards'} />
                        </div>
                      </div>
                      <strong className="seat-card-name">
                        {m ? `${m.nickname}${m.id === user.id ? '（你）' : ''}` : '邀请好友'}
                      </strong>
                      <div className="seat-card-bottom">
                        {m ? (
                          <span className={`seat-chip ${m.ready ? 'chip-approve' : 'chip-status'}`}>
                            {m.online ? (m.ready ? '✓ 已准备' : '未准备') : '暂时离线'}
                          </span>
                        ) : (
                          <span className="seat-chip chip-hint">点击复制链接</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Free Direct Extension Toggles (Lady of the Lake & Early Assassination) */}
              <div className="waiting-ext-bar">
                <button
                  type="button"
                  disabled={!host || disabled}
                  className={`waiting-ext-orb ${room.settings.ladyEnabled ? 'is-enabled' : ''}`}
                  onClick={() => updateSettings({ ladyEnabled: !room.settings.ladyEnabled })}
                >
                  <span className="orb-icon">🌊</span>
                  <span className="orb-text">
                    <strong>湖中女神</strong>
                    <small>{room.settings.ladyEnabled ? '已开启' : '点击开启'}</small>
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!host || disabled}
                  className={`waiting-ext-orb ${room.settings.earlyAssassinationEnabled ? 'is-enabled' : ''}`}
                  onClick={() =>
                    updateSettings({
                      earlyAssassinationEnabled: !room.settings.earlyAssassinationEnabled,
                    })
                  }
                >
                  <span className="orb-icon">🗡️</span>
                  <span className="orb-text">
                    <strong>提前刺杀</strong>
                    <small>{room.settings.earlyAssassinationEnabled ? '已开启' : '点击开启'}</small>
                  </span>
                </button>

                <button
                  type="button"
                  className="waiting-ext-orb"
                  onClick={() => setSettingsModalOpen(true)}
                >
                  <span className="orb-icon">⚙️</span>
                  <span className="orb-text">
                    <strong>{room.settings.playerCount} 人局配置</strong>
                    <small>{host ? '切换人数/规则' : '查看房间规则'}</small>
                  </span>
                </button>
              </div>

              {/* Bottom Waiting Action Dock */}
              <div className="table-action-dock waiting-dock">
                <div className="dock-inline-controls">
                  <button
                    type="button"
                    className={`mp-cyan-pill ${me?.ready ? 'is-ready-state' : ''}`}
                    disabled={disabled}
                    onClick={() => command({ type: 'setReady', payload: { ready: !me?.ready } })}
                  >
                    {me?.ready ? '取消准备' : '准备'}
                  </button>
                  {host &&
                  room.members.length === room.settings.playerCount &&
                  room.members.every(m => m.ready) ? (
                    <button
                      type="button"
                      className="mp-cyan-pill"
                      disabled={disabled}
                      onClick={() => command({ type: 'startGame', payload: {} })}
                    >
                      人已到齐，开始发牌
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary tool-pill pulse-action"
                      style={{ flex: 1, minHeight: 46 }}
                      onClick={() => startPracticeGame(room.settings)}
                    >
                      🤖 补满电脑试玩 ({room.settings.playerCount}人局)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Room Settings Modal */}
          {settingsModalOpen && (
            <div className="table-modal-backdrop" role="dialog" aria-modal="true" aria-label="房间设置">
              <div className="table-modal-sheet">
                <div className="table-modal-head">
                  <strong>本局房间设置</strong>
                  <button
                    type="button"
                    className="secondary tool-pill"
                    onClick={() => setSettingsModalOpen(false)}
                  >
                    关闭
                  </button>
                </div>
                <p className="hint">
                  {room.phase !== 'waiting'
                    ? '对局进行中设置已锁定，结束后返回等待区可调整。'
                    : host
                      ? '修改玩法设置会清除准备状态，接纳开关不会。'
                      : '由房主调整，所有玩家实时同步。'}
                </p>
                <div className="check">
                  <Label.Root htmlFor="admission">允许新成员加入</Label.Root>
                  <input
                    id="admission"
                    type="checkbox"
                    disabled={!host || disabled || room.phase !== 'waiting'}
                    checked={room.acceptingNewMembers}
                    onChange={e =>
                      command({
                        type: 'setAdmission',
                        payload: { acceptingNewMembers: e.target.checked },
                      })
                    }
                  />
                </div>
                <fieldset disabled={!host || disabled || room.phase !== 'waiting'}>
                  <legend className="sr-only">房间规则设置</legend>
                  <SettingsFields settings={settings!} onChange={updateSettings} />
                </fieldset>
                {room.phase === 'waiting' && (
                  <details className="preset-details">
                    <summary>常用设置 · 保存与应用</summary>
                    <PresetsPanel
                      currentSettings={settings!}
                      disabled={disabled}
                      canApply={!!host}
                      onApply={s => command({ type: 'updateSettings', payload: s })}
                    />
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
