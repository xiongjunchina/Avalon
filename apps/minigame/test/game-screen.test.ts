import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, type GamePhase, type RoomView, type User } from '@avalon/contracts';
import { gameScreen, gameAction, syncGameUi } from '../src/screens/game.js';

const self = { id: '11111111-1111-4111-8111-111111111111', nickname: '我', seat: 1 };
const other = { id: '22222222-2222-4222-8222-222222222222', nickname: '他', seat: 2 };
const phases: GamePhase[] = ['dealing','role_reveal','proposing','discussion','team_vote','mission','guanyin_window','early_window','assassination','finished','aborted'];
const room = (phase: GamePhase) => ({ id: '33333333-3333-4333-8333-333333333333', version: 4, hostId: self.id, code: '123456', phase: 'playing', settings: { ...defaultSettings, playerCount: 5 }, members: [], acceptingNewMembers: true,
  game: { id: '44444444-4444-4444-8444-444444444444', rulesetVersion: 'test', phase, players: [self, other], captainId: self.id, captainOrder: [self.id, other.id], mission: 1, missionSizes: [2,3,2,3,3], failuresRequired: 1, rejectionCount: 0, rounds: [{ number: 1, mission: 1, captainId: self.id, team: [self.id, other.id], direction: 'clockwise' }], progress: { confirmed: 0, teamVotes: 0, missionVotes: 0 },
    self: { role: 'merlin', team: 'blue', evilIds: [other.id], merlinCandidates: [], confirmed: false, teamVoted: false, missionVoted: false, canDecideEarly: false } } }) as RoomView;

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

test('game shows submitted state and only server-projected public ballots', () => {
  const r = room('team_vote');
  r.game!.self!.teamVoted = true;
  r.game!.teamVote = { votedIds: [self.id], ballots: { [self.id]: 'abstain' } };
  let screen = gameScreen(r, self, { privateRoleVisible: false, ballotVisible: false });
  assert.ok(screen.rows.some(row => row.text.includes('已提交组队投票')));
  assert.ok(screen.rows.some(row => row.id.startsWith('ballot:') && row.text.includes('弃权')));
  r.game!.teamVote.ballots = undefined;
  screen = gameScreen(r, self, { privateRoleVisible: false, ballotVisible: false });
  assert.ok(!screen.rows.some(row => row.id.startsWith('ballot:')));
});

