import { randomBytes } from 'node:crypto';
import { DomainError } from './store.js';

export function bearerToken(header: string | undefined): string | undefined {
  return /^Bearer ([A-Za-z0-9_-]{1,512})$/.exec(header ?? '')?.[1];
}

export function requestOriginAllowed(request: {
  method: string;
  origin?: string;
  authorization?: string;
  socketTicket?: string;
  websocket?: boolean;
  miniGameLogin?: boolean;
}, expectedOrigin: string): boolean {
  if (request.origin !== undefined) return request.origin === expectedOrigin;
  if (request.method === 'GET' && !request.websocket) return true;
  return Boolean(bearerToken(request.authorization) || (request.websocket && request.socketTicket) || request.miniGameLogin);
}

export class MiniGameTickets {
  private readonly pending = new Map<string, { roomId: string; sessionToken: string; expiresAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}

  issue(roomId: string, sessionToken: string): string {
    for (const [key, value] of this.pending) if (value.expiresAt <= this.now()) this.pending.delete(key);
    const ticket = randomBytes(32).toString('base64url');
    this.pending.set(ticket, { roomId, sessionToken, expiresAt: this.now() + 30_000 });
    return ticket;
  }

  consume(ticket: string, roomId: string): string {
    const value = this.pending.get(ticket);
    if (!value || value.roomId !== roomId) throw new DomainError('UNAUTHENTICATED', 401);
    this.pending.delete(ticket);
    if (value.expiresAt <= this.now()) throw new DomainError('UNAUTHENTICATED', 401);
    return value.sessionToken;
  }
}
