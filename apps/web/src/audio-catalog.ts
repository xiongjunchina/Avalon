export interface BackgroundMusic { file: string; title: string }

export interface BackgroundMusicTrack {
  id: string;
  file: string;
  title: string;
  subtitle: string;
  desc: string;
  duration: string;
  badge: string;
}

export const BGM_STORAGE_KEY = 'avalon:bgm_track_id';

export const BGM_CANDIDATES: BackgroundMusicTrack[] = [
  {
    id: 'yungong-symphony',
    file: '/audio/bgm-candidates/01-yungong-xunyin-symphony.mp3',
    title: '《云宫迅音》（大交响国风重制版）',
    subtitle: '恢弘磅礴 · 管弦齐鸣 · 齐天大圣降临',
    desc: '中国管弦乐团实录与民乐唢呐大鼓融合，气势雄浑，比旧版更具史诗震撼感。',
    duration: '04:25',
    badge: '史诗震撼',
  },
  {
    id: 'ganwen-lu',
    file: '/audio/bgm-candidates/02-ganwen-lu-zai-he-fang.mp3',
    title: '《敢问路在何方》（终曲交响变奏）',
    subtitle: '经典回响 · 沧桑悠远 · 踏平坎坷成大道',
    desc: '86版西游记灵魂片尾曲交响升华版，旋律一出情怀拉满，宿命感十足。',
    duration: '05:16',
    badge: '情怀经典',
  },
  {
    id: 'xiliang-nverqing',
    file: '/audio/bgm-candidates/03-xiliang-qingyuan-nverqing.mp3',
    title: '《西梁情缘》（女儿国·唯美古筝琵琶）',
    subtitle: '温婉缠绵 · 丝竹雅韵 · 柔情似水',
    desc: '以《女儿情》为蓝本的纯器乐编曲，古筝与琵琶清脆灵动，非常耐听，适合桌游慢节奏思考。',
    duration: '04:35',
    badge: '柔和优雅',
  },
  {
    id: 'baishi-guqin',
    file: '/audio/bgm-candidates/04-baishi-xueyi-guqin.mp3',
    title: '《拜师学艺》（方寸仙山·禅意古琴洞箫）',
    subtitle: '仙风道骨 · 灵台清幽 · 悟彻菩提',
    desc: '空灵古琴配合悠远洞箫，营造仙家洞府静谧修道氛围，特别利于发言讨论与盘逻辑。',
    duration: '04:38',
    badge: '静心盘道',
  },
  {
    id: 'wuting-erhu',
    file: '/audio/bgm-candidates/05-wuting-pansi-erhu.mp3',
    title: '《勿听》（盘丝情怨·幽深民乐二胡）',
    subtitle: '爱恨纠葛 · 弦音如诉 · 暗潮涌动',
    desc: '二胡深沉凄美，竹笛飘逸，展现西游神话中妖仙爱恨纷争，带有一丝神秘悬疑感。',
    duration: '04:20',
    badge: '悬疑暗涌',
  },
];

export function getSavedBgmTrack(): BackgroundMusicTrack {
  try {
    const id = localStorage.getItem(BGM_STORAGE_KEY);
    const found = BGM_CANDIDATES.find(c => c.id === id);
    if (found) return found;
  } catch {
    /* localStorage unavailable */
  }
  return BGM_CANDIDATES[0];
}

export const BACKGROUND_MUSIC: BackgroundMusic = {
  file: BGM_CANDIDATES[0].file,
  title: BGM_CANDIDATES[0].title,
};
