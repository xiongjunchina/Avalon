import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { DomainError } from './store.js';

type AvatarMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type AvatarDownloadRequest = { url: URL; address: LookupAddress; signal: AbortSignal };
export type AvatarDownloadResponse = { status: number; headers: Headers; body: AsyncIterable<Uint8Array> };
export type AvatarInputOptions = {
  /** Test seam. Production callers must use the pinned HTTPS transport below. */
  fetcher?: (request: AvatarDownloadRequest) => Promise<AvatarDownloadResponse>;
  /** Test seam. All DNS answers are checked, including answers not selected for the connection. */
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
};

const MAX_DATA_URL_LENGTH = 65_536;
// Including the MIME/base64 prefix, every accepted image can fit the profile field.
const MAX_IMAGE_BYTES = 49_134;
const DOWNLOAD_TIMEOUT_MS = 5_000;
const invalid = () => new DomainError('INVALID_AVATAR', 400);
const unavailable = () => new DomainError('CONTENT_CHECK_UNAVAILABLE', 503);

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6 || address.includes('%') || address.includes('.')) return false;
  const [left, right] = address.toLowerCase().split('::');
  const before = left ? left.split(':') : [];
  const after = right ? right.split(':') : [];
  const parts = right === undefined ? before : [...before, ...Array(8 - before.length - after.length).fill('0'), ...after];
  const [first, second] = parts.map(part => parseInt(part, 16));
  // Only global unicast; exclude translation/tunnel, documentation and special-use blocks.
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002 && first !== 0x3ffe &&
    !(first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) &&
    !(first === 0x3fff && second <= 0x0fff);
}

function checkedUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
    (url.port && url.port !== '443') ||
    !/^(?:[a-z0-9-]+\.)*(?:qlogo|qpic)\.cn$/.test(url.hostname)) throw invalid();
  return url;
}

function checkJpeg(data: Buffer): boolean {
  if (data.length < 16 || !data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
    !data.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) return false;
  let offset = 2, frame = false;
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 0xff) return false;
    while (data[offset] === 0xff) offset++;
    if (offset + 3 > data.length) return false;
    const marker = data[offset++];
    if (marker === 0xda) return frame && offset + 2 < data.length - 2;
    if (marker === 0xd9 || marker === 0xd8 || marker === 0x00) return false;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) return false;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) return false;
      const height = data.readUInt16BE(offset + 3), width = data.readUInt16BE(offset + 5);
      if (!width || !height || width > 4096 || height > 4096) return false;
      frame = true;
    }
    offset += length;
  }
  return false;
}

function checkBytes(data: Buffer, declaredMime: string): { data: Buffer; mime: AvatarMime } {
  if (!data.length || data.length > MAX_IMAGE_BYTES) throw invalid();
  let mime: AvatarMime | undefined;
  if (data.length >= 45 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.readUInt32BE(8) === 13 && data.toString('ascii', 12, 16) === 'IHDR' &&
    data.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) {
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    if (width > 0 && height > 0 && width <= 4096 && height <= 4096) mime = 'image/png';
  } else if (checkJpeg(data)) mime = 'image/jpeg';
  else if (data.length >= 20 && data.toString('ascii', 0, 4) === 'RIFF' && data.readUInt32LE(4) === data.length - 8 &&
    data.toString('ascii', 8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16)) &&
    data.readUInt32LE(16) > 0 && data.readUInt32LE(16) <= data.length - 20) mime = 'image/webp';
  if (!mime || mime !== declaredMime) throw invalid();
  return { data, mime };
}

function downloadPinned({ url, address, signal }: AvatarDownloadRequest): Promise<AvatarDownloadResponse> {
  return new Promise((resolve, reject) => {
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      callback(null, options.all ? [address] : address.address, address.family);
    };
    const request = httpsRequest(url, {
      method: 'GET', agent: false, lookup: pinnedLookup, family: address.family,
      servername: url.hostname, rejectUnauthorized: true, signal,
      headers: { Accept: 'image/png,image/jpeg,image/webp', 'Accept-Encoding': 'identity' },
    }, response => {
      // Rejected headers still abort the response; keep that teardown error handled.
      response.on('error', reject);
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      }
      resolve({ status: response.statusCode ?? 0, headers, body: response });
    });
    request.on('error', reject);
    request.end();
  });
}

export async function parseAvatarInput(value: string, options: AvatarInputOptions = {}): Promise<{ data: Buffer; mime: AvatarMime }> {
  if (typeof value !== 'string' || !value || value.length > MAX_DATA_URL_LENGTH) throw invalid();
  if (value.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match || match[2].length % 4 !== 0) throw invalid();
    const data = Buffer.from(match[2], 'base64');
    if (data.toString('base64') !== match[2]) throw invalid();
    return checkBytes(data, match[1]);
  }

  const url = checkedUrl(value);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, DOWNLOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const answers = await (options.lookup ?? (hostname => dnsLookup(hostname, { all: true })))(url.hostname);
      if (!answers.length || answers.some(record => isIP(record.address) !== record.family || !isPublicAddress(record.address))) throw invalid();
      if (controller.signal.aborted) throw unavailable();
      const response = await (options.fetcher ?? downloadPinned)({ url, address: answers[0], signal: controller.signal });
      // Never follow redirects, including redirects to another permitted hostname.
      if (response.status >= 500) throw unavailable();
      if (response.status !== 200) throw invalid();
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw invalid();
      if (response.headers.has('content-encoding') && response.headers.get('content-encoding') !== 'identity') throw invalid();
      const rawLength = response.headers.get('content-length');
      if (rawLength !== null && (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_IMAGE_BYTES)) throw invalid();
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        if (controller.signal.aborted) throw unavailable();
        size += chunk.byteLength;
        if (size > MAX_IMAGE_BYTES) throw invalid();
        chunks.push(Buffer.from(chunk));
      }
      if (rawLength !== null && Number(rawLength) !== size) throw invalid();
      return checkBytes(Buffer.concat(chunks, size), mime);
    })()]);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
