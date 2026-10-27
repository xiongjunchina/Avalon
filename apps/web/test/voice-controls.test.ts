import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceControls } from '../src/VoiceControls';
import type { VoiceState } from '../src/agora-voice';

const noop = () => {};
const voice: VoiceState = { status: 'connected', muted: false, deafened: false,
  speakingUids: new Set(), onlineUids: new Set(), micOpenUids: new Set(), uid: 1 };
const wakeLock = { supported: true, enabled: false, active: false, pending: false, notice: '', toggle: noop };
const render = (state: VoiceState, wake = wakeLock) => renderToStaticMarkup(createElement(VoiceControls, {
  voiceState: state, onJoin: noop, onLeave: noop, onToggleMute: noop, onToggleDeafen: noop, onReconnect: noop, wakeLock: wake,
}));

test('voice controls expose the optional screen preference only during a voice session and always retain an exit', () => {
  const disconnected = render({ ...voice, status: 'disconnected' });
  assert.match(disconnected, /开启语音/); assert.doesNotMatch(disconnected, /保持亮屏/);
  for (const status of ['connected', 'connecting', 'error'] as const) {
    const html = render({ ...voice, status });
    assert.match(html, /voice-options-row/); assert.match(html, /aria-pressed="false"/); assert.match(html, /保持亮屏/);
    assert.match(html, /leave-voice-btn/);
  }
});

test('recovery needs an explicit action and uses a yellow status instead of claiming a healthy call', () => {
  const html = render({ ...voice, recoveryNeeded: true, recoveryMessage: '请恢复麦克风' });
  assert.match(html, /voice-status-dot connecting/); assert.match(html, /点击恢复语音/);
  assert.doesNotMatch(html, /voice-status-dot connected/);
  const recovering = render({ ...voice, recoveryNeeded: true, recovering: true });
  assert.match(recovering, /恢复中…/); assert.doesNotMatch(recovering, /voice-recovery-action/);
  assert.match(recovering, /leave-voice-btn/);
});

test('wake-lock denial and browser limitations remain inline without claiming the preference is on', () => {
  const html = render(voice, { ...wakeLock, supported: false, notice: '当前浏览器不支持保持亮屏' });
  assert.match(html, /disabled=""/); assert.match(html, /当前浏览器不支持保持亮屏/); assert.match(html, /aria-pressed="false"/);
});

test('recovering players can still mute themselves or silence the room while opening audio stays blocked', () => {
  const button = (html: string, className: string) => {
    const tag = html.match(new RegExp(`<button\\b(?=[^>]*class="[^"]*\\b${className}\\b)[^>]*>`));
    assert.ok(tag, className); return tag[0];
  };
  const live = render({ ...voice, recovering: true });
  assert.doesNotMatch(button(live, 'mic-btn'), /disabled/);
  assert.doesNotMatch(button(live, 'deafen-btn'), /disabled/);
  assert.doesNotMatch(button(live, 'leave-voice-btn'), /disabled/);
  const silent = render({ ...voice, recovering: true, muted: true, deafened: true });
  assert.match(button(silent, 'mic-btn'), /disabled/);
  assert.match(button(silent, 'deafen-btn'), /disabled/);
  assert.doesNotMatch(button(silent, 'leave-voice-btn'), /disabled/);
});
