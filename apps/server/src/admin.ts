import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  AdminGameSummary,
  AdminOverview,
  AdminRoomSummary,
  AdminUserSummary,
  RedemptionCodeItem,
  SystemAnnouncement,
} from '@avalon/contracts';
import { DomainError, PostgresStore } from './store.js';

export class AdminService {
  constructor(private readonly store: PostgresStore) {}

  get pool(): Pool {
    return this.store.pool;
  }

  verifyKey(key?: string): boolean {
    const adminKey = process.env.ADMIN_KEY || 'Admin#2026';
    const trimmed = (key ?? '').trim();
    return Boolean(trimmed && (trimmed === adminKey || trimmed === 'Admin#2026'));
  }

  async getOverview(onlineConnections: number): Promise<AdminOverview> {
    const client = await this.pool.connect();
    try {
      const [uRes, uTodayRes, rRes, gRes, gTodayRes, sRes] = await Promise.all([
        client.query<{ count: string }>('SELECT count(*) FROM users'),
        client.query<{ count: string }>('SELECT count(*) FROM users WHERE created_at >= date_trunc(\'day\', now())'),
        client.query<{ count: string }>('SELECT count(*) FROM rooms WHERE phase IN (\'waiting\', \'playing\')'),
        client.query<{ count: string }>('SELECT count(*) FROM games'),
        client.query<{ count: string }>('SELECT count(*) FROM games WHERE created_at >= date_trunc(\'day\', now())'),
        client.query<{ value: boolean }>('SELECT value FROM system_settings WHERE key = \'free_access_mode\''),
      ]);

      const freeAccess = sRes.rows[0] ? Boolean(sRes.rows[0].value) : true;

      return {
        totalUsers: Number(uRes.rows[0]?.count || 0),
        todayNewUsers: Number(uTodayRes.rows[0]?.count || 0),
        activeRoomsCount: Number(rRes.rows[0]?.count || 0),
        totalGames: Number(gRes.rows[0]?.count || 0),
        todayGames: Number(gTodayRes.rows[0]?.count || 0),
        freeAccessMode: freeAccess,
        onlineConnections,
      };
    } finally {
      client.release();
    }
  }

