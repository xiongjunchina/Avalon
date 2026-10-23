import { QuestMedallion } from './QuestMedallion';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Label from '@radix-ui/react-label';
import {
  defaultSettings,
  defaultAnonymousTeamVote,
  type Command,
  type Member,
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
  failuresRequiredFor,
  isEnded,
  projectGame,
  teamOf,
  transition,
  type GameState,
} from '@avalon/game-core';
import './style.css';
import './scenes.css';
import './sound.css';
import { ReadyReminder } from './ReadyReminder';
import './feedback.css';
import { Modal } from './Modal';
import { GamePanel } from './GamePanel';
import { PracticeSeatPicker } from './PracticeSeatPicker';
import { RoomConnection } from './room-connection';
import { api, describe, errors } from './api';
import { AccountPanel } from './AccountPanel';
import { PresetsPanel, SettingsFields, settingsText } from './PresetsPanel';
import { Emblem, PlayerAvatar, WECHAT_SAMPLE_AVATARS, roleTeam } from './Heraldry';
import { GuidePanel } from './GuidePanel';
import { RolePortrait } from './RolePortrait';
import { FEMALE_DEMONS, WUYUE_MISSIONS, roleMottos, roleNames, roleTitles } from './roles';
import { SoundProvider, SoundButton, useSound, useGameSound, useNavigationSound } from './SoundSettings';
import { VoiceControls } from './VoiceControls';
import { SeatMicBadge } from './SeatMicBadge';
import { FriendsModal, RoomInvitationToast, DirectChatToast } from './FriendsModal';
import { voiceManager, type VoiceState } from './agora-voice';
import { uuidToRtcUid, type VoiceTokenResponse, type FriendSummary, type RoomChatMessage } from '@avalon/contracts';
import { AdminDashboard } from './AdminDashboard';
import { ChatDrawer } from './ChatDrawer';
import { RolePreferenceModal } from './RolePreferenceModal';

const SHOWCASE_ROLES: Role[] = [
  'merlin',
  'assassin',
  'percival',
  'morgana',
  'guinevere',
  'mordred',
  'oberon',
  'loyal',
  'minion',
];

