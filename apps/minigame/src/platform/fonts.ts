import type { WxRuntime } from './wechat.js';
import { setWebFonts } from '../ui/web-render.js';

// wx.loadFont takes a packaged local TrueType path and returns a Canvas family.
// https://developers.weixin.qq.com/minigame/dev/api/render/font/wx.loadFont.html
export function installWebFonts(wx: Pick<WxRuntime, 'loadFont'|'loadSubpackage'>, redraw:()=>void=()=>{}): void {
  if (!wx.loadFont) return;
  const loaded: Record<string, string> = {};
  for (const name of ['calligraphy', 'display', 'sans']) {
    try { const family = wx.loadFont('art/fonts/' + name + '.ttf'); if (family) loaded[name] = family; }
    catch { /* System font fallback keeps older runtimes usable. */ }
  }
  setWebFonts(loaded);
  if(wx.loadSubpackage)try{wx.loadSubpackage({name:'web-fonts',success:()=>{for(const weight of [500,600,700])try{const family=wx.loadFont!('web-fonts/sans'+weight+'.ttf');if(family)loaded['sans'+weight]=family;}catch{}try{const family=wx.loadFont!('web-fonts/homeInterface.ttf');if(family)loaded.homeInterface=family;}catch{}setWebFonts(loaded);redraw();},fail:()=>{}});}catch{}
}
