import type { PoolClient } from 'pg';
import { DomainError, PostgresStore } from './store.js';
import type { FriendSummary, User } from '@avalon/contracts';

export class FriendsService {
  constructor(private store: PostgresStore) {}

  async listFriends(userId: string): Promise<FriendSummary[]> {
    return this.store.tx(async c => {
      const query = `
        SELECT
          f.id as relation_id,
          f.status,
          f.user_id as sender_id,
          u.id as friend_id,
          u.nickname,
          u.avatar,
          u.avatar_url,
          u.player_code,
          rm.room_id,
          r.code as room_code,
          (rm.connection_id IS NOT NULL) as is_online
        FROM friends f
        JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
        LEFT JOIN room_members rm ON rm.user_id = u.id AND rm.connection_id IS NOT NULL
        LEFT JOIN rooms r ON r.id = rm.room_id AND r.phase <> 'closed'
        WHERE (f.user_id = $1 OR f.friend_id = $1)
          AND f.status IN ('pending', 'accepted')
        ORDER BY
          (rm.connection_id IS NOT NULL) DESC,
          f.updated_at DESC
      `;
      const res = await c.query<{
        relation_id: string;
        status: 'pending' | 'accepted';
        sender_id: string;
        friend_id: string;
        nickname: string;
        avatar: User['avatar'];
        avatar_url: string | null;
        player_code: string | null;
        room_id: string | null;
        room_code: string | null;
        is_online: boolean | null;
      }>(query, [userId]);

      return res.rows.map(row => ({
        id: row.friend_id,
        nickname: row.nickname,
        avatar: row.avatar,
        ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
        playerCode: row.player_code ?? '000000',
        status: row.status,
        isSender: row.sender_id === userId,
        online: !!row.is_online,
        roomId: row.room_id,
        roomCode: row.room_code,
      }));
    });
  }

  async sendRequest(userId: string, targetQuery: string): Promise<{ success: boolean; status: 'pending' | 'accepted'; targetUser: User }> {
    const trimmed = targetQuery.trim();
    if (!trimmed) throw new DomainError('INVALID_INPUT', 400);

    return this.store.tx(async c => {
      const targetRes = await c.query<{
        id: string;
        nickname: string;
        avatar: User['avatar'];
        avatar_url: string | null;
        player_code: string | null;
      }>(
        'SELECT id, nickname, avatar, avatar_url, player_code FROM users WHERE player_code = $1 OR nickname = $1',
        [trimmed]
      );
      if (!targetRes.rows[0]) throw new DomainError('USER_NOT_FOUND', 404);
      const target = targetRes.rows[0];

      if (target.id === userId) throw new DomainError('CANNOT_ADD_SELF', 400);

      const existing = await c.query<{ id: string; user_id: string; friend_id: string; status: string }>(
        'SELECT * FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
        [userId, target.id]
      );

      if (existing.rows[0]) {
        const rel = existing.rows[0];
        if (rel.status === 'accepted') throw new DomainError('ALREADY_FRIENDS', 409);
        if (rel.status === 'pending') {
          if (rel.user_id === userId) throw new DomainError('REQUEST_ALREADY_SENT', 409);
          // If the other user already requested me, auto-accept!
          await c.query("UPDATE friends SET status = 'accepted', updated_at = NOW() WHERE id = $1", [rel.id]);
          return {
            success: true,
            status: 'accepted' as const,
            targetUser: {
              id: target.id,
              nickname: target.nickname,
              avatar: target.avatar,
              playerCode: target.player_code ?? undefined,
            },
          };
        }
      }

      await c.query(
        "INSERT INTO friends (user_id, friend_id, status, created_at, updated_at) VALUES ($1, $2, 'pending', NOW(), NOW()) ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'pending', updated_at = NOW()",
        [userId, target.id]
      );

      return {
        success: true,
        status: 'pending' as const,
        targetUser: {
          id: target.id,
          nickname: target.nickname,
          avatar: target.avatar,
          playerCode: target.player_code ?? undefined,
        },
      };
    });
  }

  async respondRequest(userId: string, requesterId: string, accept: boolean): Promise<{ success: boolean }> {
    return this.store.tx(async c => {
      if (accept) {
        const res = await c.query(
          "UPDATE friends SET status = 'accepted', updated_at = NOW() WHERE friend_id = $1 AND user_id = $2 AND status = 'pending'",
          [userId, requesterId]
        );
        if (!res.rowCount) throw new DomainError('REQUEST_NOT_FOUND', 404);
      } else {
        await c.query(
          "DELETE FROM friends WHERE friend_id = $1 AND user_id = $2 AND status = 'pending'",
          [userId, requesterId]
        );
      }
      return { success: true };
    });
  }

  async removeFriend(userId: string, friendId: string): Promise<{ success: boolean }> {
    return this.store.tx(async c => {
      await c.query(
        'DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
        [userId, friendId]
      );
      return { success: true };
    });
  }
}
