import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { IdentityDetails } from '../src/IdentityDetails';
import { roleNames } from '../src/roles';

test('compact identity keeps exactly the permitted vision and uses neutral player portraits', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `朋友${i + 1}末` }));
  const game = createGame('identity-ui', players, { ...defaultSettings, playerCount: 12 }, a => a);
  const seen = new Set();
  for (const player of players) {
    const self = projectGame(game, player.id).self!;
    seen.add(self.role);
    const html = renderToStaticMarkup(createElement(IdentityDetails, { self, players }));
    const visible = [...self.merlinCandidates, ...(self.guinevereCandidates ?? []), ...self.evilIds];
    assert.ok(html.includes(roleNames[self.role]));
    assert.equal((html.match(/class="role-portrait /g) ?? []).length, 1);
    assert.equal((html.match(/class="player-token /g) ?? []).length, visible.length);
    for (const other of players) assert.equal(html.includes(other.nickname), visible.includes(other.id), `${self.role} sees ${other.id}`);
    for (const role of new Set(Object.values(game.roles))) {
      if (role !== self.role) assert.ok(!html.includes(`/art/roles/${role}-`), `${self.role} must not load ${role}'s art`);
    }
  }
  assert.equal(seen.size, 9);
  const loyalGuardians = new Set(players.map(p => projectGame(game, p.id).self!).filter(s => s.role === 'loyal').map(s => s.loyalGuardian));
  assert.deepEqual([...loyalGuardians].sort(), ['bailong', 'jingang', 'shawujing', 'zhubajie']);
});

test('Merlin identity only mentions Mordred when this game configuration includes him',()=>{
  for (const count of [7,8,9,12]) {
    const players=Array.from({length:count},(_,i)=>({id:`p${i}`,seat:i+1,nickname:`同伴${i}`}));
    const game=createGame('vision',players,{...defaultSettings,playerCount:count},a=>a,{randomBelow:()=>0n});
    const html=renderToStaticMarkup(createElement(IdentityDetails,{self:projectGame(game,'p0').self!,players}));
    assert.equal(html.includes('本局含黄眉老怪'),count>=8);
    if(count<8)assert.match(html,/本局全部群妖成员/);
  }
});

test('IdentityDetails renders guardian perk clue for loyal players when guardianPerksEnabled is true', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const game = createGame('perk-ui', players, { ...defaultSettings, playerCount: 12, guardianPerksEnabled: true }, a => a);
  const loyalPlayers = players.filter(p => game.roles[p.id] === 'loyal');
  assert.ok(loyalPlayers.length > 0);

  for (const p of loyalPlayers) {
    const self = projectGame(game, p.id).self!;
    assert.ok(self.guardianClue);
    const html = renderToStaticMarkup(createElement(IdentityDetails, { self, players }));
    assert.ok(html.includes(self.guardianClue.title));
    assert.ok(html.includes(self.guardianClue.description));
    for (const tid of self.guardianClue.targetIds) {
      const targetPlayer = players.find(x => x.id === tid)!;
      assert.ok(html.includes(targetPlayer.nickname));
    }
  }
});

test('IdentityDetails treasure button is locked for non-assassins when treasures disabled, but available for assassin', () => {
  const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const game = createGame('treasure-test-6', players, { ...defaultSettings, playerCount: 6, treasuresEnabled: false }, a => a);

  // Loyal player
  const loyalP = players.find(p => game.roles[p.id] === 'loyal')!;
  const loyalSelf = projectGame(game, loyalP.id).self!;
  const loyalHtml = renderToStaticMarkup(createElement(IdentityDetails, {
    self: loyalSelf,
    players,
    game: projectGame(game, loyalP.id),
    treasuresEnabled: false,
  }));
  assert.ok(loyalHtml.includes('is-locked'));
  assert.ok(loyalHtml.includes('未开启法宝模式'));

  // Assassin player
  const assassinP = players.find(p => game.roles[p.id] === 'assassin')!;
  const assassinSelf = projectGame(game, assassinP.id).self!;
  const assassinHtml = renderToStaticMarkup(createElement(IdentityDetails, {
    self: assassinSelf,
    players,
    game: projectGame(game, assassinP.id),
    treasuresEnabled: false,
  }));
  assert.ok(assassinHtml.includes('is-enabled'));
  assert.ok(assassinHtml.includes('火尖枪'));
});

test('IdentityDetails treasure button shows role-specific status when treasures enabled in 10-player game', () => {
  const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const game = createGame('treasure-test-10', players, { ...defaultSettings, playerCount: 10, treasuresEnabled: true }, a => a);

  // Percival
  const percivalP = players.find(p => game.roles[p.id] === 'percival')!;
  const percivalSelf = projectGame(game, percivalP.id).self!;
  const percivalHtml = renderToStaticMarkup(createElement(IdentityDetails, {
    self: percivalSelf,
    players,
    game: projectGame(game, percivalP.id),
    treasuresEnabled: true,
  }));
  assert.ok(percivalHtml.includes('is-enabled'));
  assert.ok(percivalHtml.includes('九环锡杖'));

  // Oberon
  const oberonP = players.find(p => game.roles[p.id] === 'oberon')!;
  const oberonSelf = projectGame(game, oberonP.id).self!;
  const oberonHtml = renderToStaticMarkup(createElement(IdentityDetails, {
    self: oberonSelf,
    players,
    game: projectGame(game, oberonP.id),
    treasuresEnabled: true,
  }));
  assert.ok(oberonHtml.includes('is-enabled'));
  assert.ok(oberonHtml.includes('芭蕉神扇'));
});

test('IdentityDetails treasure button supports 8-player game with treasuresEnabled', () => {
  const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  const gameEnabled = createGame('treasure-test-8-on', players, { ...defaultSettings, playerCount: 8, treasuresEnabled: true }, a => a);

  // Percival with treasures enabled in 8-player game
  const percivalP = players.find(p => gameEnabled.roles[p.id] === 'percival')!;
  const percivalSelf = projectGame(gameEnabled, percivalP.id).self!;
  const percivalHtml = renderToStaticMarkup(createElement(IdentityDetails, {
    self: percivalSelf,
    players,
    game: projectGame(gameEnabled, percivalP.id),
    treasuresEnabled: true,
  }));
  assert.ok(percivalHtml.includes('is-enabled'));
  assert.ok(percivalHtml.includes('九环锡杖'));

  // Loyal with treasures enabled in 8-player game
  const loyalP = players.find(p => gameEnabled.roles[p.id] === 'loyal')!;
  const loyalSelf = projectGame(gameEnabled, loyalP.id).self!;
  const loyalHtml = renderToStaticMarkup(createElement(IdentityDetails, {
    self: loyalSelf,
    players,
    game: projectGame(gameEnabled, loyalP.id),
    treasuresEnabled: true,
  }));
  assert.ok(loyalHtml.includes('is-enabled'));
  assert.ok(loyalHtml.includes('紧箍信物'));

  // Loyal with treasures disabled in 8-player game
  const gameDisabled = createGame('treasure-test-8-off', players, { ...defaultSettings, playerCount: 8, treasuresEnabled: false }, a => a);
  const loyalDisabledP = players.find(p => gameDisabled.roles[p.id] === 'loyal')!;
  const loyalDisabledSelf = projectGame(gameDisabled, loyalDisabledP.id).self!;
  const loyalDisabledHtml = renderToStaticMarkup(createElement(IdentityDetails, {
    self: loyalDisabledSelf,
    players,
    game: projectGame(gameDisabled, loyalDisabledP.id),
    treasuresEnabled: false,
  }));
  assert.ok(loyalDisabledHtml.includes('is-locked'));
  assert.ok(loyalDisabledHtml.includes('未开启法宝模式'));
});


