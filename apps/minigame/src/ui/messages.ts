import { errors } from '../../../web/src/api.js';

const miniGameErrors: Record<string, string> = {
  HANDOFF_EXPIRED: '接续链接已过期或已使用，请返回小游戏重新复制。',
  HANDOFF_ROOM_CHANGED: '房间状态已变化，请返回当前房间重新复制接续链接。',
  WECHAT_VOICE_DISABLED: '服务器尚未启用微信语音，请管理员检查语音配置；对局不受影响。',
  WECHAT_VOICE_LIMIT: '微信原生语音每房最多10人，11～12人牌局不能加入原生语音。',
  WECHAT_VOICE_IDENTITY: '原生语音需使用当前微信绑定的游戏账号；请退出并重新微信登录，不要切换仙友码账号。',
  WECHAT_VOICE_SESSION: '未取得微信语音签名所需的会话，请重新加入语音。',
  WECHAT_LOGIN_FAILED: '微信身份验证未完成，请重新登录或先体验单人演练。',
  WECHAT_LOGIN_TIMEOUT: '微信身份验证超时，请检查网络后重新登录。',
  WECHAT_LOGIN_CANCELLED: '已取消微信身份验证，可重新登录或体验单人演练。',
  NETWORK: '暂时无法连接游戏服务。请检查网络，或先体验单人演练。',
  NETWORK_DOMAIN: '连接地址未通过微信域名校验，请联系管理员检查域名及端口配置。',
  NETWORK_TLS: '安全连接失败，请联系管理员检查 HTTPS 证书和服务入口。',
  NETWORK_RESPONSE: '游戏服务返回了非接口页面，请联系管理员检查备案接入和网关。',
  WECHAT_UNAVAILABLE: '微信登录服务暂不可用，请联系管理员检查服务配置，或先体验单人演练。',
  WECHAT_CODE_INVALID: '微信登录凭证已过期，请重新点击登录。',
  HTTP_404: '当前服务入口没有这个接口，请联系管理员检查后端版本。',
  HTTP_502: '游戏服务暂未就绪，请稍后重试。',
  HTTP_503: '游戏服务暂不可用，请稍后重试。',
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
