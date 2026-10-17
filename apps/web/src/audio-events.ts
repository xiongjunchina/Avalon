import type { GameView } from '@avalon/contracts';

export const SOUND_STORAGE_KEY = 'lunjian.sound.v1';
export interface SoundPreferences { music: boolean; effects: boolean }
export function parseSoundPreferences(raw: string | null): SoundPreferences {
  try { const value = JSON.parse(raw ?? '{}'); return { music: value?.music === true, effects: value?.effects === true }; }
  catch { return { music: false, effects: false }; }
}
export const EFFECT_CUES = ['tap', 'page', 'ready', 'confirm', 'deal', 'tick', 'success-tone', 'failure-tone', 'chime', 'sword', 'notice', 'game-start', 'victory', 'defeat', 'game-over'] as const;
export type EffectCue = typeof EFFECT_CUES[number];
export const EFFECT_ASSET_ROOT = '/audio/v3';
export const effectFile = (cue: EffectCue) => `${EFFECT_ASSET_ROOT}/${cue === 'victory' ? 'victory-r2' : cue}.mp3`;
export const ACCENT_PRIORITIES: Partial<Record<EffectCue, number>> = { 'game-start': 2, sword: 3, victory: 4, defeat: 4, 'game-over': 4 };
export type MusicScene = 'lobby' | 'table' | 'tension' | null;
// Only public fields participate. Private roles, ballots, choices and submission counts are deliberately absent.
export type PublicAudioGame = Pick<GameView, 'id' | 'phase' | 'captainId' | 'rounds' | 'result'>;
const phase = (g: PublicAudioGame) => g.phase === 'role_reveal' ? 'proposing' : g.phase;
export function gameAudioCues(previous: PublicAudioGame | null, next: PublicAudioGame | null, viewerTeam?: 'blue' | 'red'): EffectCue[] {
  if (!next) return [];
  if (!previous || previous.id !== next.id) return next.phase === 'dealing' ? ['deal'] : ['role_reveal', 'proposing'].includes(next.phase) ? ['game-start'] : [];
  // Perspective matters only after the public result; never distinguish private choices or roles in play.
  if (next.result && !previous.result) return [!next.result.winner || !viewerTeam ? 'game-over' : next.result.winner === viewerTeam ? 'victory' : 'defeat'];
  if (next.result) return [];
  // The public assassination phase overrides all other feedback in the same update.
  if (next.phase === 'assassination' && previous.phase !== next.phase) return ['sword'];
  if (previous.phase === 'dealing' && ['role_reveal', 'proposing'].includes(next.phase)) return ['game-start'];
  const result = next.rounds.find(r => r.result && !previous.rounds.some(p => p.number === r.number && p.result));
  if (result) return [result.result!.passed ? 'success-tone' : 'failure-tone'];
  const vote = next.rounds.find(r => r.vote && !previous.rounds.some(p => p.number === r.number && p.vote));
  if (vote) return [vote.vote!.passed ? 'confirm' : 'notice'];
  if (phase(previous) !== phase(next) || (phase(next) === 'proposing' && previous.captainId !== next.captainId)) {
    switch (phase(next)) {
      case 'proposing': case 'discussion': return ['page'];
      case 'team_vote': return ['notice'];
      case 'lady': return ['chime'];
    }
  }
  return [];
}

/** Baseline resets on reconnect/foreground/route changes. Never sound a restored snapshot. */
export class AudioEventTracker {
  private previous: PublicAudioGame | null = null;
  private active = false;
  reset() { this.active = false; }
  update(game: PublicAudioGame | null, active: boolean, viewerTeam?: 'blue' | 'red'): EffectCue[] {
    const cues = active && this.active ? gameAudioCues(this.previous, game, viewerTeam) : [];
    this.previous = game; this.active = active;
    return cues;
  }
}
