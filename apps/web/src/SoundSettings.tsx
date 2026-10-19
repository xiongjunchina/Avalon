import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameView } from '@avalon/contracts';
import { AudioEventTracker, parseSoundPreferences, SOUND_STORAGE_KEY, type EffectCue, type MusicScene, type SoundPreferences } from './audio-events';
import { interactionCue, PAGE_SOUND_EVENT } from './audio-interactions';
import { BGM_CANDIDATES, BGM_STORAGE_KEY, getSavedBgmTrack, type BackgroundMusicTrack } from './audio-catalog';
import { SoundEngine } from './audio-engine';
import { Modal } from './Modal';

function readPreferences() {
  try { return parseSoundPreferences(localStorage.getItem(SOUND_STORAGE_KEY)); }
  catch { return parseSoundPreferences(null); }
}

const SoundContext = createContext<{
  preferences: SoundPreferences;
  update: (key: keyof SoundPreferences, enabled: boolean) => void;
  engine: SoundEngine;
  error: string;
  visible: boolean;
  currentBgm: BackgroundMusicTrack;
  switchBgm: (track: BackgroundMusicTrack) => void;
} | null>(null);

export const useSound = () => {
  const sound = useContext(SoundContext);
  if (!sound) throw Error('SoundProvider missing');
  return sound;
};