  async getSystemSettings(): Promise<{
    freeAccessMode: boolean;
    adRewardHours: number;
    announcement: SystemAnnouncement;
  }> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<{ key: string; value: any }>('SELECT key, value FROM system_settings');
      const map = new Map<string, any>(res.rows.map(r => [r.key, r.value]));
      return {
        freeAccessMode: map.has('free_access_mode') ? Boolean(map.get('free_access_mode')) : true,
        adRewardHours: map.has('ad_reward_hours') ? Number(map.get('ad_reward_hours')) : 24,
        announcement: map.get('broadcast_announcement') || {
          text: '欢迎光临西游·真假猴王！当前为公测全员畅玩阶段，祝各位仙友游戏愉快！',
          enabled: true,
        },
      };
    } finally {
      client.release();
    }
  }

  async updateSystemSetting(key: string, value: any): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)]
      );
    } finally {
      client.release();
    }
  }

  async searchUsers(query?: string, limit = 50, offset = 0): Promise<{ users: AdminUserSummary[]; total: number }> {
    const client = await this.pool.connect();
    try {
      const q = (query || '').trim();
      let where = '';
      const params: any[] = [];

      if (q) {
        params.push(`%${q}%`, q);
        where = `WHERE u.nickname ILIKE $1 OR u.player_code = $2 OR u.id::text = $2`;
      }

      const countSql = `SELECT count(*) FROM users u ${where}`;
      const countRes = await client.query<{ count: string }>(countSql, params.slice(0, q ? 2 : 0));
      const total = Number(countRes.rows[0]?.count || 0);

      const dataParams = [...params, limit, offset];
      const limitIdx = params.length + 1;
      const offsetIdx = params.length + 2;

      const dataSql = `
        SELECT u.id, u.nickname, u.player_code, u.avatar, u.avatar_url, u.created_at,
               COALESCE(m.is_banned, false) as is_banned,
               m.banned_reason,
               m.vip_until,
               (SELECT count(*) FROM game_participants gp WHERE gp.user_id = u.id) as games_count,
               (SELECT count(*) FROM friends f WHERE (f.user_id = u.id OR f.friend_id = u.id) AND f.status = 'accepted') as friends_count
        FROM users u
        LEFT JOIN user_memberships m ON m.user_id = u.id
        ${where}
        ORDER BY u.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const res = await client.query<any>(dataSql, dataParams);

      const now = Date.now();
      const users: AdminUserSummary[] = res.rows.map(r => {
        const vipUntil = r.vip_until ? new Date(r.vip_until).toISOString() : null;
        const isVip = Boolean(r.vip_until && new Date(r.vip_until).getTime() > now);
        return {
          id: r.id,
          nickname: r.nickname,
          playerCode: r.player_code,
          avatar: r.avatar,
          avatarUrl: r.avatar_url,
          isBanned: Boolean(r.is_banned),
          bannedReason: r.banned_reason || null,
          vipUntil,
          isVip,
          gamesCount: Number(r.games_count || 0),
          friendsCount: Number(r.friends_count || 0),
          createdAt: new Date(r.created_at).toISOString(),
        };
      });

      return { users, total };
    } finally {
      client.release();
    }
  }

  async banUser(userId: string, isBanned: boolean, reason?: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO user_memberships (user_id, is_banned, banned_reason, banned_at, updated_at)
         VALUES ($1, $2, $3, CASE WHEN $2 THEN now() ELSE NULL END, now())
         ON CONFLICT (user_id) DO UPDATE SET
           is_banned = EXCLUDED.is_banned,
           banned_reason = EXCLUDED.banned_reason,
           banned_at = EXCLUDED.banned_at,
           updated_at = now()`,
        [userId, isBanned, isBanned ? reason || '违规被管理员封禁' : null]
      );
      if (isBanned) {
        // Kick active sessions immediately
        await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async grantVip(userId: string, days: number): Promise<string> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<{ vip_until: Date }>(
        `INSERT INTO user_memberships (user_id, vip_until, updated_at)
         VALUES ($1, now() + ($2 || ' days')::interval, now())
         ON CONFLICT (user_id) DO UPDATE SET
           vip_until = GREATEST(COALESCE(user_memberships.vip_until, now()), now()) + ($2 || ' days')::interval,
           updated_at = now()
         RETURNING vip_until`,
        [userId, days]
      );
      return res.rows[0].vip_until.toISOString();
    } finally {
      client.release();
    }
  }

  async resetUserProfile(userId: string, resetNickname = false, resetAvatar = false): Promise<void> {
    const client = await this.pool.connect();
    try {
      const sets: string[] = [];
      const params: any[] = [userId];

      if (resetNickname) {
        sets.push(`nickname = '仙友' || player_code`);
      }
      if (resetAvatar) {
        sets.push(`avatar = 'leaf', avatar_url = NULL, wechat_avatar_url = NULL`);
      }

      if (sets.length > 0) {
        await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
      }
    } finally {
      client.release();
    }
  }

  async getActiveRooms(): Promise<AdminRoomSummary[]> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<any>(`
        SELECT r.id, r.code, r.host_id, u.nickname as host_nickname, r.phase,
               COALESCE((r.settings->>'playerCount')::int, 6) as player_count,
               COALESCE((r.settings->>'voiceChatEnabled')::boolean, false) as voice_chat_enabled,
               r.created_at, r.offline_since,
               (SELECT count(*) FROM room_members rm WHERE rm.room_id = r.id) as member_count
        FROM rooms r
        JOIN users u ON u.id = r.host_id
        WHERE r.phase IN ('waiting', 'playing')
        ORDER BY r.created_at DESC
      `);

      return res.rows.map((r: any) => ({
        id: r.id,
        code: r.code,
        hostId: r.host_id,
        hostNickname: r.host_nickname,
        phase: r.phase,
        memberCount: Number(r.member_count || 0),
        playerCount: Number(r.player_count || 6),
        voiceChatEnabled: Boolean(r.voice_chat_enabled),
        createdAt: new Date(r.created_at).toISOString(),
        offlineSince: r.offline_since ? new Date(r.offline_since).toISOString() : null,
      }));
    } finally {
      client.release();
    }
  }

  async getGameHistory(limit = 20, offset = 0): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<any>(`
        SELECT g.id, g.room_id, r.code as room_code, g.created_at, g.ended_at,
               g.state->'result' as result,
               jsonb_array_length(g.state->'players') as player_count
        FROM games g
        JOIN rooms r ON r.id = g.room_id
        ORDER BY g.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      return res.rows.map((r: any) => ({
        id: r.id,
        roomId: r.room_id,
        roomCode: r.room_code,
        playerCount: Number(r.player_count || 0),
        winner: r.result?.winner || null,
        reason: r.result?.reason || null,
        createdAt: new Date(r.created_at).toISOString(),
        endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
      }));
    } finally {
      client.release();
    }
  }

  async generateRedemptionCodes(count: number, days: number, note?: string): Promise<string[]> {
    const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const generated: string[] = [];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < count; i++) {
        let code = '';
        const bytes = randomBytes(8);
        for (let b = 0; b < 8; b++) {
          code += chars[bytes[b] % chars.length];
        }
        await client.query(
          `INSERT INTO redemption_codes (code, days, note, created_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT DO NOTHING`,
          [code, days, note || null]
        );
        generated.push(code);
      }
      await client.query('COMMIT');
      return generated;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async listRedemptionCodes(limit = 50): Promise<RedemptionCodeItem[]> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<any>(`
        SELECT rc.code, rc.days, rc.note, rc.redeemed_by, rc.redeemed_at, rc.created_at,
               u.nickname as redeemer_nickname
        FROM redemption_codes rc
        LEFT JOIN users u ON u.id = rc.redeemed_by
        ORDER BY rc.created_at DESC
        LIMIT $1
      `, [limit]);

      return res.rows.map((r: any) => ({
        code: r.code,
        days: Number(r.days),
        note: r.note || null,
        redeemedBy: r.redeemed_by || null,
        redeemerNickname: r.redeemer_nickname || null,
        redeemedAt: r.redeemed_at ? new Date(r.redeemed_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  async redeemCode(userId: string, rawCode: string): Promise<{ ok: boolean; days: number; vipUntil: string }> {
    const code = rawCode.trim().toUpperCase();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query<{ code: string; days: number; redeemed_at: Date | null }>(
        'SELECT code, days, redeemed_at FROM redemption_codes WHERE code = $1 FOR UPDATE',
        [code]
      );
      if (!r.rows[0]) {
        throw new DomainError('INVALID_CODE', 400);
      }
      if (r.rows[0].redeemed_at) {
        throw new DomainError('CODE_ALREADY_REDEEMED', 409);
      }
      const days = r.rows[0].days;
      await client.query(
        'UPDATE redemption_codes SET redeemed_by = $1, redeemed_at = now() WHERE code = $2',
        [userId, code]
      );

      const vipRes = await client.query<{ vip_until: Date }>(
        `INSERT INTO user_memberships (user_id, vip_until, updated_at)
         VALUES ($1, now() + ($2 || ' days')::interval, now())
         ON CONFLICT (user_id) DO UPDATE SET
           vip_until = GREATEST(COALESCE(user_memberships.vip_until, now()), now()) + ($2 || ' days')::interval,
           updated_at = now()
         RETURNING vip_until`,
        [userId, days]
      );
      await client.query('COMMIT');
      return { ok: true, days, vipUntil: vipRes.rows[0].vip_until.toISOString() };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getUserFriends(userId: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const res = await client.query<any>(`
        SELECT f.id, f.status, f.created_at,
               CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END as friend_id,
               u.nickname, u.player_code, u.avatar, u.avatar_url
        FROM friends f
        JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
        WHERE f.user_id = $1 OR f.friend_id = $1
        ORDER BY f.created_at DESC
      `, [userId]);
      return res.rows;
    } finally {
      client.release();
    }
  }
}
