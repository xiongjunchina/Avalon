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
});

test('Merlin identity only mentions Mordred when this game configuration includes him',()=>{
  for (const count of [7,8,9,12]) {
    const players=Array.from({length:count},(_,i)=>({id:`p${i}`,seat:i+1,nickname:`同伴${i}`}));
    const game=createGame('vision',players,{...defaultSettings,playerCount:count},a=>a);
    const html=renderToStaticMarkup(createElement(IdentityDetails,{self:projectGame(game,'p0').self!,players}));
    assert.equal(html.includes('本局含岳不群'),count>=9);
    if(count<9)assert.match(html,/本局全部暗影成员/);
  }
});
