import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameFixture } from './game-helpers.js';

test('role preference: setting preferences stores to db, enforces privacy, and marks hasRolePreference', async t => {
  const f = await gameFixture(t, false, { rolePreferenceEnabled: true });
  const host = f.people[0];
  const player2 = f.people[1];

  // host sets role preferences
  await f.command(host.user.id, 'setRolePreferences', { preferences: ['merlin', 'percival'] });

  // player2 views room state
  const player2View = await f.state(player2.user.id);
  // player2 does NOT see host's private preferences
  assert.equal(player2View.selfRolePreferences?.length ?? 0, 0);

  // player2 DOES see that host has set their preference
  const hostMember = player2View.members.find(m => m.id === host.user.id);
  assert.equal(hostMember?.hasRolePreference, true);

  // player2 himself has not set preference
  const player2Member = player2View.members.find(m => m.id === player2.user.id);
  assert.equal(player2Member?.hasRolePreference, undefined);

  // host views own room state
  const hostView = await f.state(host.user.id);
  // host DOES see own preferences
  assert.deepEqual(hostView.selfRolePreferences, ['merlin', 'percival']);

  // player2 sets preferences
  await f.command(player2.user.id, 'setRolePreferences', { preferences: ['morgana', 'assassin'] });
  const hostViewAfter = await f.state(host.user.id);
  // host cannot see player2's preferences
  assert.deepEqual(hostViewAfter.selfRolePreferences, ['merlin', 'percival']);
  // but sees that player2 has set preference
  const p2MemberSeenByHost = hostViewAfter.members.find(m => m.id === player2.user.id);
  assert.equal(p2MemberSeenByHost?.hasRolePreference, true);

  // Start game and finish deal
  await f.command(host.user.id, 'startGame');
  await f.finishDeal();

  const gameViewHost = await f.state(host.user.id);
  assert.equal(gameViewHost.game?.phase, 'role_reveal');
  // Roles assigned
  assert.ok(gameViewHost.game?.self?.role);
});
