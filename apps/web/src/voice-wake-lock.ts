export interface VoiceWakeLockSnapshot {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  pending: boolean;
  notice: string;
}
export interface VoiceWakeLockState extends VoiceWakeLockSnapshot { toggle: () => void }
export interface ScreenWakeLock {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
  removeEventListener: (type: 'release', listener: () => void) => void;
}

/** Optional per-call preference. Browser visibility and late requests may never resurrect a released lock. */
export class VoiceWakeLockController {
  private state: VoiceWakeLockSnapshot;
  private voiceActive = false;
  private generation = 0;
  private lock: ScreenWakeLock | null = null;
  private releaseListener: (() => void) | null = null;
  private listeners = new Set<(state: VoiceWakeLockSnapshot) => void>();
  constructor(private environment: { supported: boolean; visible: () => boolean; request: () => Promise<ScreenWakeLock> }) {
    this.state = { supported: environment.supported, enabled: false, active: false, pending: false, notice: '' };
  }
  getState(): VoiceWakeLockSnapshot { return { ...this.state }; }
  subscribe(listener: (state: VoiceWakeLockSnapshot) => void) {
    this.listeners.add(listener); listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }
  private update(next: Partial<VoiceWakeLockSnapshot>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.getState());
  }
  setVoiceActive(active: boolean) {
    if (active === this.voiceActive) return;
    this.voiceActive = active;
    if (!active) this.reset();
    else if (!this.state.supported) this.update({ notice: '当前浏览器不支持保持亮屏' });
  }
  toggle() {
    if (!this.voiceActive) return;
    if (this.state.enabled) {
      this.generation++; this.release();
      this.update({ enabled: false, pending: false, active: false, notice: '' });
    } else if (!this.state.supported) this.update({ notice: '当前浏览器不支持保持亮屏' });
    else {
      this.update({ enabled: true, notice: '' });
      void this.acquire();
    }
  }
  visibilityChanged() {
    if (!this.environment.visible()) {
      this.generation++; this.release();
      this.update({ active: false, pending: false });
    } else if (this.voiceActive && this.state.enabled) void this.acquire();
  }
  private async acquire() {
    if (!this.voiceActive || !this.state.enabled || !this.environment.visible() || this.lock || this.state.pending) return;
    const generation = ++this.generation;
    this.update({ pending: true, notice: '' });
    try {
      const lock = await this.environment.request();
      if (generation !== this.generation || !this.voiceActive || !this.state.enabled || !this.environment.visible()) {
        this.releaseHandle(lock); return;
      }
      if (lock.released) { this.update({ enabled: false, pending: false, notice: '未能保持亮屏，请重试' }); return; }
      this.lock = lock;
      this.releaseListener = () => {
        if (this.lock !== lock) return;
        this.lock = null; this.releaseListener = null;
        if (!this.environment.visible()) this.update({ active: false, pending: false });
        else this.update({ active: false, enabled: false, pending: false, notice: '亮屏已被系统暂停，可重新开启' });
      };
      lock.addEventListener('release', this.releaseListener);
      this.update({ active: true, pending: false });
    } catch {
      if (generation === this.generation) this.update({ enabled: false, active: false, pending: false, notice: '未能保持亮屏，请重试' });
    }
  }
  private releaseHandle(lock: ScreenWakeLock) { try { void lock.release().catch(() => {}); } catch { /* Browser may already have released it. */ } }
  private release() {
    const lock = this.lock, listener = this.releaseListener;
    this.lock = null; this.releaseListener = null;
    if (lock) { if (listener) lock.removeEventListener('release', listener); this.releaseHandle(lock); }
  }
  private reset() {
    this.generation++; this.release();
    this.update({ enabled: false, active: false, pending: false, notice: '' });
  }
  dispose() { this.voiceActive = false; this.reset(); }
}
