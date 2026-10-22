import { defaultAnonymousTeamVote, type Settings } from '@avalon/contracts';
import type { ScreenModel } from '../ui/widgets.js';

export function settingsScreen(settings: Settings): ScreenModel {
  return { title: '房间玩法', subtitle: '点击逐项切换，返回后应用', rows: [
    { id: 'playerCount', text: `人数：${settings.playerCount}（点击增加）` },
    { id: 'captainMode', text: `队长：${settings.captainMode === 'seat_order' ? '座位循环' : '随机顺序'}` },
    { id: 'rejectionScope', text: `流局：${settings.rejectionScope === 'game' ? '全局累计' : '每轮累计'}` },
    { id: 'anonymousTeamVote', text: `匿名投票：${settings.anonymousTeamVote ? '开' : '关'}` },
    { id: 'ladyEnabled', text: `照妖宝镜：${settings.ladyEnabled ? '开' : '关'}` },
    { id: 'earlyAssassinationEnabled', text: `提前刺杀：${settings.earlyAssassinationEnabled ? '开' : '关'}` },
    { id: 'guardianPerksEnabled', text: `护法天机：${settings.guardianPerksEnabled ? '开' : '关'}` },
    { id: 'voiceChatEnabled', text: `网页端语音：${settings.voiceChatEnabled ? '开' : '关'}（小游戏暂不提供）` },
    { id: 'autoRevealRoleEnabled', text: `自动亮身份：${settings.autoRevealRoleEnabled ? '开' : '关'}` },
    { id: 'treasuresEnabled', text: `9–12人法宝：${settings.treasuresEnabled ? '开' : '关'}（仅9人以上生效）` },
    { id: 'apply', text: '应用设置并返回' },
  ] };
}

export function toggleSetting(settings: Settings, key: keyof Settings): Settings {
  if (key === 'playerCount') {
    const playerCount = settings.playerCount === 12 ? 5 : settings.playerCount + 1;
    return { ...settings, playerCount, anonymousTeamVote: defaultAnonymousTeamVote(playerCount) };
  }
  if (key === 'captainMode') return { ...settings, captainMode: settings.captainMode === 'seat_order' ? 'random_order' : 'seat_order' };
  if (key === 'rejectionScope') return { ...settings, rejectionScope: settings.rejectionScope === 'game' ? 'mission' : 'game' };
  if (key === 'anonymousTeamVote' || key === 'ladyEnabled' || key === 'earlyAssassinationEnabled' || key === 'guardianPerksEnabled' || key === 'voiceChatEnabled' || key === 'autoRevealRoleEnabled' || key === 'treasuresEnabled')
    return { ...settings, [key]: !settings[key] };
  return settings;
}
