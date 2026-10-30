import { normalizeBasePath } from '../../../packages/contracts/src/deployment-path';

export function deploymentUrls(base = '/') {
  const basePath = normalizeBasePath(base);
  const path = (value: string) => basePath + value.replace(/^\//, '');
  return {
    basePath, path,
    asset: (value: string) => /^\/(art|audio|assets)\//.test(value) ? path(value) : value,
    isAdmin: (pathname: string) => pathname === path('admin') || pathname.startsWith(path('admin/')),
    invite: (origin: string, key: string) => `${origin}${basePath}?invite=${encodeURIComponent(key)}`,
    socket: (origin: string, roomId: string) => `${origin.replace(/^http/, 'ws')}${path(`api/rooms/${encodeURIComponent(roomId)}/socket`)}`,
  };
}

declare const __APP_BASE_PATH__: string;
// Both build tools inject this constant. Plain Node unit tests retain root compatibility.
export const deployment = deploymentUrls(typeof __APP_BASE_PATH__ === 'undefined' ? '/' : __APP_BASE_PATH__);
export const assetUrl = deployment.asset;
