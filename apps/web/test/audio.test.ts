import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { createGame, projectGame, transition } from '@avalon/game-core';
import { defaultSettings, type GameView } from '@avalon/contracts';
import { AudioEventTracker, EFFECT_CUES, effectFile, gameAudioCues, parseSoundPreferences } from '../src/audio-events';
import { BACKGROUND_MUSIC } from '../src/audio-catalog';
import { SoundEngine } from '../src/audio-engine';

const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, seat: i + 1, nickname: `仙友${i}` }));
const fresh = () => createGame('audio-game', players, { ...defaultSettings, playerCount: 5, anonymousTeamVote: true }, a => a, { randomBelow: () => 0n });
const view = () => projectGame(fresh(), 'p0');
test('sound settings default off and reject malformed or truthy string values', () => {
  for (const value of [null, '', 'bad', 'null', '[]', '{"music":"false","effects":1}']) assert.deepEqual(parseSoundPreferences(value), { music: false, effects: false });
  assert.deepEqual(parseSoundPreferences('{"music":true,"effects":false}'), { music: true, effects: false });
});
test('restoring, reconnecting and returning to the foreground never replay historical cues', () => {
  const tracker = new AudioEventTracker(), a = view(), b = { ...a, phase: 'team_vote' as const };
  assert.deepEqual(tracker.update(a, true), []);
  assert.deepEqual(tracker.update(b, true), ['notice']);
  assert.deepEqual(tracker.update(b, true), []);
  tracker.update(b, false);
  assert.deepEqual(tracker.update({ ...b, phase: 'assassination' }, true), []);
  tracker.reset(); assert.deepEqual(tracker.update(a, true), []);
  assert.deepEqual(gameAudioCues(null, { ...a, phase: 'dealing' }), ['deal']);
});
test('countdown completion and practice entrance play start once, restored games stay silent', () => {
  const tracker = new AudioEventTracker(), a = view();
  tracker.update(null,true);
  assert.deepEqual(tracker.update({ ...a, phase: 'dealing' },true),['deal']);
  assert.deepEqual(tracker.update(a,true),['game-start']);
  assert.deepEqual(tracker.update({ ...a,phase:'proposing' },true),[]);
  tracker.update(null,true);
  assert.deepEqual(tracker.update(a,true),['game-start']);
  tracker.reset(); assert.deepEqual(tracker.update(a,true),[]);
});
test('private roles, vote choices, submission progress and inspections never produce audio', () => {
  const a = view();
  for (const p of players) assert.deepEqual(gameAudioCues(a, projectGame(fresh(), p.id)), []);
  const privateChange = { ...a, progress: { confirmed: 5, teamVotes: 4, missionVotes: 2 }, self: { ...a.self!, missionVoted: true, teamVoted: true, inspections: [{ afterMission: 2, inspectorId: 'p0', targetId: 'p1', team: 'red' as const }] } };
  assert.deepEqual(gameAudioCues(a, privateChange), []);
});
test('public round transitions sound once; terminal result takes precedence over next phase', () => {
  let g = fresh(); const ids = players.map(p => p.id);
  const send = (id: string, type: string, payload: object = {}) => { g = transition(g, id, { type, payload } as Parameters<typeof transition>[2], ids); };
  send('p0', 'proposeTeam', { playerIds: ['p0','p1'], direction: 'clockwise' });
  send('p0', 'startTeamVote');
  let before = projectGame(g, 'p0');
  for (const p of players.slice(0,4)) { send(p.id, 'teamVote', { approve: true }); assert.deepEqual(gameAudioCues(before, projectGame(g, 'p0')), []); before = projectGame(g, 'p0'); }
  send('p4', 'teamVote', { approve: true });
  assert.deepEqual(gameAudioCues(before, projectGame(g, 'p0')), ['confirm']);
  before = projectGame(g, 'p0'); send('p0', 'missionVote', { success: true });
  assert.deepEqual(gameAudioCues(before, projectGame(g, 'p0')), []);
  send('p1', 'missionVote', { success: true });
  assert.deepEqual(gameAudioCues(before, projectGame(g, 'p0')), ['success-tone']);
  assert.deepEqual(gameAudioCues(before, { ...projectGame(g, 'p0'), phase: 'assassination' }), ['sword']);
  const finished: GameView = { ...before, phase: 'finished', result: { winner: 'blue', reason: 'merlin_survived' } };
  assert.deepEqual(gameAudioCues(before, finished, 'blue'), ['victory']);
  assert.deepEqual(gameAudioCues(before, finished, 'red'), ['defeat']);
  const redWins = { ...finished, result: { winner: 'red' as const, reason: 'merlin_found' as const } };
  assert.deepEqual(gameAudioCues(before, redWins, 'red'), ['victory']);
  assert.deepEqual(gameAudioCues(before, redWins, 'blue'), ['defeat']);
  assert.deepEqual(gameAudioCues(before, { ...finished, result: { winner: null, reason: 'unanimous_abort' } }, 'blue'), ['game-over']);
  assert.deepEqual(gameAudioCues(finished, finished), []);
});
test('assassination plays one sword draw and does not replay when restored', () => {
  const tracker = new AudioEventTracker(), a = view();
  tracker.update(a, true);
  const assassination = { ...a, phase: 'assassination' as const };
  assert.deepEqual(tracker.update(assassination, true), ['sword']);
  assert.deepEqual(tracker.update(assassination, true), []);
  assert.deepEqual(gameAudioCues({ ...a, phase: 'early_window' }, assassination), ['sword']);
  tracker.reset();
  assert.deepEqual(tracker.update(assassination, true), []);
});
test('every non-vocal effect is packaged and all rejected narration/loops are removed', () => {
  assert.ok(existsSync(`apps/web/public${BACKGROUND_MUSIC.file}`), BACKGROUND_MUSIC.file);
  for (const cue of EFFECT_CUES) assert.ok(existsSync(`apps/web/public${effectFile(cue)}`), cue);
  const files = readdirSync('apps/web/public/audio', { recursive: true }).map(String);
  assert.ok(!files.some(file => /voice-|lobby\.mp3|table\.mp3|tension\.mp3/.test(file)));
});

