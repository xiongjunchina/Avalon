import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { uuidToRtcUid } from '@avalon/contracts';
import { computePlayerMicState, SeatMicBadge } from '../src/SeatMicBadge';
import { AgoraVoiceManager, type VoiceState } from '../src/agora-voice';

test('computePlayerMicState handles local user states correctly', () => {
  const myId = 'user-me-123';
  const myRtcUid = uuidToRtcUid(myId);

  // 1. Connected & unmuted (live)
  const stateLive: VoiceState = {
    status: 'connected',
    muted: false,
    deafened: false,
    speakingUids: new Set(),
    onlineUids: new Set([myRtcUid]),
    micOpenUids: new Set([myRtcUid]),
    uid: myRtcUid,
  };
  const resLive = computePlayerMicState(myId, myId, stateLive);
  assert.equal(resLive.state, 'live');
  assert.equal(resLive.isInteractive, true);
  assert.match(resLive.label, /已开启/);

  // 2. Connected & speaking
  const stateSpeaking: VoiceState = {
    ...stateLive,
    speakingUids: new Set([myRtcUid]),
  };
  const resSpeaking = computePlayerMicState(myId, myId, stateSpeaking);
  assert.equal(resSpeaking.state, 'speaking');
  assert.equal(resSpeaking.isInteractive, true);
  assert.match(resSpeaking.label, /正在说话/);

  // 3. Connected & muted
  const stateMuted: VoiceState = {
    ...stateLive,
    muted: true,
    micOpenUids: new Set(),
  };
  const resMuted = computePlayerMicState(myId, myId, stateMuted);
  assert.equal(resMuted.state, 'muted');
  assert.equal(resMuted.isInteractive, true);
  assert.match(resMuted.label, /已静音/);

  // 4. Connected & deafened
  const stateDeafened: VoiceState = {
    ...stateLive,
    deafened: true,
  };
  const resDeafened = computePlayerMicState(myId, myId, stateDeafened);
  assert.equal(resDeafened.state, 'muted');

  // 5. Connecting
  const stateConnecting: VoiceState = {
    ...stateLive,
    status: 'connecting',
  };
  const resConnecting = computePlayerMicState(myId, myId, stateConnecting);
  assert.equal(resConnecting.state, 'unjoined');

  // 6. Disconnected
  const stateDisconnected: VoiceState = {
    ...stateLive,
    status: 'disconnected',
  };
  const resDisconnected = computePlayerMicState(myId, myId, stateDisconnected);
  assert.equal(resDisconnected.state, 'unjoined');
});

test('computePlayerMicState handles remote participants states correctly', () => {
  const myId = 'user-me-123';
  const myRtcUid = uuidToRtcUid(myId);
  const remoteId = 'user-remote-456';
  const remoteRtcUid = uuidToRtcUid(remoteId);

  // Base connected state
  const baseConnected: VoiceState = {
    status: 'connected',
    muted: false,
    deafened: false,
    speakingUids: new Set(),
    onlineUids: new Set([myRtcUid]),
    micOpenUids: new Set([myRtcUid]),
    uid: myRtcUid,
  };

  // 1. Remote user unjoined / not in voice channel
  const resUnjoined = computePlayerMicState(remoteId, myId, baseConnected);
  assert.equal(resUnjoined.state, 'unjoined');
  assert.equal(resUnjoined.isInteractive, false);
  assert.equal(resUnjoined.label, '未连麦');

  // 2. Remote user online but mic muted (in onlineUids but not micOpenUids)
  const stateRemoteMuted: VoiceState = {
    ...baseConnected,
    onlineUids: new Set([myRtcUid, remoteRtcUid]),
    micOpenUids: new Set([myRtcUid]),
  };
  const resRemoteMuted = computePlayerMicState(remoteId, myId, stateRemoteMuted);
  assert.equal(resRemoteMuted.state, 'muted');
  assert.equal(resRemoteMuted.isInteractive, false);
  assert.match(resRemoteMuted.label, /已静音/);

  // 3. Remote user mic open (live)
  const stateRemoteLive: VoiceState = {
    ...baseConnected,
    onlineUids: new Set([myRtcUid, remoteRtcUid]),
    micOpenUids: new Set([myRtcUid, remoteRtcUid]),
  };
  const resRemoteLive = computePlayerMicState(remoteId, myId, stateRemoteLive);
  assert.equal(resRemoteLive.state, 'live');
  assert.equal(resRemoteLive.isInteractive, false);
  assert.match(resRemoteLive.label, /已开启/);

  // 4. Remote user speaking
  const stateRemoteSpeaking: VoiceState = {
    ...stateRemoteLive,
    speakingUids: new Set([remoteRtcUid]),
  };
  const resRemoteSpeaking = computePlayerMicState(remoteId, myId, stateRemoteSpeaking);
  assert.equal(resRemoteSpeaking.state, 'speaking');
  assert.equal(resRemoteSpeaking.isInteractive, false);
  assert.match(resRemoteSpeaking.label, /正在说话/);

  // 5. When local user is disconnected, remote user reports unjoined
  const stateLocalDisconnected: VoiceState = {
    ...stateRemoteLive,
    status: 'disconnected',
  };
  const resLocalDisconnected = computePlayerMicState(remoteId, myId, stateLocalDisconnected);
  assert.equal(resLocalDisconnected.state, 'unjoined');
});

