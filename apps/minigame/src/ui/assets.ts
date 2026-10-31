import {applicationUrl} from '../net/urls.js';
import {builtinAvatarFor} from '../../../web/src/avatar-catalog.js';
import type {Avatar} from '@avalon/contracts';
import type { WxImage, WxRuntime } from '../platform/wechat.js';

export function displayAssetLabel(name: string | undefined): string {
  return name?.trim() || '默认纹样';
}

export interface Artwork { readonly revision?:number; get(name: string): WxImage | undefined }

export function createArtwork(runtime: WxRuntime, redraw: () => void, baseUrl = ''): Artwork {
  let hdReady=false,hdLoading=false,hdRetryAt=0;
  const ensureHd=()=>{if(hdReady||hdLoading||Date.now()<hdRetryAt||!runtime.loadSubpackage)return;hdLoading=true;const fail=()=>{hdLoading=false;hdRetryAt=Date.now()+30000;};try{runtime.loadSubpackage({name:'hd-art',success:()=>{hdReady=true;hdLoading=false;redraw();},fail});}catch{fail();}};
  let revision=0;
  const cache = new Map<string, { image: WxImage; ready: boolean; retryAt?: number }>();
  const artwork: Artwork = {get revision(){return revision;}, get(name) {
    const legacy=/^emblems\/(leaf|moon|sun|mountain|wave|star)\.png$/.exec(name);
    if(legacy)name=builtinAvatarFor(legacy[1] as Avatar).src;
    if(/^\/art\/avatars\/wx-\d+\.webp/.test(name))name=name.slice(5).split('?')[0]!;
    const role=/^(?:\/art\/)?roles\/([a-z-]+)-(160|640)\.webp$/.exec(name);
    let preview:WxImage|undefined;
    if(role){
      ensureHd();
      if(hdReady){
        const low=cache.get('roles/'+role[1]+'-160.webp');preview=low?.ready?low.image:undefined;
        name='hd-art/'+role[1]+'-640.jpg';
      }else name='roles/'+role[1]+'-160.webp';
    }
    const scene=/^scenes\/(gate|sword|pavilion|library|mirror|dawn)\.webp$/.exec(name);
    if(scene){ensureHd();if(hdReady){const low=cache.get(name);preview=low?.ready?low.image:undefined;name='hd-art/scene-'+scene[1]+'.jpg';}}
    if (!runtime.createImage || !/^(hd-art\/(?:[a-z-]+-640|scene-[a-z-]+)\.jpg|moonlit\.png|avatars\/wx-\d+\.webp|emblems\/[a-z0-9-]+\.png|scenes\/(gate|sword|pavilion|library|mirror|dawn)\.webp|roles\/[a-z-]+-160\.webp|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s]+|\/art\/[^\s]+)$/.test(name)) return undefined;
    const existing = cache.get(name);
    if (existing && (!existing.retryAt || Date.now() < existing.retryAt)) return existing.ready ? existing.image : preview;
    const image = runtime.createImage();
    const entry: { image: WxImage; ready: boolean; retryAt?: number } = { image, ready: false };
    cache.set(name, entry);
    image.onload = () => { entry.ready = true; revision++;redraw(); };
    image.onerror = () => { entry.retryAt = Date.now() + 30_000; };
    const packagedName=name.replace(/\.webp$/,'.jpg');
    image.src = name.startsWith('hd-art/') ? name : name.startsWith('data:') || name.startsWith('https:') ? name : name.startsWith('/art/') ? applicationUrl(baseUrl,name) : `art/${packagedName}`;
    return preview;
  } };
  return artwork;
}
