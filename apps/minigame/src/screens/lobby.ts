import { defaultSettings, type Command, type RoomView, type Settings, type User } from '@avalon/contracts';
import type { MiniGameApi } from '../net/api.js';
import type { MiniGameRoomConnection } from '../net/socket.js';
import type { ScreenModel } from '../ui/widgets.js';

export function commandId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

export class LobbyController {
  private room?: RoomView;
  private connection?: Pick<MiniGameRoomConnection, 'send'>;
  constructor(private readonly api: MiniGameApi, readonly user: User) {}
  setRoom(room: RoomView) { this.room = room; }
  setConnection(connection: Pick<MiniGameRoomConnection, 'send'>) { this.connection = connection; }

  async create(settings: Settings = defaultSettings): Promise<RoomView> {
    const { room } = await this.api.request<{ room: RoomView }>('/rooms', { settings });
    this.room = room;
    return room;
  }
  async join(key: string): Promise<RoomView> {
    const { room } = await this.api.request<{ room: RoomView }>('/rooms/join', { key: key.trim() });
    this.room = room;
    return room;
  }
  async resume(): Promise<RoomView | undefined> {
    const { roomId } = await this.api.request<{ user: User; roomId: string | null }>('/me');
    if (!roomId) return undefined;
    const { room } = await this.api.request<{ room: RoomView }>(`/rooms/${roomId}`);
    this.room = room;
    return room;
  }

  private send(type: Command['type'], payload: Command['payload']): boolean {
    if (!this.room || !this.connection) return false;
    return this.connection.send({ type, payload, commandId: commandId(), expectedVersion: this.room.version } as Command);
  }
  ready(value: boolean) { return this.send('setReady', { ready: value }); }
  start() { return this.room?.hostId === this.user.id && this.send('startGame', {}); }
  admission(value: boolean) { return this.room?.hostId === this.user.id && this.send('setAdmission', { acceptingNewMembers: value }); }
  updateSettings(settings: Settings) { return this.room?.hostId === this.user.id && this.send('updateSettings', settings); }
  kick(userId: string) { return this.room?.hostId === this.user.id && this.send('kickMember', { userId }); }
  leave() { return this.send('leaveRoom', {}); }
}

export function lobbyScreen(room: RoomView, user: User, status = ''): ScreenModel {
  const me = room.members.find(member => member.id === user.id);
  return { title: `房间 ${room.code}`, web: { page: 'table', room, user }, subtitle: `${room.settings.playerCount}人 · ${status}`, rows: [
    ...room.members.map(member => ({ id: `member:${member.id}`, text: `${member.seat}号 ${member.nickname} · ${member.ready ? '已准备' : '未准备'} · ${member.online ? '在线' : '离线'}` })),
    { id: 'ready', text: me?.ready ? '取消准备' : '准备' },
    ...(room.hostId === user.id ? [
      { id: 'start', text: '开始游戏' },
      { id: 'settings', text: '房间玩法设置' },
      { id: 'presets', text: '保存或应用玩法预设' },
      { id: 'admission', text: room.acceptingNewMembers ? '关闭新玩家加入' : '允许新玩家加入' },
    ] : []),
    { id: 'share', text: '邀请微信好友' }, { id: 'friends', text: '邀请仙友入房' }, { id: 'chat', text: '房间聊天' },
    { id: 'practice', text: `幻化分身试玩（${room.settings.playerCount}人局）` },
    { id: 'leave', text: '离开房间' },
  ] };
}

export function readyReminder(room: RoomView, userId: string): boolean {
  return room.phase === 'waiting' && room.members.length === room.settings.playerCount
    && room.members.some(member => member.id === userId && !member.ready)
    && room.members.every(member => member.id === userId || member.ready);
}
