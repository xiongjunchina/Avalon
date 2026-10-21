export interface WxRequestOptions {
  url: string;
  method?: string;
  header?: Record<string, string>;
  data?: unknown;
  success(result: { statusCode: number; data: unknown; header?: Record<string, string> }): void;
  fail(error: unknown): void;
}

export interface WxSocketTask {
  send(options: { data: string }): void;
  close(options?: { code?: number; reason?: string }): void;
  onOpen(callback: () => void): void;
  onMessage(callback: (event: { data: string }) => void): void;
  onClose(callback: (event: { code: number }) => void): void;
  onError(callback: (error: unknown) => void): void;
}

export interface WxRuntime {
  createCanvas(): HTMLCanvasElement;
  getSystemInfoSync(): { screenWidth: number; screenHeight: number; pixelRatio: number; safeArea?: { top: number; bottom: number } };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  request(options: WxRequestOptions): void;
  connectSocket(options: { url: string; header?: Record<string, string> }): WxSocketTask;
  login(options: { success(result: { code: string }): void; fail(error: unknown): void }): void;
  showKeyboard?(options: { defaultValue?: string; maxLength?: number; confirmType?: string; success?(): void; fail?(error: unknown): void }): void;
  hideKeyboard?(): void;
  onKeyboardConfirm?(callback: (event: { value: string }) => void): void;
  offKeyboardConfirm?(callback: (event: { value: string }) => void): void;
  onTouchStart?(callback: (event: { touches: { clientX: number; clientY: number }[] }) => void): void;
  onTouchEnd?(callback: (event: { changedTouches: { clientX: number; clientY: number }[] }) => void): void;
  createInnerAudioContext?(): { src: string; play(): void; pause(): void; stop(): void; destroy(): void };
  onShow(callback: () => void): void;
  onHide(callback: () => void): void;
  onShareAppMessage?(callback: () => { title: string; query?: string }): void;
  shareAppMessage?(options: { title: string; query: string }): void;
  getLaunchOptionsSync?(): { query?: { invite?: string } };
}

export class WechatPlatform {
  constructor(readonly runtime: WxRuntime) {}
  canvas() { return this.runtime.createCanvas(); }
  screen() { return this.runtime.getSystemInfoSync(); }
  get(key: string) { return this.runtime.getStorageSync(key); }
  set(key: string, value: unknown) { this.runtime.setStorageSync(key, value); }
  remove(key: string) { this.runtime.removeStorageSync(key); }
  request(options: WxRequestOptions) { this.runtime.request(options); }
  socket(url: string, header?: Record<string, string>) { return this.runtime.connectSocket({ url, header }); }
  login(): Promise<string> {
    return new Promise((resolve, reject) => this.runtime.login({ success: value => resolve(value.code), fail: reject }));
  }
  onShow(callback: () => void) { this.runtime.onShow(callback); }
  onHide(callback: () => void) { this.runtime.onHide(callback); }
}
