import {applicationUrl} from '../net/urls.js';
import {builtinAvatarFor} from '../../../web/src/avatar-catalog.js';
import type {Avatar} from '@avalon/contracts';
import type { WxImage, WxRuntime } from '../platform/wechat.js';

export function displayAssetLabel(name: string | undefined): string {
  return name?.trim() || '默认纹样';
}

export interface Artwork { get(name: string): WxImage | undefined }

export function createArtwork(runtime: WxRuntime, redraw: () => void, baseUrl = ''): Artwork {
  const cache = new Map<string, { image: WxImage; ready: boolean; retryAt?: number }>();
  const artwork: Artwork = { get(name) {
    const legacy=/^emblems\/(leaf|moon|sun|mountain|wave|star)\.png$/.exec(name);
    if(legacy)name=builtinAvatarFor(legacy[1] as Avatar).src;
    if(/^\/art\/avatars\/wx-\d+\.webp/.test(name))name=name.slice(5).split('?')[0]!;
    const preview = /^\/art\/roles\/[a-z-]+-640\.webp$/.test(name) ? artwork.get(name.replace('/art/','').replace('-640.webp','-160.webp')) : undefined;
    if (!runtime.createImage || !/^(moonlit\.png|avatars\/wx-\d+\.webp|emblems\/[a-z0-9-]+\.png|scenes\/(gate|sword|pavilion|library|mirror|dawn)\.webp|roles\/[a-z-]+-160\.webp|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s]+|\/art\/[^\s]+)$/.test(name)) return undefined;
    const existing = cache.get(name);
    if (existing && (!existing.retryAt || Date.now() < existing.retryAt)) return existing.ready ? existing.image : preview;
    const image = runtime.createImage();
    const entry: { image: WxImage; ready: boolean; retryAt?: number } = { image, ready: false };
    cache.set(name, entry);
    image.onload = () => { entry.ready = true; redraw(); };
    image.onerror = () => { entry.retryAt = Date.now() + 30_000; };
    image.src = name.startsWith('data:') || name.startsWith('https:') ? name : name.startsWith('/art/') ? applicationUrl(baseUrl,name) : `art/${name}`;
    return preview;
  } };
  return artwork;
}
