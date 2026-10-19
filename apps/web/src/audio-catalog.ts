export interface BackgroundMusic { file: string; title: string }

// User-supplied recording, preserved byte-for-byte. The content hash avoids stale caches.
export const BACKGROUND_MUSIC: BackgroundMusic = {
  file: '/audio/v2/yungong-xunyin-f8c50d48a06f.mp3',
  title: '许镜清 · 云宫迅音（经典女声吟唱序曲版）',
};
