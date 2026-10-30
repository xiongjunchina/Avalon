export const DEFAULT_API_BASE_URL = 'https://game.ccnepower.com/avalon';
export function normalizeServiceUrl(value = DEFAULT_API_BASE_URL) {
  let url;
  try { url = new URL(value); } catch { throw Error('INVALID_API_ORIGIN'); }
  if (!/^https:\/\/[^/?#\s\\]+(?:\/[a-z0-9_-]+)*\/?$/.test(value) || url.username || url.password || !url.hostname)
    throw Error('INVALID_API_ORIGIN');
  return url.origin + url.pathname.replace(/\/$/, '');
}
