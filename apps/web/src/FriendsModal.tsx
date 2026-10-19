import React, { useEffect, useState } from 'react';
import type { FriendSummary, RoomView, User } from '@avalon/contracts';
import { api, describe } from './api';
import { Modal } from './Modal';
import { PlayerAvatar } from './Heraldry';

export interface FriendsModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: User | null;
  currentRoom: RoomView | null;
  onJoinRoom?: (code: string) => void;
}

export function FriendsModal({
  open,
  onClose,
  currentUser,
  currentRoom,
  onJoinRoom,
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
  }, [open, currentUser]);

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
      </div>
      </div>
    </Modal>
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