export function SoundProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences), [error, setError] = useState('');
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const [currentBgm, setCurrentBgm] = useState<BackgroundMusicTrack>(getSavedBgmTrack);
  const [engine] = useState(() => new SoundEngine(setError, getSavedBgmTrack()));
  const changeVersion = useRef(0);

  useEffect(() => {
    engine.configure(preferences);
  }, [engine, preferences]);

  useEffect(() => {
    const play = (cue: EffectCue | null) => void engine.activate().then(() => { if (cue) void engine.effect(cue); });
    const click = (event: MouseEvent) => {
      play(interactionCue(event.target instanceof Element ? event.target : null, 'click'));
    };
    const change = (event: Event) => play(interactionCue(event.target instanceof Element ? event.target : null, 'change'));
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      play(['Enter', ' '].includes(event.key) ? interactionCue(event.target instanceof Element ? event.target : null, 'keyboard') : null);
    };
    const pageSound = () => play('page');
    const visibility = () => { const value = document.visibilityState === 'visible'; setVisible(value); engine.setForeground(value); };
    const hide = () => { setVisible(false); engine.setForeground(false); };
    const sync = (event: StorageEvent) => {
      if (event.key === SOUND_STORAGE_KEY || event.key === null) {
        const next = readPreferences(); engine.configure(next); setPreferences(next);
      }
      if (event.key === BGM_STORAGE_KEY || event.key === null) {
        const nextTrack = getSavedBgmTrack();
        setCurrentBgm(nextTrack);
        engine.setMusic(nextTrack);
      }
    };
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('change', change, true);
    document.addEventListener(PAGE_SOUND_EVENT, pageSound);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', visibility); window.addEventListener('storage', sync);
    return () => {
      document.removeEventListener('click', click, true); document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('change', change, true); document.removeEventListener(PAGE_SOUND_EVENT, pageSound);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', visibility); window.removeEventListener('storage', sync);
      engine.dispose();
    };
  }, [engine]);

  function update(key: keyof SoundPreferences, enabled: boolean) {
    const version = ++changeVersion.current;
    const next = { ...preferences, [key]: enabled }; setPreferences(next); engine.configure(next); setError('');
    try { localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(next)); } catch { /* Still works for this page when storage is unavailable. */ }
    if (enabled) void engine.activate().then(() => { if (key === 'effects' && version === changeVersion.current) void engine.effect('confirm'); });
  }

  function switchBgm(track: BackgroundMusicTrack) {
    setCurrentBgm(track);
    try {
      localStorage.setItem(BGM_STORAGE_KEY, track.id);
    } catch {}
    engine.setMusic(track);
    if (!preferences.music) {
      update('music', true);
    }
  }

  return (
    <SoundContext.Provider value={{ preferences, update, engine, error, visible, currentBgm, switchBgm }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useGameSound(game: GameView | null, active: boolean, connected: boolean) {
  const { engine, visible } = useSound(), tracker = useRef(new AudioEventTracker());
  useEffect(() => {
    const reset = () => tracker.current.reset();
    document.addEventListener('visibilitychange', reset); window.addEventListener('pagehide', reset);
    return () => { document.removeEventListener('visibilitychange', reset); window.removeEventListener('pagehide', reset); };
  }, []);
  useEffect(() => {
    const live = active && connected && visible;
    const cues = tracker.current.update(game, live, game?.result ? game.self?.team : undefined);
    const scene: MusicScene = !active || !game ? 'lobby' : game.result ? null : game.phase === 'assassination' ? 'tension' : 'table';
    engine.setScene(scene);
    if (!connected || !visible) engine.cancelEffects();
    else if (cues.length) void engine.transition(cues);
  }, [engine, game, active, connected, visible]);
}

export function useNavigationSound(key: string, ready: boolean) {
  const { engine } = useSound(), previous = useRef<string | null>(null);
  useEffect(() => {
    if (ready && previous.current !== null && previous.current !== key) void engine.transition(['page']);
    previous.current = ready ? key : null;
  }, [engine, key, ready]);
}

export function SoundControls() {
  const { preferences, update, error, currentBgm, switchBgm } = useSound();
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleAudition = (track: BackgroundMusicTrack) => {
    if (auditioningId === track.id) {
      audioRef.current?.pause();
      setAuditioningId(null);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = track.file;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      audioRef.current.onended = () => setAuditioningId(null);
      setAuditioningId(track.id);
    }
  };

  const handleSelectBgm = (track: BackgroundMusicTrack) => {
    if (audioRef.current) {
      audioRef.current.pause();
      setAuditioningId(null);
    }
    switchBgm(track);
  };

  return (
    <div className="sound-controls">
      <label className="sound-option">
        <span>
          <strong>背景音乐</strong>
          <small>{currentBgm.title}</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={preferences.music}
          onChange={e => update('music', e.target.checked)}
          aria-label="背景音乐"
        />
      </label>

      <label className="sound-option">
        <span>
          <strong>操作音效</strong>
          <small>法器反馈 · 降妖法鼓 · 金箍惊鸣 · 胜负终章</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={preferences.effects}
          onChange={e => update('effects', e.target.checked)}
          aria-label="操作音效"
        />
      </label>

      {/* 5 Candidate Tracks Showcase & Audition */}
      <section className="bgm-selector-section" aria-label="西游记主题音乐候选">
        <div className="bgm-selector-head">
          <span className="bgm-selector-title">🎼 西游记主题仙乐试听与切换</span>
          <span className="bgm-selector-sub">已下载 5 首高品质 MP3 · 点击试听或设为背景曲</span>
        </div>

        <div className="bgm-track-list">
          {BGM_CANDIDATES.map(track => {
            const isCurrent = currentBgm.id === track.id;
            const isPlaying = auditioningId === track.id;

            return (
              <div
                key={track.id}
                className={`bgm-track-card ${isCurrent ? 'is-active-bgm' : ''} ${
                  isPlaying ? 'is-auditioning' : ''
                }`}
              >
                <div className="bgm-track-top">
                  <div className="bgm-track-meta">
                    <span className="bgm-badge">{track.badge}</span>
                    <strong className="bgm-title">{track.title}</strong>
                    <span className="bgm-duration">{track.duration}</span>
                  </div>
                </div>
                <p className="bgm-subtitle">{track.subtitle}</p>
                <p className="bgm-desc">{track.desc}</p>

                <div className="bgm-track-actions">
                  <button
                    type="button"
                    className={`bgm-btn-audition ${isPlaying ? 'is-playing' : ''}`}
                    onClick={() => handleAudition(track)}
                    aria-label={`${isPlaying ? '暂停试听' : '试听'} ${track.title}`}
                  >
                    {isPlaying ? '⏸ 暂停试听' : '▶ 试听'}
                  </button>

                  <button
                    type="button"
                    className={`bgm-btn-select ${isCurrent ? 'is-current' : ''}`}
                    onClick={() => handleSelectBgm(track)}
                    disabled={isCurrent && preferences.music}
                  >
                    {isCurrent && preferences.music ? '✓ 当前使用中' : '设为背景音乐'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="sound-hint">仅影响自己的设备，自动记住选择。音量使用手机或电脑的媒体音量键调整。</p>
      {error && <p role="status" className="error">{error}</p>}
    </div>
  );
}

export function SoundButton() {
  const [open, setOpen] = useState(false), { preferences } = useSound();
  const enabled = preferences.music || preferences.effects;
  return <>
    <button type="button" className={`secondary sound-button${enabled ? ' is-on' : ''}`} aria-label="声音设置" aria-haspopup="dialog" aria-expanded={open} title="声音设置" onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/>{enabled ? <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></> : <path d="m16 9 5 6m0-6-5 6"/>}</svg>
    </button>
    {open && <Modal label="声音设置" scene="library" onClose={() => setOpen(false)}><section className="sound-dialog"><div className="section-head"><h2>天宫仙乐</h2><button type="button" className="secondary compact-button" onClick={() => setOpen(false)}>关闭</button></div><SoundControls /></section></Modal>}
  </>;
}
