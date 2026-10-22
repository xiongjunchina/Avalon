import type { ScreenModel } from '../ui/widgets.js';
import { ALL_GALLERY_ROLES, WUYUE_MISSIONS } from '../../../web/src/roles.js';
import { roleDescriptions, roleTreasures } from '../../../web/src/role-descriptions.js';
import { ROLE_CONFIG, MISSION_SIZES } from '@avalon/game-core';

export function guideScreen(roleId?: string, section: 'rules'|'roles'|'config' = 'rules', art=false): ScreenModel {
  const role = ALL_GALLERY_ROLES.find(item => item.id === roleId);
  if(art&&role)return {title:role.fullName,rows:[],web:{page:'sheet',background:'library',backId:'guideArtClose',underlay:guideScreen(undefined,section),document:{kind:'art',modal:true,roleItem:role}}};
  if (role) return { title: role.fullName, portrait: role.artPrefix + '-160.webp', web: { page: 'sheet', background: 'library', backId: 'guide:roles', document:{kind:'guide-role',roleItem:role,activeTab:section} }, subtitle: role.team === 'blue' ? '取经阵营' : '妖魔阵营', rows: [
    { id: 'role-title', text: role.title }, { id: 'role-motto', text: role.motto },
    { id: 'role-story', text: role.story },
    { id: 'role-ability', text: '身份能力：' + roleDescriptions[role.role].ability },
    { id: 'role-visibility', text: '身份关联：' + roleDescriptions[role.role].visibility },
    { id: 'role-tip', text: '取经锦囊：' + roleDescriptions[role.role].tip },
    { id: 'role-treasure', text: '专属法宝：' + roleTreasures[role.role] },
    { id: 'guide:roles', text: '返回角色图鉴' },
  ] };
  return { title: '嘻游识妖谱', web: { page: 'sheet', background: 'library',document:{kind:'guide',activeTab:section} }, subtitle: '嘻游 · 真假猴王', rows: [
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
    ...Array.from({ length: 8 }, (_, index) => index + 5).map(count => ({ id: 'guide:config:' + count, text: count + '人板子：' + ROLE_CONFIG[count].map(role => ALL_GALLERY_ROLES.find(item => item.role === role)?.name ?? role).join('、') + '\n五难出征人数：' + MISSION_SIZES[count].join(' / ') })),
    ...ALL_GALLERY_ROLES.map(item => ({ id: `guide-role:${item.id}`, text: `${item.team === 'blue' ? '取经' : '妖魔'} · ${item.fullName}` })),
    { id: 'back', text: '返回' },
  ] };
}
