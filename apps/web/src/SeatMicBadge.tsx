import React from 'react';
import type { VoiceState } from './agora-voice';
import { uuidToRtcUid } from '@avalon/contracts';

export type MicState = 'live' | 'speaking' | 'muted' | 'unjoined';

export interface SeatMicBadgeProps {
  playerId: string;
  userId?: string;
  voiceChatEnabled?: boolean;
  voiceState?: VoiceState;
  onToggleMute?: () => void;
  className?: string;
}

export function computePlayerMicState(
  playerId: string,
  userId: string | undefined,
  voiceState?: VoiceState
): { state: MicState; label: string; isInteractive: boolean } {
  const isMe = Boolean(userId && playerId === userId);
  const pRtcUid = uuidToRtcUid(playerId);

  if (!voiceState) {
    return { state: 'unjoined', label: '未连麦', isInteractive: false };
  }

  if (isMe) {
    if (voiceState.status === 'connected') {
      if (voiceState.muted || voiceState.deafened) {
        return {
          state: 'muted',
          label: '你的麦克风已静音（点击可开麦）',
          isInteractive: true,
        };
      }
      const isSpeaking =
        voiceState.speakingUids.has(pRtcUid) ||
        (voiceState.uid !== undefined && voiceState.speakingUids.has(voiceState.uid));
      if (isSpeaking) {
        return {
          state: 'speaking',
          label: '你的麦克风已开启 · 正在说话…（点击可静音）',
          isInteractive: true,
        };
      }
      return {
        state: 'live',
        label: '你的麦克风已开启（点击可静音）',
        isInteractive: true,
      };
    }
    if (voiceState.status === 'connecting') {
      return { state: 'unjoined', label: '语音连接中…', isInteractive: false };
    }
    return { state: 'unjoined', label: '你尚未开启语音', isInteractive: false };
  }

  // Remote participant
  if (voiceState.status === 'connected') {
    if (voiceState.micOpenUids.has(pRtcUid)) {
      if (voiceState.speakingUids.has(pRtcUid)) {
        return { state: 'speaking', label: '麦克风已开启 · 正在说话…', isInteractive: false };
      }
      return { state: 'live', label: '麦克风已开启', isInteractive: false };
    }
    if (voiceState.onlineUids.has(pRtcUid)) {
      return { state: 'muted', label: '麦克风已静音', isInteractive: false };
    }
    return { state: 'unjoined', label: '未连麦', isInteractive: false };
  }

  return { state: 'unjoined', label: '未连麦', isInteractive: false };
}

function LiveMicSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="currentColor" fillOpacity="0.35" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function SpeakingMicSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" fill="currentColor" fillOpacity="0.75" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MutedMicSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2.4" />
      <path d="M18.89 13.23A7.12 7.12 0 0 1 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" fill="currentColor" fillOpacity="0.25" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function UnjoinedMicSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="3" x2="21" y2="21" strokeWidth="2.2" />
      <path d="M18.89 13.23A7.12 7.12 0 0 1 19 12v-2" strokeDasharray="2 2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" strokeDasharray="2 2" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

export function SeatMicBadge({
  playerId,
  userId,
  voiceChatEnabled,
  voiceState,
  onToggleMute,
  className = '',
}: SeatMicBadgeProps) {
  if (!voiceChatEnabled) return null;

  const { state, label, isInteractive } = computePlayerMicState(playerId, userId, voiceState);

  const innerContent = (
    <>
      {state === 'speaking' && (
        <span className="mic-badge-pulse-ring" aria-hidden="true" />
      )}
      <span className="mic-badge-icon">
        {state === 'live' && <LiveMicSvg />}
        {state === 'speaking' && <SpeakingMicSvg />}
        {state === 'muted' && <MutedMicSvg />}
        {state === 'unjoined' && <UnjoinedMicSvg />}
      </span>
    </>
  );

  if (isInteractive && onToggleMute) {
    return (
      <button
        type="button"
        className={`seat-mic-badge is-${state} is-clickable ${className}`}
        onClick={e => {
          e.stopPropagation();
          onToggleMute();
        }}
        title={label}
        aria-label={label}
      >
        {innerContent}
      </button>
    );
  }

  return (
    <span
      className={`seat-mic-badge is-${state} ${className}`}
      title={label}
      aria-label={label}
    >
      {innerContent}
    </span>
  );
}
