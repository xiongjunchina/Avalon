import React from 'react';
import type { VoiceState } from './agora-voice';

export interface VoiceControlsProps {
  voiceState: VoiceState;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onReconnect?: () => void;
}

export function VoiceControls({
  voiceState,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onReconnect,
}: VoiceControlsProps) {
  const isSpeaking = voiceState.speakingUids.has(voiceState.uid ?? 0);
  const isConnected = voiceState.status === 'connected';
  const isConnecting = voiceState.status === 'connecting';
  const isError = voiceState.status === 'error';
  const isDisconnected = voiceState.status === 'disconnected';

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
    return (
      <div className="voice-connecting-box">
        <span className="voice-status-dot connecting" />
        <span className="voice-connecting-label">连接中…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="voice-error-cluster">
        <span
          className="voice-status-dot error"
          title={`语音连接异常 (${voiceState.error || '点击重新连接'})`}
        />
        <button
          type="button"
          className="voice-retry-btn"
          onClick={onReconnect || onJoin}
          title="重新连接语音"
        >
          重试
        </button>
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

  return (
    <div className="voice-controls-cluster">
      {/* Voice Connection Status Light */}
      <span
        className="voice-status-dot connected"
        title="声网实时语音已连接 (极低延迟)"
      />

      {/* Mic Button */}
      <button
        type="button"
        className={`voice-btn mic-btn ${voiceState.muted ? 'is-muted' : 'is-live'} ${isSpeaking ? 'is-speaking' : ''}`}
        onClick={onToggleMute}
        disabled={voiceState.deafened}
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
