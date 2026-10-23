import type { Command, Player, RoomView, Settings } from '@avalon/contracts';
import { MISSION_SIZES, captain, createGame, isEnded, projectGame, teamOf, transition, type GameState } from '@avalon/game-core';
import { ensureGameClone } from '../platform/clone.js';

const SELF_ID = 'practice-self';
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

export class PracticeSession {
  private game: GameState;
  readonly user = { id: SELF_ID, nickname: '我' };
  constructor(readonly settings: Settings, nickname: string) {
    ensureGameClone();
    this.user.nickname = nickname;
    const players: Player[] = Array.from({ length: settings.playerCount }, (_, index) => ({
      id: index === 0 ? SELF_ID : `practice-bot-${index}`, seat: index + 1,
      nickname: index === 0 ? nickname : `仙友${index + 1}号`,
    }));
    this.game = createGame(`practice-${Date.now()}`, players, settings, shuffle);
    this.stepBot();
  }
  view(): RoomView {
    const game = projectGame(this.game, this.user.id);
    return { id: 'local-practice', code: '练习局', hostId: SELF_ID, version: 1,
      settings: this.settings, members: this.game.players.map(player => ({ ...player, ready: true, online: true })),
      phase: isEnded(this.game) ? 'finished' : 'playing', acceptingNewMembers: false, game };
  }
  act(action: Pick<Command, 'type' | 'payload'>): void {
    if (action.type === 'returnToLobby') return;
    this.game = transition(this.game, this.user.id, action, this.game.players.map(player => player.id));
    this.stepBot();
  }
  switchSeat(id: string) {
    const player = this.game.players.find(item => item.id === id);
    if (!player) throw new Error('INVALID_TARGET');
    this.user.id = player.id; this.user.nickname = player.nickname;
  }
  perspectives() { return this.game.players.map(player => ({ ...player, role: this.game.roles[player.id]! })); }
  stepBot(autoSelf = false): boolean {
    if (isEnded(this.game)) return false;
    const game = this.game;
    const online = game.players.map(player => player.id);
    const apply = (userId: string, action: Pick<Command, 'type' | 'payload'>) => { this.game = transition(this.game, userId, action, online); };
    if (game.phase === 'role_reveal') {
      for (const player of game.players) if ((player.id !== this.user.id || autoSelf) && !this.game.confirmed.includes(player.id)) apply(player.id, { type: 'confirmRole', payload: {} });
    } else if (game.phase === 'proposing') {
      const id = captain(game);
      if ((id === this.user.id && !autoSelf)) return false;
      const size = MISSION_SIZES[game.players.length][game.mission - 1];
      apply(id, { type: 'proposeTeam', payload: { playerIds: game.players.slice(0, size).map(player => player.id), direction: 'clockwise' } });
    } else if (game.phase === 'discussion') {
      const id = captain(game);
      if ((id === this.user.id && !autoSelf)) return false;
      apply(id, { type: 'startTeamVote', payload: {} });
    } else if (game.phase === 'team_vote') {
      for (const player of game.players) {
        if (this.game.phase !== 'team_vote') break;
        if ((player.id !== this.user.id || autoSelf) && !(player.id in this.game.teamVotes)) apply(player.id, { type: 'teamVote', payload: { approve: true } });
      }
    } else if (game.phase === 'mission') {
      for (const id of game.rounds.at(-1)?.team ?? []) {
        if (this.game.phase !== 'mission') break;
        if ((id !== this.user.id || autoSelf) && !(id in this.game.missionVotes)) apply(id, { type: 'missionVote', payload: { success: teamOf(this.game.roles[id]!) !== 'red' || this.game.mission === 1 } });
      }
    } else if (game.phase === 'guanyin_window') {
      const id = game.players.find(player => game.roles[player.id] === 'guinevere')?.id;
      if (!id || (id === this.user.id && !autoSelf)) return false;
      apply(id, { type: 'useTreasure', payload: { action: 'guanyinMirror', skip: true } });
    } else if (game.phase === 'early_window') {
      const id = game.players.find(player => game.roles[player.id] === 'assassin')?.id;
      if (!id || (id === this.user.id && !autoSelf)) return false;
      apply(id, { type: 'earlyAssassinationDecision', payload: { attempt: false } });
    } else if (game.phase === 'assassination') {
      const id = game.players.find(player => game.roles[player.id] === 'assassin')?.id;
      if (!id || (id === this.user.id && !autoSelf)) return false;
      const target = game.players.find(player => player.id !== id);
      if (target) apply(id, { type: 'assassinate', payload: { targetId: target.id } });
    } else return false;
    return this.game !== game;
  }
}
