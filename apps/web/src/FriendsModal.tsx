import React, { useEffect, useRef, useState } from 'react';
import type { DirectMessage, FriendSummary, RoomView, User } from '@avalon/contracts';
import { api, describe } from './api';
import { Modal } from './Modal';
import { PlayerAvatar } from './Heraldry';

const DIRECT_QUICK_PHRASES = [
  '来开一局？',
  '马上上线！',
  '稍等我两分钟',
  '今晚几点开战？',
  '速来，三缺一！',
  '上局打得漂亮！',
];

export interface FriendsModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: User | null;
  currentRoom: RoomView | null;
  onJoinRoom?: (code: string) => void;
  incomingDirectChat?: { messageId: string; fromUser: User; text: string; timestamp: string } | null;
  initialChatFriend?: User | null;
}

export function FriendsModal({
  open,
  onClose,
  currentUser,
  currentRoom,
  onJoinRoom,
  incomingDirectChat,
  initialChatFriend,
}: FriendsModalProps) {
  const [activeTab, setActiveTab] = useState<'invite' | 'friends' | 'add'>('invite');
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedMyCode, setCopiedMyCode] = useState(false);
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());

  // Direct Message (私聊密札) State
  const [activeChatFriend, setActiveChatFriend] = useState<FriendSummary | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [directLoading, setDirectLoading] = useState(false);
  const [directText, setDirectText] = useState('');
  const [directSending, setDirectSending] = useState(false);
  const [isDirectRecording, setIsDirectRecording] = useState(false);
  const [directVoiceNotice, setDirectVoiceNotice] = useState('');
  const directStreamEndRef = useRef<HTMLDivElement | null>(null);
  const directRecognitionRef = useRef<any>(null);


  const fetchFriends = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await api<{ friends: FriendSummary[] }>('/friends');
      setFriends(res.friends);
    } catch (err) {
      console.warn('Failed to load friends:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && currentUser) {
      void fetchFriends();
      setAddStatus(null);
      setAddError(null);
      setActionMessage(null);
    }
    if (!open) {
      setActiveChatFriend(null);
    }
  }, [open, currentUser]);

  // Web Speech recognition for direct chat dictation
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsDirectRecording(true);
        setDirectVoiceNotice('正在聆听中，请说话…');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setDirectText(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsDirectRecording(false);
        setDirectVoiceNotice('');
      };

      recognition.onerror = () => {
        setIsDirectRecording(false);
        setDirectVoiceNotice('语音未捕获，请重试');
        setTimeout(() => setDirectVoiceNotice(''), 2500);
      };

      recognition.onend = () => {
        setIsDirectRecording(false);
        setDirectVoiceNotice('');
      };

      directRecognitionRef.current = recognition;
    }
  }, []);

  const handleToggleDirectVoice = () => {
    if (!directRecognitionRef.current) {
      alert('当前浏览器未开放原生语音识别，请直接使用手机键盘自带的语音输入键');
      return;
    }
    if (isDirectRecording) {
      directRecognitionRef.current.stop();
      setIsDirectRecording(false);
    } else {
      try {
        directRecognitionRef.current.start();
      } catch {
        directRecognitionRef.current.stop();
        setIsDirectRecording(false);
      }
    }
  };

  const loadDirectMessages = async (friendId: string) => {
    setDirectLoading(true);
    try {
      const res = await api<{ messages: DirectMessage[] }>(`/friends/${friendId}/chat`);
      setDirectMessages(res.messages);
    } catch (err) {
      console.warn('Failed to load chat:', err);
    } finally {
      setDirectLoading(false);
    }
  };

  useEffect(() => {
    if (activeChatFriend) {
      void loadDirectMessages(activeChatFriend.id);
    } else {
      setDirectMessages([]);
    }
  }, [activeChatFriend?.id]);

  useEffect(() => {
    if (activeChatFriend) {
      directStreamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [directMessages.length, activeChatFriend]);

  // Handle incoming real-time direct chat
  useEffect(() => {
    if (!incomingDirectChat) return;
    if (activeChatFriend && activeChatFriend.id === incomingDirectChat.fromUser.id) {
      setDirectMessages(prev => [
        ...prev,
        {
          id: incomingDirectChat.messageId,
          senderId: incomingDirectChat.fromUser.id,
          receiverId: currentUser?.id ?? '',
          message: incomingDirectChat.text,
          createdAt: incomingDirectChat.timestamp,
          isSelf: false,
        },
      ]);
    }
  }, [incomingDirectChat]);

  // Handle initialChatFriend
  useEffect(() => {
    if (open && initialChatFriend) {
      const found = friends.find(f => f.id === initialChatFriend.id);
      if (found) {
        setActiveChatFriend(found);
      } else {
        setActiveChatFriend({
          id: initialChatFriend.id,
          nickname: initialChatFriend.nickname,
          playerCode: initialChatFriend.playerCode ?? '000000',
          avatar: initialChatFriend.avatar,
          avatarUrl: initialChatFriend.avatarUrl,
          online: true,
          status: 'accepted',
          isSender: false,
        });
      }
    }
  }, [open, initialChatFriend, friends]);

  const handleSendDirect = async (overrideText?: string) => {
    const content = (overrideText ?? directText).trim();
    if (!content || !activeChatFriend || directSending) return;
    setDirectSending(true);
    try {
      const res = await api<{ ok: boolean; messageId: string; timestamp: string }>(
        `/friends/${activeChatFriend.id}/chat`,
        { text: content }
      );
      setDirectMessages(prev => [
        ...prev,
        {
          id: res.messageId,
          senderId: currentUser!.id,
          receiverId: activeChatFriend.id,
          message: content,
          createdAt: res.timestamp,
          isSelf: true,
        },
      ]);
      if (!overrideText) {
        setDirectText('');
      }
    } catch (err) {
      alert(describe(err));
    } finally {
      setDirectSending(false);
    }
  };


  const handleCopy = async (text: string, type: 'link' | 'code' | 'myCode') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else if (type === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedMyCode(true);
        setTimeout(() => setCopiedMyCode(false), 2000);
      }
    } catch {
      // Fallback
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setAddStatus(null);
    setAddError(null);
    try {
      const res = await api<{ success: boolean; status: 'pending' | 'accepted'; targetUser: User }>(
        '/friends/request',
        { query: query.trim() }
      );
      if (res.status === 'accepted') {
        setAddStatus(`已成功与「${res.targetUser.nickname}」结为仙友！`);
      } else {
        setAddStatus(`仙缘申请已送达「${res.targetUser.nickname}」，等待对方确认！`);
      }
      setQuery('');
      void fetchFriends();
    } catch (err) {
      setAddError(describe(err));
    }
  };

  const handleAccept = async (friendId: string, nickname: string) => {
    setActionMessage(null);
    try {
      await api(`/friends/${friendId}/accept`, {});
      setActionMessage(`已与「${nickname}」结为仙友！`);
      void fetchFriends();
    } catch (err) {
      setActionMessage(describe(err));
    }
  };

  const handleRemove = async (friendId: string, nickname: string) => {
    if (!window.confirm(`确定要解除与「${nickname}」的仙友关系吗？`)) return;
    setActionMessage(null);
    try {
      await api(`/friends/${friendId}`, undefined, 'DELETE');
      setActionMessage(`已解除与「${nickname}」的仙友关系。`);
      void fetchFriends();
    } catch (err) {
      setActionMessage(describe(err));
    }
  };

  const handleInvite = async (targetUserId: string, nickname: string) => {
    if (!currentRoom) return;
    try {
      const res = await api<{ sent: boolean; online: boolean }>(`/rooms/${currentRoom.id}/invite`, {
        targetUserId,
      });
      setInvitedUserIds(prev => new Set(prev).add(targetUserId));
      if (res.online) {
        setActionMessage(`已向「${nickname}」发送对局召集令！`);
      } else {
        setActionMessage(`已发送邀请，对方目前暂未在线。`);
      }
    } catch (err) {
      setActionMessage(describe(err));
    }
  };

  const acceptedFriends = friends.filter(f => f.status === 'accepted');
  const incomingRequests = friends.filter(f => f.status === 'pending' && !f.isSender);
  const outgoingRequests = friends.filter(f => f.status === 'pending' && f.isSender);

  const roomUrl = typeof window !== 'undefined' && currentRoom ? `${window.location.origin}/?invite=${currentRoom.code}` : '';

  if (!open) return null;

  return (
    <Modal label="仙友录 · 召集与好友" scene="pavilion" onClose={onClose}>
      <div className="table-modal-sheet">
        <div className="table-modal-head">
          <strong>仙友录 · 召集与好友</strong>
          <button type="button" className="secondary tool-pill" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="friends-modal-content">
        {activeChatFriend ? (
          <div className="direct-chat-sheet">
            <div className="direct-chat-topbar">
              <button
                type="button"
                className="direct-back-btn"
                onClick={() => setActiveChatFriend(null)}
              >
                ← 返回仙友录
              </button>
              <div className="direct-target-info">
                <PlayerAvatar avatar={activeChatFriend.avatar} avatarUrl={activeChatFriend.avatarUrl} className="friend-avatar" />
                <span>{activeChatFriend.nickname}</span>
                <span className={`online-status-dot ${activeChatFriend.online ? 'online' : 'offline'}`} />
              </div>
              <button
                type="button"
                className="direct-back-btn"
                onClick={() => void loadDirectMessages(activeChatFriend.id)}
                title="刷新密信"
              >
                🔄
              </button>
            </div>

            <div className="direct-chat-stream">
              {directLoading ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '20px' }}>
                  正在查阅密札往来…
                </div>
              ) : directMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '30px' }}>
                  📜 暂无密札往来，发送快捷密语或打字开始交谈吧！
                </div>
              ) : (
                directMessages.map(m => {
                  const isSelf = m.isSelf || m.senderId === currentUser?.id;
                  const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div
                      key={m.id}
                      className={`direct-bubble-row ${isSelf ? 'is-self' : 'is-friend'}`}
                    >
                      <div className="direct-bubble">{m.message}</div>
                      {timeStr && <span className="direct-bubble-time">{timeStr}</span>}
                    </div>
                  );
                })
              )}
              <div ref={directStreamEndRef} />
            </div>

            {/* Quick direct tactical phrases */}
            <div className="direct-quick-chips">
              {DIRECT_QUICK_PHRASES.map(p => (
                <button
                  key={p}
                  type="button"
                  className="direct-quick-chip"
                  onClick={() => void handleSendDirect(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Voice notice */}
            {directVoiceNotice && (
              <div style={{ padding: '4px 14px', fontSize: '11px', color: '#38bdf8', background: 'rgba(56,189,248,0.1)' }}>
                🎙️ {directVoiceNotice}
              </div>
            )}

            {/* Input bar */}
            <form
              className="chat-drawer-input-bar"
              onSubmit={e => {
                e.preventDefault();
                void handleSendDirect();
              }}
            >
              <button
                type="button"
                className={`chat-voice-btn ${isDirectRecording ? 'is-recording' : ''}`}
                onClick={handleToggleDirectVoice}
                title="语音转文字"
              >
                🎙️
              </button>
              <input
                type="text"
                className="chat-text-input"
                placeholder={`向 ${activeChatFriend.nickname} 发送密札…`}
                value={directText}
                onChange={e => setDirectText(e.target.value)}
                maxLength={300}
              />
              <button
                type="submit"
                disabled={directSending || !directText.trim()}
                className="chat-send-btn"
              >
                传札
              </button>
            </form>
          </div>
        ) : (
          <>
          <div className="friends-nav-tabs">
            <button
            type="button"
            className={`friends-tab-btn ${activeTab === 'invite' ? 'active' : ''}`}
            onClick={() => { setActiveTab('invite'); setActionMessage(null); }}
          >
            📜 房间召集
          </button>
          <button
            type="button"
            className={`friends-tab-btn ${activeTab === 'friends' ? 'active' : ''}`}
            onClick={() => { setActiveTab('friends'); setActionMessage(null); }}
          >
            👥 我的仙友
            {incomingRequests.length > 0 && (
              <span className="friends-badge-dot" title={`${incomingRequests.length} 条待处理申请`}>
                {incomingRequests.length}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`friends-tab-btn ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => { setActiveTab('add'); setActionMessage(null); }}
          >
            ✨ 添加仙友
          </button>
        </div>

        {actionMessage && (
          <div className="friends-action-banner" role="status">
            {actionMessage}
          </div>
        )}

        {/* TAB 1: 房间召集 */}
        {activeTab === 'invite' && (
          <div className="friends-tab-pane">
            {currentRoom ? (
              <div className="room-invite-section">
                <div className="room-code-display-card">
                  <span className="room-code-label">当前对局房间号</span>
                  <span className="room-code-val">{currentRoom.code}</span>
                  <div className="room-invite-btn-row">
                    <button
                      type="button"
                      className="room-copy-btn primary"
                      onClick={() => handleCopy(roomUrl, 'link')}
                    >
                      {copiedLink ? '✓ 链接已复制' : '🔗 复制对局邀请链接'}
                    </button>
                    <button
                      type="button"
                      className="room-copy-btn"
                      onClick={() => handleCopy(currentRoom.code, 'code')}
                    >
                      {copiedCode ? '✓ 房间号已复制' : '📋 复制房间号'}
                    </button>
                  </div>
                  <p className="room-invite-tip">
                    复制后可直接发送到微信、QQ 等群聊，朋友点击链接即可一键入席！
                  </p>
                </div>

                <div className="online-friends-invite-list">
                  <h4 className="friends-subheading">一键召集在线仙友</h4>
                  {acceptedFriends.length === 0 ? (
                    <p className="friends-empty-tip">暂无好友，前往「添加仙友」结识道友吧！</p>
                  ) : (
                    <div className="friends-grid">
                      {acceptedFriends.map(f => {
                        const isInCurrentRoom = currentRoom.members.some(m => m.id === f.id);
                        const isInvited = invitedUserIds.has(f.id);

                        return (
                          <div key={f.id} className="friend-card">
                            <div className="friend-avatar-wrap">
                              <PlayerAvatar avatar={f.avatar} avatarUrl={f.avatarUrl} className="friend-avatar" />
                              <span className={`online-status-dot ${f.online ? 'online' : 'offline'}`} />
                            </div>
                            <div className="friend-info">
                              <div className="friend-name-row">
                                <span className="friend-name">{f.nickname}</span>
                                <span className="friend-code">#{f.playerCode}</span>
                              </div>
                              <span className="friend-room-status">
                                {isInCurrentRoom
                                  ? '已在当前房间'
                                  : f.online
                                  ? f.roomCode
                                    ? `在房间 ${f.roomCode}`
                                    : '大厅闲逛中'
                                  : '离线'}
                              </span>
                            </div>
                            <div className="friend-actions">
                              <button
                                type="button"
                                className="invite-action-btn chat"
                                onClick={() => setActiveChatFriend(f)}
                                title="密札私聊"
                              >
                                ✉️ 密札
                              </button>
                              {isInCurrentRoom ? (
                                <span className="status-tag in-room">已在房中</span>
                              ) : (
                                <button
                                  type="button"
                                  className="invite-action-btn"
                                  disabled={isInvited}
                                  onClick={() => handleInvite(f.id, f.nickname)}
                                >
                                  {isInvited ? '已发送召集' : '一键召集'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="no-room-invite-prompt">
                <p className="prompt-icon">🏯</p>
                <p className="prompt-title">当前尚未进入对局房间</p>
                <p className="prompt-desc">
                  在大厅创建房间或加入朋友的房间后，即可在此复制链接并一键向在线仙友发送对局召集令！
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: 我的仙友 */}
        {activeTab === 'friends' && (
          <div className="friends-tab-pane">
            {/* Incoming Requests */}
            {incomingRequests.length > 0 && (
              <div className="friends-requests-box">
                <h4 className="friends-subheading accent">待处理的仙缘申请 ({incomingRequests.length})</h4>
                <div className="friends-grid">
                  {incomingRequests.map(req => (
                    <div key={req.id} className="friend-card pending-card">
                      <div className="friend-avatar-wrap">
                        <PlayerAvatar avatar={req.avatar} avatarUrl={req.avatarUrl} className="friend-avatar" />
                      </div>
                      <div className="friend-info">
                        <div className="friend-name-row">
                          <span className="friend-name">{req.nickname}</span>
                          <span className="friend-code">#{req.playerCode}</span>
                        </div>
                        <span className="friend-room-status">申请与你结为仙友</span>
                      </div>
                      <div className="friend-actions">
                        <button
                          type="button"
                          className="accept-action-btn"
                          onClick={() => handleAccept(req.id, req.nickname)}
                        >
                          结为仙友
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outgoing Requests */}
            {outgoingRequests.length > 0 && (
              <div className="friends-outgoing-box">
                <h4 className="friends-subheading">已发送的申请 ({outgoingRequests.length})</h4>
                <div className="friends-list-compact">
                  {outgoingRequests.map(req => (
                    <div key={req.id} className="friend-row-compact">
                      <span className="friend-name">{req.nickname} (#{req.playerCode})</span>
                      <span className="status-tag waiting">等待对方回应...</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accepted Friends */}
            <div className="friends-list-section">
              <h4 className="friends-subheading">仙友列表 ({acceptedFriends.length})</h4>
              {loading ? (
                <p className="friends-empty-tip">正在载入仙友录...</p>
              ) : acceptedFriends.length === 0 ? (
                <p className="friends-empty-tip">暂无仙友。点击上方「添加仙友」添加好友吧！</p>
              ) : (
                <div className="friends-grid">
                  {acceptedFriends.map(f => (
                    <div key={f.id} className="friend-card">
                      <div className="friend-avatar-wrap">
                        <PlayerAvatar avatar={f.avatar} avatarUrl={f.avatarUrl} className="friend-avatar" />
                        <span className={`online-status-dot ${f.online ? 'online' : 'offline'}`} />
                      </div>
                      <div className="friend-info">
                        <div className="friend-name-row">
                          <span className="friend-name">{f.nickname}</span>
                          <span className="friend-code">#{f.playerCode}</span>
                        </div>
                        <span className="friend-room-status">
                          {f.online ? (f.roomCode ? `在房间 ${f.roomCode}` : '大厅闲逛') : '离线'}
                        </span>
                      </div>
                      <div className="friend-actions">
                        <button
                          type="button"
                          className="invite-action-btn chat"
                          onClick={() => setActiveChatFriend(f)}
                          title="密札私聊"
                        >
                          ✉️ 密札
                        </button>
                        {currentRoom && f.online && !currentRoom.members.some(m => m.id === f.id) && (
                          <button
                            type="button"
                            className="invite-action-btn"
                            disabled={invitedUserIds.has(f.id)}
                            onClick={() => handleInvite(f.id, f.nickname)}
                          >
                            {invitedUserIds.has(f.id) ? '已召集' : '召集'}
                          </button>
                        )}
                        {!currentRoom && f.online && f.roomCode && onJoinRoom && (
                          <button
                            type="button"
                            className="invite-action-btn join"
                            onClick={() => {
                              onJoinRoom(f.roomCode!);
                              onClose();
                            }}
                          >
                            加入对局
                          </button>
                        )}
                        <button
                          type="button"
                          className="remove-action-btn"
                          title="解除仙缘"
                          onClick={() => handleRemove(f.id, f.nickname)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: 添加仙友 */}
        {activeTab === 'add' && (
          <div className="friends-tab-pane">
            <div className="my-player-code-card">
              <span className="card-label">我的专属仙友号</span>
              <div className="code-row">
                <span className="my-code-digits">{currentUser?.playerCode ?? '------'}</span>
                <button
                  type="button"
                  className="copy-mini-btn"
                  onClick={() => handleCopy(currentUser?.playerCode ?? '', 'myCode')}
                >
                  {copiedMyCode ? '✓ 已复制' : '复制仙友号'}
                </button>
              </div>
              <p className="code-hint">把你的仙友号分享给好友，好友可直接搜索添加你！</p>
            </div>

            <form className="add-friend-form" onSubmit={handleSendRequest}>
              <label htmlFor="friend-search-input" className="form-label">
                搜索添加仙友
              </label>
              <div className="search-input-row">
                <input
                  id="friend-search-input"
                  type="text"
                  className="friend-input"
                  placeholder="输入好友 6 位数字仙友号 或 完整昵称"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  maxLength={20}
                />
                <button type="submit" className="friend-submit-btn" disabled={!query.trim()}>
                  发送申请
                </button>
              </div>
            </form>

            {addStatus && <p className="add-friend-status success">{addStatus}</p>}
            {addError && <p className="add-friend-status error">{addError}</p>}
          </div>
        )}
        </>
      )}
      </div>
      </div>
    </Modal>
  );
}

export function DirectChatToast({
  message,
  onOpenChat,
  onDismiss,
}: {
  message: { fromUser: User; text: string; timestamp: string } | null;
  onOpenChat: (user: User) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="room-invitation-toast direct-chat-toast" role="alert">
      <div className="toast-glow-ring" />
      <div className="toast-body">
        <div className="toast-header">
          <span className="toast-badge" style={{ color: '#38bdf8', borderColor: '#38bdf8' }}>✉️ 仙友私信密札</span>
          <button type="button" className="toast-close-btn" onClick={onDismiss} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="toast-content">
          <div className="toast-avatar-box">
            <PlayerAvatar
              avatar={message.fromUser.avatar}
              avatarUrl={message.fromUser.avatarUrl}
              className="toast-avatar"
            />
          </div>
          <div className="toast-info">
            <p className="toast-message">
              <strong>{message.fromUser.nickname}</strong>：
            </p>
            <p
              className="toast-room-code"
              style={{
                color: '#fff4d0',
                fontSize: '13px',
                fontWeight: 'normal',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                maxWidth: '180px',
              }}
            >
              {message.text}
            </p>
          </div>
        </div>
        <div className="toast-actions">
          <button
            type="button"
            className="toast-join-btn"
            style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
            onClick={() => {
              onOpenChat(message.fromUser);
              onDismiss();
            }}
          >
            查阅并回复
          </button>
          <button type="button" className="toast-ignore-btn" onClick={onDismiss}>
            忽略
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomInvitationToast({
  invitation,
  onAccept,
  onDismiss,
}: {
  invitation: { fromUser: User; roomId: string; roomCode: string } | null;
  onAccept: (code: string) => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!invitation) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 15000);
    return () => clearTimeout(timer);
  }, [invitation, onDismiss]);

  if (!invitation) return null;

  return (
    <div className="room-invitation-toast" role="alert">
      <div className="toast-glow-ring" />
      <div className="toast-body">
        <div className="toast-header">
          <span className="toast-badge">📜 仙友对局召集</span>
          <button type="button" className="toast-close-btn" onClick={onDismiss} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="toast-content">
          <div className="toast-avatar-box">
            <PlayerAvatar
              avatar={invitation.fromUser.avatar}
              avatarUrl={invitation.fromUser.avatarUrl}
              className="toast-avatar"
            />
          </div>
          <div className="toast-info">
            <p className="toast-message">
              仙友 <strong>{invitation.fromUser.nickname}</strong> 邀请你共赴对局！
            </p>
            <p className="toast-room-code">房间号: <strong>{invitation.roomCode}</strong></p>
          </div>
        </div>
        <div className="toast-actions">
          <button
            type="button"
            className="toast-join-btn"
            onClick={() => {
              onAccept(invitation.roomCode);
              onDismiss();
            }}
          >
            立即前往加入
          </button>
          <button type="button" className="toast-ignore-btn" onClick={onDismiss}>
            暂不加入
          </button>
        </div>
      </div>
    </div>
  );
}

