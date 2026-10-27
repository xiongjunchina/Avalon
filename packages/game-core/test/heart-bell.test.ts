import test from 'node:test';
import assert from 'node:assert/strict';
import { commandSchema, defaultSettings, type Command, type HeartBellAdvice, type Role } from '@avalon/contracts';
import { captain, createGame, projectGame, transition, type GameState } from '../src/index';

function fixture(count = 12) {
  const players = Array.from({ length: count }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, seat: i + 1, nickname: `仙友${i + 1}` }));
  let game = createGame('heart-bell-game', players, { ...defaultSettings, playerCount: count, treasuresEnabled: true }, a => a, { randomBelow: () => 0n });
  const id = (role: Role) => players.find(p => game.roles[p.id] === role)!.id;
  const online = players.map(p => p.id);
  const sender = id('minion'), target = id('morgana'), good = id('loyal');
  for (const p of players) game = transition(game, p.id, { type: 'confirmRole', payload: {} }, online);
  game = transition(game, captain(game), { type: 'proposeTeam', payload: { playerIds: [sender, target, good], direction: 'clockwise' } }, online);
  game = transition(game, captain(game), { type: 'startTeamVote', payload: {} }, online);
  for (const p of players) game = transition(game, p.id, { type: 'teamVote', payload: { approve: true } }, online);
  if (game.phase === 'guanyin_window') game = transition(game, id('guinevere'), { type: 'useTreasure', payload: { action: 'guanyinMirror', skip: true } }, online);
  assert.equal(game.phase, 'mission');
  return { game, players, id, sender, target, good, online };
}
const action = (targetId: string, advice: HeartBellAdvice = 'protect'): Pick<Command, 'type' | 'payload'> => ({ type: 'useTreasure', payload: { action: 'heartBell', targetId, advice } });
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

test('11/12 players: bell sends once without delaying the mission, changing cards, or leaking to other seats', () => {
  for (const count of [11, 12]) for (const advice of ['protect', 'sabotage'] as const) {
    const { game, players, sender, target, online } = fixture(count);
    assert.deepEqual(projectGame(game, sender).self?.treasures?.heartBell?.targetIds, [target]);
    const next = transition(game, sender, action(target, advice), online);
    assert.equal(next.phase, game.phase);
    assert.deepEqual(next.missionVotes, game.missionVotes);
    assert.deepEqual(next.rounds, game.rounds);
    assert.deepEqual(json(projectGame(next)), json(projectGame(game)));
    for (const player of players) {
      const view = projectGame(next, player.id);
      if (player.id === target) {
        assert.deepEqual(view.self?.treasures?.incomingHeartBell, { mission: 1, roundNumber: 1, advice, active: true });
        assert.equal(view.self?.treasures?.heartBell, undefined);
      } else if (player.id === sender) {
        assert.equal(view.self?.treasures?.heartBell?.sent?.targetId, target);
        assert.equal(view.self?.treasures?.heartBell?.available, false);
        assert.equal(view.self?.treasures?.incomingHeartBell, undefined);
      } else assert.deepEqual(json(view), json(projectGame(game, player.id)));
    }
    assert.throws(() => transition(next, sender, action(target), online), /ALREADY_USED/);
    assert.equal(game.treasuresState?.heartBell, undefined, 'input state is not mutated');
  }
});

test('all four cosmetic female demons share the bell; recognized allies only, never Oberon', () => {
  const { game, sender, target, id, online } = fixture();
  const demonSkins = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const skinGame = { ...game, id: `skin-${i}` };
    demonSkins.add(projectGame(skinGame, sender).self!.femaleDemon!);
    assert.equal(projectGame(skinGame, sender).self?.treasures?.heartBell?.available, true);
  }
  assert.equal(demonSkins.size, 4);
  for (const role of ['morgana', 'assassin', 'mordred'] as const) {
    const g = structuredClone(game);
    g.rounds.at(-1)!.team[1] = id(role);
    assert.doesNotThrow(() => transition(g, sender, action(id(role)), online));
  }
  const g = structuredClone(game);
  g.rounds.at(-1)!.team[1] = id('oberon');
  assert.deepEqual(projectGame(g, sender).self?.treasures?.heartBell?.targetIds, []);
  for (const invalidTarget of [sender, id('loyal'), id('oberon'), target, 'unknown']) {
    assert.throws(() => transition(g, sender, action(invalidTarget), online), /HEART_BELL_UNAVAILABLE/);
  }
});

