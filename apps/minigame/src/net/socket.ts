import type { Command, RoomView, ServerMessage } from '@avalon/contracts';
import type { WechatPlatform, WxSocketTask } from '../platform/wechat.js';
import type { MiniGameApi } from './api.js';

export interface MiniGameRoomHandlers {
  snapshot(room: RoomView): void;
  status?(status: string): void;
  error?(code: string): void;
  busy?(value: boolean): void;
  ended?(reason: 'left' | 'closed' | 'expired'): void;
  message?(message: ServerMessage): void;
}

export class MiniGameRoomConnection {
  private socket: WxSocketTask | undefined;
  private open = false;
  private stopped = false;
  private takenOver = false;
  private connecting = false;
  private generation = 0;
  private lastVersion = 0;
  private pending: Command | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private ackTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: {
    api: MiniGameApi;
    platform: WechatPlatform;
    roomId: string;
    baseUrl: string;
    handlers: MiniGameRoomHandlers;
    retryDelay?: number;
    ackTimeout?: number;
  }) {}

  start() { void this.connect(); }
  resume() { if (!this.stopped && !this.takenOver && !this.open) void this.connect(); }
  stop() {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.retryTimer);
    clearTimeout(this.ackTimer);
    this.socket?.close();
    this.socket = undefined;
    this.open = false;
    this.pending = undefined;
    this.options.handlers.busy?.(false);
  }

  send(command: Command): boolean {
    if (this.stopped || this.takenOver || !this.open || this.pending) return false;
    this.pending = command;
    this.transmit();
    return true;
  }

  private acceptSnapshot(room: RoomView) {
    if (room.version < this.lastVersion) return;
    this.lastVersion = room.version;
    this.options.handlers.snapshot(room);
  }

  private transmit() {
    if (!this.pending || !this.open || !this.socket) return;
    this.options.handlers.busy?.(true);
    this.socket.send({ data: JSON.stringify(this.pending) });
    clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => {
      this.ackTimer = undefined;
      this.options.handlers.error?.('ACK_PENDING');
      this.socket?.close({ code: 4000, reason: 'Receipt timeout' });
    }, this.options.ackTimeout ?? 8_000);
  }

  private schedule() {
    if (this.stopped || this.takenOver) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(), this.options.retryDelay ?? 1_000);
  }

  private terminal(reason: 'left' | 'closed' | 'expired') {
    this.stop();
    this.options.handlers.ended?.(reason);
  }

  private async connect() {
    if (this.stopped || this.takenOver || this.connecting || this.open) return;
    this.connecting = true;
    const generation = ++this.generation;
    const current = () => !this.stopped && this.generation === generation;
    this.options.handlers.status?.('连接中');
    try {
      const data = await this.options.api.request<{ room: RoomView }>(`/rooms/${this.options.roomId}`);
      if (!current()) return;
      this.acceptSnapshot(data.room);
      const { ticket } = await this.options.api.request<{ ticket: string }>('/minigame/socket-ticket', { roomId: this.options.roomId });
      if (!current()) return;
      const base = this.options.baseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '');
      const socket = this.options.platform.socket(`${base}/api/rooms/${this.options.roomId}/socket?ticket=${encodeURIComponent(ticket)}`);
      this.socket = socket;
      socket.onOpen(() => {
        if (!current()) return;
        this.open = true;
        this.connecting = false;
        this.options.handlers.status?.('已连接');
        if (this.pending) this.transmit();
      });
      socket.onMessage(event => {
        if (!current()) return;
        let message: ServerMessage;
        try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
        if (message.type === 'snapshot') this.acceptSnapshot(message.room);
        else if (message.type === 'commandResult' && this.pending?.commandId === message.commandId) {
          const leaving = this.pending.type === 'leaveRoom';
          this.pending = undefined;
          clearTimeout(this.ackTimer);
          this.options.handlers.busy?.(false);
          if (!message.ok) this.options.handlers.error?.(message.error ?? 'NETWORK');
          else if (leaving) this.terminal('left');
        } else if (message.type === 'takenOver') {
          this.takenOver = true;
          clearTimeout(this.ackTimer);
          this.options.handlers.busy?.(false);
          this.options.handlers.status?.('其他设备已接管');
        } else if (message.type === 'roomClosed') this.terminal('closed');
        else if (message.type === 'left') this.terminal('left');
        else if (message.type === 'error' && message.error === 'UNAUTHENTICATED') this.terminal('expired');
        else if (message.type === 'error') this.options.handlers.error?.(message.error);
        this.options.handlers.message?.(message);
      });
      socket.onClose(event => {
        if (!current()) return;
        this.open = false;
        this.connecting = false;
        clearTimeout(this.ackTimer);
        if (event.code === 4003) { this.terminal('expired'); return; }
        this.options.handlers.status?.('已断线，正在重连');
        this.schedule();
      });
      socket.onError(() => socket.close());
    } catch (error) {
      if (!current()) return;
      this.connecting = false;
      const code = error instanceof Error ? error.message : 'NETWORK';
      if (code === 'UNAUTHENTICATED') this.terminal('expired');
      else if (['ROOM_CLOSED', 'FORBIDDEN', 'ROOM_NOT_FOUND'].includes(code)) this.terminal('closed');
      else { this.options.handlers.error?.(code); this.schedule(); }
    }
  }
}
