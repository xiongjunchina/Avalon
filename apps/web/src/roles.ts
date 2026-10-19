import type { FemaleDemon, LoyalGuardian, Role } from '@avalon/contracts';

export const roleNames: Record<Role, string> = {
  merlin: '孙悟空',
  percival: '唐三藏',
  guinevere: '观音菩萨',
  loyal: '取经护法',
  morgana: '六耳猕猴',
  assassin: '红孩儿',
  mordred: '黄眉老怪',
  oberon: '牛魔王',
  minion: '女妖精',
};

export const roleTitles: Record<Role, string> = {
  merlin: '齐天大圣',
  percival: '大唐圣僧',
  guinevere: '南海大士',
  loyal: '取经护法',
  morgana: '混世魔猴',
  assassin: '圣婴大王',
  mordred: '小雷音假佛',
  oberon: '平天大圣',
  minion: '绝色妖仙',
};

export const roleMottos: Record<Role, string> = {
  merlin: '火眼金睛识群妖，天机不可轻泄',
  percival: '辨明真假美猴王，护持大圣保真经',
  guinevere: '慈航普度闻天机，洞悉小雷音真伪',
  loyal: '披荆斩棘护圣僧，降妖除魔取真经',
  morgana: '善聆音察理知前后，假扮大圣惑圣僧',
  assassin: '三昧真火焚天地，终局一击定乾坤',
  mordred: '假扮如来设雷音，瞒过火眼乱真经',
  oberon: '独霸一方不结盟，暗怀异心阻取经',
  minion: '红绡曼舞惑圣僧，千娇百媚阻西行',
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
    motto: '踏破群山驮圣僧，银枪破浪护真经',
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

export interface FemaleDemonMeta {
  key: FemaleDemon;
  name: string;
  fullName: string;
  title: string;
  motto: string;
  artPrefix: string;
}

export const FEMALE_DEMONS: Record<FemaleDemon, FemaleDemonMeta> = {
  spider: {
    key: 'spider',
    name: '蜘蛛精',
    fullName: '女妖精 · 蜘蛛精',
    title: '盘丝大仙',
    motto: '盘丝结网诱唐僧，红绡濯垢困真龙',
    artPrefix: 'minion-spider',
  },
  baigu: {
    key: 'baigu',
    name: '白骨精',
    fullName: '女妖精 · 白骨精',
    title: '白骨夫人',
    motto: '三变幻化惑肉眼，枯骨红颜乱佛心',
    artPrefix: 'minion-baigu',
  },
  yutu: {
    key: 'yutu',
    name: '玉兔精',
    fullName: '女妖精 · 玉兔精',
    title: '广寒仙子',
    motto: '广寒私逃下天竺，素娥抛绣结良缘',
    artPrefix: 'minion-yutu',
  },
  laoshu: {
    key: 'laoshu',
    name: '老鼠精',
    fullName: '女妖精 · 老鼠精',
    title: '地涌夫人',
    motto: '无底洞中藏娇魅，金鼻白毛惑众生',
    artPrefix: 'minion-laoshu',
  },
};

export function formatRoleName(role: Role, loyalGuardian?: LoyalGuardian, femaleDemon?: FemaleDemon): string {
  if (role === 'loyal' && loyalGuardian && LOYAL_GUARDIANS[loyalGuardian]) {
    return LOYAL_GUARDIANS[loyalGuardian].fullName;
  }
  if (role === 'minion' && femaleDemon && FEMALE_DEMONS[femaleDemon]) {
    return FEMALE_DEMONS[femaleDemon].fullName;
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

export interface RoleGalleryItem {
  id: string;
  role: Role;
  loyalGuardian?: LoyalGuardian;
  femaleDemon?: FemaleDemon;
  team: 'blue' | 'red';
  name: string;
  fullName: string;
  title: string;
  motto: string;
  artPrefix: string;
  story: string;
}

export const ALL_GALLERY_ROLES: RoleGalleryItem[] = [
  // 蓝方 取经正果 (7位)
  {
    id: 'merlin',
    role: 'merlin',
    team: 'blue',
    name: '孙悟空',
    fullName: '齐天大圣 · 孙悟空',
    title: '齐天大圣',
    motto: '火眼金睛识群妖，天机不可轻泄',
    artPrefix: 'merlin',
    story: '花果山美猴王，炼就火眼金睛。开局可看破除小雷音黄眉老怪之外的所有红方群妖阵营，但须言语暗藏锋芒，提防红孩儿的三昧真火终局刺杀。',
  },
  {
    id: 'percival',
    role: 'percival',
    team: 'blue',
    name: '唐三藏',
    fullName: '大唐圣僧 · 唐三藏',
    title: '大唐圣僧',
    motto: '辨明真假美猴王，护持大圣保真经',
    artPrefix: 'percival',
    story: '大唐御弟高僧，开局得见真大圣孙悟空与假大圣六耳猕猴两位候选。须凭发言表决明辨真伪，带领取经同伴抵御群妖。',
  },
  {
    id: 'guinevere',
    role: 'guinevere',
    team: 'blue',
    name: '观音菩萨',
    fullName: '南海大士 · 观音菩萨',
    title: '南海大士',
    motto: '慈航普度闻天机，洞悉小雷音真伪',
    artPrefix: 'guinevere',
    story: '大慈大悲观世音，开局听闻两道南海天机，能识破假扮佛祖的隐身黄眉老怪的一半虚实，弥补孙悟空的视野盲区。',
  },
  {
    id: 'zhubajie',
    role: 'loyal',
    loyalGuardian: 'zhubajie',
    team: 'blue',
    name: '猪八戒',
    fullName: '取经护法 · 猪八戒',
    title: '天蓬元帅',
    motto: '九齿钉耙护圣僧，憨厚赤诚踏灵山',
    artPrefix: 'zhubajie-loyal',
    story: '原天蓬元帅，手执九齿钉耙。虽恋凡尘但护师赤诚，忠心耿耿踏遍万里关山，乃取经路上不可或缺的臂助。',
  },
  {
    id: 'shawujing',
    role: 'loyal',
    loyalGuardian: 'shawujing',
    team: 'blue',
    name: '沙悟净',
    fullName: '取经护法 · 沙悟净',
    title: '卷帘大将',
    motto: '降妖宝杖担行李，任劳任怨卫正途',
    artPrefix: 'shawujing-loyal',
    story: '原卷帘大将，流沙河皈依正道后肩挑重担，降妖宝杖威震邪崇，任劳任怨护持圣僧直达灵山宝地。',
  },
  {
    id: 'bailong',
    role: 'loyal',
    loyalGuardian: 'bailong',
    team: 'blue',
    name: '白龙',
    fullName: '取经护法 · 白龙',
    title: '玉龙三太子',
    motto: '踏破群山驮圣僧，银枪破浪护真经',
    artPrefix: 'bailong-loyal',
    story: '西海龙王三太子，化为白龙良驹踏破千山万壑驮负圣僧，危难之时化现龙身银枪破浪护佑师门。',
  },
  {
    id: 'jingang',
    role: 'loyal',
    loyalGuardian: 'jingang',
    team: 'blue',
    name: '金刚',
    fullName: '取经护法 · 金刚',
    title: '护法金刚',
    motto: '暗中随行佑取经，金杵伏魔镇群邪',
    artPrefix: 'jingang-loyal',
    story: '西天灵山护法金刚，隐身云端暗佑西行，法相庄严金杵伏魔，诛邪荡寇正道永昌。',
  },

  // 红方 群妖乱道 (8位)
  {
    id: 'morgana',
    role: 'morgana',
    team: 'red',
    name: '六耳猕猴',
    fullName: '混世魔猴 · 六耳猕猴',
    title: '混世魔猴',
    motto: '善聆音察理知前后，假扮大圣惑圣僧',
    artPrefix: 'morgana',
    story: '神通本领与大圣无二，假扮孙悟空迷惑唐三藏，善于假乱真、伺机制造流局并阻挠取经出征。',
  },
  {
    id: 'assassin',
    role: 'assassin',
    team: 'red',
    name: '红孩儿',
    fullName: '圣婴大王 · 红孩儿',
    title: '圣婴大王',
    motto: '三昧真火焚天地，终局一击定乾坤',
    artPrefix: 'assassin',
    story: '号山火云洞圣婴大王，修成三昧真火。若蓝方完成三次取经，红孩儿将发动终局一刺，击中大圣即可翻盘获胜。',
  },
  {
    id: 'mordred',
    role: 'mordred',
    team: 'red',
    name: '黄眉老怪',
    fullName: '小雷音假佛 · 黄眉老怪',
    title: '小雷音假佛',
    motto: '假扮如来设雷音，瞒过火眼乱真经',
    artPrefix: 'mordred',
    story: '原弥勒座下黄眉童儿，下界私立小雷音寺假扮如来佛祖，妖气内敛瞒过大圣火眼金睛，乃红方潜伏至深的假佛隐士。',
  },
  {
    id: 'oberon',
    role: 'oberon',
    team: 'red',
    name: '牛魔王',
    fullName: '平天大圣 · 牛魔王',
    title: '平天大圣',
    motto: '独霸一方不结盟，暗怀异心阻取经',
    artPrefix: 'oberon',
    story: '翠云山芭蕉洞平天大圣，威镇一方不入群妖同盟，独行孤狼难辨敌我，暗中掣肘西行大计。',
  },
  {
    id: 'spider',
    role: 'minion',
    femaleDemon: 'spider',
    team: 'red',
    name: '蜘蛛精',
    fullName: '绝色妖仙 · 盘丝大仙',
    title: '盘丝大仙',
    motto: '盘丝结网诱唐僧，红绡濯垢困真龙',
    artPrefix: 'minion-spider',
    story: '盘丝洞七情妖仙，濯垢泉畔化为绝色佳人，结丝作茧欲困圣僧，娇媚倾城暗藏杀机。',
  },
  {
    id: 'baigu',
    role: 'minion',
    femaleDemon: 'baigu',
    team: 'red',
    name: '白骨精',
    fullName: '绝色妖仙 · 白骨夫人',
    title: '白骨夫人',
    motto: '三变幻化惑肉眼，枯骨红颜乱佛心',
    artPrefix: 'minion-baigu',
    story: '白虎岭千年尸魔，三化幻形离间师徒，红粉骷髅惑乱肉眼，杀意藏于绝代风华之中。',
  },
  {
    id: 'yutu',
    role: 'minion',
    femaleDemon: 'yutu',
    team: 'red',
    name: '玉兔精',
    fullName: '绝色妖仙 · 广寒仙子',
    title: '广寒仙子',
    motto: '广寒私逃下天竺，素娥抛绣结良缘',
    artPrefix: 'minion-yutu',
    story: '月宫捣药玉兔私下凡间，化身天竺国绝美真假公主抛绣招亲，轻歌曼舞欲夺圣僧元阳阻断西行。',
  },
  {
    id: 'laoshu',
    role: 'minion',
    femaleDemon: 'laoshu',
    team: 'red',
    name: '老鼠精',
    fullName: '绝色妖仙 · 地涌夫人',
    title: '地涌夫人',
    motto: '无底洞中藏娇魅，金鼻白毛惑众生',
    artPrefix: 'minion-laoshu',
    story: '陷空山无底洞金鼻白毛老鼠精，曾偷饮灵山清油宝烛，国色天香倾国倾城，诱僧入洞暗图大道。',
  },
];

export function getRoleGalleryItem(role: Role, loyalGuardian?: LoyalGuardian, femaleDemon?: FemaleDemon): RoleGalleryItem {
  if (role === 'loyal' && loyalGuardian) {
    const found = ALL_GALLERY_ROLES.find(r => r.role === 'loyal' && r.loyalGuardian === loyalGuardian);
    if (found) return found;
  }
  if (role === 'minion' && femaleDemon) {
    const found = ALL_GALLERY_ROLES.find(r => r.role === 'minion' && r.femaleDemon === femaleDemon);
    if (found) return found;
  }
  const match = ALL_GALLERY_ROLES.find(r => r.role === role);
  return match ?? ALL_GALLERY_ROLES[0];
}