const BOT_NAMES = ['仙友2号', '仙友3号', '仙友4号', '仙友5号', '仙友6号', '仙友7号', '仙友8号', '仙友9号', '仙友10号', '仙友11号', '仙友12号'];

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
  const [page, setPage] = useState<'table' | 'account' | 'guide' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.has('admin') || search.get('page') === 'admin' || window.location.hash.includes('admin') || window.location.pathname.startsWith('/admin')) {
        return 'admin';
      }
    }
    return 'table';
  });
  const guideReturn = useRef<'table' | 'account'>('table');
  const [replayId, setReplayId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; enabled: boolean } | null>(null);
  const [freeAccessMode, setFreeAccessMode] = useState<boolean>(true);
  const [nickname, setNickname] = useState('');
  const [authMode, setAuthMode] = useState<'create' | 'switch'>('create');
  const [switchCode, setSwitchCode] = useState('');
  const [knownAccounts, setKnownAccounts] = useState<Array<{ id: string; nickname: string; playerCode: string; lastSeen: number }>>(() => {
    try {
      const raw = localStorage.getItem('avalon_known_accounts');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveKnownAccount = (u: User) => {
    if (!u || !u.playerCode) return;
    try {
      const raw = localStorage.getItem('avalon_known_accounts');
      const list: Array<{ id: string; nickname: string; playerCode: string; lastSeen: number }> = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(item => item.playerCode !== u.playerCode && item.id !== u.id);
      filtered.unshift({
        id: u.id,
        nickname: u.nickname,
        playerCode: u.playerCode,
        lastSeen: Date.now(),
      });
      const updated = filtered.slice(0, 5);
      localStorage.setItem('avalon_known_accounts', JSON.stringify(updated));
      setKnownAccounts(updated);
    } catch {}
  };
  // Room join key is always strictly empty - never auto prefilled from historical/URL invite string
  const [key, setKey] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupSettings, setSetupSettings] = useState<Settings>(() => ({
    ...defaultSettings,
    playerCount: 6,
    captainMode: 'random_order',
    anonymousTeamVote: true,
    earlyAssassinationEnabled: true,
  }));
  const pendingSettingsRef = useRef<Settings | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [rolePrefModalOpen, setRolePrefModalOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<Member | null>(null);
  const [showcaseIndex, setShowcaseIndex] = useState(0);
  const [invite, setInvite] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('连接中');
  const transportRef = useRef<RoomConnection | null>(null);
  const [bootRetry, setBootRetry] = useState(0);

  // Agora Voice & Friends State
  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceManager.getState());
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [pendingInvitation, setPendingInvitation] = useState<{
    fromUser: User;
    roomId: string;
    roomCode: string;
  } | null>(null);
  const [incomingFriendRequestsCount, setIncomingFriendRequestsCount] = useState(0);

  // Room Chat & Direct Messages State
  const [roomChatMessages, setRoomChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatBubbles, setChatBubbles] = useState<Record<string, { text: string; expiresAt: number }>>({});
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [pendingDirectChat, setPendingDirectChat] = useState<{
    messageId: string;
    fromUser: User;
    text: string;
    timestamp: string;
  } | null>(null);
  const [chatFriendToOpen, setChatFriendToOpen] = useState<User | null>(null);

  const handleOpenChatDrawer = () => {
    setChatDrawerOpen(true);
    setUnreadChatCount(0);
  };

  // Auto expire floating bubbles
  useEffect(() => {
    const entries = Object.entries(chatBubbles);
    if (entries.length === 0) return;
    const now = Date.now();
    const nextExpiry = Math.min(...entries.map(([, b]) => b.expiresAt)) - now;
    if (nextExpiry <= 0) {
      setChatBubbles(prev => {
        const next = { ...prev };
        for (const [id, b] of Object.entries(next)) {
          if (b.expiresAt <= Date.now()) delete next[id];
        }
        return next;
      });
      return;
    }
    const timer = setTimeout(() => {
      setChatBubbles(prev => {
        const next = { ...prev };
        for (const [id, b] of Object.entries(next)) {
          if (b.expiresAt <= Date.now()) delete next[id];
        }
        return next;
      });
    }, nextExpiry + 50);
    return () => clearTimeout(timer);
  }, [chatBubbles]);


  useEffect(() => {
    return voiceManager.subscribe(setVoiceState);
  }, []);

  // Check admin url parameter and load system status
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.has('admin') || search.get('page') === 'admin' || window.location.hash.includes('admin') || window.location.pathname.startsWith('/admin')) {
      setPage('admin');
    }
    // Clean up lingering invite query parameter from browser address bar so page refreshes stay clean
    if (search.has('invite')) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
      } catch {}
    }
    let active = true;
    void api<{ announcement: { text: string; enabled: boolean }; freeAccessMode: boolean }>('/system/announcement')
      .then(res => {
        if (!active || !res) return;
        setFreeAccessMode(res.freeAccessMode);
        if (res.announcement && res.announcement.enabled && res.announcement.text && !res.announcement.text.includes('欢迎光临')) {
          const dismissed = sessionStorage.getItem('dismissed_announcement');
          if (dismissed !== res.announcement.text) {
            setAnnouncement(res.announcement);
          }
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Check incoming friend requests
  useEffect(() => {
    if (!user) return;
    let active = true;
    const checkFriends = async () => {
      try {
        const res = await api<{ friends: FriendSummary[] }>('/friends');
        if (!active) return;
        const incoming = res.friends.filter(f => f.status === 'pending' && !f.isSender);
        setIncomingFriendRequestsCount(incoming.length);
      } catch {
        // Silently ignore if offline
      }
    };
    void checkFriends();
    const interval = setInterval(() => void checkFriends(), 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user?.id, friendsModalOpen]);

  // Clean up voice when leaving room or when room settings disable voice
  useEffect(() => {
    if (!roomId || !user || (room && !room.settings.voiceChatEnabled)) {
      void voiceManager.leave();
    }
    return () => {
      void voiceManager.leave();
    };
  }, [roomId, user?.id, room?.settings.voiceChatEnabled]);

  const handleJoinVoice = async () => {
    if (!roomId || !room?.settings.voiceChatEnabled) return;
    try {
      const tokenData = await api<VoiceTokenResponse>(`/rooms/${roomId}/voice-token`);
      await voiceManager.join(tokenData);
    } catch (err) {
      console.warn('Failed to join voice:', err);
      setError('无法开启语音：' + (err instanceof Error ? err.message : '请检查网络或麦克风权限'));
    }
  };

  const handleLeaveVoice = async () => {
    await voiceManager.leave();
  };

  const handleToggleMute = () => {
    void voiceManager.toggleMute();
  };

  const handleToggleDeafen = () => {
    void voiceManager.toggleDeafen();
  };

  const handleReconnectVoice = () => {
    void handleJoinVoice();
  };

  const handleJoinByCode = async (code: string) => {
    try {
      const data = await api<{ room: RoomView }>('/rooms/join', { key: code });
      setRoom(data.room);
      setRoomId(data.room.id);
      setJoinOpen(false);
      setPage('table');
      history.replaceState(null, '', '/');
    } catch (err) {
      setError(describe(err));
    }
  };

  // Single-player interactive practice game state
  const [practiceGame, setPracticeGame] = useState<GameState | null>(null);
  const practiceGameRef = useRef<GameState | null>(null);
  practiceGameRef.current = practiceGame;
  const [practiceUserId, setPracticeUserId] = useState<string>('p1');
  const sound = useSound();
  useGameSound(practiceGame ? projectGame(practiceGame, practiceUserId) : room?.game ?? null,
    page === 'table' && !loading && !!user, !!practiceGame || !roomId || connection === '已连接');
  useNavigationSound(`${page}:${!!user}:${roomId ?? ''}:${practiceGame?.id ?? ''}:${setupOpen}:${joinOpen}`, !loading);

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
    if (!error) return;
    const timer = setTimeout(() => setError(''), 2000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    let active = true;
    api<{ user: User; roomId: string | null }>('/me')
      .then(data => {
        if (active) {
          setUser(data.user);
          saveKnownAccount(data.user);
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
        invitation: msg => {
          setPendingInvitation(msg);
        },
        announcement: msg => {
          if (msg && msg.enabled && msg.text && !msg.text.includes('欢迎光临')) {
            const dismissed = sessionStorage.getItem('dismissed_announcement');
            if (dismissed !== msg.text) {
              setAnnouncement(msg);
            }
          } else {
            setAnnouncement(null);
          }
        },
        roomChat: msg => {
          setRoomChatMessages(prev => [...prev.slice(-49), msg]);
          setChatBubbles(prev => ({
            ...prev,
            [msg.fromUserId]: { text: msg.text, expiresAt: Date.now() + 3800 },
          }));
          setUnreadChatCount(prev => prev + 1);
        },
        directChat: msg => {
          setPendingDirectChat(msg);
        },
        ended: reason => {
          setRoomId(null);
          setRoom(null);
          setPage('table');
          setSettingsModalOpen(false);
          setKickTarget(null);
          setSetupOpen(false);
          setJoinOpen(false);
          setInvite('');
          setBusy(false);
          setRoomChatMessages([]);
          setChatBubbles({});
          setChatDrawerOpen(false);
          setUnreadChatCount(0);
          if (reason === 'expired') {
            setUser(null);
            setError(errors.UNAUTHENTICATED);
          } else if (reason === 'closed') { setError(''); setNotice('房间已关闭，已返回游戏大厅。'); }
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
        room.settings.earlyAssassinationEnabled !== target.earlyAssassinationEnabled ||
        room.settings.guardianPerksEnabled !== target.guardianPerksEnabled ||
        room.settings.autoRevealRoleEnabled !== target.autoRevealRoleEnabled ||
        room.settings.treasuresEnabled !== target.treasuresEnabled ||
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

  async function handleLogout() {
    await run(async () => {
      await api('/sessions', {}, 'DELETE');
      setUser(null);
      setRoomId(null);
      setRoom(null);
      setPage('table');
      setNotice('已注销当前身份，请重新输入尊号入局');
    });
  }

  async function handleSwitchAccount(code: string) {
    const clean = code.trim();
    if (!/^\d{6}$/.test(clean)) {
      setError('请输入6位有效数字仙友码');
      return;
    }
    await run(async () => {
      const data = await api<{ user: User }>('/sessions/switch', { playerCode: clean });
      setUser(data.user);
      saveKnownAccount(data.user);
      setSwitchCode('');
      try {
        const meData = await api<{ user: User; roomId: string | null }>('/me');
        setRoomId(meData.roomId);
      } catch {}
      setNotice(`仙友 ${data.user.nickname}（#${data.user.playerCode}）已归位！`);
    });
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
    const rolePreferences = s.rolePreferenceEnabled && room?.selfRolePreferences?.length
      ? { p1: room.selfRolePreferences }
      : undefined;
    const g = createGame(`practice-game-${Date.now()}`, players, s, shuffleArray, { rolePreferences });
    setPracticeUserId('p1');
    practiceGameRef.current = g;
    setPracticeGame(g);
    setSetupOpen(false);
  }

  function handlePracticeCommand(action: Pick<Command, 'type' | 'payload'>) {
    const currentGame = practiceGameRef.current;
    if (!currentGame) return;
    if (action.type === 'returnToLobby') {
      startPracticeGame(currentGame.settings);
      return;
    }
    try {
      const onlineIds = currentGame.players.map(p => p.id);
      let next = transition(currentGame, practiceUserId, action, onlineIds);
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
          if (next.phase !== 'team_vote') break;
          if (p.id !== practiceUserId && !(p.id in next.teamVotes)) {
            next = transition(next, p.id, { type: 'teamVote', payload: { approve: true } }, onlineIds);
          }
        }
      }
      if (next.phase === 'guanyin_window') {
        const guanyin = next.players.find(p => next.roles[p.id] === 'guinevere');
        if (guanyin && guanyin.id !== practiceUserId) {
          const round = next.rounds.at(-1);
          const target = round?.team.find(id => id !== guanyin.id);
          if (target) {
            next = transition(next, guanyin.id, { type: 'useTreasure', payload: { action: 'guanyinMirror', targetId: target } }, onlineIds);
          } else {
            next = transition(next, guanyin.id, { type: 'useTreasure', payload: { action: 'guanyinMirror', skip: true } }, onlineIds);
          }
        }
      }
      // Let the human try the bell before practice bots immediately play their cards.
      // This is local practice pacing only; multiplayer never waits for a treasure.
      const tryingHeartBell = projectGame(next, practiceUserId).self?.treasures?.heartBell?.available ||
        (action.type === 'useTreasure' && 'action' in action.payload && action.payload.action === 'heartBell');
      if (next.phase === 'mission' && !tryingHeartBell) {
        const round = next.rounds.at(-1)!;
        for (const pid of round.team) {
          if (next.phase !== 'mission') break;
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
      const finalGame = next.result?.reason === 'host_ended' ? null : next;
      practiceGameRef.current = finalGame;
      setPracticeGame(finalGame);
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
          if (next.phase !== 'team_vote') break;
          if (!(p.id in next.teamVotes)) {
            next = transition(next, p.id, { type: 'teamVote', payload: { approve: true } }, onlineIds);
          }
        }
      } else if (next.phase === 'guanyin_window') {
        const guanyin = next.players.find(p => next.roles[p.id] === 'guinevere');
        if (guanyin) {
          const round = next.rounds.at(-1);
          const target = round?.team.find(id => id !== guanyin.id);
          if (target) {
            next = transition(next, guanyin.id, { type: 'useTreasure', payload: { action: 'guanyinMirror', targetId: target } }, onlineIds);
          } else {
            next = transition(next, guanyin.id, { type: 'useTreasure', payload: { action: 'guanyinMirror', skip: true } }, onlineIds);
          }
        }
      } else if (next.phase === 'mission') {
        const round = next.rounds.at(-1)!;
        for (const pid of round.team) {
          if (next.phase !== 'mission') break;
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
  const activeGame = practiceGame ?? room?.game;
  const scene = page === 'guide' || setupOpen ? 'library' : page === 'account' ? 'dawn' : activeGame ? (activeGame.result ? 'dawn' : 'sword') : roomId ? 'pavilion' : 'gate';

  return (
    <main data-scene={scene} data-sound="tap" className={`app-shell ${inTableViewport ? 'is-table-viewport is-live-table' : ''}`}>
      {/* Global Announcement Marquee */}
      {announcement?.enabled && announcement.text && !announcement.text.includes('欢迎光临') && page !== 'admin' && (
        <div className="global-announcement-marquee" role="alert">
          <div className="global-announcement-text">
            <span>📢</span>
            <span>{announcement.text}</span>
          </div>
          <button
            type="button"
            className="global-announcement-close"
            onClick={() => {
              if (announcement?.text) {
                sessionStorage.setItem('dismissed_announcement', announcement.text);
              }
              setAnnouncement(null);
            }}
            aria-label="关闭广播"
          >
            ✕
          </button>
        </div>
      )}

      {/* Toast Alerts */}
      {room?.phase === 'waiting' && user && <ReadyReminder room={room} userId={user.id} disabled={busy || connection !== '已连接'} onReady={() => command({type:'setReady',payload:{ready:true}})} />}
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

      {page === 'admin' ? (
        <AdminDashboard onBackToGame={() => setPage(user ? 'table' : 'table')} />
      ) : page === 'guide' ? (
        <GuidePanel onBack={() => setPage(user ? guideReturn.current : 'table')} />
      ) : loading ? (
        <div className="skeleton" aria-label="正在恢复访客身份" />
      ) : !user ? (
        /* Guest Entry Screen */
        <div className="mp-home-screen">
          <div className="mp-logo-block">
            <h1 className="mp-avalon-logo">
              <span className="logo-word">嘻游</span>
              <span className="logo-dot">·</span>
              <span className="logo-word">真假猴王</span>
            </h1>
            <p className="mp-avalon-sub">一念佛魔皆幻相，谁是修道取经人</p>
          </div>
          <section className="panel guest-login-card">
            <h2>{authMode === 'create' ? '请留取经尊号' : '仙友归位'}</h2>

            <div className="guest-tabs-bar" role="tablist" aria-label="登录模式选择">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'create'}
                className={`guest-tab-btn ${authMode === 'create' ? 'is-active' : ''}`}
                onClick={() => setAuthMode('create')}
              >
                ✨ 新入仙途（取名启程）
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'switch'}
                className={`guest-tab-btn is-switch ${authMode === 'switch' ? 'is-active is-switch' : ''}`}
                onClick={() => setAuthMode('switch')}
              >
                🔄 仙友归位（切换账号）
              </button>
            </div>

            {authMode === 'create' ? (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void run(async () => {
                    const data = await api<{ user: User }>('/sessions/guest', { nickname });
                    setUser(data.user);
                    saveKnownAccount(data.user);
                  });
                }}
              >
                <p className="muted" id="nickname-next-step">
                  输入尊号昵称即可踏入取经大道，开启或加入真假猴王取经之局。
                </p>
                <Label.Root htmlFor="nickname">你的尊号（昵称）</Label.Root>
                <input
                  id="nickname"
                  value={nickname}
                  maxLength={20}
                  required
                  autoComplete="nickname"
                  aria-describedby="nickname-next-step nickname-identity-hint"
                  placeholder="例如：仙友xx"
                  onChange={e => setNickname(e.target.value)}
                />
                <p className="hint" id="nickname-identity-hint">
                  系统会自动为你分派唯一的 6 位专属仙友码，在不同设备或账号间自由切换。
                </p>
                <button className="mp-cyan-pill" disabled={busy || !nickname.trim()} type="submit">
                  {busy ? '正在踏入取经大道…' : '踏入取经大道'}
                </button>
              </form>
            ) : (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void handleSwitchAccount(switchCode);
                }}
              >
                <p className="muted" id="switch-next-step">
                  输入你的 6 位唯一专属仙友码，立即切回历史账号查看功果簿战绩。
                </p>
                <Label.Root htmlFor="switchCode">6 位专属仙友码</Label.Root>
                <input
                  id="switchCode"
                  className="guest-switch-input"
                  value={switchCode}
                  maxLength={6}
                  pattern="\d{6}"
                  required
                  autoComplete="off"
                  aria-describedby="switch-next-step"
                  placeholder="例如：123456"
                  onChange={e => setSwitchCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <p className="hint">
                  仙友码可在个人中心“功果簿”中查看并复制，永久绑定个人历史胜率与复盘。
                </p>
                <button
                  className="mp-gold-pill"
                  disabled={busy || switchCode.trim().length !== 6}
                  type="submit"
                >
                  {busy ? '正在寻回仙友仙籍…' : '立即归位切回账号'}
                </button>
              </form>
            )}

            {/* Recently Used Accounts Quick Switcher */}
            {knownAccounts.length > 0 && (
              <div style={{ marginTop: '20px', borderTop: '1px dashed rgba(255, 255, 255, 0.15)', paddingTop: '14px' }}>
                <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '0 0 6px', fontWeight: 600 }}>
                  📜 常用仙籍（点击秒切）：
                </p>
                <div className="guest-known-list">
                  {knownAccounts.map(acc => (
                    <button
                      key={acc.playerCode}
                      type="button"
                      disabled={busy}
                      className="guest-known-item"
                      onClick={() => void handleSwitchAccount(acc.playerCode)}
                      title={`快速切回 ${acc.nickname}（仙友码 #${acc.playerCode}）`}
                    >
                      <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{acc.nickname}</span>
                      <span style={{ color: '#ffd875', fontFamily: 'monospace', fontSize: '12px' }}>
                        #{acc.playerCode} · 点击切入 ➔
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <button
                className="secondary"
                style={{ marginTop: '14px', width: '100%' }}
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
          onLogout={handleLogout}
        />
      ) : practiceGame ? (
        /* Single-Player Interactive Sandbox Game Table */
        <div className="room-table-screen">
          <header className="room-top-bar is-practice-top-bar">
            <div className="room-top-left">
              <button
                type="button"
                className="a2-exit-circle-btn"
                aria-label="退出试玩"
                title="退出试玩"
                onClick={() => setPracticeGame(null)}
              >
                <svg viewBox="0 0 24 24" className="a2-exit-arrow-svg" aria-hidden="true">
                  <path d="M9 14l-4-4 4-4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 10h11a4 4 0 1 1 0 8h-1" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <PracticeSeatPicker gameId={practiceGame.id} players={practiceGame.players} roles={practiceGame.roles}
                value={practiceUserId} onChange={setPracticeUserId} />
            </div>
            <h1 className="table-top-title">嘻游 · 真假猴王</h1>
            <div className="room-top-right">
              <SoundButton />
              {!isEnded(practiceGame) && (
                <button
                  type="button"
                  className="secondary tool-pill pulse-action"
                  aria-label="⚡ 电脑代操下一步"
                  onClick={stepPracticeBot}
                >
                  ⚡ 代操
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
              hostId: practiceGame.players[0].id,
              version: 1,
              phase: isEnded(practiceGame) ? 'finished' : 'playing',
              settings: practiceGame.settings,
              acceptingNewMembers: false,
              members: practiceGame.players.map((p, idx) => ({
                ...p,
                avatar: idx === 0 ? user.avatar : undefined,
                avatarUrl: idx === 0 ? user.avatarUrl ?? null : null,
                wechatAvatarUrl:
                  idx === 0
                    ? user.wechatAvatarUrl ?? WECHAT_SAMPLE_AVATARS[0]
                    : WECHAT_SAMPLE_AVATARS[idx % WECHAT_SAMPLE_AVATARS.length],
                ready: true,
                online: true,
              })),
              game: projectGame(practiceGame, practiceUserId),
            }}
            userId={practiceUserId}
            disabled={false}
            connected={true}
            onSound={cue => void sound.engine.effect(cue)}
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
              <span className="mp-setup-title">
                {setupSettings.voiceChatEnabled ? '🎙️ 开启语音房' : '🏛️ 开启常规房'}
              </span>
              <div className="home-tools"><SoundButton /><button
                type="button"
                className="secondary tool-pill"
                onClick={() => {
                  guideReturn.current = 'table';
                  setPage('guide');
                }}
              >
                规则
              </button></div>
            </header>

            {/* Room Type Selector in Setup Screen */}
            <div className="mp-setup-mode-row" role="radiogroup" aria-label="房间类型选择">
              <button
                type="button"
                role="radio"
                aria-checked={!setupSettings.voiceChatEnabled}
                className={`mp-setup-mode-btn ${!setupSettings.voiceChatEnabled ? 'is-active' : ''}`}
                onClick={() => setSetupSettings(s => ({ ...s, voiceChatEnabled: false }))}
              >
                <span className="mode-btn-icon">🏛️</span>
                <span className="mode-btn-info">
                  <strong>线下常规房</strong>
                  <small>同桌聚会 · 面杀无语音</small>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={setupSettings.voiceChatEnabled}
                className={`mp-setup-mode-btn ${setupSettings.voiceChatEnabled ? 'is-active' : ''}`}
                onClick={() => setSetupSettings(s => ({ ...s, voiceChatEnabled: true }))}
              >
                <span className="mode-btn-icon">🎙️</span>
                <span className="mode-btn-info">
                  <strong>远端语音房</strong>
                  <small>线上开黑 · 实时语音</small>
                </span>
              </button>
            </div>

            <div className="mp-shield-row" role="radiogroup" aria-label="选择游戏人数">
              {[5, 6, 7, 8, 9, 10, 11, 12].map(count => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={setupSettings.playerCount === count}
                  className={`mp-shield-btn ${setupSettings.playerCount === count ? 'is-active' : ''}`}
                  onClick={() => setSetupSettings(s => ({ ...s, playerCount: count, anonymousTeamVote: defaultAnonymousTeamVote(count) }))}
                >
                  <span>{count}</span>
                </button>
              ))}
            </div>

            <div className="mp-factions-stack">
              <section className="mp-faction-panel is-blue">
                <h3>蓝方 · 取经正果 ({setupBlueRoles.length}人)</h3>
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
                        <small>{roleTitles[role]}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mp-faction-panel is-red">
                <h3>红方 · 群妖乱道 ({setupRedRoles.length}人)</h3>
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
                        <small>{roleTitles[role]}</small>
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
                {busy ? '正在开启法坛…' : setupSettings.voiceChatEnabled ? '开启远端语音房' : '开启线下常规房'}
              </button>
              <button
                type="button"
                className="mp-subtle-link"
                onClick={() => startPracticeGame(setupSettings)}
              >
                幻境单人演练 {setupSettings.playerCount} 人取经牌局 ›
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
                  <PlayerAvatar
                    avatar={user.avatar}
                    avatarUrl={user.avatarUrl}
                    wechatAvatarUrl={user.wechatAvatarUrl}
                    fallbackKind="crown"
                  />
                </span>
                <span className="mp-avatar-name">{user.nickname}</span>
              </button>

              <div className="home-tools">
                <button
                  type="button"
                  className="secondary tool-pill friends-pill-btn"
                  onClick={() => setFriendsModalOpen(true)}
                  title="仙友录 · 召集与好友"
                >
                  👥 仙友
                  {incomingFriendRequestsCount > 0 && (
                    <span className="friends-badge-dot">{incomingFriendRequestsCount}</span>
                  )}
                </button>
                <SoundButton />
                <button
                  type="button"
                  className="secondary tool-pill home-logout-btn"
                  onClick={handleLogout}
                  title="注销当前登录状态，更换新身份"
                >
                  🚪 换号
                </button>
                <button
                  type="button"
                  className="secondary tool-pill home-guide-btn"
                  onClick={() => {
                    guideReturn.current = 'table';
                    setPage('guide');
                  }}
                  title="嘻游识妖谱 · 规则说明"
                >
                  📖 识妖谱
                </button>
              </div>
            </header>

            <div className="mp-logo-block">
              <h1 className="mp-avalon-logo">
                <span className="logo-word">嘻游</span>
                <span className="logo-dot">·</span>
                <span className="logo-word">真假猴王</span>
              </h1>
              <p className="mp-avalon-sub">一念佛魔皆幻相，谁是修道取经人</p>
              {freeAccessMode && (
                <div className="lobby-banner-wrap">
                  <span className="lobby-free-access-banner">
                    🎉 公测盛典 · 全特权限时免费畅玩中
                  </span>
                </div>
              )}
            </div>

            {/* Center Single Role Medallion (Auto-rotates one role at a time, non-clickable) */}
            <section
              className="mp-medallion-stage"
              aria-label="角色展示"
            >
              <div className={`mp-medallion-circle allegiance-${roleTeam(showcaseRole)}`}>
                <RolePortrait
                  role={showcaseRole}
                  femaleDemon={showcaseRole === 'minion' ? 'yutu' : undefined}
                  size="card"
                />
              </div>
              <h2 className="mp-medallion-name">
                {showcaseRole === 'minion' ? '玉兔精' : roleNames[showcaseRole]}
              </h2>
              <p className="mp-medallion-motto">
                {showcaseRole === 'minion' ? FEMALE_DEMONS.yutu.motto : roleMottos[showcaseRole]}
              </p>
            </section>

            <footer className="mp-home-footer">
              {/* Room Mode Toggle: Offline Regular vs Online Voice */}
              <div className="lobby-mode-switch" role="radiogroup" aria-label="建房模式">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!setupSettings.voiceChatEnabled}
                  className={`lobby-mode-pill ${!setupSettings.voiceChatEnabled ? 'is-active' : ''}`}
                  onClick={() => setSetupSettings(s => ({ ...s, voiceChatEnabled: false }))}
                  title="同桌线下聚会，无语音干扰"
                >
                  🏛️ 线下常规房
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={setupSettings.voiceChatEnabled}
                  className={`lobby-mode-pill ${setupSettings.voiceChatEnabled ? 'is-active' : ''}`}
                  onClick={() => setSetupSettings(s => ({ ...s, voiceChatEnabled: true }))}
                  title="远端线上开黑，支持声网高清实时语音"
                >
                  🎙️ 远端语音房
                </button>
              </div>

              <div className="lobby-primary-actions">
                <button
                  type="button"
                  className="mp-cyan-pill"
                  disabled={busy}
                  onClick={() => setSetupOpen(true)}
                >
                  <Emblem kind="mountain" />
                  {setupSettings.voiceChatEnabled ? '开语音房' : '开常规房'}
                </button>
                <button
                  type="button"
                  className="secondary lobby-join"
                  onClick={() => {
                    setKey('');
                    setJoinOpen(true);
                  }}
                >
                  <Emblem kind="crown" />加入房间
                </button>
              </div>
              <button type="button" className="secondary practice-entry" onClick={() => startPracticeGame(setupSettings)}>🐒 幻境单人试玩 ›</button>
              <div className="lobby-compact-links" role="navigation" aria-label="快捷导航">
                <button
                  type="button"
                  className="lobby-link-btn"
                  onClick={() => { setReplayId(null); setPage('account'); }}
                  title="功果簿（战绩与个人资料）"
                >
                  📜 功果簿
                </button>
                <span className="lobby-link-sep" aria-hidden="true">·</span>
                <button
                  type="button"
                  className="lobby-link-btn is-logout"
                  onClick={handleLogout}
                  title="退出当前登录并更换新身份"
                >
                  🚪 退出登录
                </button>
              </div>
            </footer>

            {/* Join Room Modal */}
            {joinOpen && (
              <Modal
                label="加入朋友房间"
                scene="gate"
                onClose={() => {
                  setKey('');
                  setJoinOpen(false);
                }}
              >
                <div className="table-modal-sheet">
                  <div className="table-modal-head">
                    <strong>加入朋友的房间</strong>
                    <button
                      type="button"
                      className="secondary tool-pill"
                      onClick={() => {
                        setKey('');
                        setJoinOpen(false);
                      }}
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
                        setKey('');
                        setJoinOpen(false);
                        history.replaceState(null, '', '/');
                      });
                    }}
                  >
                    <Label.Root htmlFor="room-key">输入 6 位数字房号或粘贴邀请链接</Label.Root>
                    <div className="join-room-input-wrap">
                      <input
                        id="room-key"
                        value={key}
                        required
                        placeholder="例如：6位数字房号（如 382910）或完整邀请链接"
                        onChange={e => setKey(e.target.value)}
                        autoComplete="off"
                        autoFocus
                      />
                      {Boolean(key) && (
                        <button
                          type="button"
                          className="join-room-clear-btn"
                          onClick={() => setKey('')}
                          title="清空输入"
                          aria-label="清空输入内容"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <button className="mp-cyan-pill" disabled={busy || !key.trim()} type="submit">
                      {busy ? '正在入座…' : '立即入座'}
                    </button>
                  </form>
                </div>
              </Modal>
            )}
          </div>
        )
      ) : !room ? (
        <div className="skeleton" aria-label="正在恢复房间" />
      ) : (
        /* Single-Screen Room & Game Table Viewport */
        <div className="room-table-screen">
          {/* Compact Top Header Bar */}
          <header className="room-top-bar is-room-top-bar">
            <div className="room-top-left">
              <button
                type="button"
                className="a2-exit-circle-btn"
                disabled={disabled}
                aria-label={room.phase === 'playing' ? (room.hostId === user.id ? '结束游戏' : '退出房间') : '退出房间'}
                title={room.phase === 'playing' ? (room.hostId === user.id ? '结束游戏' : '退出房间') : '退出房间'}
                onClick={() => {
                  if (room.phase === 'playing') {
                    if (window.confirm(room.hostId === user.id ? '确定要结束本局游戏吗？' : '确定要退出当前房间吗？')) {
                      command(room.hostId === user.id ? { type: 'endGame', payload: {} } : { type: 'leaveRoom', payload: {} });
                    }
                  } else {
                    command({ type: 'leaveRoom', payload: {} });
                  }
                }}
              >
                <svg viewBox="0 0 24 24" className="a2-exit-arrow-svg" aria-hidden="true">
                  <path d="M9 14l-4-4 4-4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 10h11a4 4 0 1 1 0 8h-1" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
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
                  {room.members.length}/{room.settings.playerCount}人 · 复制
                </small>
              </button>
            </div>
            <h1 className="table-top-title">嘻游 · 真假猴王</h1>
            <div className="room-top-right">
              <SoundButton />
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
                onClick={handleOpenChatDrawer}
                aria-label="法坛传音"
                style={{ position: 'relative' }}
              >
                💬 传音
                {unreadChatCount > 0 && <span className="chat-unread-dot" />}
              </button>
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
            <>
              <GamePanel
                key={room.game.id}
                room={room}
                userId={user.id}
                disabled={disabled}
                connected={connection === '已连接'}
                onSound={cue => void sound.engine.effect(cue)}
                send={command}
                onOpenGuide={() => {
                  guideReturn.current = 'table';
                  setPage('guide');
                }}
                onOpenReplay={gameId => {
                  setReplayId(gameId);
                  setPage('account');
                }}
                speakingUids={voiceState.speakingUids}
                voiceState={voiceState}
                onToggleMute={handleToggleMute}
                chatBubbles={chatBubbles}
                onOpenChat={handleOpenChatDrawer}
                hasUnreadChat={unreadChatCount > 0}
              />
              {room.settings.voiceChatEnabled && (
                <div className="game-floating-voice-hud" aria-label="实时语音控制">
                  <VoiceControls
                    voiceState={voiceState}
                    onJoin={handleJoinVoice}
                    onLeave={handleLeaveVoice}
                    onToggleMute={handleToggleMute}
                    onToggleDeafen={handleToggleDeafen}
                    onReconnect={handleReconnectVoice}
                  />
                </div>
              )}
            </>
          ) : (
            /* Waiting Room Single-Screen Table with Physical Quest Board at Top */
            <div className="waiting-table-body">
              {/* Top Physical 5-Mission Quest Board Preview for Current Player Count */}
              <div className="avalon-quest-board">
                <div className="game-score quest-circles-row" aria-label="本局五轮任务配置">
                  {(MISSION_SIZES[room.settings.playerCount] ?? MISSION_SIZES[6]).map((count, i) => {
                    const twoFailsRequired = failuresRequiredFor(room.settings.playerCount, i + 1) === 2;
                    return (
                      <QuestMedallion key={i} mission={i + 1} count={count} twoFailsRequired={twoFailsRequired} />
                    );
                  })}
                </div>

                <div
                  className="quest-vote-track-zone is-clickable"
                  onClick={() => setSettingsModalOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSettingsModalOpen(true);
                    }
                  }}
                  title={host ? '点击修改房间规则与人数配置' : '点击查看房间详细规则配置'}
                  aria-label={host ? '点击修改房间规则与人数配置' : '点击查看房间详细规则配置'}
                >
                  <div className="quest-vote-track-left">
                    <div className="quest-track-head">
                      <span className="quest-track-sub">
                        {settingsText(room.settings)}
                        <span className="quest-track-edit-cue" aria-hidden="true">
                          {host ? ' ⚙️修改' : ' ⚙️'}
                        </span>
                      </span>
                    </div>

                  </div>

                  <div className="quest-faction-plaque">
                    <strong>{room.settings.playerCount}位玩家</strong>
                    <span>
                      {(ROLE_CONFIG[room.settings.playerCount] ?? []).filter(r => roleTeam(r) === 'red').length}
                      名群妖乱道
                    </span>
                  </div>
                </div>
              </div>

              {/* Phase & Host Hint Banner */}
              <div className="scheme3-middle-zone">
                <div className="scheme3-ink-ribbon">
                  <span className="ink-ribbon-ornament" aria-hidden="true">〰</span>
                  <p className="ink-ribbon-text">
                    等待仙友入座 <strong>{room.members.length}/{room.settings.playerCount}</strong>
                  </p>
                  <span className="ink-ribbon-ornament" aria-hidden="true">〰</span>
                </div>
              </div>

              {/* 5–12 Player Compact Seat Grid */}
              <div
                className={`table-seats-grid ${
                  room.settings.playerCount > 10
                    ? 'grid-12'
                    : room.settings.playerCount > 8
                      ? 'grid-10'
                      : 'grid-8'
                }`}
                data-player-count={room.settings.playerCount}
                aria-label="房间座位"
              >
                {Array.from({ length: room.settings.playerCount }, (_, i) => {
                  const m = room.members.find(member => member.seat === i + 1);
                  const isRoomHost = m && m.id === room.hostId;
                  const isMemberSpeaking = m ? voiceState.speakingUids.has(uuidToRtcUid(m.id)) : false;
                  return (
                    <div
                      key={i}
                      role={!m ? 'button' : undefined}
                      tabIndex={!m ? 0 : undefined}
                      aria-label={!m ? `${i + 1}号空位，复制邀请链接` : undefined}
                      onKeyDown={e => {
                        if (!m && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          copyInviteLink();
                        }
                      }}
                      onClick={() => {
                        if (!m) copyInviteLink();
                      }}
                      className={[
                        'table-seat-card',
                        m ? 'occupied' : 'is-empty',
                        m?.id === user.id ? 'is-me' : '',
                        isRoomHost ? 'is-captain' : '',
                        m?.ready ? 'is-ready' : '',
                        isMemberSpeaking ? 'seat-is-speaking' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {/* Floating Chat Bubble */}
                      {m && chatBubbles[m.id] && (
                        <div className="seat-chat-bubble-anchor">
                          <div className="seat-chat-bubble">{chatBubbles[m.id].text}</div>
                        </div>
                      )}
                      <div className="seat-card-top">
                        <div className="seat-top-badges">
                          {isRoomHost && <span className="seat-badge badge-captain">👑 房主</span>}
                          {host && m && m.id !== user.id && (
                            <button
                              type="button"
                              className="seat-kick-btn"
                              disabled={disabled}
                              title={`将 ${m.nickname} 移出房间`}
                              aria-label={`踢出 ${m.nickname}`}
                              onClick={e => {
                                e.stopPropagation();
                                setKickTarget(m);
                              }}
                            >
                              踢出
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={`seat-card-avatar-wrap ${isMemberSpeaking ? 'is-speaking' : ''}`}>
                        {isMemberSpeaking && (
                          <span className="seat-speaking-ring" aria-hidden="true" />
                        )}
                        {isRoomHost && (
                          <span className="seat-aura-ring aura-gold" aria-hidden="true" />
                        )}
                        <div className={`seat-card-avatar ${isMemberSpeaking ? 'speaking-avatar' : ''}`}>
                          <PlayerAvatar
                            avatar={m?.avatar}
                            avatarUrl={m?.avatarUrl}
                            wechatAvatarUrl={m?.wechatAvatarUrl}
                            fallbackKind="cards"
                          />
                        </div>
                        {m && (
                          <SeatMicBadge
                            playerId={m.id}
                            userId={user.id}
                            voiceChatEnabled={room.settings.voiceChatEnabled}
                            voiceState={voiceState}
                            onToggleMute={m.id === user.id ? handleToggleMute : undefined}
                          />
                        )}
                        <span className="seat-num-badge">{i + 1}</span>
                      </div>
                      <strong className="seat-card-name">
                        {m
                          ? `${m.nickname}${
                              room.members.filter(x => x.nickname === m.nickname).length > 1
                                ? ` #${m.playerCode ? m.playerCode.slice(-4) : m.id.slice(0, 4)}`
                                : ''
                            }${m.id === user.id ? '（你）' : ''}`
                          : '邀请好友'}
                      </strong>
                      <div className="seat-card-bottom">
                        {m ? (
                          <>
                            <span className={`seat-chip ${m.ready ? 'chip-approve' : 'chip-status'}`}>
                              {m.online ? (m.ready ? '✓ 已准备' : '未准备') : '暂时离线'}
                            </span>
                            {room.settings.rolePreferenceEnabled && (
                              m.id === user.id ? (
                                <span
                                  className="badge-role-pref is-mine"
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setRolePrefModalOpen(true);
                                  }}
                                  title="点击修改心仪角色"
                                >
                                  🎭 意向 {room.selfRolePreferences?.length ?? 0}/3
                                </span>
                              ) : m.hasRolePreference ? (
                                <span className="badge-role-pref" title="该仙友已选定心仪出战角色">
                                  ✨ 已选意向
                                </span>
                              ) : null
                            )}
                          </>
                        ) : (
                          <span className="seat-chip chip-hint">点击复制链接</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>


              {/* Bottom Waiting Voice & Social Action Bar */}
              <div className="waiting-voice-social-row">
                {room.settings.voiceChatEnabled ? (
                  <div className="waiting-voice-capsule">
                    <VoiceControls
                      voiceState={voiceState}
                      onJoin={handleJoinVoice}
                      onLeave={handleLeaveVoice}
                      onToggleMute={handleToggleMute}
                      onToggleDeafen={handleToggleDeafen}
                      onReconnect={handleReconnectVoice}
                    />
                  </div>
                ) : (
                  <div className="waiting-offline-badge" title="本房间为线下常规聚会房，无语音干扰">
                    <span>🏛️ 线下房</span>
                  </div>
                )}
                <button
                  type="button"
                  className="secondary tool-pill waiting-friends-pill-btn"
                  onClick={handleOpenChatDrawer}
                  title="法坛传音"
                  style={{ position: 'relative' }}
                >
                  <span className="friends-btn-icon">💬</span>
                  <span className="friends-btn-label">传音</span>
                  {unreadChatCount > 0 && <span className="chat-unread-dot" />}
                </button>
                <button
                  type="button"
                  className="secondary tool-pill waiting-friends-pill-btn"
                  onClick={() => setFriendsModalOpen(true)}
                  title="仙友录 · 召集与好友"
                >
                  <span className="friends-btn-icon">👥</span>
                  <span className="friends-btn-label">仙友</span>
                  {incomingFriendRequestsCount > 0 && (
                    <span className="friends-badge-dot">{incomingFriendRequestsCount}</span>
                  )}
                </button>
              </div>

              {/* Bottom Waiting Action Dock */}
              <div className="table-action-dock waiting-dock">
                <div className="dock-inline-controls waiting-dock-controls">
                  <button
                    type="button"
                    className={`mp-cyan-pill waiting-ready-btn ${me?.ready ? 'is-ready-state' : ''}`}
                    disabled={disabled}
                    onClick={() => command({ type: 'setReady', payload: { ready: !me?.ready } })}
                  >
                    <span className="waiting-btn-text">{me?.ready ? '取消取经' : '✋ 出发取经'}</span>
                  </button>
                  {room.settings.rolePreferenceEnabled && (
                    <button
                      type="button"
                      className="secondary tool-pill waiting-role-pref-btn"
                      onClick={() => setRolePrefModalOpen(true)}
                      title="设置心仪出战角色（第1/2/3志愿）"
                    >
                      <span className="waiting-btn-text">
                        🎭 心仪角色 {room.selfRolePreferences && room.selfRolePreferences.length > 0 ? `(${room.selfRolePreferences.length}/3)` : '(未设)'}
                      </span>
                    </button>
                  )}
                  {host &&
                  room.members.length === room.settings.playerCount &&
                  room.members.every(m => m.ready) ? (
                    <button
                      type="button"
                      className="mp-cyan-pill waiting-start-btn"
                      disabled={disabled}
                      onClick={() => command({ type: 'startGame', payload: {} })}
                    >
                      <span className="waiting-btn-text">📜 仙友齐聚 · 敕令发牌</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary tool-pill pulse-action waiting-practice-btn"
                      onClick={() => startPracticeGame(room.settings)}
                    >
                      <span className="waiting-btn-text">🐒 幻化分身试玩 ({room.settings.playerCount}人局)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Host Kick Confirmation Modal */}
          {kickTarget && (
            <Modal label="确认踢出玩家" scene="pavilion" onClose={() => setKickTarget(null)}>
              <div className="table-modal-sheet">
                <div className="table-modal-head">
                  <strong>移出房间成员</strong>
                  <button
                    type="button"
                    className="secondary tool-pill"
                    onClick={() => setKickTarget(null)}
                  >
                    取消
                  </button>
                </div>
                <p>
                  确认将 <strong>{String(kickTarget.seat).padStart(2, '0')}号 · {kickTarget.nickname}{room.members.filter(x => x.nickname === kickTarget.nickname).length > 1 && kickTarget.playerCode ? ` #${kickTarget.playerCode.slice(-4)}` : ''}</strong> 移出当前房间吗？移出后该座位将立即空出。
                </p>
                <div className="dock-inline-controls" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setKickTarget(null)}
                  >
                    保留座位
                  </button>
                  <button
                    type="button"
                    className="assassin-execute-btn"
                    disabled={disabled}
                    onClick={() => {
                      const target = kickTarget;
                      setKickTarget(null);
                      command({ type: 'kickMember', payload: { userId: target.id } });
                      setNotice(`已将 ${target.nickname} 移出房间`);
                    }}
                  >
                    确认踢出
                  </button>
                </div>
              </div>
            </Modal>
          )}

          {/* Room Settings Modal */}
          {settingsModalOpen && (
            <Modal label="房间设置" scene="library" onClose={() => setSettingsModalOpen(false)}>
              <div className="table-modal-sheet settings-sheet dedicated-settings-sheet">
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
                <div className="settings-body">
                  <p className="hint settings-hint">
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
                  {host && room.phase !== 'playing' && room.members.some(m => m.id !== user.id) && (
                    <div className="settings-member-list">
                      <strong>房间成员管理</strong>
                      <div className="settings-member-rows">
                        {room.members
                          .filter(m => m.id !== user.id)
                          .map(m => (
                            <div key={m.id} className="settings-member-row">
                              <span>
                                {String(m.seat).padStart(2, '0')}号 · {m.nickname}
                                {room.members.filter(x => x.nickname === m.nickname).length > 1 && m.playerCode ? ` #${m.playerCode.slice(-4)}` : ''}{' '}
                                <small className="hint">({m.online ? '在线' : '离线'})</small>
                              </span>
                              <button
                                type="button"
                                className="seat-kick-btn"
                                disabled={disabled}
                                onClick={() => {
                                  setSettingsModalOpen(false);
                                  setKickTarget(m);
                                }}
                              >
                                踢出房间
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
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
                <button type="button" className="return-table-btn" onClick={() => setSettingsModalOpen(false)}>返回法坛</button>
              </div>
            </Modal>
          )}

          {/* Friends & Invitation Modal */}
          <FriendsModal
            open={friendsModalOpen}
            onClose={() => {
              setFriendsModalOpen(false);
              setChatFriendToOpen(null);
            }}
            currentUser={user}
            currentRoom={room}
            onJoinRoom={handleJoinByCode}
            incomingDirectChat={pendingDirectChat}
            initialChatFriend={chatFriendToOpen}
          />

          {/* Role Preference Matching Modal */}
          {room && (
            <RolePreferenceModal
              open={rolePrefModalOpen}
              onClose={() => setRolePrefModalOpen(false)}
              currentPreferences={room.selfRolePreferences ?? []}
              playerCount={room.settings.playerCount}
              disabled={disabled || room.phase !== 'waiting'}
              onSave={async prefs => {
                await command({
                  type: 'setRolePreferences',
                  payload: { preferences: prefs },
                });
              }}
            />
          )}

          {/* Floating Room Invitation Toast */}
          <RoomInvitationToast
            invitation={pendingInvitation}
            onAccept={handleJoinByCode}
            onDismiss={() => setPendingInvitation(null)}
          />

          {/* Floating Direct Chat Notification Toast */}
          <DirectChatToast
            message={pendingDirectChat}
            onOpenChat={fromUser => {
              setChatFriendToOpen(fromUser);
              setFriendsModalOpen(true);
              setPendingDirectChat(null);
            }}
            onDismiss={() => setPendingDirectChat(null)}
          />

          {/* Room In-game / Waiting Floating Chat Drawer */}
          {chatDrawerOpen && room && (
            <ChatDrawer
              roomId={room.id}
              messages={roomChatMessages}
              onClose={() => setChatDrawerOpen(false)}
            />
          )}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<SoundProvider><App /></SoundProvider>);
