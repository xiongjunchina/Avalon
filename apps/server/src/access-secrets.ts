import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(secret, salt, 32) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifySecret(secret: string, encoded?: string | null): Promise<boolean> {
  if (!encoded || secret.length > 128) return false;
  const [salt, hex] = encoded.split(':');
  if (!/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(hex ?? '')) return false;
  const key = await derive(secret, salt, 32) as Buffer;
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
