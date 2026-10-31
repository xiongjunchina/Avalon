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
    { id: 'voiceChatEnabled', text: `网页端声网兼容：${settings.voiceChatEnabled ? '开启' : '关闭'}（不影响微信语音）` },
    { id: 'autoRevealRoleEnabled', text: `自动亮身份：${settings.autoRevealRoleEnabled ? '开' : '关'}` },
    { id: 'treasuresEnabled', text: `8–12人法宝：${settings.treasuresEnabled ? '开' : '关'}（仅8人以上生效）` },
    ...(settings.treasuresEnabled && settings.playerCount >= 8 ? [{ id: 'treasureRule', text: settings.guardianPerksEnabled ? '新局法宝：护法天机已开，蓝方禁用、红方保留' : '新局法宝：护法天机未开，双方按角色保留' }] : []),
    { id: 'rolePreferenceEnabled', text: `心仪选角：${settings.rolePreferenceEnabled ? '开' : '关'}` },
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
  if (key === 'anonymousTeamVote' || key === 'ladyEnabled' || key === 'earlyAssassinationEnabled' || key === 'guardianPerksEnabled' || key === 'voiceChatEnabled' || key === 'autoRevealRoleEnabled' || key === 'treasuresEnabled' || key === 'rolePreferenceEnabled')
    return { ...settings, [key]: !settings[key] };
  return settings;
}

export const settingOptions = {
 captainMode:[['seat_order','按座位循环'],['random_order','开局打乱一次，整局循环']],
 rejectionScope:[['game','全局累计，5 次判负'],['mission','单次任务累计，5 次判负']],
 voiceChatEnabled:[['false','关闭（不影响微信语音）'],['true','开启（仅网页声网）']],
} as const;
export type SettingChoiceKey=keyof typeof settingOptions;
export class SettingsChoice {
 current?:{id:string;key:SettingChoiceKey;value:string};
 open(id:string,settings:Settings){const key=id.split(':').at(-1) as SettingChoiceKey;if(!(key in settingOptions))return false;this.current={id,key,value:String(settings[key])};return true;}
 choose(value:string){const current=this.current;this.current=undefined;if(!current||!settingOptions[current.key].some(o=>o[0]===value)||value===current.value)return;return current.id;}
 close(){this.current=undefined;}
}