test('SeatMicBadge renders nothing when voiceChatEnabled is false', () => {
  const html = renderToStaticMarkup(
    React.createElement(SeatMicBadge, {
      playerId: 'p1',
      userId: 'p1',
      voiceChatEnabled: false,
    })
  );
  assert.equal(html, '');
});

test('SeatMicBadge renders appropriate markup and classes when voiceChatEnabled is true', () => {
  const myId = 'p1';
  const myRtcUid = uuidToRtcUid(myId);

  const voiceState: VoiceState = {
    status: 'connected',
    muted: false,
    deafened: false,
    speakingUids: new Set(),
    onlineUids: new Set([myRtcUid]),
    micOpenUids: new Set([myRtcUid]),
    uid: myRtcUid,
  };

  // Local user live with onToggleMute -> renders button
  const htmlMe = renderToStaticMarkup(
    React.createElement(SeatMicBadge, {
      playerId: myId,
      userId: myId,
      voiceChatEnabled: true,
      voiceState,
      onToggleMute: () => {},
    })
  );
  assert.match(htmlMe, /<button/);
  assert.match(htmlMe, /seat-mic-badge/);
  assert.match(htmlMe, /is-live/);
  assert.match(htmlMe, /is-clickable/);

  // Remote user muted -> renders span
  const remoteId = 'p2';
  const remoteRtcUid = uuidToRtcUid(remoteId);
  const voiceStateRemoteMuted: VoiceState = {
    ...voiceState,
    onlineUids: new Set([myRtcUid, remoteRtcUid]),
  };
  const htmlRemote = renderToStaticMarkup(
    React.createElement(SeatMicBadge, {
      playerId: remoteId,
      userId: myId,
      voiceChatEnabled: true,
      voiceState: voiceStateRemoteMuted,
    })
  );
  assert.match(htmlRemote, /<span/);
  assert.match(htmlRemote, /is-muted/);
  assert.doesNotMatch(htmlRemote, /is-clickable/);
});

test('AgoraVoiceManager initializes with onlineUids and micOpenUids sets and exports defensive copies', () => {
  const manager = new AgoraVoiceManager();
  const state = manager.getState();
  assert.ok(state.onlineUids instanceof Set);
  assert.ok(state.micOpenUids instanceof Set);
  assert.equal(state.onlineUids.size, 0);
  assert.equal(state.micOpenUids.size, 0);

  // Mutating returned set does not affect manager state
  state.onlineUids.add(999);
  const state2 = manager.getState();
  assert.equal(state2.onlineUids.size, 0);
});
