import {blurBackdrop} from './backdrop.js';
import {setDocumentTextMeasurer} from './web-document-layout.js';
import type { Artwork } from './assets.js';
import { hitTest, wrapText, type HitRegion, type SafeViewport } from './layout.js';
import { layoutWebScreen, type WebNode, type WebLayout } from './web-layout.js';
import type { ScreenModel } from './widgets.js';

// Matches apps/web/src/scenes.css (Scheme A-2).
const cnSans = '"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,-apple-system,sans-serif';
const cnKaiti = '"STKaiti","Kaiti SC","Ma Shan Zheng",' + cnSans;
const documentWidths=new Map<string,number>();
let backdropFactory:(()=>HTMLCanvasElement)|undefined,fontRevision=0;
const backdrops=new WeakMap<HTMLCanvasElement,{key:string;canvas:HTMLCanvasElement}>();
export function setBackdropCanvasFactory(factory:()=>HTMLCanvasElement){backdropFactory=factory;}
function drawBlurredBackdrop(canvas:HTMLCanvasElement,ctx:CanvasRenderingContext2D,v:SafeViewport,underlay:ScreenModel,artwork?:Artwork){
  const factory=backdropFactory??(canvas.ownerDocument?()=>canvas.ownerDocument.createElement('canvas'):undefined);if(!factory)return;
  const key=JSON.stringify([underlay,v.width,v.height,v.top,v.bottom,artwork?.revision??0,fontRevision]);let cached=backdrops.get(canvas);
  if(cached?.key!==key){const buffer=cached?.canvas??factory();buffer.width=Math.round(v.width);buffer.height=Math.round(v.height);const bc=buffer.getContext('2d');if(!bc||!bc.getImageData||!bc.putImageData)return;
    try{bc.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,buffer.width,buffer.height);const pixels=bc.getImageData(0,0,buffer.width,buffer.height);if(!pixels?.data)return;blurBackdrop(pixels.data,buffer.width,buffer.height);bc.putImageData(pixels,0,0);}catch{return;}cached={key,canvas:buffer};backdrops.set(canvas,cached);}
  ctx.drawImage(cached.canvas,0,0,v.width,v.height);
}
let sans = cnSans;
let homeInterface='"Home Interface",'+cnSans;
let nativeSans=false;
const sansWeights:Record<string,string>={};
let display = '"ZCOOL XiaoWei",' + cnSans;
let calligraphy = '"Ma Shan Zheng",' + cnKaiti;
export function setWebFonts(fonts: { homeInterface?:string;sans500?:string;sans600?:string;sans700?:string;sans?: string; display?: string; calligraphy?: string }) {
  documentWidths.clear();fontRevision++;if(fonts.homeInterface)homeInterface=JSON.stringify(fonts.homeInterface)+','+cnSans;
  if(fonts.sans){sans=JSON.stringify(fonts.sans)+','+cnSans;nativeSans=true;}
  for(const key of ['sans500','sans600','sans700'] as const)if(fonts[key])sansWeights[key.slice(4)]=JSON.stringify(fonts[key])+','+cnSans;
  if (fonts.display) display = JSON.stringify(fonts.display) + ',' + cnSans;
  if (fonts.calligraphy) calligraphy = JSON.stringify(fonts.calligraphy) + ',' + cnKaiti;
}
const clamp = (a: number, value: number, b: number) => Math.max(a, Math.min(value,b));
export const webTheme = {
  accent: '#ffd875', border: '#d4a359', text: '#fff8ef', muted: '#eddcc4',
  surface: 'rgba(48,16,14,.94)', raised: 'rgba(66,22,20,.96)', ink: 'rgba(26,8,8,.98)',
  blue: '#5ef2ff', red: '#f87171', cyan: '#27657b', brand: '#7d231f',
};
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 14) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arc(x+w-r,y+r,r,-Math.PI/2,0);
  ctx.lineTo(x+w,y+h-r);ctx.arc(x+w-r,y+h-r,r,0,Math.PI/2);
  ctx.lineTo(x+r,y+h);ctx.arc(x+r,y+h-r,r,Math.PI/2,Math.PI);
  ctx.lineTo(x,y+r);ctx.arc(x+r,y+r,r,Math.PI,Math.PI*1.5);ctx.closePath();
}
function cornerRect(ctx:CanvasRenderingContext2D,n:WebNode,tl:number,tr:number,br:number,bl:number) {
  const {x,y,width:w,height:h}=n;
  ctx.beginPath();ctx.moveTo(x+tl,y);ctx.lineTo(x+w-tr,y);ctx.quadraticCurveTo(x+w,y,x+w,y+tr);
  ctx.lineTo(x+w,y+h-br);ctx.quadraticCurveTo(x+w,y+h,x+w-br,y+h);ctx.lineTo(x+bl,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-bl);
  ctx.lineTo(x,y+tl);ctx.quadraticCurveTo(x,y,x+tl,y);ctx.closePath();
}
function fill(ctx: CanvasRenderingContext2D, n: WebNode, color: string | CanvasGradient, radius = 14, border = webTheme.border) {
  rect(ctx, n.x, n.y, n.width, n.height, radius); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = n.selected ? 2 : 1; ctx.stroke();
}
function gradient(ctx: CanvasRenderingContext2D, n: WebNode, colors: string[],angle=155) {
  const rad=angle*Math.PI/180,dx=Math.sin(rad),dy=-Math.cos(rad),length=Math.abs(n.width*dx)+Math.abs(n.height*dy),cx=n.x+n.width/2,cy=n.y+n.height/2;
  const value = ctx.createLinearGradient(cx-dx*length/2,cy-dy*length/2,cx+dx*length/2,cy+dy*length/2);
  colors.forEach((color, index) => value.addColorStop(index / (colors.length - 1), color)); return value;
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 14, color = webTheme.text, align: CanvasTextAlign = 'center', family = sans, weight = '400', spacing = 0) {
  ctx.textAlign = align; ctx.textBaseline = 'middle'; const sansWeight=String(Math.min(700,Math.max(400,Math.round(Number(weight)/100)*100)));
  const useFamily=family===sans&&nativeSans?(sansWeights[sansWeight]??sans):family,useWeight=family===sans&&!nativeSans?sansWeight:family.startsWith('-apple-system')?weight:'400';
  ctx.font = useWeight+' ' + size + 'px ' + useFamily; ctx.fillStyle = color;
  let glyphs = Array.from(value);
  const measure = () => ctx.measureText(glyphs.join('')).width + Math.max(0,glyphs.length-1)*spacing;
  while (glyphs.length && measure() > width) glyphs.pop();
  if(glyphs.join('')!==value && glyphs.length) glyphs[glyphs.length-1]='…';
  if(spacing) {
    let px=x-(align==='center'?measure()/2:align==='right'?measure():0);
    ctx.textAlign='left';for(const char of glyphs){ctx.fillText(char,px,y);px+=ctx.measureText(char).width+spacing;}
  } else ctx.fillText(glyphs.join(''),x,y);

}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string | CanvasGradient, line = webTheme.border) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke();
}
function portrait(ctx: CanvasRenderingContext2D, n: WebNode, artwork?: Artwork, round = false) {
  const x = n.x, y = n.y, width = n.width, height = n.height;
  ctx.save();
  if (round) { circle(ctx, x + width / 2, y + height / 2, width / 2, '#210d0b',n.team==='blue'?'#38bdf8':n.team==='red'?'#f87171':webTheme.border); ctx.clip(); }
  else { rect(ctx, x, y, width, height, 12); ctx.clip(); }
  const img = n.image ? artwork?.get(n.image) : undefined;
  if (img?.width && img.height) {
    const scale = Math.max(width / img.width, height / img.height);
    ctx.drawImage(img as CanvasImageSource, x + (width - img.width * scale) / 2, y + (height - img.height * scale) / 2, img.width * scale, img.height * scale);
  } else { ctx.fillStyle = '#25100e'; ctx.fillRect(x, y, width, height); text(ctx, '☯', x + width / 2, y + height / 2, width, Math.min(42, width / 2), webTheme.accent); }
  ctx.restore();
  if (round && n.kind==='seat') {
    ctx.beginPath();ctx.arc(x+width/2,y+height/2,width/2,0,Math.PI*2);ctx.strokeStyle=n.team==='blue'?'#38bdf8':n.team==='red'?'#f87171':webTheme.border;ctx.lineWidth=1;ctx.stroke();
  } else if (round) {
    for (const inset of [0, 5, -5]) { ctx.beginPath(); ctx.arc(x + width / 2, y + height / 2, width / 2 + inset, 0, Math.PI * 2); ctx.strokeStyle = inset === 0 ? webTheme.accent : '#d4a35977'; ctx.lineWidth = inset === 0 ? 3 : 1; ctx.stroke(); }
  } else { rect(ctx, x, y, width, height, 12); ctx.strokeStyle = n.team === 'blue' ? '#5ef2ff88' : '#ef444488'; ctx.stroke(); }
}
function art(ctx: CanvasRenderingContext2D, artwork: Artwork | undefined, name: string, x: number, y: number, w: number, h: number) {
  const img = artwork?.get('symbols/' + name + '.png');
  if (img) ctx.drawImage(img as CanvasImageSource,x,y,w,h);
}
function shadow(ctx: CanvasRenderingContext2D, color = 'rgba(0,0,0,.65)', blur = 12, dy = 4) { ctx.shadowColor=color; ctx.shadowBlur=blur; ctx.shadowOffsetY=dy; }
function edge(ctx: CanvasRenderingContext2D, n: WebNode, r=14) {
  rect(ctx,n.x+1.5,n.y+1.5,n.width-3,n.height-3,r);ctx.strokeStyle='rgba(255,230,160,.24)';ctx.lineWidth=1;ctx.stroke();
}
function arenaFill(ctx: CanvasRenderingContext2D,n:WebNode) {
  rect(ctx,n.x,n.y,n.width,n.height,20);ctx.save();ctx.clip();
  ctx.translate(n.x+n.width/2,n.y+n.height/2);ctx.scale(n.width/2,n.height/2);
  const value=ctx.createRadialGradient?.(0,0,0,0,0,Math.SQRT2);
  if(value?.addColorStop){value.addColorStop(0,'rgba(55,18,16,.45)');value.addColorStop(.6,'rgba(26,8,8,.72)');value.addColorStop(1,'rgba(12,3,3,.92)');ctx.fillStyle=value;}
  else ctx.fillStyle='rgba(26,8,8,.72)';
  ctx.fillRect(-1,-1,2,2);ctx.restore();
  rect(ctx,n.x,n.y,n.width,n.height,20);ctx.strokeStyle='#d4a35959';ctx.lineWidth=1;ctx.stroke();
}
function utilityFill(ctx:CanvasRenderingContext2D,n:WebNode) {
  const {x,y,width:w,height:h}=n;
  ctx.save();ctx.beginPath();ctx.moveTo(x+4,y);ctx.lineTo(x+w-4,y);ctx.lineTo(x+w,y+h/2);ctx.lineTo(x+w-4,y+h);ctx.lineTo(x+4,y+h);ctx.lineTo(x,y+h/2);ctx.closePath();ctx.clip();
  // CSS clips the rectangular border to this hexagon; it does not stroke its diagonals.
  fill(ctx,n,gradient(ctx,n,['#441715','#200908']),6,'#e5b567');ctx.restore();
}
function rule(ctx: CanvasRenderingContext2D,n:WebNode,color='rgba(212,163,89,.4)') {ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(n.x+n.width,n.y);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();}
function soundIcon(ctx: CanvasRenderingContext2D, x:number,y:number) {
  ctx.save();ctx.strokeStyle='#eddcc4';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x-6,y-3);ctx.lineTo(x-3,y-3);ctx.lineTo(x+1,y-6);ctx.lineTo(x+1,y+6);ctx.lineTo(x-3,y+3);ctx.lineTo(x-6,y+3);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(x+4,y-3);ctx.lineTo(x+9,y+3);ctx.moveTo(x+9,y-3);ctx.lineTo(x+4,y+3);ctx.stroke();ctx.restore();
}
function drawSeatMicBadge(ctx: CanvasRenderingContext2D, x: number, y: number, state: 'live'|'speaking'|'muted'|'unjoined') {
  const r = 9, cx = x + r, cy = y + r;
  ctx.save();
  if (state === 'speaking') {
    ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    shadow(ctx, 'rgba(74, 222, 128, 0.8)', 8, 0);
  } else if (state === 'live') {
    shadow(ctx, 'rgba(34, 197, 94, 0.5)', 6, 0);
  } else if (state === 'muted') {
    shadow(ctx, 'rgba(239, 68, 68, 0.4)', 5, 0);
  } else {
    shadow(ctx, 'rgba(0, 0, 0, 0.6)', 3, 1);
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (state === 'speaking') { ctx.fillStyle = '#19523a'; ctx.strokeStyle = '#4ade80'; }
  else if (state === 'live') { ctx.fillStyle = '#153e2e'; ctx.strokeStyle = '#22c55e'; }
  else if (state === 'muted') { ctx.fillStyle = '#3d1417'; ctx.strokeStyle = '#ef4444'; }
  else { ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'; }
  ctx.fill(); ctx.lineWidth = 1.3;
  if (state === 'unjoined') ctx.setLineDash([2, 2]);
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();

  ctx.save();
  const iconColor = state === 'speaking' ? '#86efac' : state === 'live' ? '#4ade80' : state === 'muted' ? '#f87171' : '#94a3b8';
  ctx.strokeStyle = iconColor; ctx.fillStyle = iconColor; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.rect(cx - 1.8, cy - 4.2, 3.6, 5.5);
  if (state === 'live' || state === 'speaking') ctx.fill(); else ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy - 1, 3.5, 0, Math.PI, false); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy + 2.5); ctx.lineTo(cx, cy + 4.5);
  ctx.moveTo(cx - 2.5, cy + 4.5); ctx.lineTo(cx + 2.5, cy + 4.5); ctx.stroke();
  if (state === 'muted' || state === 'unjoined') {
    ctx.beginPath(); ctx.moveTo(cx - 4.5, cy - 4.5); ctx.lineTo(cx + 4.5, cy + 4.5);
    ctx.lineWidth = 1.4; ctx.strokeStyle = state === 'muted' ? '#ef4444' : '#64748b'; ctx.stroke();
  }
  ctx.restore();
}
function drawDocumentNode(ctx:CanvasRenderingContext2D,n:WebNode,model:ScreenModel,artwork?:Artwork) {
  if(n.kind==='hitbox'||n.skin==='hitbox')return;
  const cx=n.x+n.width/2,cy=n.y+n.height/2;
  const family=n.fontFace==='system'?'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif':n.fontFace==='display'?display:n.fontFace==='calligraphy'?calligraphy:sans;
  const privateNotice=model.web?.document?.kind==='private-notice';
  const color=n.id==='mirror-footnote'?'#bfa882':n.id==='mirror-waiting'?'#fff4d0':n.id==='mirror-prompt'||n.id==='mirror-waiting-detail'?'#faebd7':privateNotice?(n.id==='notice-title'?'#ffe5ae':n.tone==='green'?'#9bf4cf':n.tone==='red'?'#ffc1b6':n.tone==='blue'?'#93c5fd':n.tone==='gold'?'#ffd875':n.tone==='muted'?'#eddcc4':'#fff8ef'):model.web?.document?.kind==='treasures'&&['treasure-role-description','treasure-role-note','bell-consumption','bell-unavailable'].includes(n.id)?'#e8d7b8':n.tone==='red'?'#f87171':n.tone==='green'?'#34d399':n.tone==='blue'?'#7dd3fc':n.tone==='gold'?'#ffd875':n.tone==='muted'?(['admin','admin-friends','special-editor','code-editor'].includes(model.web?.document?.kind??'')?'#94a3b8':'#cbdbe8'):['admin','admin-friends','special-editor','code-editor'].includes(model.web?.document?.kind??'')?'#e2e8f0':'#fff2d5';
  const write=(value:string,x:number,y:number,w:number,size=n.fontSize??13,align:CanvasTextAlign=n.align??'center',font=family,weight=n.weight??'400',c=color)=>text(ctx,value,x,y,w,size,c,align,font,weight,n.letterSpacing??0);
  const box=(skin=n.skin)=>{
    const colors:Record<string,string[]>={
      'quiet-button':['#220d0b99','#220d0b99'],'auth-frame':['#3a1418f5','#170807fa'],'auth-tab':n.selected?['#254b56','#173b49']:['#321c1c','#321c1c'],'preference-submit':['#d4a359','#8b6020'],'sound-frame':['#2a4962','#102b42'],'treasure-frame':['#1f110e','#150a08'],'dialog-frame':['#152e49d9','#112b44db'],'social-code':['#2e1412cc','#180a0ce6'],'social-tab':n.selected?['#5a2d19f2','#3c1914f2']:['#1e1012b3','#1e1012b3'],'social-primary':['#f5a623','#d97706'],'social-remove':['#321014b3','#321014b3'],'social-chat':['#0284c7','#0369a1'], 'vote-frame':['#240a09','#170505','#0d0202'],
      'page-heading':['#3a1418ed','#1c0908f7'], 'card':['#3a1418ed','#1c0908f7'], 'knowledge':['#102b43b8','#102b43b8'],
      'profile-frame':['#16344edb','#16344edb'],'account-profile':['#102b43bd','#102b43bd'],'profile':['#14374fda','#14374fda'],'preset-card':['#3a1418ed','#1c0908f7'],'history-card':['#3a1418ed','#1c0908f7'], 'profile-toggle':['#16344edb','#16344edb'],
      'guide-gallery':['#00000040','#00000040'],'guide-role-blue':['#18354cdb','#18354cdb'],'guide-role-red':['#3a2e41d6','#3a2e41d6'],'guide-step':['#0910178c','#0910178c'],'hint':['#102a40e8','#102a40e8'],'tip':['#e5b96420','#b48c4614'], 'progress':['#100303','#100303'],
      'expedition':['#271629','#160d1c'], 'tabs':['#30100ef5','#1c0908f7'], 'metrics':['#3a1418ed','#1c0908f7'],
      'success-hero':['#104539ee','#09251fee'],'failure-hero':['#5b1b17ee','#2b0c0aee'],
      'input':['#1e0a09e6','#1e0a09e6'],'accordion':['#3b1409aa','#1e0808ee'],
      'gold-button':['#ffd875','#f5a623','#d97706'], 'dragon-button':['#6d2718','#32100c'],
      'vote-prompt':['#2d0b09','#1e0706'], 'setting':['#112c42bb','#112c42bb'],
      'treasure-entry':['#112b43b0','#112b43b0'],'submitted':['#123c30dd','#0a241ddd'],
      'faction-blue':['#163354ee','#071d30f5'],'faction-red':['#421221ee','#210810f5'],'cyan-button':['#5ef2ff','#24b8cc'],'toast':['#11273bfa','#0b1929fa'],'warning':['#551812eb','#551812eb'],'captain-banner':['#0b4e64','#16808b'], 'message':['#112a40ed','#112a40ed'],
    };
    let radius=skin==='vote-prompt'?999:skin==='profile-frame'?18:n.id==='overlayClose'&&model.web?.document?.kind==='identity'&&n.primary?10:skin==='treasure-frame'?18:skin==='preference-submit'?22:skin==='auth-frame'?24:skin==='auth-tab'?6:skin==='quiet-button'?24:skin==='sound-frame'?24:skin==='account-profile'?20:skin==='preset-card'||skin==='history-card'?18:skin==='social-tab'?10:skin==='social-code'?16:skin==='social-primary'?8:skin==='social-remove'?24:skin==='social-chat'?8:['dialog-frame'].includes(skin??'')?24:skin==='page-heading'?0:skin==='vote-frame'?18:['pill','tabs','button','gold-button','dragon-button'].includes(skin??'')?24:skin==='input'?14:skin==='voter-chip'?5:12;
    const colorsNow=colors[skin??'']??(n.selected?['#27657b','#15404f']:['#3e1614eb','#1c0908f5']);
    ctx.save();if(['sound-frame','auth-frame','dialog-frame','vote-frame','card','gold-button','pill','button','social-primary','social-chat','social-remove','social-tab'].includes(skin??''))shadow(ctx,'#00000099',['dialog-frame','sound-frame','auth-frame'].includes(skin??'')?24:12,['dialog-frame','sound-frame','auth-frame'].includes(skin??'')?8:4);
    if(skin==='dialog-frame'){fill(ctx,n,'#152e49',24);ctx.shadowColor='transparent';ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;const scene=model.web?.document?.kind==='presets'?'library':model.web?.background??'pavilion';const bg=artwork?.get('scenes/'+scene+'.webp');if(bg?.width&&bg.height){ctx.save();rect(ctx,n.x,n.y,n.width,n.height,24);ctx.clip();const scale=Math.max(n.width/bg.width,n.height/bg.height);ctx.drawImage(bg as CanvasImageSource,n.x+(n.width-bg.width*scale)/2,n.y+(n.height-bg.height*scale)*(scene==='sword'?.4:scene==='pavilion'?.55:scene==='gate'?.46:.5),bg.width*scale,bg.height*scale);ctx.restore();ctx.shadowBlur=0;}}
    fill(ctx,n,gradient(ctx,n,colorsNow,skin==='dialog-frame'?180:skin==='sound-frame'?145:skin==='vote-frame'?175:['gold-button','social-primary','social-tab','social-chat'].includes(skin??'')?135:155),skin==='guide-step'?6:radius,skin==='social-primary'?'#ffd54f':skin==='social-chat'?'#7dd3fc':skin==='social-remove'?'#ff4d4f4d':skin==='guide-step'?'#ffffff0d':skin==='dialog-frame'?'#d4a359':skin==='vote-frame'?'#e0aa3e':n.selected?'#ffd875':skin==='quiet-button'?'transparent':['pill','button','gold-button','sound-frame'].includes(skin??'')?'#d4a359':'#d4a35966');ctx.restore();
    if(['dialog-frame','sound-frame','auth-frame'].includes(skin??'')){ctx.save();rect(ctx,n.x+1,n.y+1,n.width-2,n.height-2,radius-1);const edge=ctx.createLinearGradient(0,n.y,0,n.y+n.height);edge.addColorStop(0,'#ffebb473');edge.addColorStop(.2,'#efd89e40');edge.addColorStop(1,'#efd89e40');ctx.strokeStyle=edge;ctx.lineWidth=1;ctx.stroke();ctx.restore();}
  };
  const image=(path:string|undefined,x:number,y:number,w:number,h:number,round=false)=>{
    const img=path?artwork?.get(path):undefined;
    ctx.save();if(round){ctx.beginPath();ctx.arc(x+w/2,y+h/2,w/2,0,Math.PI*2);ctx.clip();}
    if(img?.width&&img.height){const scale=Math.max(w/img.width,h/img.height);ctx.drawImage(img as CanvasImageSource,x+(w-img.width*scale)/2,y+(h-img.height*scale)/2,img.width*scale,img.height*scale);}else {ctx.fillStyle='#10283b';ctx.fillRect(x,y,w,h);art(ctx,artwork,'cards',x+w*.2,y+h*.2,w*.6,h*.6);}
    ctx.restore();
  };
  if(n.skin==='room-chat-bubble'){ctx.save();shadow(ctx,'#000000cc',16,4);fill(ctx,n,'#16101cf5',8,'#ffd875');ctx.restore();ctx.beginPath();ctx.moveTo(cx-6,n.y+n.height);ctx.lineTo(cx+6,n.y+n.height);ctx.lineTo(cx,n.y+n.height+6);ctx.closePath();ctx.fillStyle='#ffd875';ctx.fill();(n.lines??[n.text]).forEach((line,i)=>write(line,cx,n.y+6.5+8.1+i*16.2,n.width-20,12,'center',sans,'600','#fff4d0'));return;}
  if(n.skin==='select-menu'){fill(ctx,n,'#24100e',4,'#d4a359');return;}
  if(n.skin==='select-option'){fill(ctx,{...n,selected:false},n.selected?'#266778':'#24100e',0,'transparent');write(n.text,n.x+10,cy,n.width-20,13,'left',sans,'400','#fff8ef');return;}
  if(n.skin==='admin-textarea'){fill(ctx,{...n,selected:false},'#0b0f17d9',8,'#d4a3594d');(n.lines??[n.text]).forEach((line,i)=>write(line,n.x+12,n.y+16+i*20,n.width-24,13.5,'left',family,'400',n.selected?'#f8fafc':'#808080'));return;}
  if(n.skin==='admin-broadcast-check'){fill(ctx,{...n,selected:false,x:n.x+4,y:cy-6.5,width:13,height:13},n.selected?'#1683fa':'#454545',2,'#999');if(n.selected)write('✓',n.x+10.5,cy,12,11,'center',sans,'700','#fff');const lines=n.lines??[n.text];lines.forEach((line,i)=>write(line,n.x+27,cy+(i-(lines.length-1)/2)*19.5,n.width-27,13,'left',family,'400','#e2e8f0'));return;}
  if(n.skin==='admin-select'||n.skin==='web-select'){const web=n.skin==='web-select';fill(ctx,n,web?'#1e0a09e6':'#0b0f17d9',web?14:8,web?'#d4a35988':'#d4a3594d');write(n.text,n.x+12,cy,n.width-32,web?16:13.5,'left',family,'400','#f8fafc');ctx.beginPath();ctx.moveTo(n.x+n.width-12,cy-2);ctx.lineTo(n.x+n.width-8,cy+2);ctx.lineTo(n.x+n.width-4,cy-2);ctx.strokeStyle='#f8fafc';ctx.lineWidth=1.5;ctx.stroke();return;}
  if(n.skin==='identity-return'){ctx.save();shadow(ctx,'#00000066',10,3);fill(ctx,n,gradient(ctx,n,['#ffd875','#f5a623','#d97706'],135),10,'#ffe599');write(n.text,cx,cy,n.width-16,14,'center',sans,'700','#1e0908');ctx.restore();return;}
  if(n.skin==='admin-room-heading'){(n.lines??[n.text]).forEach((line,i)=>write(line,n.x,n.y+(i?29+(i-1)*16:11),n.width,16,'left',display,'400','#f8fafc'));return;}
  if(n.skin==='admin-special-card'){fill(ctx,n,'transparent',8,'#ffffff14');return;}
  if(n.skin==='admin-rule'){rule(ctx,n,'#ffffff14');return;}
  if(n.skin==='admin-password-frame'){fill(ctx,n,'transparent',12,'#d4a3598c');return;}
  if(n.skin==='admin-radio'){circle(ctx,n.x+7,cy,6.5,n.selected?'#1683fa':'#fff','#aab1ba');if(n.selected)circle(ctx,n.x+7,cy,2.5,'white','transparent');write(n.text,n.x+20,cy,n.width-20,12.5,'left',family,'600','#cbd5e1');return;}
  if(n.skin==='admin-count'){ctx.save();ctx.lineWidth=1.5;circle(ctx,cx,cy,Math.min(17,n.width/2),n.selected?'#266778':'#240d0b',n.selected?'#a5f3fc':'#ffd875');if(n.selected)circle(ctx,cx,cy,Math.min(17,n.width/2)+4,'transparent','#a5f3fc');ctx.restore();write(n.text,cx,cy,n.width,13,'center',family,'600');return;}
  if(n.skin==='admin-toggle'){rule(ctx,{...n,y:n.y+n.height},'#d6c29766');write(n.text,n.x,cy,n.width-56,13,'left',family,'400','#e2e8f0');fill(ctx,{...n,x:n.x+n.width-40,y:cy-11,width:40,height:22},n.selected?'#216d7e':'#445567',11,n.selected?'#a5f3fc':'#b8c5cf');circle(ctx,n.x+n.width-(n.selected?12:28),cy,8,n.selected?'#dbfff9':'#e5edf1','transparent');return;}
  if(n.skin==='admin-friend-row'){fill(ctx,n,'#1e293b80',6,'transparent');return;}
  if(n.skin==='admin-web-input'){fill(ctx,n,'#1e0a09e6',14,'#d4a35999');write(n.text,n.x+12,cy,n.width-24,13.5,'left',family,'400','#f8fafc');return;}
  if(n.skin==='admin-table-head'||n.skin==='admin-table-cell'){fill(ctx,n,n.skin==='admin-table-head'?'#0f1520f2':'#0b0f1799',0,'#ffffff0a');write(n.text,n.x+14,cy,n.width-28,n.fontSize??13,'left',family,n.skin==='admin-table-head'?'600':'400',n.skin==='admin-table-head'?'#94a3b8':n.tone==='gold'?'#ffd875':n.tone==='green'?'#4ade80':'#cbd5e1');return;}
  if(n.skin==='admin-user-code'){fill(ctx,n,'#ffd8751f',4,'#ffd87540');write(n.text,cx,cy,n.width-10,12,'center','monospace','400','#ffd875');return;}
  if(n.skin==='admin-membership'){fill(ctx,n,n.selected?'#d4a35926':'#38bdf81a',4,n.selected?'#d4a35966':'#38bdf833');write(n.text,cx,cy,n.width-6,11,'center',family,'600',n.selected?'#ffd875':'#38bdf8');return;}
  if(n.skin?.startsWith('admin-')){
    const skin=n.skin,primary=skin==='admin-primary',banner=skin==='admin-banner',tab=skin==='admin-tab',header=skin==='admin-header',metric=skin==='admin-metric',status=skin==='admin-status';
    const bg=skin==='admin-back'?'#121826':skin==='admin-nav'?'#0b0f17fa':skin==='admin-user-card'?'#121826e6':primary?gradient(ctx,n,['#d4af37','#aa820a'],135):banner?gradient(ctx,n,['#143228e6','#0f231efa']):header?'#0f1520f5':status?'#4ade801f':tab?(n.selected?'#d4a35929':'#ffffff0a'):skin==='admin-input'?'#0b0f17d9':metric||skin==='admin-card'?'#121826d9':'#1e293bbf';
    ctx.save();if(n.disabled)ctx.globalAlpha=primary?.6:.45;if(n.kind==='button'&&skin!=='admin-input'&&skin!=='admin-checkbox'){ctx.shadowColor=tab&&n.selected?'#d4a3591f':'#d4a35966';ctx.shadowBlur=tab&&n.selected?10:16;ctx.shadowOffsetY=tab&&n.selected?0:3;}
    if(skin!=='admin-checkbox')fill(ctx,{...n,selected:false},bg,header||skin==='admin-nav'?0:skin==='admin-back'?8:skin==='admin-user-card'?10:status?999:primary||tab||skin==='admin-input'?8:metric||banner||skin==='admin-card'?12:6,banner?'#10b981':status?'#4ade804d':primary?'transparent':n.selected?'#d4a35973':n.tone==='red'?'#ef444459':header?'#d4a3594d':tab?'transparent':skin==='admin-nav'?'#ffffff14':skin==='admin-user-card'?'#ffffff14':skin==='admin-card'?'#ffffff14':skin==='admin-input'?'#d4a3594d':'#94a3b84d');
    ctx.shadowColor='transparent';
    if(metric){write(n.detail??'',n.x+16,n.y+24,n.width-32,12,'left',sans,'400','#94a3b8');write(n.text,n.x+16,n.y+50,n.width-32,24,'left',display,'400','#ffd875');}
    else if(n.kind!=='panel'){const lines=n.lines??[n.text],lh=n.lineHeight??20;lines.forEach((line,i)=>{const ty=lines.length>1?n.y+14+i*lh:cy;if(ty<n.y+n.height-4)write(line,lines.length>1||skin==='admin-input'?n.x+12:cx,ty,n.width-(skin==='admin-input'?24:8),n.fontSize??13,lines.length>1||skin==='admin-input'?'left':'center',family,n.weight??(skin==='admin-tool'||primary||tab?'700':'400'),primary?'#0b0f17':status?'#4ade80':n.tone==='red'?'#fca5a5':n.selected?'#ffd875':'#cbd5e1');});}
    ctx.restore();return;
  }
  if(n.skin==='chapter-option'){fill(ctx,n,'#220b0af5',0,'#d4a35933');write(n.text,n.x+12,cy,n.width-24,13,'left',sans,'400','#fff2d5');return;}
  if(n.skin==='plain-summary'){write(n.text,n.x,cy,n.width,13,'left',family,'400','#ffd875');return;}
  if(n.skin==='replay-heading'){fill(ctx,n,'#1e0908cc',12,'transparent');write(n.text,n.x+8,cy,n.width-110,30,'left',display);return;}
  if(n.skin==='replay-hero'){fill(ctx,n,'#1e0908cc',24,'#e5b964');return;}
  if(n.skin==='replay-captain'){circle(ctx,n.x+20,cy,21,'#210d0b','#e5b964');image(n.image,n.x+1,cy-19,38,38,true);write((n.count??'')+'号 '+n.text,n.x+52,cy,n.width-58,13,'left',sans,'400','#ffe3af');return;}
  if(n.skin==='guide-emblem'){if(n.image)art(ctx,artwork,n.image.slice(8,-4),n.x,n.y,n.width,n.height);return;}
  if(n.skin==='guide-mission'){rule(ctx,n,'#d4a35966');write(n.badge??'',cx,n.y+14,n.width-4,9,'center',sans,'400','#eddcc4');write(n.detail??'',cx,n.y+35,n.width-4,14,'center',display,'400','#ffd875');return;}
  if(n.skin==='rule'){rule(ctx,n,'#d0be8d66');return;}
  if(n.skin==='current-summary'){fill(ctx,n,'#280e0de6',10,'#e5b96499');const parts=n.id==='current-round'?n.text.split('    '):n.id==='mission-overview-heading'?n.text.split(' · '):[n.text];if(parts.length>1){write(parts[0]!,n.x+10,cy,n.width-118,n.id==='mission-overview-heading'?16:12,'left',n.id==='mission-overview-heading'?display:sans,'400','#ffd875');write(parts[1]!,n.x+n.width-10,cy,112,n.id==='mission-overview-heading'?10.5:12,'right',sans,'400','#eddcc4');}else write(n.text,cx,cy,n.width-16,12,'center',sans,'400','#ffd875');return;}
  if(n.skin==='text'||n.skin==='section-title'||n.skin==='page-heading') {
    if(n.skin==='page-heading')box('page-heading');
    if(n.skin==='section-title'){const g=ctx.createLinearGradient(n.x,n.y,n.x+n.width,n.y);g.addColorStop(0,'#3a141299');g.addColorStop(.5,'#1e0a0cbf');g.addColorStop(1,'#3a141299');fill(ctx,n,g,10,'#d9c39266');}
    const lines=n.lines??n.text.split('\n'),lh=n.lineHeight??(n.fontSize??13)*1.5;
    lines.forEach((line,i)=>write(line,n.align==='left'?n.x:n.align==='right'?n.x+n.width:cx,n.y+lh/2+i*lh,n.width,n.fontSize??13,n.align??'center'));
    return;
  }
  if(n.skin==='result-hero') {
    const info=JSON.parse(n.detail??'{}') as {won?:boolean;self?:string;reason?:string;teams?:{team:string;players:string[]}[]};
    fill(ctx,n,gradient(ctx,n,['#3a1418ed','#1c0908f7']),22,'#e5b964');
    circle(ctx,n.x+40,n.y+36,23,'#e5b96422','#e5b96477');write(info.won?'🏆':'⚖️',n.x+40,n.y+36,42,27);
    write(info.won?'VICTORY · 你的阵营获胜':'MATCH RESULT · 本局结算',n.x+76,n.y+23,n.width-212,10,'left',sans,'700','#ffd875');
    write(n.text,n.x+76,n.y+47,n.width-212,Math.min(21,(n.width-212)/5),'left',display,'700','#ffd875');
    fill(ctx,{...n,x:n.x+16,y:n.y+70,width:n.width-32,height:36},'#0d111ddd',9,'#d4a35944');write((n.team==='blue'?'🛡 蓝方获胜':n.team==='red'?'⚔ 红方获胜':'本局不计胜负')+'  '+(info.reason??''),n.x+27,n.y+88,n.width-54,12,'left',sans,'600','#e5decb');
    fill(ctx,{...n,x:n.x+n.width-126,y:n.y+18,width:110,height:40},'#17314bdd',8,'#7dd3fc88');write('我的底牌',n.x+n.width-71,n.y+29,100,10,'center',sans,'400','#bdd3e0');write(info.self??'',n.x+n.width-71,n.y+45,100,12,'center',sans,'700','#cdeaff');
    return;

  }
  if(n.skin==='mission-card'){
    const success=n.tone==='green';ctx.save();if(n.selected)shadow(ctx,success?'#34d399':'#f87171',12,0);fill(ctx,n,gradient(ctx,n,success?['#123b31','#08231e']:['#4d1715','#270b0a']),12,n.selected?'#ffd875':success?'#34d399aa':'#f87171aa');ctx.restore();
    if(n.height<=60){write((success?'🪷':'🔥')+' '+n.text+(n.selected?' ✓':''),cx,cy,n.width-12,15,'center',display,'700',success?'#7ee7cf':'#fca5a5');return;}
    write(success?'🪷':'🔥',cx,n.y+20,n.width-10,22);write(n.text,cx,n.y+45,n.width-10,15,'center',display,'700',success?'#7ee7cf':'#fca5a5');write(n.detail??'',cx,n.y+64,n.width-8,10.5,'center',sans,'400','#eddcc4');write(n.selected?'✓ 已选中':'点击选择',cx,n.y+88,n.width-10,10.5,'center',sans,'700','#eddcc4');return;
  }
  if(n.skin==='setup-count-frame'){fill(ctx,n,gradient(ctx,n,['#16314ce6','#0c1f33eb'],160),20,'#e2ca9273');return;}
  if(n.skin==='setup-practice'){write(n.text,cx,cy,n.width-12,12,'center',sans,'500','#d7c08a');return;}
  if(n.skin==='count'){ctx.save();shadow(ctx,n.selected?'#5ce8f566':'#040e1a99',n.selected?14:10,n.selected?0:3);circle(ctx,cx,cy,n.width/2-.75,'transparent',n.selected?'#5ef2ff':'#e3cea0');ctx.fillStyle=gradient(ctx,n,n.selected?['#2b8296','#165668']:['#284865f0','#10263cf5'],n.selected?160:145);ctx.fill();ctx.stroke();ctx.restore();if(n.selected){circle(ctx,cx,cy,n.width/2+3,'transparent','#aefff4');}write(n.text,cx,cy,n.width-5,n.fontSize??18,'center',display,'600',n.selected?'#fff':'#fff5d8');return;}
  if(n.skin==='setup-mode') {fill(ctx,n,gradient(ctx,n,n.selected?['#235467','#123440']:['#191c27','#111520']),16,'#d4a359');const [title,sub]=n.text.split('\n');write(title??'',cx,n.y+17,n.width-12,13.5,'center',sans,'700',n.selected?'#ffd54f':'#b8a99b');write(sub??'',cx,n.y+36,n.width-10,10.5,'center',sans,'400','#b5cddd');return;}
  if(n.skin==='setup-role'){
    const imgSize=n.width-4;
    fill(ctx,n,gradient(ctx,n,n.team==='blue'?['#0c1831','#1a4bb8']:['#9e1115','#4b1015']),8,n.team==='blue'?'#4d88ff':'#e04a4e');
    image(n.image,n.x+2,n.y+2,imgSize,imgSize);
    const labelY=n.y+2+imgSize;
    const nameSize=14;
    if(n.badge){fill(ctx,{...n,x:n.x+n.width-26,y:n.y+6,width:20,height:16},'#ffffff',3);text(ctx,n.badge,n.x+n.width-16,n.y+14,20,10,'#1a3878','center',sans,'700');}
    text(ctx,n.text,cx,labelY+18,n.width-6,nameSize,'#ffffff','center',sans,'700');
    write(n.detail??'',cx,labelY+38,n.width-6,10,'center',sans,'400','rgba(255,255,255,0.65)');
    return;
  }
  if(n.skin==='guide-variant'){ctx.save();shadow(ctx,'#d4a35966',14,4);fill(ctx,n,'#102b4399',10,n.team==='blue'?'#5aa0f073':'#f05a5a73');ctx.restore();circle(ctx,cx,n.y+35,27,'#091326','#e5b964');image(n.image,cx-25,n.y+10,50,50,true);write(n.detail??'',cx,n.y+83,n.width-12,10.5,'center',sans,'400',n.team==='blue'?'#bfdbfe':'#fca5a5');write(n.text,cx,n.y+110,n.width-12,13,'center',sans);fill(ctx,{...n,x:cx-24,y:n.y+130,width:48,height:16},'#fbbf2426',8,'transparent');write('🔍 大图',cx,n.y+138,n.width-12,9.5,'center',sans,'400','#ffd875');return;}
  if(n.skin==='guide-role-heading'){
    const d=48,tx=n.x+58,tw=n.width-58,[title,motto]=n.detail?.split('|')??[];
    circle(ctx,n.x+d/2,n.y+41,d/2,'#102b43','#d4a359');image(n.image,n.x+1,n.y+18,d-2,d-2,true);
    const faction=n.team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道';ctx.font='400 10.5px '+sans;const fw=ctx.measureText(faction).width+12,twBadge=Math.min(tw-fw-6,ctx.measureText(title??'').width+12);
    fill(ctx,{...n,x:tx,y:n.y,width:fw,height:16},'#ffffff0d',8,'#d4a35955');write(faction,tx+fw/2,n.y+8,fw-6,10.5,'center',sans,'400',n.team==='blue'?'#b9e2ed':'#f0bea8');
    fill(ctx,{...n,x:tx+fw+6,y:n.y,width:twBadge,height:16},'#d4a35926',8,'#d4a35966');write(title??'',tx+fw+6+twBadge/2,n.y+8,twBadge-6,10.5,'center',sans,'400','#ffd875');
    const lines=n.lines??[n.text];lines.forEach((line,i)=>write(line,tx,n.y+34+i*21,tw,18,'left',display));write(motto??'',tx,n.y+54+(lines.length-1)*21,tw,12,'left',sans,'400','#b9e2ed');write('🔍 点击赏析完整法相大图 ›',tx,n.y+73+(lines.length-1)*21,tw,10,'left',sans,'400','#ffd875');rule(ctx,{...n,y:n.y+n.height,height:1},'#ffffff1a');return;
  }
  if(n.skin==='identity-card') {
    fill(ctx,n,gradient(ctx,n,['#102b43e0','#081826f5'],135),14,n.team==='blue'?'#52b0ff88':'#ff5e5788');
    const diameter=clamp(56,(n.width+54)*.14,68),px=n.x+12,py=cy-diameter/2;
    image(n.image,px,py,diameter,diameter,true);
    for(const extra of [0,4]){ctx.beginPath();ctx.arc(px+diameter/2,cy,diameter/2+extra,0,Math.PI*2);ctx.strokeStyle=n.team==='blue'?(extra?'#52b0ff':'#9cd4ff'):(extra?'#ff5e57':'#ff9e96');ctx.lineWidth=2;ctx.stroke();}
    const tx=px+diameter+14,tw=n.x+n.width-tx-10,[title,motto]=n.detail?.split('|')??[];
    const allegiance=(n.badge??(n.team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道'))+' · '+(title??'');ctx.font='600 11px '+sans;const badgeW=Math.min(tw,ctx.measureText(allegiance).width+38);
    fill(ctx,{...n,x:tx,y:n.y+10,width:badgeW,height:24},'#00000073',8,'#dcbe7859');
    image('symbols/'+(n.team==='blue'?'blue':'red')+'.png',tx+8,n.y+14,16,16);
    write(allegiance,tx+28,n.y+22,badgeW-36,11,'left',sans,'600','#eeddc4');
    write(n.text,tx,n.y+52,tw,20,'left',display,'700','#fff2d5');
    write(motto??'',tx,n.y+72,tw,11,'left',sans,'400','#cbdbe8');
    fill(ctx,{...n,x:tx,y:n.y+83,width:109,height:20},'#e5b96426',6,'#e5b9644d');write('🔍 点击赏析高清大图',tx+6,n.y+93,97,10,'left',sans,'400','#ffd875');return;
  }
  if(n.skin==='waiting-seat') {
    const d=n.width<100?48:58,py=n.y+18;
    if(n.image){ctx.save();if(n.badge==='房主')shadow(ctx,'#ffd875',13,0);circle(ctx,cx,py+d/2,d/2+2,'#2b0c0a','#e5b964');ctx.restore();
      if(n.image==='emblems/cards.png')art(ctx,artwork,'cards',cx-12,py+d/2-12,24,24);else image(n.image,cx-d/2,py,d,d,true);
    } else {circle(ctx,cx,py+d/2,d/2,'#16344e55','#d4a35966');write('+',cx,py+d/2,40,25);}
    if(n.badge){const host=n.badge==='房主',bw=host?52:34;fill(ctx,{...n,selected:false,x:cx-bw/2,y:n.y+7,width:bw,height:host?17:20},host?'#ffd875':'#a4303080',host?8:4,host?'#d4a359':'#f8717166');write(host?'👑 房主':n.badge,cx,n.y+(host?15.5:17),bw-4,10,'center',sans,'600',host?'#392012':'#fff');}
    ctx.font='400 13px '+sans;const nameWidth=Math.min(n.width-24,ctx.measureText(n.text).width+20),ny=py+d+8;ctx.beginPath();ctx.moveTo(cx-nameWidth/2+5,ny);ctx.lineTo(cx+nameWidth/2-5,ny);ctx.lineTo(cx+nameWidth/2,ny+12);ctx.lineTo(cx+nameWidth/2-5,ny+23);ctx.lineTo(cx-nameWidth/2+5,ny+23);ctx.lineTo(cx-nameWidth/2,ny+12);ctx.closePath();ctx.fillStyle='#2b0c0a';ctx.fill();write(n.text,cx,ny+12,nameWidth-10,13,'center',sans,'400',n.selfPlayer?'#ffd875':'#fff3d6');
    if(n.selected)fill(ctx,{...n,selected:false,x:cx-30,y:py+d+37,width:60,height:19},'#0eaa75',10,'#b1ffe0');
    write(n.detail??'',cx,py+d+46.5,n.width-12,11.5,'center',sans,'600',n.selected?'#fff':'#ead8b8');return;
  }
  if(n.skin==='waiting-offline'){fill(ctx,n,'#2d141899',16,'#dcbe7840');write(n.text,cx,cy,n.width-8,11,'center',sans,'400','#a8947e');return;}
  if(n.skin==='waiting-social'){fill(ctx,n,gradient(ctx,n,['#3e1614eb','#1c0908f5'],150),16,'#dcbe7866');write(n.text,cx-(n.count?8:0),cy,n.width-16,12,'center',sans,'700','#ffe57f');if(n.count){circle(ctx,n.x+n.width-19,cy,8,'#ff4d4f','transparent');write(String(n.count),n.x+n.width-19,cy,14,10,'center',sans,'700','#fff');}return;}
  if(n.skin==='waiting-accordion'){fill(ctx,n,'#220b0ad9',12,'#d4a35966');write(n.text,n.x+12,n.y+21,n.width-24,13,'left',sans,'600','#ffd875');return;}
  if(n.skin==='waiting-option'){fill(ctx,n,'#15334caa',8,'#d4a35988');write(n.text,cx,n.y+14,n.width-8,12,'center',sans,'400','#ede2cb');write(n.detail??'',cx,n.y+32,n.width-8,10,'center',sans,'600','#ffd875');return;}
  if(n.skin==='waiting-primary'){ctx.save();shadow(ctx,'#030d18bf',14,4);fill(ctx,{...n,selected:true},gradient(ctx,n,n.selected?['#294c59','#17323c']:['#328ea0','#145b6c'],180),14,n.selected?'#5a7e8a':'#f5dfa8');ctx.restore();write(n.text,cx,cy,n.width-12,15,'center',sans,'700','#fff8df');return;}
  if(n.skin==='sound-option'){
    rule(ctx,{...n,y:n.y+n.height-1,height:1},'#cdbb9438');write(n.text,n.x,n.y+26,n.width-60,16,'left',sans,'700','#fff2d6');
    (n.lines??[]).forEach((line,i)=>write(line,n.x,n.y+51+i*18,n.width-60,12,'left',sans,'400','#c6d9e4'));
    const sx=n.x+n.width-48;fill(ctx,{...n,x:sx,y:cy-14,width:48,height:28},n.selected?'#267d7b':'#405467',18,n.selected?'#a1e7cf':'#a6b9c5');circle(ctx,sx+(n.selected?34:14),cy,10,n.selected?'#ddfff1':'#e4edf1','transparent');return;
  }
  if(n.skin==='abort-primary'||n.skin==='abort-secondary'){const primary=n.skin==='abort-primary';ctx.save();shadow(ctx,primary?'#f5a62373':'#000000a6',16,4);fill(ctx,n,gradient(ctx,n,primary?['#ffd875','#f5a623','#d97706']:['#3e1614eb','#1c0908f5'],primary?135:150),24,primary?'#fff2b2':'#d4a359');ctx.restore();const lines=n.lines??[n.text];lines.forEach((line,i)=>write(line,cx,cy+(i-(lines.length-1)/2)*24,n.width-36,16,'center',sans,'700',primary?'#3b1402':'#fff3d6'));return;}
  if(n.skin==='mirror-aura'){const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,32);glow.addColorStop(0,'#ffd87540');glow.addColorStop(.6,'#e0aa3e0d');glow.addColorStop(.8,'transparent');circle(ctx,cx,cy,32,glow,'transparent');write('🪞',cx,cy,48,32);write('✨',n.x+n.width-8,n.y+8,24,16);return;}
  if(n.skin==='mirror-lineup'){fill(ctx,n,'#14080799',10,'#e0aa3e4d');return;}
  if(n.skin==='mirror-frame'){ctx.save();shadow(ctx,'#000000e6',48,16);fill(ctx,n,gradient(ctx,n,['#30160efa','#180a08fc'],165),20,'#e0aa3e');ctx.restore();return;}
  if(n.skin==='mirror-candidate'){ctx.save();shadow(ctx,'#f5a62373',16,4);fill(ctx,n,gradient(ctx,n,['#2d1210d9','#1c0908f2'],145),14,'#e0aa3e80');ctx.restore();return;}
  if(n.skin==='mirror-track'||n.skin==='mirror-progress'){fill(ctx,n,n.skin==='mirror-track'?'#e0aa3e26':'#ffd875',3,'transparent');return;}
  if(n.skin==='mirror-timer'||n.skin==='mirror-seat'||n.skin==='mirror-skip'){const seat=n.skin==='mirror-seat',skip=n.skin==='mirror-skip';fill(ctx,n,seat?'#ffd875':skip?'#1e0c0acc':'#e0aa3e26',seat?6:999,skip?'#e0aa3e66':'#ffd875');write(n.text,cx,cy,n.width-8,n.fontSize??13,'center',sans,seat||!skip?'700':'400',seat?'#2b0e0a':skip?'#e2cfa2':'#ffd875');return;}
  if(n.skin==='notice-frame'||n.skin==='jingu-frame'){ctx.save();shadow(ctx,n.skin==='jingu-frame'?'#d9770666':'#00000080',25,10);fill(ctx,n,n.skin==='jingu-frame'?gradient(ctx,n,['#2b1f13','#150f0c'],180):'#30100eeb',24,n.skin==='jingu-frame'?'#d97706':'#ffd875');ctx.restore();if(n.skin==='notice-frame'){ctx.save();rect(ctx,n.x+1,n.y+1,n.width-2,n.height-2,23);ctx.strokeStyle='#ffebb473';ctx.lineWidth=1;ctx.stroke();ctx.restore();}return;}
  if(['notice-pure','notice-evil','bell-message','jingu-ally','jingu-proof'].includes(n.skin??'')){const pure=n.skin==='notice-pure',evil=n.skin==='notice-evil',ally=n.skin==='jingu-ally',proof=n.skin==='jingu-proof';fill(ctx,n,pure?'#10362c':evil?'#451d20':ally?'#f59e0b1a':proof?'#00000059':'#0a192cbf',proof?10:12,pure?'#9bf4cf':evil?'#ffc1b6':ally?'#f59e0b59':proof?'transparent':'#d4a359');return;}
  if(n.skin==='jingu-confirm'){ctx.save();shadow(ctx,'#d9770666',12,4);fill(ctx,n,gradient(ctx,n,['#d97706','#b45309'],135),8,'#fef3c7');write(n.text,cx,cy,n.width-20,14.5,'center',sans,'700','#fffbeb');ctx.restore();return;}
  if(n.skin==='profile-source'){ctx.font='700 11.5px '+sans;const width=Math.min(n.width,ctx.measureText(n.text).width+18);fill(ctx,{...n,width},'#143e4ea6',999,'#6ef2ff73');write(n.text,n.x+8,cy,width-16,11.5,'left',sans,'700','#79f2ff');return;}
  if(n.skin==='social-copy'){ctx.save();shadow(ctx,'#f5a62373',16,4);fill(ctx,n,'#32181ccc',8,'#e5b96466');write(n.text,cx,cy,n.width-16,12,'center',sans,'700','#fff2d5');ctx.restore();return;}
  if(n.skin==='preference-frame'){ctx.save();shadow(ctx,'#000000d9',48,16);fill(ctx,n,gradient(ctx,n,['#160c10fa','#0c0608fc'],175),16,'#d4a359');ctx.restore();return;}
  if(n.skin==='preference-submit'||n.skin==='preference-cancel'){const submit=n.skin==='preference-submit';ctx.save();ctx.globalAlpha=n.disabled?.5:1;shadow(ctx,submit?'#b8863b66':'#00000066',submit?14:6,submit?4:2);fill(ctx,n,submit?gradient(ctx,n,['#d4a359','#b8863b','#946522'],135):'#2d1418d9',20,submit?'#ffe5a3':'#dcbe7866');write(n.text,cx,cy,n.width-16,13,'center',sans,submit?'700':'600',submit?'#1a0805':'#f5e6c8');ctx.restore();return;}
  if(n.skin==='preference-note'){ctx.save();ctx.setLineDash([3,2]);fill(ctx,n,'#00000033',8,'#dcbe7840');ctx.restore();return;}
  if(n.skin==='guide-faction'){art(ctx,artwork,(n.team??'blue')+'-faction',n.x+6,cy-20,40,40);write(n.text,n.x+56,cy,n.width-64,20,'left',display,'400','#ffd875');return;}
  if(n.skin==='preference-slot'){
    const color=['#f59e0b','#38bdf8','#c084fc'][(n.count??1)-1]!;
    ctx.save();if(!n.selected)ctx.setLineDash([3,2]);fill(ctx,n,n.selected?'#261016e6':'#1a0c108c',10,n.selected?color:'#dcbe784d');ctx.restore();write(['①志愿','②志愿','③志愿'][(n.count??1)-1]!,n.x+7,cy,37,10.5,'left',sans,'400',color);
    if(n.image)image(n.image,n.x+22,cy-11,22,22,true);write(n.text,n.x+(n.image?48:56),cy,n.width-(n.image?53:60),n.image?11.5:11,'left',sans,n.image?'700':'400',n.image?'#ffffff':'#8c7a6b');return;
  }
  if(n.skin==='preference-choice'){
    const color=n.team==='blue'?'#38bdf8':'#f87171';ctx.save();shadow(ctx,n.selected?(n.team==='blue'?'#38bdf859':'#f8717159'):'#f5a62373',n.selected?14:16,n.selected?0:4);fill(ctx,n,n.selected?gradient(ctx,n,n.team==='blue'?['#102646e6','#0a182df2']:['#411216e6','#260a0ef2']):'#1a0c10b3',12,n.selected?color:'#dcbe7840');ctx.restore();circle(ctx,n.x+26,cy,19,'#102b43',n.team==='blue'?'#52b0ff88':'#ff5e5788');image(n.image,n.x+8,cy-18,36,36,true);
    const subtitle=n.detail?.split('|')[0]??'';ctx.font='700 13px '+sans;const titleW=Math.min(n.width-60,ctx.measureText(n.text).width);write(n.text,n.x+50,cy,titleW,13,'left',sans,'700');write(subtitle,n.x+54+titleW,cy,n.width-60-titleW,10,'left',sans,'400','#d1b88e');
    if(n.badge){fill(ctx,{...n,x:n.x+n.width-54,y:n.y-6,width:48,height:17},color,8,'transparent');write(n.badge,n.x+n.width-30,n.y+2,44,10,'center',sans,'400','#102033');}return;
  }
  if(n.skin==='battle-token'){
    const d=Math.min(n.width-8,38),cyImage=n.y+d/2+2,color=n.tone==='green'?'#79d8a1':n.tone==='red'?'#f29a91':'#f1dba7';
    circle(ctx,cx,cyImage,d/2+2,'#2b0c0a','#d0be8d');image(n.image,cx-d/2,n.y+2,d,d,true);
    circle(ctx,cx+d/2-3,n.y+d-3,9,'#152536',color);write(n.badge??'',cx+d/2-3,n.y+d-3,16,13,'center',sans,'400',color);
    write((n.count===undefined?'':String(n.count)+'号 ')+n.text,cx,n.y+d+16,n.width,10.5,'center',sans);write(n.detail??'',cx,n.y+d+32,n.width,11,'center',sans,'400',color);return;
  }
  if(n.skin==='avatar'&&(n.id==='notice-avatar'||n.id.startsWith('mirror-avatar:'))){
    const notice=n.id==='notice-avatar',jingu=model.web?.document?.noticeKind==='jingu',fallback=n.image==='emblems/cards.png';
    if(notice){ctx.save();if(jingu)shadow(ctx,'#f59e0b80',8,0);circle(ctx,cx,cy,n.width/2,'transparent',jingu?'#f59e0b':'#ffd875');ctx.restore();}
    image(fallback?'symbols/cards-'+(notice?'white':'ink')+'.png':n.image,n.x+(notice?2:0),n.y+(notice?2:0),n.width-(notice?4:0),n.height-(notice?4:0),notice);return;
  }
  if(n.skin==='token'||n.skin==='avatar'||n.skin==='avatar-choice') {
    if(n.skin==='avatar-choice'){fill(ctx,n,n.selected?'#124b53':'#26100edb',12,n.selected?'#79f2ff':'#d4a35966');const d=Math.min(52,n.width-8);image(n.image,cx-d/2,n.y+6,d,d,true);write(n.text,cx,n.y+n.height-13,n.width-6,12,'center',sans,'500');return;}
    const party=n.detail?.startsWith('出征'),diameter=n.skin==='avatar'?Math.min(n.width,n.height):party?38:n.detail==='vision'?(n.fontSize??38):Math.min(38,n.width-10),px=cx-diameter/2,py=party?n.y+14:n.y+1;
    if(party){const frame=artwork?.get('emblems/'+(n.detail?.includes('|我')?'ruyi-self':'ruyi')+'.png');if(frame){const scale=Math.min(n.width/frame.width,n.height/frame.height);ctx.save();shadow(ctx,n.detail?.includes('|我')?'#ffd700b3':'#00000099',n.detail?.includes('|我')?10:8,4);ctx.drawImage(frame as CanvasImageSource,cx-frame.width*scale/2,n.y+(n.height-frame.height*scale)/2,frame.width*scale,frame.height*scale);ctx.restore();}else box('tip');}
    circle(ctx,cx,py+diameter/2,diameter/2+2,n.skin==='avatar'?'#122b34':'#2b0c0a',party?(n.detail?.includes('|我')?'#ffd875':'#00f2fe'):'#d0be8d');
    if((n.id.startsWith('vision:')||party)&&n.image==='emblems/cards.png'){ctx.save();shadow(ctx,'#5ef2ff80',8,0);circle(ctx,cx,py+diameter/2,diameter/2+1,'#2b0c0a','#5ef2ff');ctx.restore();image(party?'symbols/cards-cyan.png':'symbols/cards.png',cx-(party?15:10),py+diameter/2-(party?15:10),party?30:20,party?30:20);}else image(n.image,px,py,diameter,diameter,true);
    if(n.skin!=='avatar'){const caption=party?n.text+(n.detail?.includes('|我')?'（你）':''):(n.count===undefined?'':String(n.count)+'号 ')+n.text;if(!party)fill(ctx,{...n,x:cx-n.width/2,y:py+diameter+5,width:n.width,height:16},'#2b0c0a',8,'#d4a35977');write(caption,cx,party?n.y+60:py+diameter+13,n.width-4,10.5,'center',sans,'600','#f1dba7');if(party){fill(ctx,{...n,x:cx+5,y:py+diameter-10,width:17,height:10},'#0284c7',3,'transparent');write(String(n.count)+'号',cx+13,py+diameter-5,17,8.5,'center',sans,'700','#fff');fill(ctx,{...n,x:cx-24,y:n.y+71,width:48,height:15},'#0ea5e938',8,'#38bdf873');write('⚔️ 出征',cx,n.y+78.5,46,9.5,'center',sans,'600','#67e8f9');}}
    return;
  }
  if(n.skin==='setup-access'){fill(ctx,n,'#2b1111db',12,'#e5b96480');const lines=n.text.split('\n');write(lines[0]!,n.x+12,n.y+24,n.width-24,13,'left',sans,'700','#ffd875');write(lines[1]??'',n.x+12,n.y+46,n.width-24,12,'left',sans,'400','#eddcc4');return;}
  if(n.skin==='replay-details'){fill(ctx,n,'#220b0ad9',12,'#d4a35966');return;}
  if(n.skin==='replay-notice'){fill(ctx,n,'#ffd8751a',8,'#ffd87533');return;}
  if(n.skin==='replay-identity'){rule(ctx,{...n,y:n.y+n.height},'#d4a35966');write(n.text,n.x,cy,n.width*.55-8,14,'left',sans);image(n.image,n.x+n.width*.55,cy-24,36,48);write(n.detail??'',n.x+n.width*.55+42,cy,n.width*.45-42,13,'left',sans,'700',n.team==='blue'?'#bfdbfe':'#fca5a5');return;}
  if(n.skin==='report-ballot'){
    const d=n.fontSize??40,py=n.y,c=n.tone==='green'?'#34d399':n.tone==='red'?'#f87171':'#fbbf24',edge=n.tone==='green'?'#059669':n.tone==='red'?'#dc2626':'#d97706';
    ctx.save();ctx.lineWidth=2;circle(ctx,cx,py+d/2,d/2-1,'#210d0b','#ffd875');ctx.lineWidth=2;ctx.stroke();ctx.restore();
    if(n.image==='emblems/cards.png')art(ctx,artwork,'cards',cx-10,py+d/2-10,20,20);else image(n.image,cx-d/2+4,py+4,d-8,d-8,true);
    circle(ctx,cx+d/2-6.5,py+d-6.5,8.5,n.tone==='green'?'#195a4a':n.tone==='red'?'#7f1d1d':'#78350f',c);write(n.badge??'?',cx+d/2-6.5,py+d-6.5,14,11,'center',sans,'700',c);
    ctx.save();shadow(ctx,'#00000080',4,2);fill(ctx,{...n,selected:false,y:py+d+4,height:42},gradient(ctx,n,['#381210f2','#1c0908fa'],180),8,'#d4a359a6');ctx.restore();
    write(String(n.count)+'号'+(n.selected?'（你）':''),cx,py+d+17,n.width-4,11,'center',sans,'700','#ffd875');write(n.text,cx,py+d+32,n.width-4,Math.min(12,d/ .105*.029), 'center',sans,'600','#fff2d5');
    fill(ctx,{...n,x:cx-19,y:py+d+52,width:38,height:17},n.tone==='green'?'#10b98138':n.tone==='red'?'#ef444438':'#f59e0b38',9,edge);write(n.detail??'',cx,py+d+60.5,34,11,'center',sans,'700',c);return;
  }
  if(n.skin==='report-person'){fill(ctx,n,'#230c0abf',17,'#d4a35980');circle(ctx,n.x+17,cy,13,'#210d0b','#ffd875');if(n.image==='emblems/cards.png')image('symbols/cards.png',n.x+8,cy-9,18,18);else image(n.image,n.x+6,cy-11,22,22,true);write(n.text,n.x+36,cy,n.width-42,12,'left',sans,'600','#ffe3af');return;}
  if(n.skin==='art-frame'){ctx.save();shadow(ctx,n.team==='red'?'#ff5e5720':'#3b9eff20',35,0);fill(ctx,{...n,selected:true},gradient(ctx,n,['#18283a','#0d1723'],180),24,n.team==='red'?'#ff7675':'#70baff');ctx.restore();return;}
  if(n.skin==='art-faction'){fill(ctx,n,'#00000080',13,'#dcbe7859');art(ctx,artwork,n.team??'blue',n.x+8,cy-8,16,16);write(n.text,n.x+29,cy,n.width-34,12.5,'left',sans,'600','#fff2d5');return;}
  if(n.skin==='art-circle'){ctx.save();const color=n.team==='red'?'#ff9e96':'#9cd4ff';shadow(ctx,n.team==='red'?'#ff475780':'#3b9eff80',35,0);circle(ctx,cx,cy,n.width/2+7,'transparent',n.team==='red'?'#ff5e57':'#52b0ff');circle(ctx,cx,cy,n.width/2,color,color);ctx.restore();image(n.image,n.x+5,n.y+5,n.width-10,n.height-10,true);return;}
  if(n.skin==='art-name'){text(ctx,n.text,cx,cy,n.width,28,'#fff2d5','center',display,'400',3);return;}
  if(n.skin==='art-story-copy'){(n.lines??n.text.split('\n')).forEach((line,i)=>write(line,n.x,n.y+10.725+i*21.45,n.width,13,'left',sans,'400','#e5edf6'));return;}
  if(n.skin==='art-story'){fill(ctx,n,'#0000004d',12,'#ffffff14');return;}
  if(n.skin==='preset-count'){ctx.save();ctx.lineWidth=1.5;circle(ctx,cx,cy,n.width/2,n.selected?'#266778':'#240d0b',n.selected?'#a5f3fc':'#d4a359');if(n.selected)circle(ctx,cx,cy,n.width/2+4,'transparent','#a5f3fc');ctx.restore();write(n.text,cx,cy,n.width-8,18,'center',display,'400','#fff4d6');return;}
  if(n.skin==='preset-toggle'){rule(ctx,{...n,y:n.y+n.height},'#d4a35926');write(n.text,n.x,cy,n.width-70,16,'left',sans,'400');fill(ctx,{...n,x:n.x+n.width-60,y:cy-17,width:60,height:34},n.selected?'#126878':'#343b43',15,'#8cb9bc');circle(ctx,n.x+n.width-(n.selected?20:42),cy,13,'#a5f3fc','transparent');return;}
  if(n.skin==='treasure-result'){fill(ctx,n,'#102b43b3',10,'#e5b96480');return;}
  if(n.skin==='treasure-card'){fill(ctx,n,'#23120ebf',14,'#e5b96459');return;}
  if(n.skin==='treasure-badge'){fill(ctx,n,'#e5b96433',10,'#e5b9644d');write(n.text,cx,cy,n.width-14,11,'center',sans,'700','#ffd875');return;}
  if(n.skin==='treasure-action-box'){fill(ctx,n,'#00000040',10,'#e5b96433');return;}
  if(n.skin==='treasure-select'){fill(ctx,n,'#2a1512',8,'#e5b96466');write(n.text.replace(/ ▾$/,''),n.x+10,cy,n.width-34,13,'left',sans,'400',n.disabled?'#b3a48a':'#f7e0b5');write('⌄',n.x+n.width-12,cy,16,16,'center',sans,'400','#f7e0b5');return;}
  if(n.skin==='treasure-confirm'){ctx.save();shadow(ctx,'#f5a62373',16,4);if(n.disabled)ctx.globalAlpha*=.45;fill(ctx,n,gradient(ctx,n,n.disabled?['#c0a477','#a88a63']:['#f5a623','#d97706'],135),10,'#ffe599');write(n.text,cx,cy,n.width-12,n.fontSize??14,'center',sans,'700','#240a08');ctx.restore();return;}
  if(n.skin==='treasure-idle'){fill(ctx,n,'#00000033',8,'transparent');return;}
  if(n.skin==='direct-avatar'){image(n.image,n.x,n.y,n.width,n.height,true);return;}
  if(n.skin==='direct-topbar'||n.skin==='direct-input-bar'){ctx.fillStyle=n.skin==='direct-topbar'?'#16101cf2':'#120e18fa';ctx.fillRect(n.x,n.y,n.width,n.height);return;}
  if(n.skin==='direct-back'){fill(ctx,n,'transparent',6,'#ffd87566');write(n.text,cx,cy,n.width-12,12,'center',sans,'700','#ffd875');return;}
  if(n.skin==='direct-input'){fill(ctx,n,'#ffffff14',19,'#ffd87559');write(n.text,n.x+12,cy,n.width-24,13.5,'left',sans,'400','#c4c4c4');return;}
  if(n.skin==='direct-send'){ctx.save();ctx.globalAlpha=n.disabled?.35:1;fill(ctx,n,n.disabled?'#ffffff1a':gradient(ctx,n,['#ffd875','#e6a728'],135),19,'transparent');write(n.text,cx,cy,n.width-12,14,'center',sans,'700',n.disabled?'#ffffff66':'#2b0e01');ctx.restore();return;}
  if(n.skin==='direct-message'){fill(ctx,n,n.selected?gradient(ctx,n,['#1e3a5f','#152d4b'],135):'#1e293bcc',12,n.selected?'#38bdf8':'#ffd8754d');(n.lines??[n.text]).forEach((line,i)=>write(line,n.x+13,n.y+9+9.1+i*18.2,n.width-26,13,'left',sans,'400',n.selected?'#e0f2fe':'#fff4d0'));return;}
  if(n.skin==='direct-quick-strip'){ctx.fillStyle='#141019b3';ctx.fillRect(n.x,n.y,n.width,n.height);return;}
  if(n.skin==='direct-quick'){fill(ctx,n,'#38bdf81f',24,'#38bdf84d');write(n.text,cx,cy,n.width-18,11.5,'center',sans,'400','#bae6fd');return;}
  if(n.skin==='home-duel'){const img=artwork?.get(n.image!);if(img?.width&&img.height){const scale=Math.max(n.width/img.width,n.height/img.height);ctx.drawImage(img as CanvasImageSource,n.x+(n.width-img.width*scale)/2,n.y+(n.height-img.height*scale)*.4,img.width*scale,img.height*scale);}return;}
  if(n.skin==='home-copy'){ctx.save();const heading=n.id==='home-headline',promotion=n.id==='home-promotion';shadow(ctx,promotion?'#3b2a12':'#fff1c7',heading?6:4,1);const lines=n.text.split('\n'),lh=n.height/lines.length;lines.forEach((line,i)=>write(line,cx,n.y+lh*(i+.5),n.width,n.fontSize??13,'center',heading?calligraphy:homeInterface,'400',heading?'#40190e':promotion?'#ffe7b2':'#172329'));ctx.restore();return;}
  if(n.skin==='art-image') {image(n.image,n.x,n.y,n.width,n.height);return;}
  if(n.skin==='expedition'){fill(ctx,{...n,selected:true},gradient(ctx,n,['#281d2e','#17111d'],180),18,'#d4a359');return;}
  if(n.skin==='captain-banner'){ctx.save();rect(ctx,n.x,n.y,n.width,n.height,16);ctx.clip();const g=ctx.createLinearGradient(n.x,0,n.x+n.width,0);for(const [stop,color] of [[0,'#103f4f'],[.45,'#156d7d'],[.85,'#0f8290'],[1,'#0d6371']] as const)g.addColorStop(stop,color);ctx.fillStyle=g;ctx.fillRect(n.x,n.y,n.width,n.height);ctx.restore();ctx.fillStyle=g;ctx.fillRect(n.x,n.y+n.height/2,n.width,n.height/2);rule(ctx,{...n,y:n.y+n.height},'#e0aa3e');const d=44;circle(ctx,n.x+38,cy,d/2+2,'#122b40');image(n.image,n.x+16,cy-22,44,44,true);art(ctx,artwork,'imperial-crown',n.x+26,n.y+1,24,16);write(n.text,n.x+74,cy,n.width-84,n.fontSize??19,'left',calligraphy,'400','#ffd875');return;}
  if(n.skin==='modal-return'){ctx.save();shadow(ctx,'#00000099',8,3);fill(ctx,n,gradient(ctx,n,['#7b1b0b','#470d06'],150),8,'#ffd875');ctx.restore();write(n.text,cx,cy,n.width-12,12,'center',display,'400','#fff2d5');return;}
  if(n.skin==='report-vote-chip'){const c=n.tone==='green'?'#10b981':n.tone==='red'?'#ef4444':'#f59e0b';fill(ctx,n,c+'26',5,c+'66');write(n.text,cx,cy,n.width-6,12,'center',sans,'600',c);return;}
  if(n.skin==='report-section'){fill(ctx,n,'#120908bf',12,'#582420');return;}
  if(n.skin==='report-stat-success'||n.skin==='report-stat-failure'){const success=n.skin.endsWith('success');fill(ctx,n,success?'#10b98126':'#ef444426',10,success?'#10b98180':'#ef444480');return;}
  if(n.skin==='report-success-hero'||n.skin==='report-failure-hero'){const success=n.skin==='report-success-hero',edge=success?'#10b981':'#ef4444';ctx.save();shadow(ctx,success?'#10b98173':'#ef444473',24,0);const g=ctx.createRadialGradient(cx,n.y+n.height*.2,0,cx,n.y+n.height*.2,Math.hypot(n.width/2,n.height*.8));g.addColorStop(0,success?'#064e3b':'#7f1d1d');g.addColorStop(.7,success?'#022c22':'#450a0a');g.addColorStop(1,success?'#011913':'#200404');fill(ctx,{...n,selected:true},g,16,edge);ctx.restore();return;}
  if(n.skin==='report-ack'){
    ctx.save();shadow(ctx,'#f5a623cc',20,0);fill(ctx,{...n,selected:true},gradient(ctx,n,['#ffe885','#f5a623','#b45309'],180),24,'#fff3b0');ctx.shadowColor='transparent';
    ctx.save();rect(ctx,n.x+2,n.y+2,n.width-4,n.height-4,22);ctx.clip();ctx.translate(cx,n.y+n.height*.2);ctx.scale(n.width/2,n.height*.8);
    const radial=ctx.createRadialGradient?.(0,0,0,0,0,Math.SQRT2);if(radial?.addColorStop){radial.addColorStop(0,'#ffe885');radial.addColorStop(.55,'#f5a623');radial.addColorStop(1,'#b45309');ctx.fillStyle=radial;ctx.fillRect(-2,-2,4,4);}ctx.restore();
    ctx.save();rect(ctx,n.x+2,n.y+2,n.width-4,n.height-4,22);ctx.clip();const inset=ctx.createLinearGradient(0,n.y+2,0,n.y+n.height-2);inset.addColorStop(0,'#ffffffd9');inset.addColorStop(.09,'#ffffff00');inset.addColorStop(.84,'#78350f00');inset.addColorStop(1,'#78350faa');ctx.fillStyle=inset;ctx.fillRect(n.x+2,n.y+2,n.width-4,n.height-4);ctx.restore();ctx.restore();
    art(ctx,artwork,'cloud-brown-left',n.x+62,cy-7,18,14);art(ctx,artwork,'cloud-brown-right',n.x+n.width-80,cy-7,18,14);write(n.text,cx,cy,n.width-96,Math.min(17,n.width*.038+1.5),'center',calligraphy,'900','#3b1104');return;}
  if(n.skin==='vote-submit'){fill(ctx,{...n,selected:true},gradient(ctx,n,n.disabled?['#442825','#221210']:['#ffd875','#f5a623','#d97706'],180),24,n.disabled?'#6d4b32':'#fff2bd');art(ctx,artwork,n.disabled?'cloud-disabled-left':'cloud-brown-left',n.x+52,cy-7,18,14);art(ctx,artwork,n.disabled?'cloud-disabled-right':'cloud-brown-right',n.x+n.width-70,cy-7,18,14);write(n.text,cx,cy,n.width-70,n.fontSize??17,'center',calligraphy,'400',n.disabled?'#9e7f68':'#512300');return;}
  if(n.skin==='vote-choice'){
    const c=n.tone==='green'?'#10b981':n.tone==='red'?'#ef4444':'#f59e0b';
    ctx.save();shadow(ctx,c+'55',n.selected?16:10,0);fill(ctx,{...n,selected:true},gradient(ctx,n,['#32110f','#1b0807']),16,n.selected?c:c+'66');ctx.restore();
    write(n.badge??'',cx,n.y+25,n.width-10,25,'center',sans,'700',c);write(n.text,cx,n.y+48,n.width-10,18,'center',calligraphy,'700',c);write(n.detail??'',cx,n.y+70,n.width-10,11,'center',sans,'400','#eddcc4');return;
  }
  if(n.skin==='code-badge'){ctx.save();shadow(ctx,'#d4a35940',8,0);fill(ctx,n,'#d4a35926',4,'#d4a3594d');ctx.restore();write(n.text,cx,cy,n.width-8,11,'center',sans,'700','#ffd875');return;}
  if(n.skin==='history-status'){fill(ctx,n,'#ffffff0d',2,'#ffffff44');write(n.text,cx,cy,n.width-8,12,'center',sans,'400','#eddcc4');return;}
  if(n.skin==='voter-chip'){fill(ctx,n,'#1e0a0acc',5,'#d4a3594d');const parts=/^(\d+号) (.*?)  (.*)$/.exec(n.text);if(parts){write(parts[1]!,n.x+6,cy,25,9.5,'left',sans,'700','#ffd875');write(parts[2]!,cx-1,cy,Math.max(24,n.width-66),10.5,'center',sans,'400','#eedcc4');write(parts[3]!,n.x+n.width-6,cy,35,9.5,'right',sans,'400',n.tone==='green'?'#34d399':'#ffd875');}else write(n.text,cx,cy,n.width-8,n.fontSize??10.5,'center',sans,'400');return;}
  if(n.skin==='badge'){box('tip');write(n.text,cx,cy,n.width-8,n.fontSize??10.5,'center',sans,'700');return;}
  if(n.skin==='treasure-entry'){ctx.save();ctx.globalAlpha=n.disabled?.5:1;if(n.disabled)ctx.setLineDash([4,3]);box();ctx.setLineDash([]);write('📿',n.x+24,cy,32,23);write(n.text,n.x+46,n.y+13,n.width-70,12,'left',display,'700','#ffd875');write(n.detail??'',n.x+46,n.y+31,n.width-70,10,'left',sans,'400','#cbdbe8');write(n.disabled?'🔒':'❯',n.x+n.width-16,cy,20,13);ctx.restore();return;}
  if(n.skin==='metric'){if(n.id!=='metric:0')fill(ctx,{...n,y:n.y+8,width:1,height:n.height-16},'#d4a35988',0,'transparent');write(n.text,cx,n.y+20,n.width-4,20,'center',display,'400','#f1deba');write(n.detail??'',cx,n.y+42,n.width-4,11.5,'center',sans,'400','#eddcc4');return;}
  if(n.skin==='score-card'){
    const isRole=n.image?.startsWith('roles/'),d=isRole?48:34,py=n.y+(isRole?12:11),ink=n.team==='blue'?'#b9e2ed':'#f0bea8';
    ctx.save();shadow(ctx,'#00000080',isRole?12:14,4);
    fill(ctx,n,isRole?gradient(ctx,n,['#3a1412ed','#1c0908f7']):n.team==='blue'?'#14374fda':'#402e40da',isRole?12:14,'#d4a35966');ctx.restore();
    if(!isRole)fill(ctx,{...n,x:n.x+4,y:n.y+4,width:n.width-8,height:n.height-8},'transparent',12,'#d4a35926');
    if(isRole){circle(ctx,cx,py+d/2,d/2,'#210d0b','#d4a359');image(n.image,cx-d/2+1,py+1,d-2,d-2,true);fill(ctx,{...n,x:n.x+n.width-37,y:n.y+6,width:30,height:16},'#00000066',5,'transparent');write(n.team==='blue'?'蓝方':'红方',n.x+n.width-22,n.y+14,30,9.5,'center',sans,'400',ink);}
    else if(n.image){art(ctx,artwork,n.image.slice(8,-4),cx-d/2,py,d,d);write(n.team==='blue'?'取经正果':'群妖乱道',cx,n.y+52.5,n.width-18,11,'center',display,'400',ink);}
    write(n.text,cx,n.y+(isRole?70.5:67),n.width-14,isRole?13:14,'center',display,'700',isRole?'#fff2d8':ink);
    const [rate,record,footer]=n.detail?.split('|')??[],rateSize=isRole?16:20,labelSize=isRole?10.5:11;
    ctx.font='400 '+rateSize+'px '+display;const rw=ctx.measureText(rate??'—').width,total=rw+4+labelSize*2;
    write(rate??'—',cx-total/2,n.y+(isRole?88:88),rw+2,rateSize,'left',display,'700',isRole?'#ffd875':ink);
    write('胜率',cx+total/2,n.y+(isRole?90:91),labelSize*2+2,labelSize,'right',sans,'400','#eddcc4');
    const rule=(dy:number,alpha:string)=>fill(ctx,{...n,x:n.x+9,y:n.y+dy,width:n.width-18,height:1},alpha,0,'transparent');
    if(isRole)write((record??'').replace(' · ','    '),cx,n.y+111,n.width-14,11,'center',sans,'400',ink);
    else {rule(103,'#ffffff1a');const counts=(record??'').match(/\d+/g)??['0','0'];counts.forEach((v,i)=>{write(v,cx+(i?18:-18),n.y+117,n.width/2-8,15,'center',display,'400',ink);write(i?'失败':'胜利',cx+(i?18:-18),n.y+137,n.width/2-8,11,'center',sans,'400','#eddcc4');});}
    rule(isRole?123:149,'#ffffff0f');write(footer??'',cx,n.y+(isRole?136:164),n.width-14,isRole?10:10.5,'center',sans,'400','#eddcc4');return;
  }
  if(n.skin==='gallery-card'){fill(ctx,n,gradient(ctx,n,n.team==='blue'?['#204b79','#13325e']:['#641b25','#310d18']),14,n.team==='blue'?'#488eff':'#d63249');image(n.image,n.x+8,n.y+8,n.width-16,n.height-77);write(n.text,cx,n.y+n.height-49,n.width-12,16,'center',display,'700');write(n.detail??'',cx,n.y+n.height-22,n.width-12,11,'center',sans,'400');return;}
  if(n.skin==='social-code-number'){text(ctx,n.text,cx,cy,n.width-20,32,'#ffe57f','center','monospace','400',4);return;}
  if(n.skin==='social-status'){fill(ctx,n,'#52c41a26',6,'#52c41a66');write('已在',cx,cy-8,n.width-4,12,'center',sans,'400','#95de64');write('房中',cx,cy+8,n.width-4,12,'center',sans,'400','#95de64');return;}
  if(n.skin==='friend-card'){fill(ctx,{...n,selected:false},n.selected?'#321812cc':'#241214b3',12,n.selected?'#ff980066':'#e5b96433');circle(ctx,n.x+35,cy,20,'#1e0e12','#e5b96480');image(n.image,n.x+15,cy-20,40,40,true);if(n.online!==undefined)circle(ctx,n.x+51,cy+16,5.5,n.online?'#52c41a':'#8c8c8c','#1e0e12');const infoW=Math.max(8,n.width-67-(n.textRightInset??142)),codeW=n.badge?50.5:0;ctx.font='700 14.5px '+sans;const tw=Math.max(8,Math.min(ctx.measureText(n.text).width,infoW-codeW-6));write(n.text,n.x+67,cy-9,tw,14.5,'left',sans,'700');write('#'+(n.badge??''),n.x+73+tw,cy-9,codeW,12,'left','monospace','400','#ffd54f');write(n.detail??'',n.x+67,cy+13,infoW,12,'left',sans,'400','#fff4d68c');return;}
  if(n.skin==='message'){box(n.selected?'captain-banner':'message');write(n.detail??'',n.x+10,n.y+13,n.width-20,10,'left',sans,'400','#d4a359');(n.lines??[n.text]).forEach((line,i)=>write(line,n.x+10,n.y+34+i*20,n.width-20,13,'left',sans));return;}
  if(n.kind==='panel'){box();return;}
  if(n.kind==='button'||n.kind==='tab'||n.kind==='choice'){
    ctx.save();ctx.globalAlpha=n.disabled?.58:1;if(n.skin==='account-tab'){if(n.selected)fill(ctx,n,'#296678',22,'transparent');}else box(n.skin==='tab'&&n.selected?'captain-banner':n.skin);
    if(n.skin==='setting'){write(n.text,n.x+12,cy,n.width-64,13,'left',sans);fill(ctx,{...n,x:n.x+n.width-40,y:cy-10,width:24,height:20},n.selected?'#249c8d':'#12283b',4,n.selected?'#7dd3b4':'#d4a35966');if(n.selected)write('✓',n.x+n.width-28,cy,20,15,'center',sans,'700');}
    else if(n.skin==='social-tab'&&n.count){write(n.text,cx-7,cy,n.width-22,12,'center',sans,'600');circle(ctx,n.x+n.width-13,cy,8,'#ff4d4f','transparent');write(String(n.count),n.x+n.width-13,cy,15,10,'center',sans,'700','#fff');}
    else if(n.skin==='profile-toggle'){write(n.text,n.x+14,cy,n.width-28,15,'left',sans,'400','#fbe1ad');}
    else if(n.skin==='account-tab'){write(n.text,cx,cy,n.width-8,14,'center',sans,'400',n.selected?'#e5fbff':'#eddcc4');}
    else if(n.skin==='accordion'){write(n.text,n.x+12,cy,n.width-30,12,'left',display,'700','#ffd875');if(n.detail)write(n.detail,n.x+n.width-8,n.y+n.height-12,n.width-20,10,'right',sans,'400','#d4a359');}
    else {
      const gold=n.skin==='gold-button'||n.skin==='cyan-button'||n.skin==='social-primary'||n.skin==='preference-submit',input=n.skin==='input';ctx.font='400 '+(n.fontSize??13)+'px '+family;const lines=n.lines??wrapText(n.text,n.width-(n.width<60?6:16),t=>ctx.measureText(t).width);
      if(n.skin==='dragon-button'){art(ctx,artwork,'cloud-left',n.x+8,cy-7,24,14);art(ctx,artwork,'cloud-right',n.x+n.width-32,cy-7,24,14);}
      lines.forEach((line,i)=>write(line,input?n.x+12:cx,cy+(i-(lines.length-1)/2)*(n.fontSize??13)*1.4,n.width-(input?24:n.width<60?6:16),n.fontSize??13,input?'left':'center',family,n.weight??(input?'400':'500'),gold?'#1e0908':color));
    }
    ctx.restore();return;
  }
  box();write(n.text,cx,cy,n.width-12);
}

function drawNode(ctx: CanvasRenderingContext2D, n: WebNode, model: ScreenModel, viewportWidth:number, artwork?: Artwork) {
  if(n.skin){drawDocumentNode(ctx,n,model,artwork);return;}
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  if (n.kind === 'metric') {
    fill(ctx, n, '#21110d', 12); const [value, label] = n.text.split('|');
    text(ctx, value!, cx, n.y + 28, n.width - 6, 24, webTheme.accent); text(ctx, label!, cx, n.y + 57, n.width - 6, 11, webTheme.muted);
  } else if (n.kind === 'portrait') {
    portrait(ctx, n, artwork, n.id === 'showcase');
    if (n.id === 'showcase') {
      const nameH=clamp(24,n.width/.34*.05+6.5,27), nameY=n.y+n.height+6;
      const nameW=n.text.length*clamp(16,n.width/.34*.046,21)+53.3;
      const mottoSize=clamp(11,model.web!.user ? n.width/.34*.031 :12,12.5);
      ctx.save();shadow(ctx);
      cornerRect(ctx,{...n,x:cx-nameW/2,y:nameY,width:nameW,height:nameH},6,20,6,20);ctx.fillStyle=gradient(ctx,n,['rgba(58,20,18,.93)','rgba(28,9,8,.97)']);ctx.fill();ctx.strokeStyle='#ffd875';ctx.lineWidth=1;ctx.stroke();
      ctx.restore();
      text(ctx,n.text,cx,nameY+nameH/2,nameW-18,clamp(16,n.width/.34*.046,21),'#fff0cc','center',display,'700',2);
      if(n.detail) {
        ctx.font=mottoSize+'px '+sans;
        const mw=Math.min(n.width/.34-32,ctx.measureText(n.detail).width+20+Array.from(n.detail).length);
        fill(ctx,{...n,x:cx-mw/2,y:nameY+nameH+3,width:mw,height:mottoSize*1.75+4},'#10273db3',10,'transparent');
        text(ctx,n.detail,cx,nameY+nameH+3+(mottoSize*1.75+4)/2,mw-12,mottoSize,'#fff2d8','center',sans,'400',1);
      }
    } else {
      text(ctx,n.text,cx,n.y+n.height+26,n.width+100,16,webTheme.accent,'center',display,'700');
      if(n.detail) text(ctx,n.detail,cx,n.y+n.height+59,n.width+30,12,webTheme.muted);
    }
  } else if (n.kind === 'quest') {
    ctx.save();shadow(ctx);
    cornerRect(ctx,n,18,18,8,8);ctx.fillStyle=gradient(ctx,n,['#441614','#1c0807']);ctx.fill();ctx.strokeStyle=webTheme.border;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    const diameter=Math.min(44,n.height-67.3),radius=diameter/2;
    text(ctx,n.text,cx,n.y+14,n.width+2,13,webTheme.accent,'center',calligraphy,'700',.8);
    const isSuccess = n.passed === true, isFailure = n.passed === false;
    ctx.save();
    if(n.selected) shadow(ctx,'rgba(255,215,100,1)',20,0);
    else if(isSuccess) shadow(ctx,'rgba(16,185,129,0.85)',14,0);
    else if(isFailure) shadow(ctx,'rgba(239,68,68,0.85)',14,0);
    const circleBg = isSuccess ? '#059669' : isFailure ? '#dc2626' : n.selected ? '#f5b545' : '#25100d';
    const circleBorder = isSuccess ? '#a7f3d0' : isFailure ? '#fecaca' : n.selected ? '#fff4b8' : webTheme.border;
    circle(ctx,cx,n.y+23.3+radius,radius,circleBg,circleBorder);ctx.restore();
    if(n.selected) {ctx.beginPath();ctx.arc(cx,n.y+23.3+radius,radius+3,0,Math.PI*2);ctx.strokeStyle='#ffe082';ctx.lineWidth=2;ctx.stroke();}
    if(n.passed===undefined)art(ctx,artwork,'quest-'+n.id.slice(8),cx-radius+3,n.y+26.3,diameter-6,diameter-6);
    if(n.passed!==undefined) {
      ctx.save();shadow(ctx,'rgba(0,0,0,0.8)',4,2);
      text(ctx,n.passed?'✓':'×',cx,n.y+23.3+radius,n.width-8,24,'#ffffff','center',sans,'900');
      ctx.restore();
    }
    const countY=n.y+n.height-42;
    fill(ctx,{...n,x:cx-16,y:countY,width:32,height:20},'#2b0c0a',10);
    text(ctx,n.count+'人',cx,countY+10,30,11.5,webTheme.accent,'center',sans,'700');
    if(n.detail==='需2败')text(ctx,n.detail,cx,n.y+n.height-10,n.width-3,9.5,'#ff9800');
  } else if (n.kind === 'seat') {
    if (n.skin === 'waiting-seat') {
      const cardPad = 3, cardX = n.x + cardPad, cardY = n.y + 2, cardW = n.width - cardPad * 2, cardH = n.height - 4, r = 14;
      const isReady = n.selected;
      ctx.save();
      shadow(ctx, isReady ? '#38bdf855' : 'rgba(0,0,0,0.65)', 8, 3);
      fill(ctx, { ...n, x: cardX, y: cardY, width: cardW, height: cardH },
        gradient(ctx, n, isReady ? ['rgba(24,48,68,0.92)', 'rgba(12,24,36,0.96)'] : ['rgba(44,14,13,0.88)', 'rgba(18,6,6,0.94)']),
        r, isReady ? '#38bdf8' : 'rgba(212,163,89,0.45)');
      edge(ctx, { ...n, x: cardX, y: cardY, width: cardW, height: cardH }, r);
      ctx.restore();

      text(ctx, String(n.count) + '号', cardX + 16, cardY + 13, 30, 10.5, webTheme.accent, 'left', sans, '700');
      if (n.badge) {
        const bw = 38, bh = 15;
        fill(ctx, { ...n, x: cardX + cardW - bw - 6, y: cardY + 6, width: bw, height: bh },
          gradient(ctx, n, n.badge === '房主' ? ['#f59e0b', '#d97706'] : ['#ef4444', '#b91c1c']),
          bh / 2, n.badge === '房主' ? '#fef3c7' : '#fca5a5');
        text(ctx, n.badge, cardX + cardW - bw / 2 - 6, cardY + 13.5, bw - 4, 9, '#ffffff', 'center', sans, '700');
      }

      const diameter = clamp(44, cardW * 0.52, 54);
      const avatarX = cx - diameter / 2, avatarY = cardY + 22;
      ctx.save();
      if (isReady) {
        shadow(ctx, '#38bdf8', 10, 0);
        circle(ctx, cx, avatarY + diameter / 2, diameter / 2 + 2, 'transparent', '#38bdf8');
      }
      circle(ctx, cx, avatarY + diameter / 2, diameter / 2, '#36110f', '#d4a359');
      ctx.restore();

      const img = n.image ? artwork?.get(n.image) : undefined;
      if (n.image?.startsWith('emblems/')&&!/^emblems\/(leaf|moon|sun|mountain|wave|star)\.png$/.test(n.image)) {
        if (img) ctx.drawImage(img as CanvasImageSource, avatarX + 8, avatarY + 8, diameter - 16, diameter - 16);
      } else if (img) {
        portrait(ctx, { ...n, x: avatarX + 2, y: avatarY + 2, width: diameter - 4, height: diameter - 4 }, artwork, true);
      } else {
        text(ctx, n.disabled ? '◇' : '➕', cx, avatarY + diameter / 2, diameter, 20, webTheme.accent);
      }

      if (n.online === false) circle(ctx, avatarX + diameter - 3, avatarY + diameter - 3, 3.5, '#64748b', '#1c0808');
      else if (n.online === true) circle(ctx, avatarX + diameter - 3, avatarY + diameter - 3, 3.5, '#22c55e', '#1c0808');

      const nameY = avatarY + diameter + 6;
      text(ctx, n.text, cx, nameY + 8, cardW - 10, 11.5, n.selfPlayer ? '#38bdf8' : '#f5eedf', 'center', sans, '600');

      const statusY = cardY + cardH - 22;
      if (n.detail === '✓ 已准备') {
        fill(ctx, { ...n, x: cx - 28, y: statusY, width: 56, height: 16 }, 'rgba(16,185,129,0.22)', 8, '#10b981');
        text(ctx, '✓ 已准备', cx, statusY + 8, 52, 9.5, '#34d399', 'center', sans, '700');
      } else if (n.detail === '未准备') {
        fill(ctx, { ...n, x: cx - 24, y: statusY, width: 48, height: 16 }, 'rgba(40,14,14,0.6)', 8, 'rgba(212,163,89,0.3)');
        text(ctx, '未准备', cx, statusY + 8, 44, 9.5, webTheme.muted, 'center', sans, '500');
      } else if (n.detail) {
        text(ctx, n.detail, cx, statusY + 8, cardW - 8, 10, webTheme.accent, 'center', sans, '600');
      }
    } else {
      const diameter = clamp(38, n.height, 44), left = n.x < viewportWidth / 2;
      const avatarX = left ? n.x : n.x + n.width - diameter;
      const avatarY = n.y + (n.height - diameter) / 2;
      ctx.font='400 11.5px '+sans;
      const labelW=Math.min(n.width-diameter-5,ctx.measureText(String(n.count)+'号 · '+n.text).width+12+(n.selfPlayer?18:0));
      const labelX = left ? avatarX + diameter + 5 : avatarX-labelW-5;
      const labelH = clamp(26, n.height * 0.76, 32);
      const nameY = n.y + (n.height - labelH) / 2;

      ctx.save();
      shadow(ctx, n.selected ? '#38bdf866' : n.badge ? '#ffd87566' : 'rgba(0,0,0,.6)', 6, 2);
      fill(ctx, { ...n, x: labelX, y: nameY, width: labelW, height: labelH },
        n.teamStatus ? '#087f78' : gradient(ctx, n, n.team==='red'?['#361010f2','#1a0808fa']:n.selected||n.team==='blue' ? ['#0e2636f5', '#081622fa'] : ['#2e0e0df0', '#140606f5']),
        labelH / 2, n.teamStatus ? '#7ef5dc' : n.team==='red'?'#f87171bf':n.selected||n.team==='blue' ? '#38bdf8bf' : n.badge ? '#ffd875' : '#d4a35999');
      edge(ctx, { ...n, x: labelX, y: nameY, width: labelW, height: labelH }, labelH / 2);
      ctx.restore();

      ctx.save();
      if (n.selected) {
        shadow(ctx, 'rgba(56,189,248,0.7)', 10, 0);
        circle(ctx, avatarX + diameter / 2, avatarY + diameter / 2, diameter / 2 + 2, 'transparent', '#38bdf8');
      } else if (n.badge?.includes('队长')) {
        shadow(ctx, 'rgba(255,216,117,0.7)', 10, 0);
        circle(ctx, avatarX + diameter / 2, avatarY + diameter / 2, diameter / 2 + 2, 'transparent', '#ffd875');
      }
      circle(ctx, avatarX + diameter / 2, avatarY + diameter / 2, diameter / 2, '#36110f',n.team==='blue'?'#38bdf8':n.team==='red'?'#f87171':webTheme.border);
      ctx.restore();

      const img = n.image ? artwork?.get(n.image) : undefined;
      if (n.image?.startsWith('emblems/')&&!/^emblems\/(leaf|moon|sun|mountain|wave|star)\.png$/.test(n.image)) {
        if (img) ctx.drawImage(img as CanvasImageSource, avatarX + 8, avatarY + 8, diameter - 16, diameter - 16);
      } else if (img) {
        portrait(ctx, { ...n, x: avatarX + 2, y: avatarY + 2, width: diameter - 4, height: diameter - 4 }, artwork, true);
      } else {
        text(ctx, '◇', avatarX + diameter / 2, avatarY + diameter / 2, diameter, 20, webTheme.accent);
      }

      if (n.online === false) circle(ctx, avatarX + diameter - 3, avatarY + diameter - 3, 3.5, '#64748b', '#1c0808');


      if (n.micState) drawSeatMicBadge(ctx, avatarX - 2, avatarY + diameter - 16, n.micState);

      const meW=n.selfPlayer?18:0;
      text(ctx,String(n.count)+'号 · '+n.text,labelX+6,nameY+labelH/2,labelW-12-meW,11.5,'#f5eedf','left',sans);
      if(n.selfPlayer){fill(ctx,{...n,x:labelX+labelW-18,y:nameY+(labelH-13)/2,width:13,height:13},'#38bdf840',3,'#38bdf899');text(ctx,'我',labelX+labelW-11.5,nameY+labelH/2,12,8.5,'#38bdf8');}

      if (n.badge) {
        const bw = 46;
        fill(ctx, { ...n, x: avatarX + diameter / 2 - bw / 2, y: avatarY - 12, width: bw, height: 14 },
          gradient(ctx, n, ['#f59e0b', '#d97706']), 7, '#fef3c7');
        text(ctx, n.badge, avatarX + diameter / 2, avatarY - 5, bw - 3, 9.5, '#fffbeb', 'center', sans, '700');
      }
      if (n.teamStatus) {
        const bx = n.badge ? (left ? avatarX + 46 : avatarX - 34) : avatarX;
        fill(ctx,{...n,x:bx,y:avatarY-12,width:30,height:14},'#087f78',7,'#7ef5dc');
        text(ctx,n.teamStatus,bx+15,avatarY-5,28,9.5,'#fff','center',sans,'700');
      }

      if (n.detail) {
        if (model.web!.room?.game) {
          text(ctx, n.detail, avatarX + diameter / 2, avatarY + diameter - 5, 30, 12);
        } else {
          text(ctx, n.detail, labelX + labelW / 2, nameY + labelH + 10, labelW, 9, webTheme.muted);
        }
      }
    }
  } else if (n.kind === 'altar') {
    const r=n.width/2;
    ctx.save();shadow(ctx,'rgba(255,216,117,0.35)',20,0);circle(ctx,cx,cy,r,'#190808','#ffd875');ctx.restore();
    circle(ctx,cx,cy,r-3,'#170706','rgba(212,163,89,0.6)');
    const compact=n.width<48, directionW=Math.min(60,n.width-4);
    ctx.save();shadow(ctx,'rgba(255,216,117,0.9)',12,0);text(ctx,n.text,cx,cy-(compact?5:12),n.width,clamp(18,n.width*.36,28),webTheme.accent);ctx.restore();
    if(!compact){fill(ctx,{...n,x:cx-directionW/2,y:cy+1,width:directionW,height:12},'#0f0404cc',7,'#e5b96480');
    text(ctx,n.detail??'',cx,cy+7,directionW,9,'#eedcc4','center',sans,'700');}
    if(n.count===undefined&&model.web?.room?.game?.result)text(ctx,'胜负已分',cx,cy+(compact?9:19),n.width,9,webTheme.accent,'center',sans,'600');
    if(n.count)text(ctx,'第 '+n.count+' 难',cx,cy+(compact?9:19),n.width,9,webTheme.accent,'center',sans,'600');
  } else if (n.kind === 'panel') {
    ctx.save();
    if(n.id==='arena-frame') {
      arenaFill(ctx,n);
    } else if(n.id==='mode-frame') fill(ctx,n,'rgba(15,25,31,.88)',24,'#d4a35966');
    else {shadow(ctx,'rgba(0,0,0,.75)',22,n.id==='action-dock'?-8:3);fill(ctx,n,gradient(ctx,n,['rgba(58,20,18,.96)','rgba(28,9,8,.98)']),n.id==='action-dock'?26:18,n.id==='action-dock'?'#e5b964':'#e5b96488');}
    ctx.restore();
    if(n.id==='action-dock'&&model.web?.room?.game){
      edge(ctx,n,26);
      const dw=clamp(70,n.width*.18,105),dh=clamp(38,n.width*.1,58);
      art(ctx,artwork,'dragon-left',n.x-4,n.y+n.height-dh,dw,dh);art(ctx,artwork,'dragon-right',n.x+n.width-dw+4,n.y+n.height-dh,dw,dh);
    }
    if(n.text)text(ctx,n.text,cx,n.y+28,n.width-30,22,webTheme.accent,'center',display,'700');
  } else if (n.kind === 'label') {
    if (n.id === 'brand') {
      const w=n.width+28, size=n.fontSize??clamp(26,w*.076,34);
      ctx.save();ctx.font='400 '+size+'px '+calligraphy;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=.6;ctx.strokeStyle='#f8e4b7';shadow(ctx,'rgba(249,231,191,.65)',14,4);
      const spacing=clamp(1.5,viewportWidth*.006,4),dotMargin=clamp(4,viewportWidth*.012,10),left=['嘻','游'],right=['真','假','猴','王'];
      const wordWidth=(letters:string[])=>letters.reduce((sum,c)=>sum+ctx.measureText(c).width+spacing,0),lw=wordWidth(left),rw=wordWidth(right);
      ctx.font='700 '+size+'px '+sans;const dw=ctx.measureText('·').width;let px=cx-(lw+rw+dw+dotMargin*2)/2;
      ctx.textAlign='left';ctx.font='400 '+size+'px '+calligraphy;
      for(const c of left){ctx.strokeText(c,px,cy);ctx.fillStyle='#7d231f';ctx.fillText(c,px,cy);px+=ctx.measureText(c).width+spacing;}
      px+=dotMargin;text(ctx,'·',px+dw/2,cy-size*.04,dw,size,'#7d231f','center',sans,'700');px+=dw+dotMargin;
      ctx.font='400 '+size+'px '+calligraphy;ctx.textAlign='left';for(const c of right){ctx.strokeText(c,px,cy);ctx.fillStyle='#7d231f';ctx.fillText(c,px,cy);px+=ctx.measureText(c).width+spacing;}ctx.restore();

    } else if (n.id === 'ribbon') {
      const g=ctx.createLinearGradient(n.x,n.y,n.x+n.width,n.y);for(const [p,c] of [[0,'transparent'],[.15,'#5f1816eb'],[.5,'#87221ef7'],[.85,'#5f1816eb'],[1,'transparent']] as const)g.addColorStop(p,c);
      ctx.fillStyle=g;ctx.fillRect(n.x,n.y,n.width,n.height);rule(ctx,n,'#ffd875');rule(ctx,{...n,y:n.y+n.height},'#ffd875');
      if(model.web?.room&&!model.web.room.game){text(ctx,'〰',cx-132,cy,20,14,'#ffd875');text(ctx,'〰',cx+132,cy,20,14,'#ffd875');}else{art(ctx,artwork,'cloud-left',n.x+3,n.y+9,26,14);art(ctx,artwork,'cloud-right',n.x+n.width-29,n.y+9,26,14);}
      const lines=n.text.split('\n');lines.forEach((line,i)=>text(ctx,line,cx,cy+(i-(lines.length-1)/2)*19,n.width-48,model.web?.room&&!model.web.room.game?21:clamp(12.5,(n.width+20)*.034,15),'#fff4d6','center',calligraphy,'700'));
    } else if(n.id==='free-access') {
      ctx.save();shadow(ctx,'#ffd87566',12,0);fill(ctx,n,gradient(ctx,n,['#a81e18f0','#780f0cfa']),14,'#ffd875');ctx.restore();
      text(ctx,n.text,cx,cy,n.width-20,11,'#fff9e6','center',display,'400',.3);
    } else if(n.id==='footer-dot')text(ctx,'·',cx,cy,20,13,webTheme.muted);
    else if(['footer-rule','dock-divider'].includes(n.id)) rule(ctx,n);
    else if(n.id==='dock-rule')text(ctx,n.text,cx,cy,n.width-5,13,webTheme.accent,'center',display,'700');
    else if(n.id==='dock-waiting') {
      const lines=n.text.split('\n');lines.forEach((line,index)=>text(ctx,line,cx,cy+(index-(lines.length-1)/2)*23,n.width-8,index?12:16,index?webTheme.muted:webTheme.accent,'center',index?sans:display,'700'));
    } else {
      if (n.id === 'score') {fill(ctx,n,gradient(ctx,n,['rgba(56,18,16,.3)','rgba(68,22,20,.95)','rgba(56,18,16,.3)']),0,'transparent');rule(ctx,n,'#e5b96466');rule(ctx,{...n,y:n.y+n.height},'#e5b96466');}
      if (model.web?.page === 'sheet' && !['page-title'].includes(n.id)) fill(ctx, n, 'rgba(21,29,41,.75)', 10, 'rgba(212,163,89,.26)');
      const lines = n.id === 'score' || n.id === 'page-title' ? [n.text] : n.lines ?? wrapText(n.text, n.width - 20);
      const fontSize = n.id === 'score' ? 10 : n.id === 'page-title' ? 16 : n.muted ? 11 : 13;
      lines.forEach((line, index) => text(ctx, line, cx, n.y + (n.height - lines.length * 22) / 2 + 11 + index * 22, n.width - 16, fontSize, n.team === 'blue' ? webTheme.blue : n.team === 'red' ? webTheme.red : n.muted ? webTheme.muted : webTheme.text));
    }
  } else {
    const primary = n.primary, home=model.web!.page==='home', table=model.web!.page==='table';
    const isDirection=n.id==='direction',isCTA=n.id==='propose'||n.id==='startTeamVote';
    const color=isCTA&&n.disabled?gradient(ctx,n,['#442825','#221210']):n.kind==='input'?'rgba(26,8,8,.97)':primary ? gradient(ctx,n,home?['#328ea0','#145b6c']:isCTA?['#74291d','#44120e']:['#27657b','#15404f']) : isDirection?gradient(ctx,n,['#581816','#260a09']):gradient(ctx,n,['rgba(62,22,20,.92)','rgba(28,9,8,.96)']);
    ctx.save();ctx.globalAlpha=n.disabled&&!isCTA ? .58 : 1;
    const radius=home&&['create','join'].includes(n.id)?14:n.badge==='utility'?6:n.id==='copyRoom'?5:n.kind==='choice'?12:n.height/2;
    if(n.badge==='utility')utilityFill(ctx,n);
    else if(!n.muted&&!(home&&n.id==='mode:voice')){shadow(ctx);fill(ctx,n,color,radius,primary&&home?'#f5dfa8':n.selected?'#f5dfa8':webTheme.border);ctx.shadowBlur=0;ctx.shadowOffsetY=0;if(!n.fixed)edge(ctx,n,radius);}
    if(home&&n.id==='mode:offline'){fill(ctx,n,gradient(ctx,n,['#27657b','#15404f']),16,'#f5dfa8');}
    if(home&&n.id==='friends'&&n.count){text(ctx,'♟ 仙友',cx-7,cy,n.width-25,13,'#fff3d6','center',homeInterface,'400');circle(ctx,n.x+n.width-14,cy,8,'#dc2626','#f87171');text(ctx,String(Math.min(n.count,99)),n.x+n.width-14,cy,15,11,'#fff','center',sans,'700');ctx.restore();return;}
    if(n.id==='sound'){soundIcon(ctx,home&&n.width>50?n.x+20:cx,cy);if(home&&n.width>50)text(ctx,'静音',n.x+46,cy,36,13,'#fff3d6','center',homeInterface,'400');ctx.restore();return;}
    if(table&&n.fixed&&['leave','exitPractice'].includes(n.id)){ctx.save();ctx.translate(n.x+1,n.y+1);ctx.strokeStyle='#ffd875';ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(9,14);ctx.lineTo(5,10);ctx.lineTo(9,6);ctx.moveTo(5,10);ctx.lineTo(16,10);ctx.bezierCurveTo(22,10,22,18,16,18);ctx.stroke();ctx.restore();ctx.restore();return;}
    if(n.id==='copyRoom'){
      circle(ctx,n.x+8,n.y+8,3,'#22c55e','#22c55e');text(ctx,n.text,n.x+14,n.y+8,n.width-16,11,webTheme.accent,'left',sans,'700');text(ctx,n.detail??'',n.x+5,n.y+20,n.width-6,8,webTheme.muted,'left');ctx.restore();return;
    }
    if(home&&n.badge==='home-avatar'&&n.image){circle(ctx,n.x+17,cy,14,'#183041','#d4a359');ctx.save();circle(ctx,n.x+17,cy,13,'#210d0b');ctx.clip();const avatar=artwork?.get(n.image);if(avatar?.width)ctx.drawImage(avatar as CanvasImageSource,n.x+4,cy-13,26,26);ctx.restore();text(ctx,n.text,n.x+32+(n.width-37)/2,cy,n.width-36,12,webTheme.text,'center',homeInterface,'400');ctx.restore();return;}
    if(isCTA&&!n.disabled){art(ctx,artwork,'cloud-left',n.x+5,cy-8,24,14);art(ctx,artwork,'cloud-right',n.x+n.width-29,cy-8,24,14);}
    if(home&&n.image){art(ctx,artwork,n.image.slice(8,-4),n.x+n.width/2-55,cy-10,20,20);}
    if (n.id.startsWith('mission-choice:')) {
      const success = n.id.endsWith('success'), icon = artwork?.get('emblems/' + (success ? 'blue' : 'red') + '.png');
      if (icon) ctx.drawImage(icon as CanvasImageSource, cx - 30, n.y + 24, 60, 60);
      text(ctx, n.text, cx, n.y + 108, n.width - 20, 20, success ? '#5ef2cf' : '#ff9c8f');
      text(ctx, n.selected ? '✓ 已选中' : '点击选择', cx, n.y + 132, n.width - 20, 11, webTheme.muted);
      ctx.restore(); return;
    }
    const lines = home || n.height <= 38 || n.badge==='utility' ? [table && n.fixed && n.width<45 ? n.text.replace(' ', '') : n.text] : n.lines ?? wrapText(n.text, n.width - 20);
    const fontFace = home ? homeInterface : n.kind === 'input' || n.kind === 'tab' ? sans : isDirection || isCTA ? calligraphy : home && n.height > 38 && n.kind !== 'button' ? display : sans;
    const fontWt = home || n.kind === 'input' ? '400' : home && n.height <= 36 ? '500' : '700';
    lines.forEach((line, index) => text(ctx, line, cx+(home&&n.image&&n.badge!=='home-avatar'?12:0), n.y + (n.height - lines.length * 21) / 2 + 10 + index * 21, table ? n.width-4 : n.width - 14, home ? n.fontSize??13 : n.badge==='utility'?clamp(12,viewportWidth*.034,14):table&&n.fixed?n.width<45?10:11:isDirection?14.5:14, home&&n.muted?'#fff3cc':n.kind === 'input' ? webTheme.muted : n.id==='logout'?'#fca5a5':isCTA&&n.disabled?'#8c7365':isDirection||isCTA?webTheme.accent:'#fff3d6', 'center', fontFace, fontWt));
    ctx.restore();
  }
}

export function configureDocumentMetrics(canvas:HTMLCanvasElement){
 const ctx=canvas.getContext('2d');if(!ctx)return;
 setDocumentTextMeasurer((value,size,face='sans',weight='400')=>{const family=face==='display'?display:face==='calligraphy'?calligraphy:face==='system'?'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif':sans;const familyKey=face==='sans'&&nativeSans?(sansWeights[weight]??sans):family,renderWeight=(face==='sans'&&!nativeSans)||face==='system'?weight:'400';const key=familyKey+'|'+renderWeight+'|'+size+'|'+value,cached=documentWidths.get(key);if(cached!==undefined)return cached;ctx.save();ctx.font=renderWeight+' '+size+'px '+familyKey;const width=ctx.measureText(value).width;ctx.restore();if(documentWidths.size>8192)documentWidths.clear();documentWidths.set(key,width);return width;});
}
export function renderWebScreen(model: ScreenModel, canvas: HTMLCanvasElement, v: SafeViewport, artwork?: Artwork, preparedLayout?: WebLayout): HitRegion[] {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D is unavailable');
  configureDocumentMetrics(canvas);
  const modal = model.web!.document?.modal;
  if (modal) {
    const underlay=model.web!.underlay??{title:'',rows:[],web:{page:'home' as const,user:model.web!.document?.user,guestHome:!model.web!.document?.user}};
    renderWebScreen(underlay,canvas,v,artwork);if(model.web!.document?.kind!=='admin-friends')drawBlurredBackdrop(canvas,ctx,v,underlay,artwork);
    ctx.fillStyle = model.web!.document?.kind==='art'?'rgba(4,9,16,.88)':model.web!.document?.kind==='admin-friends'?'rgba(0,0,0,.7)':'rgba(7, 26, 44, 0.78)';
    ctx.fillRect(0, 0, v.width, v.height);
  }
  const scene = model.web!.background ?? (model.web!.page === 'home' ? 'gate' : model.web!.page === 'setup' ? 'library' : model.web!.page === 'table' ? model.web!.room?.game ? 'sword' : 'pavilion' : 'library');
  if (!modal) { ctx.fillStyle = '#0c0505'; ctx.fillRect(0, 0, v.width, v.height); }
  const admin=model.web!.document?.kind==='admin';
  if(admin){const g=ctx.createRadialGradient(v.width/2,v.height*.1,0,v.width/2,v.height*.1,v.height);g.addColorStop(0,'#151b26');g.addColorStop(1,'#0b0f17');ctx.fillStyle=g;ctx.fillRect(0,0,v.width,v.height);}
  const bg = admin?undefined:artwork?.get('scenes/' + scene + '.webp');
  if (!modal && bg?.width && bg.height) {
    const scale = Math.max(v.width / bg.width, v.height / bg.height);
    ctx.drawImage(bg as CanvasImageSource, (v.width - bg.width * scale) / 2, (v.height - bg.height * scale) * (scene === 'gate' ? 0.46 : scene === 'sword' ? 0.4 : scene === 'pavilion' ? 0.55 : 0.5), bg.width * scale, bg.height * scale);
  }
  // Web scene is shown at full opacity; do not add an extra Mini Game dark veil.
  const layout = preparedLayout ?? layoutWebScreen(model, v);
  for (const node of [...layout.nodes.filter(item => item.fixed && item.id === 'dialog-frame'), ...layout.nodes.filter(item => !item.fixed), ...layout.nodes.filter(item => item.fixed && item.kind === 'panel' && item.id !== 'dialog-frame'), ...layout.nodes.filter(item => item.fixed && item.kind !== 'panel')]) {
    // Clipping alone still issues all text/image draw calls for long documents.
    if (node.y + node.height < (node.clipTop ?? v.top) - 24 || node.y > (node.clipBottom ?? v.height-v.bottom) + 24) continue;
    ctx.save();
    if (!node.fixed) { ctx.beginPath(); ctx.rect(node.clipLeft??0, node.clipTop ?? layout.contentTop, (node.clipRight??v.width)-(node.clipLeft??0), (node.clipBottom ?? layout.contentBottom) - (node.clipTop ?? layout.contentTop)); ctx.clip(); }
    drawNode(ctx, node, model, v.width, artwork); ctx.restore();
  }
  if (layout.maxScroll > 0) {
    const height = layout.contentBottom - layout.contentTop, thumb = Math.max(24, height * height / (height + layout.maxScroll));
    ctx.fillStyle = '#ffd87588'; ctx.fillRect(v.width - 5, layout.contentTop + (model.scroll ?? 0) / layout.maxScroll * (height - thumb), 2, thumb);
  }
  // Reverse paint order so a toast or fixed dock owns the tap instead of a covered seat.
  if(model.web!.document)return [...layout.nodes.filter(n=>!n.disabled&&['button','choice','tab'].includes(n.kind)&&n.y+n.height>(n.clipTop??v.top)&&n.y<(n.clipBottom??v.height-v.bottom)).reverse().sort((a,b)=>Number(Boolean(b.fixed))-Number(Boolean(a.fixed))),...layout.nodes.filter(n=>n.kind==='hitbox')];
  return [...layout.nodes].sort((a, b) => Number(Boolean(b.fixed)) - Number(Boolean(a.fixed)))
    .filter(node => !node.disabled && !['label', 'panel', 'altar', 'metric'].includes(node.kind)
      && node.y + node.height > (node.clipTop ?? v.top) && node.y < (node.clipBottom ?? v.height - v.bottom));
}
