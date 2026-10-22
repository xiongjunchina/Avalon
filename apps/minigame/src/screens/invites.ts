export class InviteInbox {
  private pending?: { code: string; sender?: string };
  get code() { return this.pending?.code; }
  receive(raw: string | undefined, sender?: string): void {
    const code = raw?.trim();
    if (!code || code.length > 200) return;
    this.pending = { code, ...(sender ? { sender } : {}) };
  }
  label(): string | undefined {
    if (!this.pending) return undefined;
    return `${this.pending.sender ?? '好友'} 邀请你加入房间 ${this.pending.code}`;
  }
  take(): string | undefined { const code = this.pending?.code; this.pending = undefined; return code; }
}
