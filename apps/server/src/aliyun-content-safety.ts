import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ContentSafetyProvider, SafetyDecision } from './content-safety-provider.js';
import { DomainError } from './store.js';

export type AliyunSafetyConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
  regionId?: string;
  /** Official public or VPC endpoint only. */
  endpoint?: string;
  nicknameService?: string;
  chatService?: string;
  imageService?: string;
  timeoutMs?: number;
};

const unavailable = () => new DomainError('CONTENT_CHECK_UNAVAILABLE', 503);
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const percentEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g,
  character => '%' + character.charCodeAt(0).toString(16).toUpperCase());

/** ACS3 reference algorithm; signs the exact transmitted body and all applicable headers.
 * https://help.aliyun.com/en/sdk/product-overview/v3-request-structure-and-signature
 */
export function signAliyunRequest(input: {
  url: URL; method: string; body: string; headers: Record<string, string>;
  accessKeyId: string; accessKeySecret: string;
}): Record<string, string> {
  const headers = Object.fromEntries(Object.entries(input.headers).map(([name, value]) => [name.toLowerCase(), value.trim()]));
  headers.host = input.url.host;
  headers['x-acs-content-sha256'] = sha256(input.body);
  const keys = Object.keys(headers).filter(name => name === 'host' || name === 'content-type' || name.startsWith('x-acs-')).sort();
  const canonicalHeaders = keys.map(name => `${name}:${headers[name]}\n`).join('');
  const query = [...input.url.searchParams].map(([name, value]) => [percentEncode(name), percentEncode(value)])
    .sort(([nameA, valueA], [nameB, valueB]) => nameA < nameB ? -1 : nameA > nameB ? 1 : valueA < valueB ? -1 : valueA > valueB ? 1 : 0)
    .map(([name, value]) => `${name}=${value}`).join('&');
  const signedHeaders = keys.join(';');
  const canonical = [input.method.toUpperCase(), input.url.pathname || '/', query, canonicalHeaders,
    signedHeaders, headers['x-acs-content-sha256']].join('\n');
  const signature = createHmac('sha256', input.accessKeySecret).update(`ACS3-HMAC-SHA256\n${sha256(canonical)}`, 'utf8').digest('hex');
  return { ...headers, authorization: `ACS3-HMAC-SHA256 Credential=${input.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}` };
}

const responseSchema = z.object({
  Code: z.literal(200),
  RequestId: z.string().min(1).max(256),
  Data: z.object({
    RiskLevel: z.enum(['none', 'low', 'medium', 'high']),
    Result: z.array(z.object({ RiskLevel: z.enum(['none', 'low', 'medium', 'high']).optional() }).passthrough()).optional(),
    ManualTaskId: z.string().nullable().optional(),
  }),
});
const regions = new Set(['cn-shanghai', 'cn-beijing', 'cn-hangzhou', 'cn-shenzhen', 'cn-chengdu']);
const textServices = new Set(['nickname_detection_pro', 'chat_detection_pro', 'comment_detection_pro',
  'ugc_moderation_byllm', 'ugc_moderation_byllm_pro']);
const imageServices = new Set(['profilePhotoCheck', 'baselineCheck', 'baselineCheck_pro', 'postImageCheck',
  'postImageCheckByVL', 'baselineCheckByVL']);

/** Paid, server-only provider. Construction never calls the network. OpenID is unused.
 * Services: https://help.aliyun.com/zh/document_detail/2684669.html
 * Images: https://help.aliyun.com/zh/document_detail/467829.html
 * RPC encoding: aliyun/alibabacloud-typescript-sdk green-20220302/src/client.ts
 */
export class AliyunContentSafetyProvider implements ContentSafetyProvider {
  private readonly timeoutMs: number;
  constructor(private readonly config: AliyunSafetyConfig, private readonly fetcher: typeof fetch = fetch) {
    this.timeoutMs = Number.isFinite(config.timeoutMs) ? Math.min(Math.max(config.timeoutMs!, 1), 5_000) : 5_000;
  }

