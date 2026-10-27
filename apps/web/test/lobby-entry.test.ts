import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LobbyHome } from '../src/LobbyHome';
import { EntryDialog } from '../src/EntryDialog';

const noop = () => {};
const props = {
  role: 'loyal' as const, freeAccess: true, busy: false, voiceEnabled: false,
  hasInvitation: false, friendRequests: 0, soundControl: null,
  onVoiceChange: noop, onAccount: noop, onSignIn: noop, onLogout: noop,
  onFriends: noop, onGuide: noop, onCreate: noop, onJoin: noop, onPractice: noop,
};

test('visitor and signed-in home expose the same hero and public guide without a registration form', () => {
  const visitor = renderToStaticMarkup(createElement(LobbyHome, { ...props, user: null }));
  const signedIn = renderToStaticMarkup(createElement(LobbyHome, {
    ...props, user: { id: 'p1', nickname: '仙友', playerCode: '123456' },
  }));
  const hero = (html: string) => html.slice(html.indexOf('<div class="mp-logo-block">'), html.indexOf('<footer'));
  assert.equal(hero(visitor), hero(signedIn));
  assert.match(visitor, /取经护法/);
  assert.match(visitor, /玩法与角色/);
  assert.match(visitor, /加入房间/);
  assert.doesNotMatch(visitor, /<form|<input|请留取经尊号|仙友码/);
  assert.match(signedIn, /个人中心/);
});

test('the public promotion follows system configuration and invitation context has a visible entry', () => {
  const html = renderToStaticMarkup(createElement(LobbyHome, {
    ...props, user: null, freeAccess: false, hasInvitation: true,
  }));
  assert.doesNotMatch(html, /限时免费/);
  assert.match(html, /加入邀请房间/);
  assert.match(html, /已收到朋友邀请/);
});

test('identity prompt explains the pending action, retains account recovery, and never prints the invitation token', () => {
  const html = renderToStaticMarkup(createElement(EntryDialog, {
    intent: { type: 'join', inviteKey: 'private-invite-token' },
    knownAccounts: [{ id: 'old', nickname: '旧仙友', playerCode: '123456', lastSeen: 0 }],
    onClose: noop, onAuthenticated: noop,
  }));
  assert.match(html, /使用此昵称加入房间/);
  assert.match(html, /已有仙友码/);
  assert.match(html, /旧仙友/);
  assert.doesNotMatch(html, /private-invite-token/);
  assert.doesNotMatch(html, /id="entry-room"/);
  assert.match(html, /邀请已带好房间信息/);
});

test('first-time number joins put the room field before the separate player nickname',()=>{
  const html=renderToStaticMarkup(createElement(EntryDialog,{
    intent:{type:'join'},knownAccounts:[],onClose:noop,onAuthenticated:noop,
  }));
  assert.ok(html.indexOf('id="entry-room"')<html.indexOf('id="entry-identity"'));
  assert.match(html,/房间号（朋友发给你的号码）/);
  assert.match(html,/玩家昵称（大家怎么称呼你）/);
  assert.match(html,/小陈、阿辉/);
  assert.doesNotMatch(html,/尊号|请留取经尊号/);
});
