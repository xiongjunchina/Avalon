import type {Settings} from '@avalon/contracts';
import {treasuresEnabledFor} from '@avalon/game-core';
export function settingsText(s:Settings, rulesetVersion?:string) {
  const redOnly = s.guardianPerksEnabled && s.playerCount >= 8 && !treasuresEnabledFor(s,s.playerCount,'percival',rulesetVersion);
  return `${s.playerCount} 人 · ${s.voiceChatEnabled ? '🎙️ 语音房' : '🏛️ 常规房'} · ${s.anonymousTeamVote?'匿名':'实名'}表决 · ${s.captainMode==='seat_order'?'座位队长':'随机队长'} · ${s.rejectionScope==='game'?'全局':'任务'}流局${s.earlyAssassinationEnabled?' · 提前刺杀':''}${s.guardianPerksEnabled?' · 护法天机':''}${s.autoRevealRoleEnabled?' · 自动亮牌':''}${s.treasuresEnabled? redOnly ? ' · 专属法宝（仅红方）' : ' · 专属法宝':''}${s.rolePreferenceEnabled?' · 心仪选角':''}`;
}
