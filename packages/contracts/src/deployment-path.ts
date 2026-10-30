/** URL prefixes are separate from the scheme/host origin used by authentication. */
export function normalizeBasePath(value = '/') {
  if (!value || value === '/') return '/';
  if (!/^\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*\/?$/.test(value)) throw new Error('INVALID_APP_BASE_PATH');
  return value.replace(/\/$/, '') + '/';
}
