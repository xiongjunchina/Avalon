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
type VoiceConfig = { appId: string; channel: string; token: string; uid: number };

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
  recoveryNeeded?: boolean;
  recovering?: boolean;
  recoveryMessage?: string;
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
  private connectionAbort?: AbortController;
  private joinTask: Promise<void> | null = null;
  private rtc: IAgoraRTC | null = null;
  private sdkCleanup?: () => void;
  private trackCleanup?: () => void;
  private recoveryNeeded = false;
  private recovering = false;
  private recoveryMessage?: string;
  private recoveryTask: Promise<'ready'|'interaction'|'reconnect'> | null = null;
  private recoveryVersion = 0;

  constructor(
    private readonly loadRTC: () => Promise<IAgoraRTC> = getAgoraRTC,
    private readonly connectionTimeoutMs = 20_000,
  ) {}

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
      recoveryNeeded: this.recoveryNeeded,
      recovering: this.recovering,
      recoveryMessage: this.recoveryMessage,
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

  private needsRecovery(message: string) {
    this.recoveryVersion++;
    this.recoveryNeeded = true;
    this.recoveryMessage = message;
    this.notify();
  }

  private watchMicrophone(track: IMicrophoneAudioTrack) {
    this.trackCleanup?.();
    const ended = () => {
      if(this.localAudioTrack!==track)return;
      if(this.uid)this.micOpenUids.delete(this.uid);
      if(!this.muted&&!this.deafened)this.needsRecovery('麦克风已被系统中断，请点击恢复语音');
      else this.notify();
    };
    track.on?.('track-ended',ended);
    const media=track.getMediaStreamTrack?.();
    const interrupted=()=>{
      if(this.localAudioTrack===track&&!this.muted&&!this.deafened)this.needsRecovery('麦克风被系统暂停，请点击恢复语音');
    };
    media?.addEventListener('ended',ended);
    media?.addEventListener('mute',interrupted);
    this.trackCleanup=()=>{track.off?.('track-ended',ended);media?.removeEventListener('ended',ended);media?.removeEventListener('mute',interrupted);};
  }

  /** Recover media in the existing channel; reconnect only when the channel really ended. */
  recover(userGesture = false): Promise<'ready'|'interaction'|'reconnect'> {
    if(this.recoveryTask)return this.recoveryTask;
    if(this.status==='disconnected')return Promise.resolve('reconnect');
    if(this.status==='connecting')return Promise.resolve('ready');
    const client=this.client,attempt=this.connectionAbort,rtc=this.rtc;
    if(!client||!attempt||attempt.signal.aborted||client.connectionState==='DISCONNECTED')return Promise.resolve('reconnect');
    if(client.connectionState==='RECONNECTING')return Promise.resolve(userGesture?'reconnect':'ready');
    let expired=false;
    const active=()=>!expired&&this.client===client&&this.connectionAbort===attempt&&!attempt.signal.aborted;
    const version=this.recoveryVersion;
    let contextError=false;
    // Keep this synchronous so a click can satisfy the browser's user-gesture requirement.
    try{if(!this.deafened)rtc?.resumeAudioContext?.();}catch{contextError=true;}
    this.recovering=true;this.notify();
    let timer:ReturnType<typeof setTimeout>|undefined;
    let abortRecovery:()=>void;
    const cancelled=new Promise<'ready'>(resolve=>{abortRecovery=()=>resolve('ready');attempt.signal.addEventListener('abort',abortRecovery,{once:true});});
    const operation=(async():Promise<'ready'|'interaction'>=>{
      let replacement:IMicrophoneAudioTrack|undefined;
      try{
        if(contextError)throw Error('AUDIO_CONTEXT_BLOCKED');
        if(!this.deafened){
          for(const remote of client.remoteUsers){
            if(!active())return 'ready';
            if(remote.hasAudio&&!remote.audioTrack){await client.subscribe(remote,'audio');if(!active())return 'ready';}
            remote.audioTrack?.play();
          }
        }
        const original=this.localAudioTrack;
        const media=original?.getMediaStreamTrack?.();
        if(!this.muted&&!this.deafened&&(!original||media?.readyState==='ended'||(userGesture&&media?.muted))){
          this.trackCleanup?.();this.trackCleanup=undefined;
          if(original){
            try{await client.unpublish(original);}finally{
              if(this.localAudioTrack===original){this.localAudioTrack=null;original.stop();original.close();}
            }
            if(!active())return 'ready';
          }
          replacement=await rtc!.createMicrophoneAudioTrack({AEC:true,ANS:true,AGC:true});
          if(!active()){replacement.stop();replacement.close();return 'ready';}
          this.localAudioTrack=replacement;this.watchMicrophone(replacement);
          await replacement.setMuted(this.muted||this.deafened);
          if(!active())return 'ready';
          await client.publish([replacement]);
          if(!active())return 'ready';
          // A user can mute while permission acquisition or publication is still pending.
          await replacement.setMuted(this.muted||this.deafened);
          if(!active())return 'ready';
        }
        if(!active())return 'ready';
        const currentMedia=this.localAudioTrack?.getMediaStreamTrack?.();
        if(!this.muted&&!this.deafened&&currentMedia?.muted){
          this.needsRecovery('麦克风仍被系统暂停，请点击恢复语音');return 'interaction';
        }
        if(this.recoveryVersion!==version)return 'interaction';
        this.recoveryNeeded=false;this.recoveryMessage=undefined;
        if(this.uid&&this.localAudioTrack&&!this.muted&&!this.deafened)this.micOpenUids.add(this.uid);
        return 'ready';
      }catch{
        if(replacement&&this.localAudioTrack===replacement){
          this.trackCleanup?.();this.trackCleanup=undefined;this.localAudioTrack=null;
          void client.unpublish(replacement).catch(()=>{});
          replacement.stop();replacement.close();
          if(this.uid)this.micOpenUids.delete(this.uid);
        }
        if(active())this.needsRecovery('语音播放或麦克风尚未恢复，请点击恢复语音');
        return 'interaction';
      }
    })();
    const timeout=new Promise<'interaction'>(resolve=>{timer=setTimeout(()=>{
      if(active()){
        expired=true;void this.releaseResources();
        this.status='error';this.error='语音恢复超时，请点击恢复语音';this.notify();
      }
      resolve('interaction');
    },this.connectionTimeoutMs);});
    const task=Promise.race([operation,cancelled,timeout]).finally(()=>{
      clearTimeout(timer);
      attempt.signal.removeEventListener('abort',abortRecovery);
      if(this.recoveryTask===task)this.recoveryTask=null;
      if(active()){this.recovering=false;this.notify();}
    });
    this.recoveryTask=task;
    return task;
  }

  join(config: VoiceConfig): Promise<void> {
    if (this.status === 'connected' && this.channel === config.channel && this.uid === config.uid) {
      return Promise.resolve();
    }
    if (this.status === 'connecting' && this.channel === config.channel && this.uid === config.uid && this.joinTask) {
      return this.joinTask;
    }
    this.connectionAbort?.abort();
    const cleanup = this.releaseResources();
    const attempt = new AbortController();
    this.connectionAbort = attempt;

    this.status = 'connecting';
    this.channel = config.channel;
    this.uid = config.uid;
    this.error = undefined;
    this.notify();

    const task = this.connect(config, attempt, cleanup);
    this.joinTask = task;
    const settled = () => { if (this.joinTask === task) this.joinTask = null; };
    void task.then(settled, settled);
    return task;
  }

  private async connect(config: VoiceConfig, attempt: AbortController, cleanup: Promise<void>): Promise<void> {
    const current = () => this.connectionAbort === attempt && !attempt.signal.aborted;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<void>(resolve => attempt.signal.addEventListener('abort', () => resolve(), { once: true }));
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('VOICE_CONNECTION_TIMEOUT')), this.connectionTimeoutMs);
    });
    const operation = (async () => {
      await cleanup;
      if (!current()) return;

      if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        throw new Error('浏览器安全限制：实时语音需使用 HTTPS 加密访问（HTTP无法使用麦克风）');
      }

      const AgoraRTC = await this.loadRTC();
      if (!current()) return;
      this.rtc=AgoraRTC;
      if (typeof AgoraRTC.checkSystemRequirements === 'function' && !AgoraRTC.checkSystemRequirements()) {
        const msg = '当前浏览器环境不支持 WebRTC 实时语音，请尝试使用 Chrome、Safari 或内置安全浏览器';
        throw new Error(msg);
      }
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      this.client = client;
      const active = () => current() && this.client === client;
      const autoplay=()=>{if(active()&&!this.deafened)this.needsRecovery('浏览器暂停了语音播放，请点击恢复语音');};
      const audioState=(state:string)=>{
        if(active()&&!this.deafened&&['interrupted','suspended','closed'].includes(state))this.needsRecovery('语音被系统暂停，请点击恢复语音');
      };
      AgoraRTC.on?.('autoplay-failed',autoplay);
      AgoraRTC.on?.('audio-context-state-changed',audioState);
      this.sdkCleanup=()=>{AgoraRTC.off?.('autoplay-failed',autoplay);AgoraRTC.off?.('audio-context-state-changed',audioState);};
      let joined = false;

      client.on('user-joined', (user: IAgoraRTCRemoteUser) => {
        if (!active()) return;
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
        if (!active()) return;
        const rUid = Number(user.uid);
        if (rUid) {
          this.onlineUids.add(rUid);
          if (mediaType === 'audio') {
            this.micOpenUids.add(rUid);
          }
        }
        try {
          await client.subscribe(user, mediaType);
          if (!active()) return;
          if (mediaType === 'audio') {
            if (!this.deafened) {
              user.audioTrack?.play();
            } else {
              user.audioTrack?.stop();
            }
          }
        } catch (err) {
          console.warn('Failed to subscribe to remote user audio:', err);
          if(active()&&mediaType==='audio'&&!this.deafened)this.needsRecovery('语音尚未恢复，请点击恢复语音');
        }
        if (!active()) return;
        this.notify();
      });

      client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (!active()) return;
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
        if (!active()) return;
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
        if (!active() || !joined) return;
        if (curState === 'RECONNECTING') {
          this.status = 'error';
          this.error = '语音网络波动，正在恢复连接，也可点击重试';
          this.notify();
        } else if (curState === 'CONNECTED') {
          this.status = 'connected';
          this.error = undefined;
          this.notify();
        } else if (curState === 'DISCONNECTED') {
          void this.releaseResources();
          this.status = 'error';
          this.error = reason === 'UID_BANNED'
            ? '当前语音身份已断开，请重新连接'
            : '语音连接已断开，请检查网络后重试';
          this.notify();
        }
      });

      // Volume indicator for speaking detection & BGM auto-ducking
      client.enableAudioVolumeIndicator();
      client.on('volume-indicator', volumes => {
        if (!active()) return;
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
              if (!active()) return;
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
      if (!active()) { await client.leave(); return; }
      joined = true;

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
        if (!active()) { localTrack.stop(); localTrack.close(); return; }
        this.localAudioTrack = localTrack;
        this.watchMicrophone(localTrack);
        if (this.muted) {
          await localTrack.setMuted(true);
          if (!active()) return;
          this.micOpenUids.delete(config.uid);
        } else {
          this.micOpenUids.add(config.uid);
        }
        await client.publish([localTrack]);
      } catch (micErr) {
        if (!active()) return;
        // If microphone permission denied or no mic device, degrade gracefully to listen-only
        console.warn('Microphone not available or permission denied; entering listen-only mode', micErr);
        this.muted = true;
        this.micOpenUids.delete(config.uid);
        this.localAudioTrack?.stop();
        this.localAudioTrack?.close();
        this.localAudioTrack = null;
      }

      if (!active()) return;
      this.status = 'connected';
      this.notify();
    })();
    try {
      await Promise.race([operation, cancelled, deadline]);
    } catch (err: unknown) {
      if (!current()) return;
      attempt.abort();
      void this.releaseResources();
      console.error('Failed to join Agora voice channel:', err);
      this.status = 'error';
      let errorMsg = '语音连接失败';
      if (err instanceof Error) {
        const msg = err.message || '';
        if (msg.includes('VOICE_CONNECTION_TIMEOUT') || msg.includes('NETWORK_TIMEOUT')) {
          errorMsg = '语音连接超时，请检查网络后点击重试';
        } else if (msg.includes('CAN_NOT_GET_GATEWAY_SERVER')) {
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
    } finally {
      clearTimeout(timeout);
    }
  }

  async toggleMute(): Promise<boolean> {
    const attempt = this.connectionAbort, client = this.client;
    const active = () => this.connectionAbort === attempt && !attempt?.signal.aborted && this.client === client;
    if (!client || this.status !== 'connected') return this.muted;
    if (this.deafened) {
      // If deafened, cannot unmute without un-deafening
      return true;
    }
    const nextMuted = !this.muted;
    this.muted = nextMuted;

    if(this.recovering){
      // Avatar mic badges can also toggle mute. Never start a second capture during recovery.
      const track=this.localAudioTrack;
      if(track&&track.getMediaStreamTrack?.().readyState!=='ended'){
        try{await track.setMuted(nextMuted);}catch{if(active())this.needsRecovery('麦克风尚未恢复，请点击恢复语音');}
      }
      if(!active())return this.muted;
      if(this.uid&&this.muted){this.micOpenUids.delete(this.uid);this.speakingUids.delete(this.uid);}
      this.notify();return this.muted;
    }

    if(this.localAudioTrack?.getMediaStreamTrack?.().readyState==='ended'){
      await this.recover(true);
    }else if (this.localAudioTrack) {
      try {
        await this.localAudioTrack.setMuted(nextMuted);
      } catch (err) {
        console.warn('Failed to toggle local audio track muted state:', err);
      }
    } else if (!nextMuted && this.client && this.status === 'connected') {
      // Try to acquire mic if not created previously
      try {
        const AgoraRTC = await this.loadRTC();
        if (!active()) return this.muted;
        const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
          AEC: true,
          ANS: true,
          AGC: true,
        });
        if (!active()) { localTrack.stop(); localTrack.close(); return this.muted; }
        this.localAudioTrack = localTrack;
        this.watchMicrophone(localTrack);
        await client.publish([localTrack]);
      } catch (err) {
        if (!active()) return this.muted;
        console.warn('Microphone permission denied:', err);
        this.muted = true;
        const failed=this.localAudioTrack;
        this.trackCleanup?.();this.trackCleanup=undefined;this.localAudioTrack=null;
        if(failed){void client.unpublish(failed).catch(()=>{});failed.stop();failed.close();}
      }
    }

    if (!active()) return this.muted;
    if (this.uid) {
      if (this.muted) {
        this.micOpenUids.delete(this.uid);
        this.speakingUids.delete(this.uid);
      } else if(this.localAudioTrack&&this.localAudioTrack.getMediaStreamTrack?.().readyState!=='ended') {
        this.micOpenUids.add(this.uid);
      } else {
        this.micOpenUids.delete(this.uid);
      }
    }
    this.notify();
    return this.muted;
  }

  async toggleDeafen(): Promise<boolean> {
    const attempt = this.connectionAbort, client = this.client;
    if (!client || this.status !== 'connected') return this.deafened;
    const nextDeafened = !this.deafened;
    this.deafened = nextDeafened;

    if (nextDeafened) {
      // Deafen: Mute mic as well, and stop all remote audio
      this.muted = true;
      if (this.localAudioTrack) {
        await this.localAudioTrack.setMuted(true);
        if (this.connectionAbort !== attempt || attempt?.signal.aborted || this.client !== client) return this.deafened;
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
    this.connectionAbort?.abort();
    this.connectionAbort = undefined;
    this.joinTask = null;
    this.recoveryTask=null;
    const cleanup = this.releaseResources();
    this.status = 'disconnected';
    this.channel = undefined;
    this.uid = undefined;
    this.error = undefined;
    this.notify();
    await cleanup;
  }

  private async releaseResources(): Promise<void> {
    // Detach before awaiting: an old leave must never clear a newer client/track.
    const client = this.client, track = this.localAudioTrack;
    this.sdkCleanup?.();this.sdkCleanup=undefined;
    this.trackCleanup?.();this.trackCleanup=undefined;
    this.client = null;
    this.localAudioTrack = null;
    this.rtc=null;
    this.recoveryNeeded=false;this.recovering=false;this.recoveryMessage=undefined;
    this.recoveryTask=null;
    for (const timer of this.speakerTimeouts.values()) {
      clearTimeout(timer);
    }
    this.speakerTimeouts.clear();
    this.speakingUids.clear();
    this.onlineUids.clear();
    this.micOpenUids.clear();

    if (track) {
      track.stop();
      track.close();
    }

    if (client) {
      client.removeAllListeners();
      try {
        await client.leave();
      } catch (err) {
        console.warn('Error leaving voice channel:', err);
      }
    }
  }
}

export const voiceManager = new AgoraVoiceManager();
