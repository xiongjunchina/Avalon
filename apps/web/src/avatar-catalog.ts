import type { Avatar } from '@avalon/contracts';

export type AvatarCategoryId = 'treasures' | 'beasts' | 'chibi';

export interface AvatarCategory {
  id: AvatarCategoryId;
  label: string;
  icon: string;
  hint: string;
}

export const AVATAR_CATEGORIES: AvatarCategory[] = [
  { id: 'chibi', label: '萌趣仙童', icon: '🌸', hint: '十位修道小童仙子，活泼可爱' },
  { id: 'treasures', label: '仙家法宝', icon: '💎', hint: '十件通灵道释法宝，清莹出尘' },
  { id: 'beasts', label: '祥瑞灵兽', icon: '🐾', hint: '十尊三界仙兽神禽，生动祥瑞' },
];

export interface BuiltinAvatarItem {
  name: string;
  src: string;
  category: AvatarCategoryId;
  categoryLabel: string;
}

// 30 built-in neutral avatars across 3 categories (10 per category)
const RAW_BUILTIN_AVATARS: Array<{ name: string; category: AvatarCategoryId; categoryLabel: string }> = [
  // Group 1: 仙家通灵法宝 (1-10)
  { name: '羊脂玉净瓶', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '翡翠宝葫芦', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '素雪山河扇', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '太虚八卦鉴', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '雪瓷沉香炉', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '太乙白玉拂尘', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '绿绮七弦琴', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '悟道仙茶盏', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '金经白玉简', category: 'treasures', categoryLabel: '仙家法宝' },
  { name: '两仪龙凤佩', category: 'treasures', categoryLabel: '仙家法宝' },

  // Group 2: 祥瑞仙兽神禽 (11-20)
  { name: '望月玉兔', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '踏浪金鲤', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '浴云白泽', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '瑶池仙鹤', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '踏霞麒麟', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '乘风青鸟', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '九色天鹿', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '金蟾衔瑞', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '玄水灵龟', category: 'beasts', categoryLabel: '祥瑞灵兽' },
  { name: '含芝仙狐', category: 'beasts', categoryLabel: '祥瑞灵兽' },

  // Group 3: 国潮Q萌仙童 (21-30)
  { name: '抱桃小仙童', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '提灯小龙女', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '折梅小花仙', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '吃茶小沙弥', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '机灵小灵狐童', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '捧拂小书童', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '抱琴小玉女', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '啃竹小灵熊', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '调皮小灵猴', category: 'chibi', categoryLabel: '萌趣仙童' },
  { name: '游水小锦鲤娃', category: 'chibi', categoryLabel: '萌趣仙童' },
];

export const BUILTIN_AVATARS: BuiltinAvatarItem[] = RAW_BUILTIN_AVATARS.map((item, index) => ({
  ...item,
  src: `/art/avatars/wx-${index + 1}.webp?v=v2`,
}));

const legacyAvatarIndex: Record<Avatar, number> = { leaf: 0, moon: 1, sun: 2, mountain: 3, wave: 4, star: 5 };

export const builtinAvatarFor = (avatar: Avatar = 'leaf') => BUILTIN_AVATARS[legacyAvatarIndex[avatar]];
export const findBuiltinAvatar = (src?: string | null) => src
  ? BUILTIN_AVATARS.find(item => item.src.split('?')[0] === src.split('?')[0])
  : undefined;