test('server rejects unauthorized, wrong phase, mode off, off-team and two-failure-round usage without consuming charge', () => {
  const { game, sender, target, good, id, online } = fixture();
  const reject = (edit: (g: GameState) => void, error: RegExp, actor = sender) => {
    const g = structuredClone(game); edit(g);
    assert.throws(() => transition(g, actor, action(target), online), error);
    assert.equal(g.treasuresState?.heartBell, undefined);
  };
  reject(() => {}, /NOT_MINION/, target);
  reject(g => { g.settings.treasuresEnabled = false; }, /TREASURES_DISABLED/);
  reject(g => { g.players = g.players.slice(0, 6).concat(g.players.find(p => p.id === sender)!); }, /TREASURES_DISABLED/);
  for (const phase of ['role_reveal', 'proposing', 'discussion', 'team_vote', 'guanyin_window', 'assassination'] as const) {
    reject(g => { g.phase = phase; }, /WRONG_PHASE/);
  }
  for (const mission of [3, 4]) {
    reject(g => { g.mission = mission; g.rounds.at(-1)!.mission = mission; }, /HEART_BELL_TWO_FAILURES/);
  }
  reject(g => { g.rounds.at(-1)!.team = [good, target, id('merlin')]; }, /HEART_BELL_UNAVAILABLE/);
  const retry = transition(game, sender, action(target), online);
  assert.equal(retry.treasuresState?.heartBell?.used, true);
});

test('card/send ordering: a card already submitted rejects the bell; a delivered suggestion never forces a card', () => {
  const { game, sender, target, online } = fixture();
  for (const voter of [sender, target]) {
    const voted = transition(game, voter, { type: 'missionVote', payload: { success: true } }, online);
    assert.equal(projectGame(voted, sender).self?.treasures?.heartBell?.available, false);
    assert.throws(() => transition(voted, sender, action(target), online), /HEART_BELL_UNAVAILABLE/);
    assert.equal(voted.treasuresState?.heartBell, undefined);
  }
  let next = transition(game, sender, action(target, 'protect'), online);
  next = transition(next, target, { type: 'missionVote', payload: { success: false } }, online);
  assert.equal(next.missionVotes[target], false, 'recipient can ignore advice');
  assert.equal(projectGame(next, target).self?.treasures?.incomingHeartBell?.active, false);
  for (const pid of game.rounds.at(-1)!.team.filter(id => id !== target)) {
    next = transition(next, pid, { type: 'missionVote', payload: { success: true } }, online);
  }
  assert.deepEqual(next.rounds.at(-1)!.result, { successes: 2, failures: 1, passed: false });
  assert.equal(projectGame(next, target).self?.treasures?.incomingHeartBell?.active, false);
});

test('saved JSON preserves the once-per-game receipt and private history, with no cross-game reuse', () => {
  const { game, sender, target, online } = fixture();
  const saved: GameState = json(transition(game, sender, action(target, 'sabotage'), online));
  assert.equal(projectGame(saved, target).self?.treasures?.incomingHeartBell?.advice, 'sabotage');
  assert.throws(() => transition(saved, sender, action(target), online), /ALREADY_USED/);
  const ended = transition(saved, online[0], { type: 'endGame', payload: {} }, online);
  assert.equal(projectGame(ended, target).self?.treasures?.incomingHeartBell?.active, false);
  assert.equal(projectGame(ended).self, undefined);
  const fresh = fixture().game;
  assert.equal(projectGame(fresh, sender).self?.treasures?.heartBell?.used, false);
  assert.equal(projectGame(fresh, target).self?.treasures?.incomingHeartBell, undefined);
});

test('wire format only accepts the two fixed advice values, never free text or extra identity fields', () => {
  const { game, sender, target, online } = fixture();
  const base = { commandId: '00000000-0000-4000-8000-000000001234', expectedVersion: 1, type: 'useTreasure' };
  for (const advice of ['protect', 'sabotage']) assert.equal(commandSchema.safeParse({ ...base, payload: { action: 'heartBell', targetId: target, advice } }).success, true);
  for (const payload of [
    { action: 'heartBell', targetId: target, advice: 'free text' },
    { action: 'heartBell', targetId: target, advice: 'protect', senderId: sender },
    { action: 'heartBell', targetId: target, advice: 'protect', text: 'I am the assassin' },
    { action: 'heartBell', targetId: 'invalid', advice: 'protect' },
  ]) assert.equal(commandSchema.safeParse({ ...base, payload }).success, false);
  assert.throws(() => transition(game, sender, action(target, 'invalid' as HeartBellAdvice), online), /INVALID_INPUT/);
});
