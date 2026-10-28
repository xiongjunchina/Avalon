import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Role, ServerMessage } from '@avalon/contracts';
import type { GameState } from '@avalon/game-core';
import { gameFixture, confirm } from './game-helpers.js';
import { localSocket, origin } from './helpers.js';

test('new guardian-mode games enforce blue treasure restrictions through persisted state and WebSocket commands', async t => {
  const f = await gameFixture(t, true, { playerCount: 12, guardianPerksEnabled: true, treasuresEnabled: true });
  const byRole = new Map<Role, typeof f.people[number]>();
  for (const person of f.people) {
    const response = await f.app.inject({ url: `/api/rooms/${f.room.id}`, headers: { cookie: `avalon_session=${person.token}` } });
    assert.equal(response.statusCode, 200);
    const self = response.json().room.game.self;
    byRole.set(self.role, person);
    assert.equal(response.json().room.game.rulesetVersion, 'standard-no-lancelot-v6');
    if (self.team === 'blue') assert.deepEqual(self.treasures, { enabled: false, disabledReason: 'guardian_perks' });
    else { assert.equal(self.treasures.enabled, true); assert.equal(self.treasures.disabledReason, undefined); }
    if (self.role === 'loyal') assert.ok(self.guardianClue);
  }
  const percival = byRole.get('percival')!, demon = byRole.get('minion')!, assassin = byRole.get('assassin')!;
  const messages: ServerMessage[] = [];
  const socket = await f.app.injectWS(`/api/rooms/${f.room.id}/socket`, {
    socket: localSocket(), headers: { origin, cookie: `avalon_session=${percival.token}` },
  }, { onInit: ws => ws.on('message', raw => messages.push(JSON.parse(raw.toString()))) });
  t.after(() => { socket.terminate(); });
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 250; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.fail('missing room or command response');
  };
  await until(() => messages.some(message => message.type === 'snapshot'));
  const before = await f.state(percival.user.id), commandId = randomUUID();
  const saved = (await f.pool.query('SELECT state FROM games WHERE id=$1', [before.game!.id])).rows[0].state;
  socket.send(JSON.stringify({ type: 'useTreasure', payload: { action: 'tinStaff', targetId: assassin.user.id }, commandId, expectedVersion: before.version }));
  await until(() => messages.some(message => message.type === 'commandResult' && message.commandId === commandId));
  assert.deepEqual(messages.find(message => message.type === 'commandResult' && message.commandId === commandId), {
    type: 'commandResult', commandId, ok: false, error: 'BLUE_TREASURES_DISABLED',
  });
  assert.equal((await f.state()).version, before.version);
  assert.deepEqual((await f.pool.query('SELECT state FROM games WHERE id=$1', [before.game!.id])).rows[0].state, saved);

  await confirm(f);
  const captainId = (await f.state()).game!.captainId;
  await f.command(captainId, 'proposeTeam', { playerIds: [demon.user.id, assassin.user.id, percival.user.id], direction: 'clockwise' });
  await f.command(captainId, 'startTeamVote');
  for (const person of f.people) await f.command(person.user.id, 'teamVote', { approve: true });
  const mission = (await f.state()).game!;
  assert.equal(mission.phase, 'mission');
  assert.equal(mission.guanyinEndsAt, undefined);
  assert.deepEqual(await f.store.pendingDeals(), []);
  await f.command(demon.user.id, 'useTreasure', { action: 'heartBell', targetId: assassin.user.id, advice: 'protect' });
  assert.equal((await f.state(assassin.user.id)).game!.self!.treasures!.incomingHeartBell?.advice, 'protect');
  assert.deepEqual((await f.state(percival.user.id)).game!.self!.treasures, { enabled: false, disabledReason: 'guardian_perks' });
});

test('restart preserves v5 private treasure results instead of applying the new policy to an existing game', async t => {
  const f = await gameFixture(t, true, { playerCount: 9, guardianPerksEnabled: true, treasuresEnabled: true });
  const id = (await f.state()).game!.id;
  const game: GameState = (await f.pool.query('SELECT state FROM games WHERE id=$1', [id])).rows[0].state;
  const percival = game.players.find(player => game.roles[player.id] === 'percival')!;
  const assassin = game.players.find(player => game.roles[player.id] === 'assassin')!;
  const loyal = game.players.find(player => game.roles[player.id] === 'loyal')!;
  game.rulesetVersion = 'standard-no-lancelot-v5';
  game.treasuresState = { tinStaff: { used: true, result: { targetId: assassin.id, team: 'red' } }, jinguSeal: { used: true, activatedBy: loyal.id } };
  await f.pool.query('UPDATE games SET ruleset_version=$2,state=$3 WHERE id=$1', [id, game.rulesetVersion, game]);
  await f.restart();
  const restored = (await f.state(percival.id)).game!;
  assert.equal(restored.rulesetVersion, 'standard-no-lancelot-v5');
  assert.equal(restored.self!.treasures!.enabled, true);
  assert.equal(restored.self!.treasures!.disabledReason, undefined);
  assert.equal(restored.self!.treasures!.tinStaff?.result?.targetId, assassin.id);
  assert.equal(restored.self!.treasures!.jinguAllyId, loyal.id);
  assert.deepEqual((await f.pool.query('SELECT state FROM games WHERE id=$1', [id])).rows[0].state, game);
});
