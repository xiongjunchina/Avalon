import type {
  IAgoraRTC,
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';

let agoraInstance: IAgoraRTC | null = null;
async function getAgoraRTC(): Promise<IAgoraRTC> {
  if (agoraInstance) return agoraInstance;
  if (typeof window === 'undefined') {
    throw new Error('AgoraRTC requires a browser environment');
  }
  const mod = await import('agora-rtc-sdk-ng');
  const rtc = ((mod as unknown as { default?: IAgoraRTC }).default ?? mod) as IAgoraRTC;
  rtc.setLogLevel(2);
  agoraInstance = rtc;
  return rtc;
}

export type VoiceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface VoiceState {
  status: VoiceStatus;
  muted: boolean;
  deafened: boolean;
  error?: string;
  speakingUids: Set<number>;
  channel?: string;
  uid?: number;
}

export class AgoraVoiceManager {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private status: VoiceStatus = 'disconnected';
  private muted = false;
  private deafened = false;
  private error?: string;
  private channel?: string;
  private uid?: number;
  private speakingUids = new Set<number>();
  private speakerTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
  private listeners = new Set<(state: VoiceState) => void>();
  private duckingCallback?: (ducking: boolean) => void;

  getState(): VoiceState {
    return {
      status: this.status,
      muted: this.muted,
      deafened: this.deafened,
      error: this.error,
      speakingUids: new Set(this.speakingUids),
      channel: this.channel,
      uid: this.uid,
    };
  }

  subscribe(listener: (state: VoiceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  setDuckingCallback(callback: (ducking: boolean) => void) {
    this.duckingCallback = callback;
  }

  private notify() {
    const state = this.getState();
    const hasSpeakers = this.speakingUids.size > 0;
    this.duckingCallback?.(hasSpeakers);
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  async join(config: { appId: string; channel: string; token: string; uid: number }): Promise<void> {
    if (this.status === 'connected' && this.channel === config.channel && this.uid === config.uid) {
      return;
    }
    // Clean up any existing connection
    await this.leave();

    this.status = 'connecting';
    this.channel = config.channel;
    this.uid = config.uid;
    this.error = undefined;
    this.notify();

    try {
      const AgoraRTC = await getAgoraRTC();
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.client = client;

      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        try {
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio') {
            if (!this.deafened) {
              user.audioTrack?.play();
            } else {
              user.audioTrack?.stop();
            }
          }
        } catch (err) {
          console.warn('Failed to subscribe to remote user audio:', err);
        }
      });

      client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType === 'audio') {
          user.audioTrack?.stop();
        }
      });

      client.on('connection-state-change', (curState, _revState, reason) => {
        if (curState === 'DISCONNECTED') {
          if (reason === 'NETWORK_ERROR') {
            this.error = '语音网络中断，正在尝试恢复...';
          }
          this.notify();
        }
      });

      // Volume indicator for speaking detection & BGM auto-ducking
      client.enableAudioVolumeIndicator();
      client.on('volume-indicator', volumes => {
        const threshold = 12;
        let changed = false;
        for (const v of volumes) {
          const uid = Number(v.uid);
          // If level is loud enough and (if local user) not muted
          const isLocal = uid === this.uid || uid === 0;
          if (v.level >= threshold && (!isLocal || !this.muted)) {
            const actualUid = isLocal ? (this.uid ?? 0) : uid;
            if (!this.speakingUids.has(actualUid)) {
              this.speakingUids.add(actualUid);
              changed = true;
            }
            const existing = this.speakerTimeouts.get(actualUid);
            if (existing) clearTimeout(existing);
            const timer = setTimeout(() => {
              this.speakerTimeouts.delete(actualUid);
              this.speakingUids.delete(actualUid);
              this.notify();
            }, 800);
            this.speakerTimeouts.set(actualUid, timer);
          }
        }
        if (changed) {
          this.notify();
        }
      });

      // Join RTC Channel
      await client.join(config.appId, config.channel, config.token, config.uid);

      // Attempt to acquire microphone and publish local track
      try {
        const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
          AEC: true, // Acoustic Echo Cancellation
          ANS: true, // Automatic Noise Suppression
          AGC: true, // Auto Gain Control
        });
        this.localAudioTrack = localTrack;
        if (this.muted) {
          await localTrack.setEnabled(false);
        }
        await client.publish([localTrack]);
      } catch (micErr) {
        // If microphone permission denied or no mic device, degrade gracefully to listen-only
        console.warn('Microphone not available or permission denied; entering listen-only mode', micErr);
        this.muted = true;
      }

      this.status = 'connected';
      this.notify();
    } catch (err) {
      console.error('Failed to join Agora voice channel:', err);
      this.status = 'error';
      this.error = err instanceof Error ? err.message : '语音连接失败';
      this.notify();
    }
  }

  async toggleMute(): Promise<boolean> {
    if (this.deafened) {
      // If deafened, cannot unmute without un-deafening
      return true;
    }
    const nextMuted = !this.muted;
    this.muted = nextMuted;

    if (this.localAudioTrack) {
      try {
        await this.localAudioTrack.setEnabled(!nextMuted);
      } catch (err) {
        console.warn('Failed to toggle local audio track:', err);
      }
    } else if (!nextMuted && this.client && this.status === 'connected') {
      // Try to acquire mic if not created previously
      try {
        const AgoraRTC = await getAgoraRTC();
        const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
          AEC: true,
          ANS: true,
          AGC: true,
        });
        this.localAudioTrack = localTrack;
        await this.client.publish([localTrack]);
      } catch (err) {
        console.warn('Microphone permission denied:', err);
        this.muted = true;
      }
    }

    if (this.muted && this.uid) {
      this.speakingUids.delete(this.uid);
    }
    this.notify();
    return this.muted;
  }

  async toggleDeafen(): Promise<boolean> {
    const nextDeafened = !this.deafened;
    this.deafened = nextDeafened;

    if (nextDeafened) {
      // Deafen: Mute mic as well, and stop all remote audio
      this.muted = true;
      if (this.localAudioTrack) {
        await this.localAudioTrack.setEnabled(false);
      }
      if (this.client) {
        for (const user of this.client.remoteUsers) {
          user.audioTrack?.stop();
        }
      }
      if (this.uid) this.speakingUids.delete(this.uid);
    } else {
      // Undeafen: resume remote audio
      if (this.client) {
        for (const user of this.client.remoteUsers) {
          user.audioTrack?.play();
        }
      }
    }

    this.notify();
    return this.deafened;
  }

  async leave(): Promise<void> {
    for (const timer of this.speakerTimeouts.values()) {
      clearTimeout(timer);
    }
    this.speakerTimeouts.clear();
    this.speakingUids.clear();

    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack.close();
      this.localAudioTrack = null;
    }

    if (this.client) {
      try {
        await this.client.leave();
      } catch (err) {
        console.warn('Error leaving voice channel:', err);
      }
      this.client = null;
    }

    this.status = 'disconnected';
    this.channel = undefined;
    this.uid = undefined;
    this.error = undefined;
    this.notify();
  }
}

export const voiceManager = new AgoraVoiceManager();
