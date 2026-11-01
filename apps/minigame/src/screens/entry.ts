import type { User } from '@avalon/contracts';
import type { ScreenModel } from '../ui/widgets.js';
import { MINI_GAME_VOICE_ENABLED } from '../features.js';

export function entryScreen(user?: User, error?: string,auth=false,voiceEnabled=MINI_GAME_VOICE_ENABLED): ScreenModel {
  const voiceDescription=voiceEnabled?'微信语音最多10人，需主动加入':'当前版本不含实时语音';
  return { title: '嘻游 · 真假猴王', web: user?{page:'home',user}:!auth?{page:'home',guestHome:true}:{page:'home',backId:'authClose',document:{kind:'auth',modal:true},underlay:{title:'嘻游 · 真假猴王',rows:[],web:{page:'home',guestHome:true}}}, subtitle: error || (user ? `${user.nickname} · ${user.playerCode ?? ''} · ${voiceDescription}` : `微信登录后开始对局 · ${voiceDescription}`), rows: user ? [
    { id: 'create', text: '创建房间' }, { id: 'join', text: '输入房间号加入' },
    { id: 'account', text: '我的账户' }, { id: 'friends', text: '仙友' },
    { id: 'switch', text: '切换账户' },
    { id: 'practice', text: '单人练习' }, { id: 'guide', text: '玩法说明' },
    { id: 'admin', text: '管理员' }, { id: 'logout', text: '退出登录' },
  ] : [{ id: 'login', text: '微信登录' }, { id: 'practice', text: '单人练习' }, { id: 'guide', text: '玩法说明' }] };
}
