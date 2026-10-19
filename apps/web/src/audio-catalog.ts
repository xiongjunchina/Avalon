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
    file: '/audio/bgm-candidates/01-yungong-symphony.mp3',
    title: '《云宫迅音》（大交响管弦乐史诗版）',
    subtitle: '宏大交响 · 铜管齐鸣 · 齐天大圣降临',
    desc: '全编制交响管弦乐团录制，铜管组与弦乐组层层推进，定音鼓震颤云霄，极具大片级史诗震撼感。',
    duration: '04:25',
    badge: '磅礴史诗',
  },
  {
    id: 'yungong-vocal-overture',
    file: '/audio/bgm-candidates/02-yungong-vocal-overture.mp3',
    title: '《云宫迅音》（经典女声吟唱序曲版）',
    subtitle: '空灵吟唱 · 电贝斯律动 · 86原汁原味情怀',
    desc: '保留86版西游记最经典的空灵女声吟唱（樊菲儿/许镜清原韵），配合标志性电声贝斯弹性节奏与笛音，童年回忆瞬间拉满。',
    duration: '02:56',
    badge: '经典情怀',
  },
  {
    id: 'yungong-concert-live',
    file: '/audio/bgm-candidates/03-yungong-concert-live.mp3',
    title: '《云宫迅音》（交响音乐会现场实况版）',
    subtitle: '剧院声场 · 自然混响 · 沉浸式临场感',
    desc: '保利剧院交响乐团现场实况大编制演奏，拥有极佳的剧院自然混响空间感，全场热血共鸣，身临其境。',
    duration: '05:03',
    badge: '现场实况',
  },
  {
    id: 'yungong-studio-master',
    file: '/audio/bgm-candidates/04-yungong-studio-master.mp3',
    title: '《云宫迅音》（殿堂主题高燃重置版）',
    subtitle: '录音室母带 · 国风弹拨与电声 · 动态张力拉满',
    desc: '顶级现代录音室重混母带，幽远序曲层层铺垫，古筝独奏穿插后爆发震撼电声鼓点与电吉他，层次最为饱满、动态张力最强。',
    duration: '05:06',
    badge: '现代高燃',
  },
  {
    id: 'yungong-electone-solo',
    file: '/audio/bgm-candidates/05-yungong-electone-solo.mp3',
    title: '《云宫迅音》（双排键电子琴一人乐团版）',
    subtitle: '一人成团 · 灵动电声 · 极致还原合成器神韵',
    desc: '知名双排键电子琴现场独奏（玖月奇迹王小玮演奏），一人手脚并用模拟百人乐团，极致还原许镜清当年开创性的电子合成器跳动韵律。',
    duration: '03:29',
    badge: '电子器乐',
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
