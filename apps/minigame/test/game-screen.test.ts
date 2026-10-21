import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type GamePhase, type RoomView, type User } from '@avalon/contracts';
import { gameScreen, gameAction } from '../src/screens/game.js';

const self = { id: '11111111-1111-4111-8111-111111111111', nickname: '我', seat: 1 };
const other = { id: '22222222-2222-4222-8222-222222222222', nickname: '他', seat: 2 };
const phases: GamePhase[] = ['dealing','role_reveal','proposing','discussion','team_vote','mission','lady','lady_reveal','early_window','assassination','finished','aborted'];
const room = (phase: GamePhase) => ({ id: '33333333-3333-4333-8333-333333333333', version: 4, hostId: self.id, code: '123456', phase: 'playing', settings: { ...defaultSettings, playerCount: 5 }, members: [], acceptingNewMembers: true,
  game: { id: '44444444-4444-4444-8444-444444444444', rulesetVersion: 'test', phase, players: [self, other], captainId: self.id, captainOrder: [self.id, other.id], mission: 1, missionSizes: [2,3,2,3,3], failuresRequired: 1, rejectionCount: 0, rounds: [{ number: 1, mission: 1, captainId: self.id, team: [self.id, other.id], direction: 'clockwise' }], progress: { confirmed: 0, teamVotes: 0, missionVotes: 0 },
    self: { role: 'merlin', team: 'blue', evilIds: [other.id], merlinCandidates: [], confirmed: false, teamVoted: false, missionVoted: false, inspections: [], canInspect: false, canConfirmInspection: false, canDecideEarly: false } } }) as RoomView;

test('every server game phase renders without exposing private role by default', () => {
  for (const phase of phases) {
    const view = gameScreen(room(phase), self as User, { privateRoleVisible: false, ballotVisible: false });
    assert.ok(view.rows.length > 0, phase);
    assert.doesNotMatch(JSON.stringify(view), /梅林|merlin|evilIds/);
  }
  const visible = gameScreen(room('role_reveal'), self as User, { privateRoleVisible: true, ballotVisible: false });
  assert.match(JSON.stringify(visible), /孙悟空/);
});

test('game actions use typed versioned commands and reject unauthorized actions', () => {
  const r = room('team_vote');
  const approve = gameAction(r, self as User, 'approve');
  assert.equal(approve?.type, 'teamVote');
  assert.equal(approve?.expectedVersion, 4);
  assert.equal(gameAction(r, self as User, 'missionSuccess'), undefined);
  assert.equal(gameAction(room('mission'), self as User, 'missionSuccess')?.type, 'missionVote');
  assert.equal(gameAction(room('role_reveal'), self as User, 'confirmRole')?.type, 'confirmRole');
});

test('captain can update a partial draft and host can resolve an abort request', () => {
  const proposing = room('proposing');
  assert.equal(gameAction(proposing, self as User, 'draft', { selectedIds: [self.id] })?.type, 'updateTeamDraft');
  const discussion = room('discussion');
  assert.equal(gameAction(discussion, self as User, 'draft', { selectedIds: [self.id, other.id] })?.type, 'updateTeamDraft');
  const pending = room('team_vote');
  pending.game!.abortPoll = { requestedBy: other.id, approvals: 0, required: 1, voted: false };
  assert.equal(gameAction(pending, self as User, 'approveAbort')?.type, 'voteAbort');
  assert.equal(gameAction(pending, self as User, 'rejectAbort')?.type, 'voteAbort');
  assert.equal(gameAction(pending, other as User, 'approveAbort'), undefined);
  assert.equal(gameAction(room('mission'), self as User, 'endGame')?.type, 'endGame');
  assert.equal(gameAction(room('mission'), other as User, 'endGame'), undefined);
});
