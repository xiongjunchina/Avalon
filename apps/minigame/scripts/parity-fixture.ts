import { defaultSettings } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';

// Deterministic, local-only fixture shared by both screenshot renderers.
export function parityFixture() {
  const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '行者', playerCode: '123456', avatar: 'leaf' as const };
  const members = Array.from({ length: 6 }, (_, index) => ({ id: index ? '00000000-0000-4000-8000-' + String(index).padStart(12, '0') : user.id, nickname: index ? '仙友' + index : user.nickname, seat: index + 1, ready: true, online: true, ...(index ? {} : { avatar: 'leaf' as const }) }));
  const game = createGame('11111111-2222-4333-8444-555555555555', members, defaultSettings, values => [...values]);
  game.phase = 'proposing'; game.confirmed = members.map(member => member.id);
  game.captainIndex = 0;
  const room = { id: '22222222-2222-4222-8222-222222222222', code: '123456', version: 1, hostId: user.id, settings: defaultSettings, acceptingNewMembers: true, members, phase: 'playing' as const, serverTime: '2026-10-22T00:00:00Z', game: projectGame(game, user.id) };
  return { user, room };
}
