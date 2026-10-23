import type { ReactNode } from 'react';
import type { Role, User } from '@avalon/contracts';
import { Emblem, PlayerAvatar, roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { FEMALE_DEMONS, roleMottos, roleNames } from './roles';

export function LobbyHero({ role, freeAccess }: { role: Role; freeAccess: boolean }) {
  return <>
    <div className="mp-logo-block">
      <h1 className="mp-avalon-logo">
        <span className="logo-word">嘻游</span>
        <span className="logo-dot">·</span>
        <span className="logo-word">真假猴王</span>
      </h1>
      <p className="mp-avalon-sub">一念佛魔皆幻相，谁是修道取经人</p>
      {freeAccess && <div className="lobby-banner-wrap">
        <span className="lobby-free-access-banner">🎉 公测盛典 · 全特权限时免费畅玩中</span>
      </div>}
    </div>
    <section className="mp-medallion-stage" aria-label="角色展示">
      <div className={`mp-medallion-circle allegiance-${roleTeam(role)}`}>
        <RolePortrait role={role} femaleDemon={role === 'minion' ? 'yutu' : undefined} size="card" />
      </div>
      <h2 className="mp-medallion-name">{role === 'minion' ? '玉兔精' : roleNames[role]}</h2>
      <p className="mp-medallion-motto">{role === 'minion' ? FEMALE_DEMONS.yutu.motto : roleMottos[role]}</p>
    </section>
  </>;
}

/** Visitors and returning players share the same public artwork and room entry points. */
export function LobbyHome({
  user, role, freeAccess, busy, voiceEnabled, hasInvitation, friendRequests, soundControl,
  onVoiceChange, onAccount, onSignIn, onLogout, onFriends, onGuide, onCreate, onJoin, onPractice,
}: {
  user: User | null; role: Role; freeAccess: boolean; busy: boolean; voiceEnabled: boolean;
  hasInvitation: boolean; friendRequests: number; soundControl: ReactNode;
  onVoiceChange: (enabled: boolean) => void;
  onAccount: () => void; onSignIn: () => void; onLogout: () => void; onFriends: () => void;
  onGuide: () => void; onCreate: () => void; onJoin: () => void; onPractice: () => void;
}) {
  return <div className="mp-home-screen">
    <header className="mp-home-topbar">
      <button type="button" className="mp-avatar-btn" aria-label={user ? '个人中心' : '登录或注册'}
        title={user ? `${user.nickname} · 点击进入个人中心` : '设置身份，保留取经战绩'}
        onClick={user ? onAccount : onSignIn}>
        <span className="mp-avatar-ring">
          <PlayerAvatar avatar={user?.avatar} avatarUrl={user?.avatarUrl}
            wechatAvatarUrl={user?.wechatAvatarUrl} fallbackKind="crown" />
        </span>
        <span className="mp-avatar-name">{user?.nickname ?? '游客浏览'}</span>
      </button>
      <div className="home-tools">
        {user && <button type="button" className="secondary tool-pill friends-pill-btn"
          onClick={onFriends} title="仙友录 · 召集与好友">
          👥 仙友
          {friendRequests > 0 && <span className="friends-badge-dot">{friendRequests}</span>}
        </button>}
        {soundControl}
        {user && <button type="button" className="secondary tool-pill home-logout-btn"
          onClick={onLogout} title="注销当前登录状态，更换新身份">🚪 换号</button>}
        <button type="button" className="secondary tool-pill home-guide-btn"
          onClick={onGuide} title="嘻游识妖谱 · 规则说明">📖 识妖谱</button>
      </div>
    </header>

    <LobbyHero role={role} freeAccess={freeAccess} />

    <footer className="mp-home-footer">
      <div className="lobby-mode-switch" role="radiogroup" aria-label="建房模式">
        <button type="button" role="radio" aria-checked={!voiceEnabled}
          className={`lobby-mode-pill ${!voiceEnabled ? 'is-active' : ''}`}
          onClick={() => onVoiceChange(false)} title="同桌线下聚会，无语音干扰">🏛️ 线下常规房</button>
        <button type="button" role="radio" aria-checked={voiceEnabled}
          className={`lobby-mode-pill ${voiceEnabled ? 'is-active' : ''}`}
          onClick={() => onVoiceChange(true)} title="远端线上开黑，支持声网高清实时语音">🎙️ 远端语音房</button>
      </div>
      {hasInvitation && <p className="lobby-invite-hint" role="status">已收到朋友邀请，点击加入即可继续入座。</p>}
      <div className="lobby-primary-actions">
        <button type="button" className="mp-cyan-pill" disabled={busy} onClick={onCreate}>
          <Emblem kind="mountain" />{voiceEnabled ? '开语音房' : '开常规房'}
        </button>
        <button type="button" className="secondary lobby-join" disabled={busy} onClick={onJoin}>
          <Emblem kind="crown" />{hasInvitation ? '加入邀请房间' : '加入房间'}
        </button>
      </div>
      <button type="button" className="secondary practice-entry" disabled={busy} onClick={onPractice}>🐒 幻境单人试玩 ›</button>
      <nav className="lobby-compact-links" aria-label="快捷导航">
        <button type="button" className="lobby-link-btn" onClick={onGuide}>玩法与角色</button>
        <span className="lobby-link-sep" aria-hidden="true">·</span>
        <button type="button" className="lobby-link-btn" onClick={onAccount} title="功果簿（战绩与个人资料）">📜 功果簿</button>
        <span className="lobby-link-sep" aria-hidden="true">·</span>
        <button type="button" className={`lobby-link-btn ${user ? 'is-logout' : ''}`}
          onClick={user ? onLogout : onSignIn}>{user ? '🚪 退出登录' : '登录 / 注册'}</button>
      </nav>
    </footer>
  </div>;
}
