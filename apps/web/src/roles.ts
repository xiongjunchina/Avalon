import type { Role } from '@avalon/contracts';

export const roleNames: Record<Role, string> = {
  merlin: '风清扬',
  percival: '令狐冲',
  guinevere: '任盈盈',
  loyal: '正道侠客',
  morgana: '东方不败',
  assassin: '林平之',
  mordred: '岳不群',
  oberon: '左冷禅',
  minion: '魔教长老',
};

export const roleTitles: Record<Role, string> = {
  merlin: '剑宗泰斗',
  percival: '剑宗传人',
  guinevere: '聪慧圣姑',
  loyal: '名门侠士',
  morgana: '魔教教主',
  assassin: '辟邪剑客',
  mordred: '伪君子掌门',
  oberon: '嵩山野心家',
  minion: '黑木堂主',
};

export const roleMottos: Record<Role, string> = {
  merlin: '慧眼识破群邪，天机不可轻泄',
  percival: '辨明真假师承，拔剑护道周全',
  guinevere: '琴音暗辨传闻，洞察正邪虚实',
  loyal: '铁肩担道义，仗剑护会盟',
  morgana: '红线绣针织幻象，以假乱真惑群雄',
  assassin: '辟邪剑出寒芒现，一击封喉定乾坤',
  mordred: '君子折扇掩祸心，瞒天过海乱正道',
  oberon: '寒冰真气独孤行，暗怀野心图五岳',
  minion: '黑木令下听号令，潜入会盟毁盟约',
};

export interface WuYueMissionMeta {
  num: number;
  mountain: string;
  title: string;
  shortLabel: string;
  subtitle: string;
}

export const WUYUE_MISSIONS: WuYueMissionMeta[] = [
  { num: 1, mountain: '嵩山', title: '嵩山会盟', shortLabel: '1·嵩山会盟', subtitle: '中岳嵩山 · 初定盟约' },
  { num: 2, mountain: '衡山', title: '衡山会盟', shortLabel: '2·衡山会盟', subtitle: '南岳衡山 · 琴箫辨音' },
  { num: 3, mountain: '泰山', title: '泰山会盟', shortLabel: '3·泰山会盟', subtitle: '东岳泰山 · 玉皇论剑' },
  { num: 4, mountain: '恒山', title: '恒山会盟', shortLabel: '4·恒山会盟', subtitle: '北岳恒山 · 悬空护道' },
  { num: 5, mountain: '华山', title: '华山会盟', shortLabel: '5·华山会盟', subtitle: '西岳华山 · 思过决战' },
];

