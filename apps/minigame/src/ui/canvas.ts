import type { WechatPlatform } from '../platform/wechat.js';

export function drawShell(platform: WechatPlatform): HTMLCanvasElement {
  const canvas = platform.canvas();
  const screen = platform.screen();
  canvas.width = Math.round(screen.screenWidth * screen.pixelRatio);
  canvas.height = Math.round(screen.screenHeight * screen.pixelRatio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.scale(screen.pixelRatio, screen.pixelRatio);
  context.fillStyle = '#101b2a';
  context.fillRect(0, 0, screen.screenWidth, screen.screenHeight);
  context.textAlign = 'center';
  context.fillStyle = '#e8d5a8';
  context.font = 'bold 30px sans-serif';
  context.fillText('嘻游 · 真假猴王', screen.screenWidth / 2, screen.screenHeight * 0.38);
  context.font = '16px sans-serif';
  context.fillText('正在准备小游戏…', screen.screenWidth / 2, screen.screenHeight * 0.47);
  return canvas;
}
