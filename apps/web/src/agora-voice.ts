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
  onlineUids: Set<number>;
  micOpenUids: Set<number>;
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
  private onlineUids = new Set<number>();
  private micOpenUids = new Set<number>();
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
      onlineUids: new Set(this.onlineUids),
      micOpenUids: new Set(this.micOpenUids),
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

    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const msg = '浏览器安全限制：实时语音需使用 HTTPS 加密访问（HTTP无法使用麦克风）';
      this.status = 'error';
      this.error = msg;
      this.notify();
      throw new Error(msg);
    }

    try {
      const AgoraRTC = await getAgoraRTC();
      if (typeof AgoraRTC.checkSystemRequirements === 'function' && !AgoraRTC.checkSystemRequirements()) {
        const msg = '当前浏览器环境不支持 WebRTC 实时语音，请尝试使用 Chrome、Safari 或内置安全浏览器';
        this.status = 'error';
        this.error = msg;
        this.notify();
        throw new Error(msg);
      }
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.client = client;

      client.on('user-joined', (user: IAgoraRTCRemoteUser) => {
        const rUid = Number(user.uid);
        if (rUid) {
          this.onlineUids.add(rUid);
          if (user.hasAudio) {
            this.micOpenUids.add(rUid);
          }
          this.notify();
        }
      });

      client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        const rUid = Number(user.uid);
        if (rUid) {
          this.onlineUids.add(rUid);
          if (mediaType === 'audio') {
            this.micOpenUids.add(rUid);
          }
        }
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
        this.notify();
      });

      client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType === 'audio') {
          const rUid = Number(user.uid);
          if (rUid) {
            this.micOpenUids.delete(rUid);
            this.speakingUids.delete(rUid);
            const existing = this.speakerTimeouts.get(rUid);
            if (existing) {
              clearTimeout(existing);
              this.speakerTimeouts.delete(rUid);
            }
          }
          user.audioTrack?.stop();
          this.notify();
        }
      });

      client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        const rUid = Number(user.uid);
        if (rUid) {
          this.onlineUids.delete(rUid);
          this.micOpenUids.delete(rUid);
          this.speakingUids.delete(rUid);
          const existing = this.speakerTimeouts.get(rUid);
          if (existing) {
            clearTimeout(existing);
            this.speakerTimeouts.delete(rUid);
          }
          this.notify();
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

      // Record local user presence
      this.onlineUids.add(config.uid);
      if (!this.muted) {
        this.micOpenUids.add(config.uid);
      } else {
        this.micOpenUids.delete(config.uid);
      }

      // Snapshot existing remote users in channel
      for (const remoteUser of client.remoteUsers) {
        const rUid = Number(remoteUser.uid);
        if (rUid) {
          this.onlineUids.add(rUid);
          if (remoteUser.hasAudio) {
            this.micOpenUids.add(rUid);
          }
        }
      }

      // Attempt to acquire microphone and publish local track
      try {
        const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
          AEC: true, // Acoustic Echo Cancellation
          ANS: true, // Automatic Noise Suppression
          AGC: true, // Auto Gain Control
        });
        this.localAudioTrack = localTrack;
        if (this.muted) {
          await localTrack.setMuted(true);
          this.micOpenUids.delete(config.uid);
        } else {
          this.micOpenUids.add(config.uid);
        }
        await client.publish([localTrack]);
      } catch (micErr) {
        // If microphone permission denied or no mic device, degrade gracefully to listen-only
        console.warn('Microphone not available or permission denied; entering listen-only mode', micErr);
        this.muted = true;
        this.micOpenUids.delete(config.uid);
      }

      this.status = 'connected';
      this.notify();
    } catch (err: unknown) {
      console.error('Failed to join Agora voice channel:', err);
      this.status = 'error';
      let errorMsg = '语音连接失败';
      if (err instanceof Error) {
        const msg = err.message || '';
        if (msg.includes('CAN_NOT_GET_GATEWAY_SERVER')) {
          errorMsg = '无法连接声网服务器，请检查网络或防火墙';
        } else if (msg.includes('INVALID_TOKEN') || msg.includes('DYNAMIC_KEY_EXPIRED')) {
          errorMsg = '语音鉴权凭据无效或已过期，请重新开启';
        } else if (msg.includes('INVALID_APP_ID')) {
          errorMsg = '声网 App ID 无效或未启用语音服务';
        } else if (msg.includes('NOT_SUPPORTED') || (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
          errorMsg = '浏览器安全限制：实时语音需使用 HTTPS 加密访问';
        } else if (msg.includes('PERMISSION_DENIED') || msg.includes('Permission denied')) {
          errorMsg = '麦克风权限被拒绝，请在手机设置或浏览器中允许录音权限';
        } else {
          errorMsg = msg;
        }
      }
      this.error = errorMsg;
      this.notify();
      throw new Error(errorMsg);
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
        await this.localAudioTrack.setMuted(nextMuted);
      } catch (err) {
        console.warn('Failed to toggle local audio track muted state:', err);
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

    if (this.uid) {
      if (this.muted) {
        this.micOpenUids.delete(this.uid);
        this.speakingUids.delete(this.uid);
      } else {
        this.micOpenUids.add(this.uid);
      }
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
        await this.localAudioTrack.setMuted(true);
      }
      if (this.client) {
        for (const user of this.client.remoteUsers) {
          user.audioTrack?.stop();
        }
      }
      if (this.uid) {
        this.micOpenUids.delete(this.uid);
        this.speakingUids.delete(this.uid);
      }
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
    this.onlineUids.clear();
    this.micOpenUids.clear();

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