test('unlocked early assassination works during proposing and stays inside the private identity view', () => {
  const r = room('proposing');
  r.game!.self!.role = 'assassin';
  r.game!.self!.canDecideEarly = true;
  const hidden = { privateRoleVisible: false, ballotVisible: false };
  assert.ok(!gameScreen(r, self, hidden).rows.some(row => row.id === 'earlyAttempt'));
  const shown = { privateRoleVisible: true, ballotVisible: false };
  assert.ok(gameScreen(r, self, shown).rows.some(row => row.id === 'earlyAttempt'));
  assert.equal(gameAction(r, self, 'earlyAttempt', shown)?.type, 'earlyAssassinationDecision');
  assert.equal(gameAction(r, self, 'earlyAttempt', hidden), undefined);
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

test('game screen shows public progress and private clues only after reveal', () => {
  const current = room('mission');
  current.game!.rejectionCount = 2;
  current.game!.rounds[0]!.result = { successes: 1, failures: 1, passed: false };
  const hidden = JSON.stringify(gameScreen(current, self as User, { privateRoleVisible: false, ballotVisible: false }));
  assert.match(hidden, /流局 2\/5/);
  assert.match(hidden, /第1轮任务失败/);
  const revealed = JSON.stringify(gameScreen(current, self as User, { privateRoleVisible: true, ballotVisible: false }));
  assert.match(revealed, /已知妖魔.*2号/);
});

test('game UI adopts server draft and clears selections when round or game changes', () => {
  const first = room('proposing');
  first.game!.draftTeam = { playerIds: [self.id, other.id], direction: 'counterclockwise' };
  const ui = { privateRoleVisible: true, ballotVisible: false, selectedIds: [] as string[], direction: 'clockwise' as const, targetId: other.id };
  syncGameUi(ui, first);
  assert.deepEqual(ui.selectedIds, [self.id, other.id]);
  assert.equal(ui.direction, 'counterclockwise');
  const next = room('proposing');
  next.game!.mission = 2;
  next.game!.draftTeam = { playerIds: [], direction: 'clockwise' };
  syncGameUi(ui, next);
  assert.deepEqual(ui.selectedIds, []);
  assert.equal(ui.targetId, undefined);
  assert.equal(ui.privateRoleVisible, false);
});

test('game screen shows team, voting progress and end-of-game role reveal', () => {
  const voting = room('team_vote');
  voting.game!.progress.teamVotes = 1;
  voting.game!.teamVote = { votedIds: [other.id] };
  const voteText = JSON.stringify(gameScreen(voting, self as User, { privateRoleVisible: false, ballotVisible: false }));
  assert.match(voteText, /出征队伍.*1号.*2号/);
  assert.match(voteText, /组队表决 1\/2/);
  const finished = room('finished');
  finished.game!.revealedRoles = { [self.id]: 'merlin', [other.id]: 'assassin' };
  const endText = JSON.stringify(gameScreen(finished, self as User, { privateRoleVisible: false, ballotVisible: false }));
  assert.match(endText, /2号.*红孩儿/);
});

test('only the host sees the rematch action after a game ends', () => {
  const finished = room('finished');
  assert.ok(gameScreen(finished, self as User, { privateRoleVisible: false, ballotVisible: false }).rows.some(row => row.id === 'rematch'));
  assert.ok(!gameScreen(finished, other as User, { privateRoleVisible: false, ballotVisible: false }).rows.some(row => row.id === 'rematch'));
});

test('auto reveal opens identity once for a new game and manual hiding persists', () => {
  const next = room('role_reveal');
  next.settings.autoRevealRoleEnabled = true;
  const ui = { privateRoleVisible: false, ballotVisible: false };
  syncGameUi(ui, next);
  assert.equal(ui.privateRoleVisible, true);
  ui.privateRoleVisible = false;
  syncGameUi(ui, next);
  assert.equal(ui.privateRoleVisible, false);
  const background = { privateRoleVisible: false, ballotVisible: false };
  syncGameUi(background, next, false);
  assert.equal(background.privateRoleVisible, false);
});

test('9-player treasure actions use private availability and valid targets', () => {
  const next = room('proposing');
  next.settings.playerCount = 9;
  next.settings.treasuresEnabled = true;
  next.game!.players = [self, other, ...Array.from({ length: 7 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`, seat: index + 3, nickname: `仙友${index + 3}` }))] as any;
  const target = next.game!.players[2]!.id;
  const selfView = next.game!.self!;
  selfView.role = 'percival';
  selfView.merlinCandidates = [other.id];
  selfView.treasures = { enabled: true, tinStaff: { used: false, available: true } };
  const ui = { privateRoleVisible: true, ballotVisible: false, targetId: target };
  assert.ok(gameScreen(next, self as User, ui).rows.some(row => row.id === 'treasure:tinStaff'));
  assert.deepEqual(gameAction(next, self as User, 'treasure:tinStaff', ui)?.payload, { action: 'tinStaff', targetId: target });
  assert.equal(gameAction(next, self as User, 'treasure:tinStaff', { ...ui, targetId: other.id }), undefined);
  selfView.treasures.tinStaff = { used: true, available: false, result: { targetId: target, team: 'red' } };
  assert.ok(!JSON.stringify(gameScreen(next, self as User, { ...ui, privateRoleVisible: false })).includes('锡杖查验'));
  assert.ok(JSON.stringify(gameScreen(next, self as User, ui)).includes('锡杖查验'));
});

test('8-player treasure actions use private availability and valid targets', () => {
  const next = room('proposing');
  next.settings.playerCount = 8;
  next.settings.treasuresEnabled = true;
  next.game!.players = [self, other, ...Array.from({ length: 6 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`, seat: index + 3, nickname: `仙友${index + 3}` }))] as any;
  const target = next.game!.players[2]!.id;
  const selfView = next.game!.self!;
  selfView.role = 'percival';
  selfView.merlinCandidates = [other.id];
  selfView.treasures = { enabled: true, tinStaff: { used: false, available: true } };
  const ui = { privateRoleVisible: true, ballotVisible: false, targetId: target };
  assert.ok(gameScreen(next, self as User, ui).rows.some(row => row.id === 'treasure:tinStaff'));
  assert.deepEqual(gameAction(next, self as User, 'treasure:tinStaff', ui)?.payload, { action: 'tinStaff', targetId: target });
  assert.equal(gameAction(next, self as User, 'treasure:tinStaff', { ...ui, targetId: other.id }), undefined);
  selfView.treasures.tinStaff = { used: true, available: false, result: { targetId: target, team: 'red' } };
  assert.ok(!JSON.stringify(gameScreen(next, self as User, { ...ui, privateRoleVisible: false })).includes('锡杖查验'));
  assert.ok(JSON.stringify(gameScreen(next, self as User, ui)).includes('锡杖查验'));
});

test('all five treasure commands are gated by the private server projection', () => {
  const next = room('proposing');
  next.settings.playerCount = 9;
  next.settings.treasuresEnabled = true;
  next.game!.players = [self, other, ...Array.from({ length: 7 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index + 3).padStart(12, '0')}`, seat: index + 3, nickname: `仙友${index + 3}` }))] as any;
  const ui = { privateRoleVisible: true, ballotVisible: false, targetId: other.id };
  const selfView = next.game!.self!;
  const cases = [
    { role: 'guinevere', key: 'guanyinMirror', state: { used: false, available: true }, phase: 'discussion' },
    { role: 'mordred', key: 'humanBag', state: { used: false, available: true }, phase: 'proposing' },
    { role: 'loyal', key: 'jinguSeal', state: { used: false, available: true }, phase: 'proposing' },
    { role: 'oberon', key: 'bananaFan', state: { used: false, available: true, armed: false }, phase: 'proposing' },
  ] as const;
  for (const item of cases) {
    selfView.role = item.role;
    selfView.treasures = { enabled: true, [item.key]: item.state };
    next.game!.phase = item.phase;
    assert.ok(gameScreen(next, self as User, ui).rows.some(row => row.id === `treasure:${item.key}`), item.key);
    assert.equal(gameAction(next, self as User, `treasure:${item.key}`, ui)?.type, 'useTreasure', item.key);
  }
});

test('dealing screen shows server deadline countdown and public treasure effects', () => {
  const dealing = room('dealing');
  dealing.game!.dealEndsAt = '2026-01-01T00:00:05.000Z';
  const dealingText = JSON.stringify(gameScreen(dealing, self as User, { privateRoleVisible: false, ballotVisible: false }, Date.parse('2026-01-01T00:00:02.000Z')));
  assert.match(dealingText, /还需3秒/);
  const active = room('proposing');
  active.game!.humanBagBannedPlayerId = other.id;
  active.game!.bananaFanNotice = '芭蕉扇已生效';
  const activeText = JSON.stringify(gameScreen(active, self as User, { privateRoleVisible: false, ballotVisible: false }));
  assert.match(activeText, /本轮人种袋禁选.*2号/);
  assert.match(activeText, /芭蕉扇已生效/);
});
test('discussion restores submitted team after phase change and reconnect',()=>{
 const r=room('discussion');r.game!.rounds[0].direction='counterclockwise';
 const ui:import('../src/screens/game.js').GameUiState={privateRoleVisible:false,ballotVisible:false};
 syncGameUi(ui,room('proposing'));syncGameUi(ui,r);
 assert.deepEqual(ui.selectedIds,[self.id,other.id]);assert.equal(ui.direction,'counterclockwise');
 const fresh:import('../src/screens/game.js').GameUiState={privateRoleVisible:false,ballotVisible:false};syncGameUi(fresh,r);
 assert.deepEqual(fresh.selectedIds,[self.id,other.id]);
 r.game!.draftTeam={playerIds:[other.id],direction:'clockwise'};syncGameUi(fresh,r);assert.deepEqual(fresh.selectedIds,[other.id]);
});
