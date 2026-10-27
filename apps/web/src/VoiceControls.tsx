import React from 'react';
import type { VoiceState } from './agora-voice';
import type { VoiceWakeLockState } from './voice-wake-lock';

export interface VoiceControlsProps {
  voiceState: VoiceState;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onReconnect?: () => void;
  wakeLock?: VoiceWakeLockState;
}

export function VoiceControls({
  voiceState,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onReconnect,
  wakeLock,
}: VoiceControlsProps) {
  const isSpeaking = voiceState.speakingUids.has(voiceState.uid ?? 0);
  const isConnected = voiceState.status === 'connected';
  const isConnecting = voiceState.status === 'connecting';
  const isError = voiceState.status === 'error';
  const isDisconnected = voiceState.status === 'disconnected';
  const needsRecovery = Boolean(voiceState.recoveryNeeded);
  const recovering = Boolean(voiceState.recovering);
  const showRecovery = !isConnecting && (needsRecovery || recovering || voiceState.recoveryMessage);
  const withOptions = (controls: React.ReactNode) => <div className="voice-controls-block">
    {controls}
    {(wakeLock || showRecovery) && <div className="voice-options-row">
      {showRecovery && (recovering ? <span className="voice-recovery-note" role="status">恢复中…</span>
        : needsRecovery ? <button type="button" className="voice-recovery-action" onClick={onReconnect || onJoin}
          title={voiceState.recoveryMessage || '恢复当前语音'}>点击恢复语音</button>
        : voiceState.recoveryMessage ? <span className="voice-recovery-note" role="status">{voiceState.recoveryMessage}</span> : null)}
      {wakeLock && <>
        <button type="button" className="voice-wake-toggle" aria-pressed={wakeLock.enabled}
          disabled={!wakeLock.supported} onClick={wakeLock.toggle}
          title={!wakeLock.supported ? '当前浏览器不支持保持亮屏' : wakeLock.active ? '关闭保持亮屏' : '语音期间保持屏幕亮起'}>
          保持亮屏{wakeLock.pending ? '…' : ''}
        </button>
        {wakeLock.notice && <span className="voice-wake-notice" role="status">{wakeLock.notice}</span>}
      </>}
    </div>}
  </div>;

  if (isDisconnected) {
    return (
      <button
        type="button"
        className="voice-join-btn"
        onClick={onJoin}
        title="点击开启声网高清实时语音"
      >
        <span className="voice-icon-inner">🎙️</span>
        <span className="voice-join-label">开启语音</span>
      </button>
    );
  }

  if (isConnecting) {
    return withOptions(
      <div className="voice-connecting-box">
        <span className="voice-status-dot connecting" />
        <span className="voice-connecting-label">{recovering ? '恢复中…' : '连接中…'}</span>
        <button type="button" className="voice-btn leave-voice-btn" onClick={onLeave} aria-label="取消语音连接" title="取消语音连接">
          <span className="voice-icon-inner">✕</span>
        </button>
      </div>
    );
  }

  if (isError) {
    return withOptions(
      <div className="voice-error-cluster">
        <span
          className="voice-status-dot is-error"
          onClick={() => {
            if (voiceState.error) {
              alert(`语音异常提示：${voiceState.error}`);
            }
          }}
          title={`语音连接异常 (${voiceState.error || '点击重新连接'})`}
        />
        {!needsRecovery && !recovering && <button
          type="button"
          className="voice-retry-btn"
          onClick={onReconnect || onJoin}
          title="重新连接语音"
        >
          {recovering ? '恢复中…' : '重试'}
        </button>}
        <button
          type="button"
          className="voice-btn leave-voice-btn"
          onClick={onLeave}
          title="取消并关闭语音"
          aria-label="取消"
        >
          <span className="voice-icon-inner">✕</span>
        </button>
      </div>
    );
  }

  return withOptions(
    <div className="voice-controls-cluster">
      {/* Voice Connection Status Light */}
      <span
        className={`voice-status-dot ${needsRecovery || recovering ? 'connecting' : 'connected'}`}
        title={needsRecovery || recovering ? '语音需要恢复' : '声网实时语音已连接 (极低延迟)'}
      />

      {/* Mic Button */}
      <button
        type="button"
        className={`voice-btn mic-btn ${voiceState.muted ? 'is-muted' : 'is-live'} ${isSpeaking ? 'is-speaking' : ''}`}
        onClick={onToggleMute}
        disabled={voiceState.deafened || (recovering && voiceState.muted)}
        title={
          voiceState.deafened
            ? '静音全员中，解除静音后可开麦'
            : voiceState.muted
            ? '麦克风已静音 · 点击开麦'
            : isSpeaking
            ? '正在说话 · 点击静音'
            : '麦克风开 · 点击静音'
        }
        aria-label={voiceState.muted ? '开启麦克风' : '静音麦克风'}
      >
        <span className="voice-icon-inner">
          {voiceState.muted ? '🔇' : '🎙️'}
        </span>
        {isSpeaking && !voiceState.muted && (
          <span className="voice-speaking-pulse" aria-hidden="true" />
        )}
      </button>

      {/* Deafen Button */}
      <button
        type="button"
        className={`voice-btn deafen-btn ${voiceState.deafened ? 'is-deafened' : 'is-hearing'}`}
        onClick={onToggleDeafen}
        disabled={recovering && voiceState.deafened}
        title={
          voiceState.deafened
            ? '已静音全房声音 · 点击恢复收听'
            : '收听中 · 点击静音全房'
        }
        aria-label={voiceState.deafened ? '取消静音全房' : '静音房间声音'}
      >
        <span className="voice-icon-inner">
          {voiceState.deafened ? '🔕' : '🔊'}
        </span>
      </button>

      {/* Leave Voice Button */}
      <button
        type="button"
        className="voice-btn leave-voice-btn"
        onClick={onLeave}
        title="关闭并退出实时语音"
        aria-label="退出语音"
      >
        <span className="voice-icon-inner">✕</span>
      </button>
    </div>
  );
}
