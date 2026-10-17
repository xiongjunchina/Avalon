import { ACCENT_PRIORITIES, effectFile, type EffectCue, type MusicScene, type SoundPreferences } from './audio-events';
import { BACKGROUND_MUSIC, type BackgroundMusic } from './audio-catalog';

type Channel = 'music' | 'effect' | 'accent';
export class SoundEngine {
  private context?: AudioContext;
  private preferences: SoundPreferences = { music: false, effects: false };
  private scene: MusicScene = 'lobby';
  private foreground = true;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private nodes = new Map<AudioBufferSourceNode, { channel: Channel; gain: GainNode }>();
  private musicNode?: AudioBufferSourceNode;
  private musicGeneration = 0;
  private effectGeneration = 0;
  private accentGeneration = 0;
  private accent?: { cue: EffectCue; priority: number; generation: number };
  private lastUi?: { cue: EffectCue; at: number };
  private disposed = false;
  constructor(private report: (message: string) => void = () => {}, private music: BackgroundMusic | null = BACKGROUND_MUSIC) {}

  configure(preferences: SoundPreferences) {
    this.preferences = preferences;
    if (!preferences.effects) this.cancelEffects();
    if (!preferences.music) { ++this.musicGeneration; this.stop('music'); this.musicNode = undefined; }
    else if (this.foreground && this.context?.state === 'running' && !this.musicNode) void this.startMusic();
  }
  // Only actual user interaction unlocks playback, never a page load or snapshot.
  async activate() {
    if (this.disposed || !this.foreground || (!this.preferences.music && !this.preferences.effects)) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state !== 'running') await this.context.resume();
      if (this.context.state === 'running') {
        this.report('');
        if (!this.musicNode) void this.startMusic();
        if (this.preferences.effects) for (const cue of ['tap', 'page', 'game-start', 'sword', 'victory', 'defeat', 'game-over'] as const) void this.loadEffect(cue).catch(() => {});
      }
    } catch { this.report('声音暂未启动，请点击声音开关重试。'); }
  }
  setForeground(visible: boolean) {
    this.foreground = visible;
    if (!visible) {
      ++this.musicGeneration; this.cancelEffects(); this.stop('music'); this.musicNode = undefined;
      void this.context?.suspend().catch(() => {});
    } else if (this.context) void this.activate();
  }
  setScene(scene: MusicScene) {
    if (scene === this.scene) return;
    this.scene = scene;
    // A single selected theme continues through navigation, without restarting.
    if (scene && this.musicNode) this.duck();
    else void this.startMusic();
  }
  private async load(path: string) {
    if (!this.buffers.has(path)) {
      const request = fetch(path).then(r => {
        if (!r.ok) throw Error('Audio unavailable'); return r.arrayBuffer();
      }).then(bytes => this.context!.decodeAudioData(bytes)).catch(error => { this.buffers.delete(path); throw error; });
      this.buffers.set(path, request);
    }
    return this.buffers.get(path)!;
  }
  private loadEffect(cue: EffectCue) { return this.load(effectFile(cue)); }
  private source(buffer: AudioBuffer, channel: Channel, volume: number, loop = false) {
    const context = this.context!, source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.loop = loop; gain.gain.value = volume;
    source.connect(gain).connect(context.destination); this.nodes.set(source, { channel, gain });
    source.addEventListener('ended', () => { source.disconnect(); gain.disconnect(); this.nodes.delete(source); }, { once: true });
    source.start(); return source;
  }
  private stop(channel: Channel) {
    for (const [source, entry] of this.nodes) if (entry.channel === channel) {
      entry.gain.gain.value = 0; try { source.stop(); } catch { /* already ended */ }
    }
  }
  private musicLevel() { return this.accent ? .025 : this.scene === 'tension' ? .12 : .20; }
  private duck() {
    const gain = this.musicNode && this.nodes.get(this.musicNode)?.gain;
    if (gain && this.context) gain.gain.setTargetAtTime(this.musicLevel(), this.context.currentTime, .12);
  }
  private async startMusic() {
    const generation = ++this.musicGeneration;
    if (!this.scene || !this.music || !this.preferences.music || !this.foreground || this.context?.state !== 'running') {
      if (!this.scene && this.musicNode && this.context) {
        const old = this.musicNode; this.musicNode = undefined;
        this.nodes.get(old)?.gain.gain.linearRampToValueAtTime(0, this.context.currentTime + .6);
        old.stop(this.context.currentTime + .65);
      }
      return;
    }
    try {
      const buffer = await this.load(this.music.file);
      if (generation !== this.musicGeneration || !this.preferences.music || !this.foreground || this.context.state !== 'running') return;
      const old = this.musicNode;
      this.musicNode = this.source(buffer, 'music', 0, true);
      this.nodes.get(this.musicNode)!.gain.gain.linearRampToValueAtTime(this.musicLevel(), this.context.currentTime + .7);
      if (old) { this.nodes.get(old)?.gain.gain.linearRampToValueAtTime(0, this.context.currentTime + .7); old.stop(this.context.currentTime + .72); }
    } catch { if (generation === this.musicGeneration) this.report('背景音乐加载失败，关闭后重新开启可重试。'); }
  }
  private playable() { return this.preferences.effects && this.foreground && !this.disposed && this.context?.state === 'running'; }
  async effect(cue: EffectCue) {
    if (!this.playable()) return;
    if (ACCENT_PRIORITIES[cue]) return this.playAccent(cue);
    const now = Date.now();
    if (this.lastUi?.cue === cue && now - this.lastUi.at < (cue === 'page' ? 120 : 55)) return;
    this.lastUi = { cue, at: now };
    const generation = this.effectGeneration;
    try {
      const buffer = await this.loadEffect(cue);
      if (generation !== this.effectGeneration || Date.now() - now > 1000 || !this.playable()) return;
      // Short control feedback remains audible during an accent without cutting it off.
      const gain = (cue === 'tap' || cue === 'tick' ? .48 : .55) * (this.accent ? .6 : 1);
      this.source(buffer, 'effect', gain);
    } catch { /* A missed effect must not interrupt the game. */ }
  }
  private async playAccent(cue: EffectCue) {
    const priority = ACCENT_PRIORITIES[cue]!;
    if (this.accent && (priority < this.accent.priority || cue === this.accent.cue)) return;
    const generation = ++this.accentGeneration, started = Date.now();
    ++this.effectGeneration; this.stop('effect'); this.stop('accent');
    this.accent = { cue, priority, generation }; this.duck();
    let source: AudioBufferSourceNode | undefined;
    try {
      const buffer = await this.loadEffect(cue);
      if (generation !== this.accentGeneration || !this.playable() || Date.now() - started > 4000) return;
      source = this.source(buffer, 'accent', .98);
      source.addEventListener('ended', () => {
        if (generation === this.accentGeneration) { this.accent = undefined; this.duck(); }
      }, { once: true });
    } catch { /* Asset errors must not block play. */ }
    finally {
      if (!source && generation === this.accentGeneration) { this.accent = undefined; this.duck(); }
    }
  }
  cancelEffects() {
    ++this.effectGeneration; ++this.accentGeneration;
    this.stop('effect'); this.stop('accent'); this.accent = undefined; this.duck();
  }
  async transition(cues: EffectCue[]) {
    // Navigation and button sounds cannot cancel an entrance, assassination or result accent.
    if (cues[0]) await this.effect(cues[0]);
  }
  dispose() {
    this.disposed = true; ++this.musicGeneration; this.cancelEffects(); this.stop('music');
    void this.context?.close().catch(() => {});
  }
}
