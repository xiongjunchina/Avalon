export interface BackgroundMusic { file: string; title: string }

// User-supplied recording, preserved byte-for-byte. The content hash avoids stale caches.
export const BACKGROUND_MUSIC: BackgroundMusic = {
  file: '/audio/v2/yungong-xunyin-f365f7a8901a.mp3',
  title: '许镜清 · 云宫迅音（86版西游记序曲）',
};
