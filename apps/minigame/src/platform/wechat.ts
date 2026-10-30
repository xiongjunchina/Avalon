import type { NativeVoiceRuntime } from './native-voice.js';
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

export interface WxImage {
  width: number;
  height: number;
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

export interface WxAvatarCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): Pick<CanvasRenderingContext2D, 'drawImage'> | null;
  toTempFilePathSync(options: { fileType: 'jpg'; quality: number }): string;
}

export interface WxRuntime extends NativeVoiceRuntime {
  createCanvas(): HTMLCanvasElement;
  loadFont?(path: string): string | null;
  createOffscreenCanvas?(options: { type: '2d'; width: number; height: number }): WxAvatarCanvas;
  createImage?(): WxImage;
  chooseImage?(options: { count: number; sizeType: string[]; sourceType: string[];
    success(result: { tempFilePaths: string[]; tempFiles?: { size: number }[] }): void; fail(error: unknown): void }): void;
  getFileSystemManager?(): { readFileSync(path: string, encoding: 'base64'): string | ArrayBuffer };
  getSystemInfoSync(): { screenWidth: number; screenHeight: number; pixelRatio: number; safeArea?: { top: number; bottom: number } };
  getMenuButtonBoundingClientRect?(): { top: number; bottom: number };
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  setClipboardData?(options: { data: string; success(): void; fail(error: unknown): void }): void;
  request(options: WxRequestOptions): void;
  connectSocket(options: { url: string; header?: Record<string, string> }): WxSocketTask;
  login(options: { success(result: { code: string }): void; fail(error: unknown): void }): void;
  showKeyboard?(options: { defaultValue?: string; maxLength?: number; confirmType?: string; success?(): void; fail?(error: unknown): void }): void;
  hideKeyboard?(): void;
  onKeyboardConfirm?(callback: (event: { value: string }) => void): void;
  offKeyboardConfirm?(callback: (event: { value: string }) => void): void;
  onKeyboardComplete?(callback: () => void): void;
  offKeyboardComplete?(callback: () => void): void;
  onTouchStart?(callback: (event: { touches: { clientX: number; clientY: number }[] }) => void): void;
  onTouchMove?(callback: (event: { touches: { clientX: number; clientY: number }[] }) => void): void;
  onTouchCancel?(callback: () => void): void;
  onTouchEnd?(callback: (event: { changedTouches: { clientX: number; clientY: number }[] }) => void): void;
  createInnerAudioContext?(): { src: string; loop?: boolean; volume?: number; play(): void; pause(): void; stop(): void; destroy(): void; onEnded?(callback: () => void): void; onError?(callback: () => void): void };
  onShow(callback: (options?: { query?: { invite?: string } }) => void): void;
  onHide(callback: () => void): void;
  onShareAppMessage?(callback: () => { title: string; query?: string }): void;
  shareAppMessage?(options: { title: string; query: string }): void;
  getLaunchOptionsSync?(): { query?: { invite?: string } };
  vibrateShort?(options?: { type?: 'light' | 'medium' | 'heavy'; success?(): void; fail?(): void }): void;
  requestAnimationFrame?(callback: () => void): number;
}

export class WechatPlatform {
  constructor(readonly runtime: WxRuntime) {}
  vibrate(type: 'light' | 'medium' | 'heavy' = 'light') {
    try { this.runtime.vibrateShort?.({ type }); } catch { /* ignore on unsupported devices */ }
  }
  canvas() { return this.runtime.createCanvas(); }
  screen() { return this.runtime.getSystemInfoSync(); }
  viewport() {
    const screen = this.screen();
    const statusTop = screen.safeArea?.top ?? 0;
    // The native capsule occupies its own row below the device status bar.
    let top = statusTop + 44;
    try {
      const capsule = this.runtime.getMenuButtonBoundingClientRect?.();
      if (capsule && Number.isFinite(capsule.bottom) && capsule.bottom > statusTop && capsule.bottom < screen.screenHeight / 2)
        top = Math.max(top, capsule.bottom + 8);
    } catch { /* Older runtimes use the conservative navigation-row reserve. */ }
    return { width: screen.screenWidth, height: screen.screenHeight, top,
      bottom: screen.screenHeight - (screen.safeArea?.bottom ?? screen.screenHeight) };
  }
  get(key: string) { return this.runtime.getStorageSync(key); }
  set(key: string, value: unknown) { this.runtime.setStorageSync(key, value); }
  remove(key: string) { this.runtime.removeStorageSync(key); }
  request(options: WxRequestOptions) { this.runtime.request(options); }
  socket(url: string, header?: Record<string, string>) { return this.runtime.connectSocket({ url, header }); }
  login(): Promise<string> {
    return new Promise((resolve, reject) => this.runtime.login({ success: value => value.code?.trim() ? resolve(value.code) : reject(new Error('WECHAT_LOGIN_FAILED')), fail: cause => { const message = cause && typeof cause === 'object' && 'errMsg' in cause ? String(cause.errMsg) : ''; reject(new Error(/timeout/i.test(message) ? 'WECHAT_LOGIN_TIMEOUT' : /cancel/i.test(message) ? 'WECHAT_LOGIN_CANCELLED' : 'WECHAT_LOGIN_FAILED')); } }));
  }
  onShow(callback: (options?: { query?: { invite?: string } }) => void) { this.runtime.onShow(callback); }
  onHide(callback: () => void) { this.runtime.onHide(callback); }
}
