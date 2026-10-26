import type { User } from '@avalon/contracts';
import { api } from './api';
import { knownAccountForNickname, type KnownAccount } from './known-accounts';

export interface EntrySessionInput {
  nickname: string;
  playerCode?: string;
  account?: KnownAccount;
  roomKey?: string;
}
interface EntryIdentity { user: User; roomId: string | null }

/** Keeps a registration attempt stable until its account and current room have both been restored. */
export class EntrySession {
  private pending: Promise<EntryIdentity> | null = null;
  private registration: { nickname: string; id: string } | undefined;
  private savedUser: User | undefined;
  constructor(private options: {
    request: typeof api;
    knownAccounts: () => KnownAccount[];
    remember: (user: User) => void;
    registrationId: () => string;
  }) {}

  authenticate(input: EntrySessionInput): Promise<EntryIdentity> {
    if (this.pending) return this.pending;
    const task = this.restore(input);
    this.pending = task;
    void task.then(() => { this.pending = null; }, () => { this.pending = null; });
    return task;
  }

  private async restore(input: EntrySessionInput): Promise<EntryIdentity> {
    const nickname = input.nickname.trim();
    const accounts = this.options.knownAccounts();
    const previous = !input.playerCode && this.savedUser?.nickname === nickname ? this.savedUser : undefined;
    const account = input.account ?? (input.playerCode
      ? accounts.find(account => account.playerCode === input.playerCode)
      : knownAccountForNickname(accounts, nickname));
    const playerCode = input.playerCode ?? previous?.playerCode ?? account?.playerCode;
    const expectedUserId = previous?.id ?? account?.id;
    let user: User;
    if (playerCode) {
      ({ user } = await this.options.request<{ user: User }>('/sessions/switch', {
        playerCode, ...(expectedUserId ? { expectedUserId } : {}),
      }));
    } else {
      if (this.registration?.nickname !== nickname) this.registration = { nickname, id: this.options.registrationId() };
      ({ user } = await this.options.request<{ user: User }>('/sessions/guest', {
        nickname, registrationId: this.registration.id, ...(input.roomKey ? { roomKey: input.roomKey } : {}),
      }));
    }
    // A successful POST already created/restored the identity even if the next network request fails.
    this.savedUser = user;
    this.options.remember(user);
    const identity = await this.options.request<EntryIdentity>('/me');
    this.options.remember(identity.user);
    return identity;
  }
}
