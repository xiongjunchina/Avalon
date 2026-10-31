import type { WxRuntime } from './wechat.js';

const avatarSide = 160;
const maxImageBytes = 8 * 1024 * 1024;
const maxDataUrlLength = 65536;

export async function chooseAvatar(wx: WxRuntime): Promise<string> {
  if (!wx.chooseImage || !wx.createImage || !wx.getFileSystemManager) throw new Error('当前微信版本不支持选择头像');
  if (wx.requirePrivacyAuthorize) await new Promise<void>((resolve, reject) => wx.requirePrivacyAuthorize!({success: resolve, fail: () => reject(new Error('请先同意隐私授权后再选择头像照片'))}));
  const chosen = await new Promise<{ path: string; size?: number }>((resolve, reject) => wx.chooseImage!({
    count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
    success: result => resolve({ path: result.tempFilePaths[0] ?? '', size: result.tempFiles?.[0]?.size }), fail: cause => { const message = String((cause as {errMsg?:string})?.errMsg ?? ''); reject(new Error(/cancel/i.test(message) ? 'AVATAR_CANCELLED' : /auth|deny|permission|privacy/i.test(message) ? '无法访问照片，请在微信设置中允许相册权限后重试' : '选择头像照片失败，请重试')); },
  }));
  if (!chosen.path) throw new Error('没有选中头像图片');
  if (chosen.size && chosen.size > maxImageBytes) throw new Error('请选择 8MB 以内的头像图片');
  // Subsequent createCanvas calls are off-screen but retain Canvas image export APIs.
  // OffscreenCanvas does not guarantee toTempFilePathSync.
  const canvas = wx.createCanvas() as unknown as import('./wechat.js').WxAvatarCanvas;
  canvas.width = avatarSide;
  canvas.height = avatarSide;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建头像画布');
  const image = wx.createImage();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('读取头像照片超时，请重新选择')); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('无法读取头像图片')); };
    image.src = chosen.path;
  });
  const side = Math.min(image.width, image.height);
  if (!side) throw new Error('头像图片尺寸无效');
  context.drawImage(image as unknown as CanvasImageSource, Math.floor((image.width - side) / 2), Math.floor((image.height - side) / 2), side, side, 0, 0, avatarSide, avatarSide);
  const files = wx.getFileSystemManager();
  for (const quality of [0.82, 0.64, 0.45]) {
    const path = canvas.toTempFilePathSync({ fileType: 'jpg', quality });
    const encoded = files.readFileSync(path, 'base64');
    if (typeof encoded !== 'string') throw new Error('无法编码头像图片');
    const result = `data:image/jpeg;base64,${encoded}`;
    if (result.length <= maxDataUrlLength) return result;
  }
  throw new Error('头像压缩后仍过大，请选择更简单的图片');
}