  checkText(content: string, scene: 1 | 5, _openid?: string): Promise<SafetyDecision> {
    if (!content.trim() || Array.from(content).length > 600 || ![1, 5].includes(scene))
      return Promise.reject(new DomainError('INVALID_INPUT', 400));
    const service = scene === 1 ? this.config.nicknameService ?? 'nickname_detection_pro' :
      this.config.chatService ?? 'comment_detection_pro';
    if (!textServices.has(service)) return Promise.reject(unavailable());
    return this.check('TextModerationPlus', service, { content });
  }

  checkImage(mediaUrl: string, _openid?: string): Promise<SafetyDecision> {
    let url: URL;
    try { url = new URL(mediaUrl); } catch { return Promise.reject(new DomainError('INVALID_INPUT', 400)); }
    // Caller supplies an immutable, controlled upload URL, never an arbitrary client URL.
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href.length > 2_048)
      return Promise.reject(new DomainError('INVALID_INPUT', 400));
    const service = this.config.imageService ?? 'profilePhotoCheck';
    if (!imageServices.has(service)) return Promise.reject(unavailable());
    return this.check('ImageModeration', service, { imageUrl: url.href });
  }

  private endpoint(): URL {
    const regionId = this.config.regionId ?? 'cn-shanghai';
    if (!regions.has(regionId)) throw unavailable();
    const configured = this.config.endpoint ?? `green-cip.${regionId}.aliyuncs.com`;
    if (typeof configured !== 'string') throw unavailable();
    let url: URL;
    try { url = new URL(configured.includes('://') ? configured : `https://${configured}`); }
    catch { throw unavailable(); }
    const hosts = [`green-cip.${regionId}.aliyuncs.com`,
      ...(regionId === 'cn-chengdu' ? [] : [`green-cip-vpc.${regionId}.aliyuncs.com`])];
    if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash) throw unavailable();
    return url;
  }

  private async check(action: 'TextModerationPlus' | 'ImageModeration', service: string, parameters: Record<string, string>): Promise<SafetyDecision> {
    const { accessKeyId, accessKeySecret, securityToken } = this.config;
    if (typeof accessKeyId !== 'string' || typeof accessKeySecret !== 'string' ||
      !/^[A-Za-z0-9]+$/.test(accessKeyId) || !/^[\x21-\x7e]+$/.test(accessKeySecret) ||
      (securityToken !== undefined && !/^[\x21-\x7e]+$/.test(securityToken))) throw unavailable();
    const endpoint = this.endpoint();
    const body = new URLSearchParams({ Service: service, ServiceParameters: JSON.stringify(parameters) }).toString();
    const headers = signAliyunRequest({ url: endpoint, method: 'POST', body, accessKeyId, accessKeySecret,
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json',
        'x-acs-action': action, 'x-acs-version': '2022-03-02',
        'x-acs-date': new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), 'x-acs-signature-nonce': randomUUID(),
        ...(securityToken ? { 'x-acs-security-token': securityToken } : {}) } });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = (async () => {
        const response = await this.fetcher(endpoint.href, { method: 'POST', headers, body,
          redirect: 'error', signal: controller.signal });
        if (response.status !== 200 || !response.body) throw unavailable();
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 262_144) { void reader.cancel().catch(() => undefined); throw unavailable(); }
            chunks.push(chunk.value);
          }
        } finally { reader.releaseLock(); }
        const parsed = responseSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        if (!parsed.success) throw unavailable();
        const result = parsed.data;
        const levels = [result.Data.RiskLevel, ...(result.Data.Result ?? []).flatMap(value => value.RiskLevel ? [value.RiskLevel] : [])];
        const decision = levels.includes('high') ? 'risky' : levels.some(value => value === 'medium' || value === 'low') ||
          Boolean(result.Data.ManualTaskId) ? 'review' : 'pass';
        return { decision, provider: 'aliyun-green-20220302', traceId: result.RequestId } satisfies SafetyDecision;
      })();
      // A single budget also bounds stalled body reads or a transport that ignores abort.
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(unavailable());
      }, this.timeoutMs); });
      return await Promise.race([request, deadline]);
    } catch {
      // Never propagate credentials, signatures, raw user content or vendor error bodies.
      throw unavailable();
    } finally { if (timer) clearTimeout(timer); }
  }
}