// Verify cancellation and independent channels without requiring an actual sound device.
test('audio stays opt-in, mutes independently and cancels pending/hidden playback', async t => {
  const sources: FakeSource[] = []; let contexts = 0, loads = 0;
  class FakeSource extends EventTarget {
    buffer = {}; loop = false; stopped = false; connect() { return { connect() {} }; } disconnect() {}
    start() { sources.push(this); }
    stop() { this.stopped = true; this.dispatchEvent(new Event('ended')); }
  }
  class FakeContext {
    state = 'suspended'; currentTime = 0; destination = {};
    constructor() { contexts++; }
    async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; } async close() { this.state = 'closed'; }
    async decodeAudioData() { return {}; }
    createBufferSource() { return new FakeSource(); }
    createGain() { return { gain: { value: 0, setTargetAtTime() {}, linearRampToValueAtTime() {} }, disconnect() {} }; }
  }
  t.mock.method(globalThis, 'fetch', async () => { loads++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response; });
  const old = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeContext });
  t.after(() => { if (old) Object.defineProperty(globalThis, 'AudioContext', old); else Reflect.deleteProperty(globalThis, 'AudioContext'); });
  const engine = new SoundEngine(() => {}, { file: '/test-theme.mp3', title: 'Test fixture' }); const flush = () => new Promise(resolve => setImmediate(resolve));
  await engine.activate(); await engine.effect('tap'); await engine.transition(['confirm']);
  assert.equal(contexts,0); assert.equal(loads,0);
  engine.configure({ music: true, effects: true }); await engine.activate(); await flush();
  const music = sources.find(s => s.loop)!; assert.ok(music);
  await engine.transition(['sword']); const effect = sources.find(s => !s.loop)!; assert.ok(effect);
  const countDuringSword = sources.length; await engine.effect('tap'); assert.equal(sources.length, countDuringSword+1);
  assert.equal(effect.stopped,false);
  await engine.transition(['page']); assert.equal(effect.stopped,false);
  await engine.transition(['game-start']); assert.equal(sources.filter(s=>!s.loop).length,3);
  await engine.transition(['victory']); assert.ok(effect.stopped);
  const victory = sources.at(-1)!; assert.equal(victory.stopped,false);
  await engine.transition(['page']); assert.equal(victory.stopped,false);
  engine.setScene('table'); await flush(); assert.equal(sources.filter(s => s.loop).length, 1);
  engine.configure({ music: false, effects: true }); assert.ok(music.stopped); assert.equal(victory.stopped,false);
  engine.configure({ music: false, effects: false }); assert.ok(victory.stopped); 
  engine.configure({ music: true, effects: true }); await flush();
  engine.setForeground(false); assert.ok(sources.every(s => s.stopped));
  const count = sources.length; await engine.effect('ready'); await engine.transition(['chime']); assert.equal(sources.length,count);
  engine.setForeground(true); await flush();
  const pending = engine.transition(['page']); engine.configure({ music: true, effects: false }); await pending;
  assert.ok(sources.filter(s => !s.loop).every(s => s.stopped));
  engine.dispose();
});
