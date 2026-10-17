import type { LoyalGuardian, Role } from '@avalon/contracts';

export const roleNames: Record<Role, string> = {
  merlin: '孙悟空',
  percival: '唐三藏',
  guinevere: '观音菩萨',
  loyal: '取经护法',
  morgana: '六耳猕猴',
  assassin: '红孩儿',
  mordred: '黄眉老怪',
  oberon: '牛魔王',
  minion: '巡山小妖',
};

export const roleTitles: Record<Role, string> = {
  merlin: '齐天大圣',
  percival: '大唐圣僧',
  guinevere: '南海大士',
  loyal: '西行护法',
  morgana: '混世魔猴',
  assassin: '圣婴大王',
  mordred: '小雷音假佛',
  oberon: '平天大圣',
  minion: '狮驼妖众',
};

export const roleMottos: Record<Role, string> = {
  merlin: '火眼金睛识群妖，天机不可轻泄',
  percival: '辨明真假美猴王，护持大圣往西行',
  guinevere: '慈航普度闻天机，洞悉小雷音真伪',
  loyal: '披荆斩棘护圣僧，降妖除魔取真经',
  morgana: '善聆音察理知前后，假扮大圣惑圣僧',
  assassin: '三昧真火焚天地，终局一击定乾坤',
  mordred: '假扮如来设雷音，瞒过火眼乱西行',
  oberon: '独霸一方不结盟，暗怀异心阻西行',
  minion: '打锣巡山探消息，混入队伍坏取经',
};

export interface LoyalGuardianMeta {
  key: LoyalGuardian;
  name: string;
  fullName: string;
  title: string;
  motto: string;
  artPrefix: string;
}

export const LOYAL_GUARDIANS: Record<LoyalGuardian, LoyalGuardianMeta> = {
  zhubajie: {
    key: 'zhubajie',
    name: '猪八戒',
    fullName: '取经护法 · 猪八戒',
    title: '天蓬元帅',
    motto: '九齿钉耙护圣僧，憨厚赤诚踏灵山',
    artPrefix: 'zhubajie-loyal',
  },
  shawujing: {
    key: 'shawujing',
    name: '沙悟净',
    fullName: '取经护法 · 沙悟净',
    title: '卷帘大将',
    motto: '降妖宝杖担行李，任劳任怨卫正途',
    artPrefix: 'shawujing-loyal',
  },
  bailong: {
    key: 'bailong',
    name: '白龙',
    fullName: '取经护法 · 白龙',
    title: '玉龙三太子',
    motto: '化马西行驮圣僧，银枪破浪护真经',
    artPrefix: 'bailong-loyal',
  },
  jingang: {
    key: 'jingang',
    name: '金刚',
    fullName: '取经护法 · 金刚',
    title: '护法金刚',
    motto: '暗中随行佑取经，金杵伏魔镇群邪',
    artPrefix: 'jingang-loyal',
  },
};

export function formatRoleName(role: Role, loyalGuardian?: LoyalGuardian): string {
  if (role === 'loyal' && loyalGuardian && LOYAL_GUARDIANS[loyalGuardian]) {
    return LOYAL_GUARDIANS[loyalGuardian].fullName;
  }
  return roleNames[role];
}

export interface WuYueMissionMeta {
  num: number;
  mountain: string;
  title: string;
  shortLabel: string;
  subtitle: string;
}

export const WUYUE_MISSIONS: WuYueMissionMeta[] = [
  { num: 1, mountain: '五行山', title: '五行揭帖', shortLabel: '1·五行揭帖', subtitle: '第一难 · 五行山下定心猿' },
  { num: 2, mountain: '流沙河', title: '流沙收徒', shortLabel: '2·流沙收徒', subtitle: '第二难 · 弱水三千聚取经' },
  { num: 3, mountain: '白虎岭', title: '三打白骨', shortLabel: '3·三打白骨', subtitle: '第三难 · 幻相重重辨真伪' },
  { num: 4, mountain: '小雷音', title: '真假雷音', shortLabel: '4·真假雷音', subtitle: '第四难 · 弥勒金铙破假佛' },
  { num: 5, mountain: '灵山顶', title: '灵山取经', shortLabel: '5·灵山取经', subtitle: '第五难 · 凌云渡口证菩提' },
];
