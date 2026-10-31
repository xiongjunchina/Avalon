import { randomBytes } from 'node:crypto';
import { DomainError } from './store.js';

export const WEB_HANDOFF_TTL_MS = 5 * 60_000;
type PendingHandoff = { sessionToken: string; userId: string; roomId?: string; expiresAt: number };

/** Personal, single-use credentials. They are deliberately separate from room invitations. */
export class WebHandoffs {
  private readonly pending = new Map<string, PendingHandoff>();
  constructor(private readonly now: () => number = Date.now, private readonly capacity = 10_000) {}

  issue(sessionToken: string, userId: string, roomId?: string) {
    const now = this.now();
    for (const [key, value] of this.pending) {
      if (value.expiresAt <= now || value.sessionToken === sessionToken) this.pending.delete(key);
    }
    if (this.pending.size >= this.capacity) throw new DomainError('HANDOFF_UNAVAILABLE', 503);
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = now + WEB_HANDOFF_TTL_MS;
    this.pending.set(ticket, { sessionToken, userId, roomId, expiresAt });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  consume(ticket: string): PendingHandoff {
    const value = this.pending.get(ticket);
    // Consume before any asynchronous validation, so concurrent exchanges cannot both succeed.
    this.pending.delete(ticket);
    if (!value || value.expiresAt <= this.now()) throw new DomainError('HANDOFF_EXPIRED', 401);
    return value;
  }
}
