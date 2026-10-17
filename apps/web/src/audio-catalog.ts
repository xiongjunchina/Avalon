export interface BackgroundMusic { file: string; title: string }

// User-supplied recording, preserved byte-for-byte. The content hash avoids stale caches.
export const BACKGROUND_MUSIC: BackgroundMusic = {
  file: '/audio/v2/xiaoao-qinxiao-d7c6b9189e4e.mp3',
  title: '胡伟立 · 笑傲江湖曲（琴箫合奏）',
};
