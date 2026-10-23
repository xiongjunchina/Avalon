import type { GameView } from '@avalon/contracts';
import { usePrivateNotice } from './private-notice';

export function guanyinNoticeKey(game: GameView, userId: string): string | null {
  return game.self?.role === 'guinevere' && game.self.treasures?.enabled && game.self.treasures.guanyinMirror?.result
    ? `avalon:guanyin-read:${game.id}:${userId}` : null;
}

export function useGuanyinNotice(game: GameView, userId: string, connected: boolean) {
  return usePrivateNotice(guanyinNoticeKey(game, userId), connected);
}
