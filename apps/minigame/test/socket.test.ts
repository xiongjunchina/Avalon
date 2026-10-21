import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Command, RoomView } from '@avalon/contracts';
import { MiniGameRoomConnection } from '../src/net/socket.js';
import type { MiniGameApi } from '../src/net/api.js';
import type { WechatPlatform, WxSocketTask } from '../src/platform/wechat.js';

class FakeSocket implements WxSocketTask {
  sent: string[] = [];
  open = () => {};
  message = (_event: { data: string }) => {};
  closed = (_event: { code: number }) => {};
  error = (_error: unknown) => {};
  send(options: { data: string }) { this.sent.push(options.data); }
  close(options?: { code?: number }) { this.closed({ code: options?.code ?? 1000 }); }
  onOpen(callback: () => void) { this.open = callback; }
  onMessage(callback: (event: { data: string }) => void) { this.message = callback; }
  onClose(callback: (event: { code: number }) => void) { this.closed = callback; }
  onError(callback: (error: unknown) => void) { this.error = callback; }
  emit(data: unknown) { this.message({ data: JSON.stringify(data) }); }
}

const room = (version: number) => ({ id: 'room-1', version, phase: 'waiting' }) as RoomView;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('reconnect replays the same unacknowledged command and ignores stale snapshots', async () => {
  const sockets: FakeSocket[] = [];
  const snapshots: number[] = [];
  const platform = { socket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; } } as unknown as WechatPlatform;
  const api = { request: async (path: string) => path.includes('socket-ticket') ? { ticket: 'ticket' } : { room: room(2) } } as unknown as MiniGameApi;
  const connection = new MiniGameRoomConnection({ api, platform, roomId: 'room-1', baseUrl: 'https://avalon.example:8443', retryDelay: 0, ackTimeout: 15,
    handlers: { snapshot: value => snapshots.push(value.version) } });
  connection.start();
  await pause(5);
  sockets[0].open();
  const command = { type: 'setReady', commandId: 'id-1', expectedVersion: 2, payload: { ready: true } } as Command;
  assert.equal(connection.send(command), true);
  assert.deepEqual(JSON.parse(sockets[0].sent[0]), command);
  await pause(40);
  assert.ok(sockets.length >= 2);
  sockets[1].open();
  sockets[1].emit({ type: 'snapshot', room: room(1) });
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), command);
  assert.deepEqual(snapshots, [2, 2]);
  assert.equal(snapshots.includes(1), false);
  connection.stop();
});

test('takeover and room closure stop further commands', async () => {
  const sockets: FakeSocket[] = [];
  const ended: string[] = [];
  const platform = { socket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; } } as unknown as WechatPlatform;
  const api = { request: async (path: string) => path.includes('socket-ticket') ? { ticket: 'ticket' } : { room: room(1) } } as unknown as MiniGameApi;
  const connection = new MiniGameRoomConnection({ api, platform, roomId: 'room-1', baseUrl: 'https://avalon.example:8443',
    handlers: { snapshot: () => {}, ended: reason => ended.push(reason) } });
  connection.start(); await pause(5); sockets[0].open();
  sockets[0].emit({ type: 'takenOver' });
  assert.equal(connection.send({ type: 'startGame', commandId: 'id', expectedVersion: 1, payload: {} } as Command), false);
  sockets[0].emit({ type: 'roomClosed' });
  assert.deepEqual(ended, ['closed']);
});
