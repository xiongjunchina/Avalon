// Only the single, non-public gateway in our Compose network may supply proxy headers.
export function runtimeConfig(env: NodeJS.ProcessEnv) {
  const production = env.NODE_ENV === 'production';
  if (production && !env.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production');
  const origin = env.APP_ORIGIN ?? 'http://localhost:5173';
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password)
    throw new Error('APP_ORIGIN must be an exact HTTP(S) origin without a trailing slash');
  for (const key of ['COOKIE_SECURE', 'TRUST_PROXY'] as const)
    if (env[key] !== undefined && !['true', 'false'].includes(env[key]!)) throw new Error(`Invalid ${key}`);
  const secure = env.COOKIE_SECURE === 'true';
  if (secure !== (url.protocol === 'https:')) throw new Error('COOKIE_SECURE must match APP_ORIGIN');
  if (production && url.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Non-local production origins require HTTPS');
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return { origin, secure, trustProxy: env.TRUST_PROXY === 'true', host: env.HOST ?? '127.0.0.1', port };
}
