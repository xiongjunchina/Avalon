import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MiniGameTickets, bearerToken, requestOriginAllowed } from '../src/minigame-session.js';
import { PostgresStore, digest } from '../src/store.js';

test('accepts only well formed bearer credentials and validates their session', async () => {
  assert.equal(bearerToken('Bearer live-token'), 'live-token');
  for (const value of [undefined, 'Basic token', 'Bearer ', 'Bearer a b']) assert.equal(bearerToken(value), undefined);
  const authenticate = async (token: string) => {
    if (token !== 'live-token') throw new Error('UNAUTHENTICATED');
    return { id: 'player-1' };
  };
  assert.deepEqual(await authenticate(bearerToken('Bearer live-token')!), { id: 'player-1' });
  await assert.rejects(authenticate(bearerToken('Bearer expired')!), /UNAUTHENTICATED/);
});

test('socket tickets are scoped, short lived and single use', () => {
  let now = 1_000;
  const tickets = new MiniGameTickets(() => now);
  const ticket = tickets.issue('room-1', 'live-token');
  assert.throws(() => tickets.consume(ticket, 'room-2'), /UNAUTHENTICATED/);
  assert.equal(tickets.consume(ticket, 'room-1'), 'live-token');
  assert.throws(() => tickets.consume(ticket, 'room-1'), /UNAUTHENTICATED/);
  const expired = tickets.issue('room-1', 'live-token');
  now += 31_000;
  assert.throws(() => tickets.consume(expired, 'room-1'), /UNAUTHENTICATED/);
});

test('mini-game may omit Origin with explicit auth but web CSRF remains strict', () => {
  const expected = 'https://avalon.example:8443';
  assert.equal(requestOriginAllowed({ method: 'POST', origin: undefined, authorization: 'Bearer token' }, expected), true);
  assert.equal(requestOriginAllowed({ method: 'GET', origin: undefined, socketTicket: 'ticket', websocket: true }, expected), true);
  assert.equal(requestOriginAllowed({ method: 'POST', origin: 'https://attacker.example', authorization: 'Bearer token' }, expected), false);
  assert.equal(requestOriginAllowed({ method: 'POST', origin: 'https://attacker.example' }, expected), false);
  assert.equal(requestOriginAllowed({ method: 'POST', origin: undefined }, expected), false);
  assert.equal(requestOriginAllowed({ method: 'POST', origin: expected }, expected), true);
});

test('logout revokes only the hash of the presented session token', async () => {
  const queries: { sql: string; params?: unknown[] }[] = [];
  const client = { query: async (sql: string, params?: unknown[]) => { queries.push({ sql, params }); return { rows: [] }; }, release: () => {} };
  const store = new PostgresStore({ connect: async () => client } as any);
  await store.revokeSession('secret-token');
  assert.deepEqual(queries.map(query => query.sql), ['BEGIN', 'DELETE FROM sessions WHERE token_hash=$1', 'COMMIT']);
  assert.deepEqual(queries[1]?.params, [digest('secret-token')]);
  assert.equal(JSON.stringify(queries).includes('secret-token'), false);
});
