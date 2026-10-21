import { WechatPlatform, type WxRuntime } from './platform/wechat.js';
import { drawShell } from './ui/canvas.js';

declare const wx: WxRuntime;

const platform = new WechatPlatform(wx);
drawShell(platform);
