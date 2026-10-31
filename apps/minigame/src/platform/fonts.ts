import type { WxRuntime } from './wechat.js';
import { setWebFonts } from '../ui/web-render.js';

// Fonts use the same packaged TrueType sources as the web. Return a throttled
// retry hook so a temporary download failure does not leave system fonts forever.
export function installWebFonts(wx: Pick<WxRuntime, 'loadFont'|'loadSubpackage'>, redraw:()=>void=()=>{}, now:()=>number=Date.now): ()=>void {
  if (!wx.loadFont) return ()=>{};
  const loaded: Record<string, string> = {};
  for (const name of ['calligraphy', 'sans']) {
    try { const family = wx.loadFont('art/fonts/' + name + '.ttf'); if (family) loaded[name] = family; }
    catch { /* Keep system fallback available on older runtimes. */ }
  }
  setWebFonts(loaded);
  let loading=false,ready=false,retryAt=0;
  const retry=()=>{
    if(!wx.loadSubpackage||loading||ready||now()<retryAt)return;
    loading=true;
    const fail=()=>{loading=false;retryAt=now()+30000;};
    try{wx.loadSubpackage({name:'web-fonts',success:()=>{
      loading=false;
      for(const name of ['display','sans500','sans600','sans700','homeInterface']){
        if(loaded[name])continue;
        try{const family=wx.loadFont!('web-fonts/'+name+'.ttf');if(family)loaded[name]=family;}catch{}
      }
      ready=['display','sans500','sans600','sans700','homeInterface'].every(name=>!!loaded[name]);
      if(!ready)retryAt=now()+30000;
      setWebFonts(loaded);redraw();
    },fail});}catch{fail();}
  };
  retry();return retry;
}
