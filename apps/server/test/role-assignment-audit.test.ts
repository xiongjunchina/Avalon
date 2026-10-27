import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createGame, finish, type GameState } from '@avalon/game-core';
import type { Role, RoleAssignmentAudit } from '@avalon/contracts';
import { gameFixture } from './game-helpers.js';
import { headers } from './helpers.js';

async function seedRoles(f: Awaited<ReturnType<typeof gameFixture>>, rolesNewestFirst: Role[]) {
  const players = f.people.map((person, index) => ({ id: person.user.id, nickname: person.user.nickname, seat: index + 1 }));
  const settings = (await f.state()).settings;
  for (const [index, role] of rolesNewestFirst.entries()) {
    const game = createGame(randomUUID(), players, settings, values => values);
    const targetId = players[0].id, other = players.find(player => game.roles[player.id] === role)!;
    [game.roles[targetId], game.roles[other.id]] = [game.roles[other.id], game.roles[targetId]];
    delete game.roleAssignmentAudit; // Historical data predating assignment audits remains a valid history input.
    finish(game, { winner: null, reason: 'unanimous_abort' });
    await f.pool.query('INSERT INTO games(id,room_id,ruleset_version,state,created_at,ended_at) VALUES($1,$2,$3,$4,$5,$6)', [
      game.id, f.room.id, game.rulesetVersion, game, new Date(f.now() - (index + 1) * 1000),
      // Deliberately reverse finish order to distinguish creation history from completion order.
      new Date(f.now() - (rolesNewestFirst.length - index) * 100),
    ]);
    await f.pool.query('INSERT INTO game_participants(game_id,user_id) SELECT $1,unnest($2::uuid[])', [game.id, players.map(player => player.id)]);
  }
}

async function savedGame(f: Awaited<ReturnType<typeof gameFixture>>): Promise<GameState> {
  return (await f.pool.query<{ state: GameState }>('SELECT state FROM games WHERE id=(SELECT current_game_id FROM rooms WHERE id=$1)', [f.room.id])).rows[0].state;
}

test('dealing uses the latest five created roles, preserving two-loyal protection and stored preference evidence', async t => {
  const f = await gameFixture(t, false, { rolePreferenceEnabled: true });
  const target = f.people[0].user.id;
  await seedRoles(f, ['loyal', 'loyal', 'assassin', 'morgana', 'merlin', 'percival']);
  await f.command(target, 'setRolePreferences', { preferences: ['assassin', 'merlin', 'loyal'] });
  await f.command(target, 'startGame');
  const game = await savedGame(f), audit = game.roleAssignmentAudit!;
  assert.ok(audit, 'newly dealt games must persist their exact audit with the state');
  assert.deepEqual(audit.players[target].recentRoles, ['loyal', 'loyal', 'assassin', 'morgana', 'merlin']);
  assert.deepEqual(audit.players[target].preferences, ['assassin', 'merlin', 'loyal']);
  assert.equal(audit.players[target].protections.visionGuaranteed, true);
  assert.equal(audit.players[target].protections.bossCooldown, false);
  assert.equal(audit.players[target].assignedRole, game.roles[target]);
  assert.equal(typeof audit.algorithmVersion, 'string'); assert.equal(typeof audit.weightVersion, 'string');
  assert.deepEqual(new Set(audit.roleOrder), new Set(Object.values(game.roles)), 'JSONB must retain the explicit ticket interval order');
  assert.ok(audit.draws.length > 0);
  for (const draw of audit.draws) {
    assert.equal(typeof draw.totalWeight, 'string'); assert.equal(typeof draw.ticket, 'string');
    assert.ok(BigInt(draw.ticket) >= 0n && BigInt(draw.ticket) < BigInt(draw.totalWeight));
  }
  const persisted = JSON.parse(JSON.stringify(game)).roleAssignmentAudit as RoleAssignmentAudit;
  assert.deepEqual(persisted, audit);
});

