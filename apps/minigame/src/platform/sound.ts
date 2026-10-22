import { AudioEventTracker, effectFile, parseSoundPreferences, SOUND_STORAGE_KEY, type EffectCue, type SoundPreferences } from '../../../web/src/audio-events.js';
import { BACKGROUND_MUSIC } from '../../../web/src/audio-catalog.js';
import type { GameView } from '@avalon/contracts';
import type { WechatPlatform } from './wechat.js';

export class MiniGameSound {
  readonly tracker = new AudioEventTracker();
  preferences: SoundPreferences;
  private active = false;
  private visible = true;
  private music?: ReturnType<NonNullable<WechatPlatform['runtime']['createInnerAudioContext']>>;
  private effects: ReturnType<NonNullable<WechatPlatform['runtime']['createInnerAudioContext']>>[] = [];
  constructor(private readonly platform: WechatPlatform, private readonly origin: string, private readonly report: (text: string) => void) {
    const raw = platform.get(SOUND_STORAGE_KEY);
    this.preferences = parseSoundPreferences(typeof raw === 'string' ? raw : null);
  }
  configure(key: keyof SoundPreferences, enabled: boolean) {
    this.preferences = { ...this.preferences, [key]: enabled };
    this.platform.set(SOUND_STORAGE_KEY, JSON.stringify(this.preferences));
    if (!this.preferences.music) { this.music?.stop(); this.music?.destroy(); this.music = undefined; }
    if (!this.preferences.effects) this.clearEffects();
    this.activate();
  }
  activate() {
    this.active = true;
    if (!this.visible || !this.preferences.music || this.music || !this.platform.runtime.createInnerAudioContext) return;
    this.music = this.platform.runtime.createInnerAudioContext();
    this.music.src = this.origin + BACKGROUND_MUSIC.file; this.music.loop = true; this.music.volume = .26;
    this.music.onError?.(() => this.report('音乐暂时无法加载，可在声音设置中重试。'));
    this.music.play();
  }
  effect(cue: EffectCue) {
    if (!this.active || !this.visible || !this.preferences.effects || !this.platform.runtime.createInnerAudioContext) return;
    while (this.effects.length >= 3) { const oldest = this.effects.shift(); oldest?.stop(); oldest?.destroy(); }
    const audio = this.platform.runtime.createInnerAudioContext();
    audio.src = this.origin + effectFile(cue); audio.volume = .55;
    const cleanup = () => { this.effects = this.effects.filter(item => item !== audio); audio.destroy(); };
    audio.onEnded?.(cleanup); audio.onError?.(cleanup); this.effects.push(audio); audio.play();
  }
  update(game: GameView | undefined, live: boolean) { for (const cue of this.tracker.update(game ?? null, this.visible && live, game?.result ? game.self?.team : undefined)) this.effect(cue); }
  foreground(value: boolean) {
    this.visible = value; this.tracker.reset();
    if (!value) { this.music?.pause(); this.clearEffects(); }
    else if (this.active && this.preferences.music) { if (this.music) this.music.play(); else this.activate(); }
  }
  private clearEffects() { for (const audio of this.effects) { audio.stop(); audio.destroy(); } this.effects = []; }
}
