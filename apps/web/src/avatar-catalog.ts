import type { Avatar } from '@avalon/contracts';

// Existing neutral artwork; choosing an avatar does not choose a game role.
export const BUILTIN_AVATARS = [
  '青玉葫芦', '山河宝扇', '伏羲古琴', '悟道仙茶',
  '太极八卦镜', '紫金香炉', '太乙拂尘', '修真竹简',
  '羊脂玉净瓶', '阴阳玉佩', '斩妖宝剑', '乾坤宝匣',
].map((name, index) => ({ name, src: `/art/avatars/wx-${index + 1}.webp?v=artifact1` }));

const legacyAvatarIndex: Record<Avatar, number> = { leaf: 0, moon: 1, sun: 2, mountain: 3, wave: 4, star: 5 };

export const builtinAvatarFor = (avatar: Avatar = 'leaf') => BUILTIN_AVATARS[legacyAvatarIndex[avatar]];
export const findBuiltinAvatar = (src?: string | null) => src
  ? BUILTIN_AVATARS.find(item => item.src.split('?')[0] === src.split('?')[0])
  : undefined;
