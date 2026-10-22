import type { WxImage, WxRuntime } from '../platform/wechat.js';

export function displayAssetLabel(name: string | undefined): string {
  return name?.trim() || '默认纹样';
}

export interface Artwork { get(name: string): WxImage | undefined }

export function createArtwork(runtime: WxRuntime, redraw: () => void): Artwork {
  const cache = new Map<string, { image: WxImage; ready: boolean }>();
  return { get(name) {
    if (!runtime.createImage || !/^(moonlit\.png|roles\/[a-z-]+-160\.webp)$/.test(name)) return undefined;
    const existing = cache.get(name);
    if (existing) return existing.ready ? existing.image : undefined;
    const image = runtime.createImage();
    const entry = { image, ready: false };
    cache.set(name, entry);
    image.onload = () => { entry.ready = true; redraw(); };
    image.onerror = () => { cache.delete(name); };
    image.src = `art/${name}`;
    return undefined;
  } };
}
