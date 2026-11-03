import type { Pool } from 'pg';
import { ContentSafety } from './content-safety.js';
import { WechatContentSafetyProvider } from './content-safety-provider.js';
import { AliyunContentSafetyProvider } from './aliyun-content-safety.js';

export function createContentSafety(pool: Pool, origin: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.CONTENT_SAFETY_ENABLED !== undefined && !['true','false'].includes(env.CONTENT_SAFETY_ENABLED))
    throw new Error('Invalid CONTENT_SAFETY_ENABLED');
  const enabled=env.CONTENT_SAFETY_ENABLED==='true';
  if(enabled&&(!env.WECHAT_MINIGAME_APP_ID||!env.WECHAT_MINIGAME_APP_SECRET||!env.ALIYUN_CONTENT_ACCESS_KEY_ID||!env.ALIYUN_CONTENT_ACCESS_KEY_SECRET))
    throw new Error('Content safety requires private WeChat and web provider credentials');
  return new ContentSafety(pool,{
    enabled,origin,basePath:env.APP_BASE_PATH??'/',
    ...(enabled?{
      wechat:new WechatContentSafetyProvider({appId:env.WECHAT_MINIGAME_APP_ID!,appSecret:env.WECHAT_MINIGAME_APP_SECRET!}),
      web:new AliyunContentSafetyProvider({accessKeyId:env.ALIYUN_CONTENT_ACCESS_KEY_ID!,accessKeySecret:env.ALIYUN_CONTENT_ACCESS_KEY_SECRET!,
        securityToken:env.ALIYUN_CONTENT_SECURITY_TOKEN||undefined,regionId:env.ALIYUN_CONTENT_REGION||'cn-shanghai',
        endpoint:env.ALIYUN_CONTENT_ENDPOINT||undefined,nicknameService:env.ALIYUN_CONTENT_NICKNAME_SERVICE||'nickname_detection_pro',
        chatService:env.ALIYUN_CONTENT_CHAT_SERVICE||'comment_detection_pro',imageService:env.ALIYUN_CONTENT_IMAGE_SERVICE||'profilePhotoCheck'}),
    }:{}),
  });
}
