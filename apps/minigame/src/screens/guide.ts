import type { ScreenModel } from '../ui/widgets.js';
import { ALL_GALLERY_ROLES, WUYUE_MISSIONS } from '../../../web/src/roles.js';

export function guideScreen(roleId?: string): ScreenModel {
  const role = ALL_GALLERY_ROLES.find(item => item.id === roleId);
  if (role) return { title: role.fullName, subtitle: role.team === 'blue' ? '取经阵营' : '妖魔阵营', rows: [
    { id: 'role-title', text: role.title }, { id: 'role-motto', text: role.motto },
    { id: 'role-story', text: role.story },
    { id: 'guide:roles', text: '返回角色图鉴' },
  ] };
  return { title: '玩法说明', subtitle: '嘻游 · 真假猴王', rows: [
    { id: 'guide:win', text: '五轮取经任务，蓝方完成三次后还须躲过刺杀' },
    { id: 'guide:loss', text: '红方破坏三次任务、累计五次流局或刺中孙悟空获胜' },
    { id: 'guide:role', text: '每人私下查看身份，讨论时不要展示底牌' },
    { id: 'guide:team', text: '队长选出任务队伍，按顺时针或逆时针发言' },
    { id: 'guide:vote', text: '全员赞成、反对或弃权；赞成多于反对才通过' },
    { id: 'guide:mission', text: '队员匿名出成功或失败；蓝方只能出成功' },
    { id: 'guide:assassin', text: '三次成功后由红孩儿刺杀孙悟空' },
    { id: 'guide:lady', text: '照妖宝镜与提前刺杀由房主开局前设置' },
    { id: 'guide:treasure', text: '9–12人法宝需房主开启，具体可用时机以本局提示为准' },
    { id: 'guide:treasureBlue', text: '九环锡杖、观音镜查验；紧箍佛印向圣僧自证' },
    { id: 'guide:treasureRed', text: '人种袋禁选队员，芭蕉扇干预任务' },
    ...WUYUE_MISSIONS.map(mission => ({ id: `mission:${mission.num}`, text: `第${mission.num}轮 · ${mission.mountain} · ${mission.title}` })),
    ...ALL_GALLERY_ROLES.map(item => ({ id: `guide-role:${item.id}`, text: `${item.team === 'blue' ? '取经' : '妖魔'} · ${item.fullName}` })),
    { id: 'back', text: '返回' },
  ] };
}