test('turning role preference off ignores saved wishes while preserving recent-role and previous-boss evidence', async t => {
  const f = await gameFixture(t, false, { rolePreferenceEnabled: false });
  const target = f.people[0].user.id;
  await seedRoles(f, ['merlin', 'assassin', 'loyal', 'percival', 'morgana', 'loyal']);
  await f.command(target, 'setRolePreferences', { preferences: ['assassin', 'morgana', 'loyal'] });
  await f.command(target, 'startGame');
  const audit = (await savedGame(f)).roleAssignmentAudit!;
  assert.deepEqual(audit.players[target].preferences, []);
  assert.deepEqual(audit.players[target].recentRoles, ['merlin', 'assassin', 'loyal', 'percival', 'morgana']);
  assert.equal(audit.players[target].protections.bossCooldown, true);
  assert.equal(audit.players[target].protections.visionGuaranteed, false);
});

test('assignment audits stay out of player snapshots and replays and appear only in completed admin replays', async t => {
  const f = await gameFixture(t, true, { rolePreferenceEnabled: true });
  const game = await savedGame(f), audit = game.roleAssignmentAudit!;
  assert.ok(audit);
  const adminHeaders = { ...headers, 'x-admin-key': process.env.ADMIN_KEY! };
  const replayUrl = `/api/admin/games/${game.id}/replay`;
  assert.equal((await f.app.inject({ url: replayUrl })).statusCode, 401);
  for (const person of f.people) {
    const snapshot = await f.state(person.user.id);
    assert.equal('roleAssignmentAudit' in snapshot, false);
    assert.equal('roleAssignmentAudit' in snapshot.game!, false);
    const response = await f.app.inject({ url: `/api/rooms/${f.room.id}`, headers: { cookie: `avalon_session=${person.token}` } });
    assert.equal(response.statusCode, 200); assert.ok(!response.body.includes('roleAssignmentAudit'));
  }
  const live = await f.app.inject({ url: replayUrl, headers: adminHeaders });
  assert.equal(live.statusCode, 200); assert.equal(live.json().roleAssignmentAudit, undefined);
  await f.pool.query('UPDATE games SET ended_at=$2 WHERE id=$1', [game.id, new Date(f.now())]);
  const inconsistentLive = await f.app.inject({ url: replayUrl, headers: adminHeaders });
  assert.equal(inconsistentLive.json().roleAssignmentAudit, undefined, 'ended_at alone must not expose a live-phase audit');
  await f.pool.query('UPDATE games SET ended_at=NULL WHERE id=$1', [game.id]);
  await f.command(f.people[0].user.id, 'endGame');
  const completed = await f.app.inject({ url: replayUrl, headers: adminHeaders });
  assert.equal(completed.statusCode, 200); assert.deepEqual(completed.json().roleAssignmentAudit, audit);
  for (const person of f.people) {
    const response = await f.app.inject({ url: `/api/games/${game.id}/replay`, headers: { cookie: `avalon_session=${person.token}` } });
    assert.equal(response.statusCode, 200); assert.equal(response.json().roleAssignmentAudit, undefined);
    assert.ok(!response.body.includes('roleAssignmentAudit'));
    const history = await f.app.inject({ url: '/api/me/games', headers: { cookie: `avalon_session=${person.token}` } });
    assert.equal(history.statusCode, 200); assert.ok(!history.body.includes('roleAssignmentAudit'));
  }
  await f.pool.query('UPDATE games SET ended_at=NULL WHERE id=$1', [game.id]);
  const unfinishedRecord = await f.app.inject({ url: replayUrl, headers: adminHeaders });
  assert.equal(unfinishedRecord.json().roleAssignmentAudit, undefined, 'terminal phase alone must not expose an audit without ended_at');
  await f.pool.query('UPDATE games SET ended_at=$2 WHERE id=$1', [game.id, new Date(f.now())]);
  await f.pool.query("UPDATE games SET state=state-'roleAssignmentAudit' WHERE id=$1", [game.id]);
  const legacy = await f.app.inject({ url: replayUrl, headers: adminHeaders });
  assert.equal(legacy.statusCode, 200); assert.equal(legacy.json().roleAssignmentAudit, undefined);
});
