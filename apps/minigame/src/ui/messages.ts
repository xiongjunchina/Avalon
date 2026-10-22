import { errors } from '../../../web/src/api.js';

const miniGameErrors: Record<string, string> = {
  UNAUTHENTICATED: '登录已失效，请返回首页重新微信登录。',
  NETWORK_TIMEOUT: '请求超时，请检查网络后重试。',
  ACK_PENDING: '正在确认操作结果，重连后将自动同步，请稍候。',
  ADMIN_UNAUTHORIZED: '管理验证已失效，请重新进入管理员。',
  WECHAT_NOT_CONFIGURED: '服务器尚未配置微信登录，请联系管理员。',
};
export function describeMiniGameError(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : String(cause ?? 'NETWORK');
  return miniGameErrors[code] ?? errors[code] ?? (/[\u3400-\u9fff]/.test(code) ? code : '操作未完成，请稍后重试。');
}
