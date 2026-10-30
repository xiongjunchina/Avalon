import type { Artwork } from './assets.js';
import { hitTest, wrapText, type HitRegion, type SafeViewport } from './layout.js';
import { layoutWebScreen, type WebNode, type WebLayout } from './web-layout.js';
import type { ScreenModel } from './widgets.js';

// Matches apps/web/src/scenes.css (Scheme A-2).
const cnSans = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,-apple-system,sans-serif';
const cnKaiti = '"STKaiti","Kaiti SC","Ma Shan Zheng",' + cnSans;
let sans = cnSans;
let display = '"ZCOOL XiaoWei",' + cnSans;
let calligraphy = '"Ma Shan Zheng",' + cnKaiti;
export function setWebFonts(fonts: { sans?: string; display?: string; calligraphy?: string }) {
  if (fonts.sans) sans = JSON.stringify(fonts.sans) + ',' + cnSans;
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
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
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
function gradient(ctx: CanvasRenderingContext2D, n: WebNode, colors: string[]) {
  const value = ctx.createLinearGradient(n.x, n.y, n.x + n.width * .25, n.y + n.height);
  colors.forEach((color, index) => value.addColorStop(index / (colors.length - 1), color)); return value;
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 14, color = webTheme.text, align: CanvasTextAlign = 'center', family = sans, weight = '400', spacing = 0) {
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.font = weight + ' ' + size + 'px ' + family; ctx.fillStyle = color;
  let glyphs = Array.from(value);
  const measure = () => ctx.measureText(glyphs.join('')).width + Math.max(0,glyphs.length-1)*spacing;
  while (glyphs.length && measure() > width) glyphs.pop();
  if(glyphs.join('')!==value && glyphs.length) glyphs[glyphs.length-1]='…';
  if(spacing) {
    let px=x-(align==='center'?measure()/2:align==='right'?measure():0);
    ctx.textAlign='left';for(const char of glyphs){ctx.fillText(char,px,y);px+=ctx.measureText(char).width+spacing;}
  } else ctx.fillText(glyphs.join(''),x,y);

}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, line = webTheme.border) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke();
}
function portrait(ctx: CanvasRenderingContext2D, n: WebNode, artwork?: Artwork, round = false) {
  const x = n.x, y = n.y, width = n.width, height = n.height;
  ctx.save();
  if (round) { circle(ctx, x + width / 2, y + height / 2, width / 2, '#210d0b'); ctx.clip(); }
  else { rect(ctx, x, y, width, height, 12); ctx.clip(); }
  const img = n.image ? artwork?.get(n.image) : undefined;
  if (img?.width && img.height) {
    const scale = Math.max(width / img.width, height / img.height);
    ctx.drawImage(img as CanvasImageSource, x + (width - img.width * scale) / 2, y + (height - img.height * scale) / 2, img.width * scale, img.height * scale);
  } else { ctx.fillStyle = '#25100e'; ctx.fillRect(x, y, width, height); text(ctx, '☯', x + width / 2, y + height / 2, width, Math.min(42, width / 2), webTheme.accent); }
  ctx.restore();
  if (round) {
    for (const inset of [0, 5, -5]) { ctx.beginPath(); ctx.arc(x + width / 2, y + height / 2, width / 2 + inset, 0, Math.PI * 2); ctx.strokeStyle = inset === 0 ? webTheme.accent : '#d4a35977'; ctx.lineWidth = inset === 0 ? 3 : 1; ctx.stroke(); }
  } else { rect(ctx, x, y, width, height, 12); ctx.strokeStyle = n.team === 'blue' ? '#5ef2ff88' : '#ef444488'; ctx.stroke(); }
}
function art(ctx: CanvasRenderingContext2D, artwork: Artwork | undefined, name: string, x: number, y: number, w: number, h: number) {
  const img = artwork?.get('emblems/' + name + '.png');
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
  if(n.kind==='hitbox')return;
  const cx=n.x+n.width/2,cy=n.y+n.height/2;
  const family=n.fontFace==='display'?display:n.fontFace==='calligraphy'?calligraphy:sans;
  const color=n.tone==='red'?'#f87171':n.tone==='green'?'#34d399':n.tone==='blue'?'#7dd3fc':n.tone==='gold'?'#ffd875':n.tone==='muted'?'#cbdbe8':'#fff2d5';
  const write=(value:string,x:number,y:number,w:number,size=n.fontSize??13,align:CanvasTextAlign=n.align??'center',font=family,weight=n.weight??'400',c=color)=>text(ctx,value,x,y,w,size,c,align,font,weight);
  const box=(skin=n.skin)=>{
    const colors:Record<string,string[]>={
      'dialog-frame':['#152e49e8','#112b44ed'], 'vote-frame':['#240a09','#170505','#0d0202'],
      'page-heading':['#3a1418ed','#1c0908f7'], 'card':['#3a1418ed','#1c0908f7'], 'knowledge':['#102b43b8','#102b43b8'],
      'profile':['#14374fda','#14374fda'], 'profile-toggle':['#16344edb','#16344edb'],
      'hint':['#102a40e8','#102a40e8'],'tip':['#e5b96420','#b48c4614'], 'progress':['#100303','#100303'],
      'expedition':['#271629','#160d1c'], 'tabs':['#30100ef5','#1c0908f7'], 'metrics':['#3a1418ed','#1c0908f7'],
      'success-hero':['#104539ee','#09251fee'],'failure-hero':['#5b1b17ee','#2b0c0aee'],
      'input':['#1e0a09e6','#1e0a09e6'],'accordion':['#3b1409aa','#1e0808ee'],
      'gold-button':['#ffd875','#f5a623','#d97706'], 'dragon-button':['#6d2718','#32100c'],
      'vote-prompt':['#2d0b09','#1e0706'], 'setting':['#112c42bb','#112c42bb'],
      'treasure-entry':['#112b43b0','#112b43b0'],'submitted':['#123c30dd','#0a241ddd'],
      'faction-blue':['#163354ee','#071d30f5'],'faction-red':['#421221ee','#210810f5'],'cyan-button':['#5ef2ff','#24b8cc'],'toast':['#11273bfa','#0b1929fa'],'warning':['#551812eb','#551812eb'],'captain-banner':['#0b4e64','#16808b'], 'message':['#112a40ed','#112a40ed'],
    };
    let radius=['dialog-frame'].includes(skin??'')?24:skin==='page-heading'?0:skin==='vote-frame'?18:skin==='pill'||skin==='tabs'?24:skin==='input'?14:skin==='voter-chip'?5:12;
    const colorsNow=colors[skin??'']??(n.selected?['#27657b','#15404f']:['#3e1614eb','#1c0908f5']);
    ctx.save();if(['dialog-frame','vote-frame','card','gold-button'].includes(skin??''))shadow(ctx,'#00000099',skin==='dialog-frame'?24:12,4);
    fill(ctx,n,gradient(ctx,n,colorsNow),radius,skin==='dialog-frame'?'#e5b964':skin==='vote-frame'?'#e0aa3e':n.selected?'#ffd875':'#d4a35966');ctx.restore();
  };
  const image=(path:string|undefined,x:number,y:number,w:number,h:number,round=false)=>{
    const img=path?artwork?.get(path):undefined;
    ctx.save();if(round){ctx.beginPath();ctx.arc(x+w/2,y+h/2,w/2,0,Math.PI*2);ctx.clip();}
    if(img?.width&&img.height){const scale=Math.max(w/img.width,h/img.height);ctx.drawImage(img as CanvasImageSource,x+(w-img.width*scale)/2,y+(h-img.height*scale)/2,img.width*scale,img.height*scale);}else {ctx.fillStyle='#10283b';ctx.fillRect(x,y,w,h);art(ctx,artwork,'cards',x+w*.2,y+h*.2,w*.6,h*.6);}
    ctx.restore();
  };
  if(n.skin==='rule'){rule(ctx,n,'#d0be8d66');return;}
  if(n.skin==='current-summary'){fill(ctx,n,'#280e0de6',10,'#e5b96499');write(n.text,cx,cy,n.width-16,12,'center',sans,'600','#ffd875');return;}
  if(n.skin==='text'||n.skin==='section-title'||n.skin==='page-heading') {
    if(n.skin==='section-title'||n.skin==='page-heading'){box(n.skin==='page-heading'?'page-heading':'tip');}
    const lines=n.lines??n.text.split('\n'),lh=n.lineHeight??(n.fontSize??13)*1.5;
    lines.forEach((line,i)=>write(line,n.align==='left'?n.x:n.align==='right'?n.x+n.width:cx,n.y+lh/2+i*lh,n.width,n.fontSize??13,n.align??'center'));
    return;
  }
  if(n.skin==='result-hero') {
    const info=JSON.parse(n.detail??'{}') as {won?:boolean;self?:string;reason?:string;teams?:{team:string;players:string[]}[]};
    fill(ctx,n,gradient(ctx,n,['#3a1418ed','#1c0908f7']),22,'#e5b964');
    circle(ctx,n.x+40,n.y+36,23,'#e5b96422','#e5b96477');write(info.won?'🏆':'⚖️',n.x+40,n.y+36,42,27);
    write(info.won?'VICTORY · 你的阵营获胜':'MATCH RESULT · 本局结算',n.x+76,n.y+23,n.width-90,11,'left',sans,'700','#ffd875');
    write(n.text,n.x+76,n.y+47,n.width-90,23,'left',display,'700','#ffd875');
    fill(ctx,{...n,x:n.x+16,y:n.y+70,width:n.width-32,height:36},'#0d111ddd',9,'#d4a35944');write((n.team==='blue'?'🛡 蓝方获胜':n.team==='red'?'⚔ 红方获胜':'本局不计胜负')+'  '+(info.reason??''),n.x+27,n.y+88,n.width-54,12,'left',sans,'600','#e5decb');
    let gy=n.y+117;
    for(const group of info.teams??[]){const rows=Math.ceil(group.players.length/2),gh=30+rows*25;fill(ctx,{...n,x:n.x+16,y:gy,width:n.width-32,height:gh},group.team==='blue'?'#14304b80':'#6a151580',10,group.team==='blue'?'#7dd3fc66':'#ef444466');write(group.team==='blue'?'🛡 蓝方阵营':'⚔ 红方阵营',n.x+27,gy+14,n.width-54,12,'left',display,'600',group.team==='blue'?'#7dd3fc':'#fca5a5');
      group.players.forEach((name,i)=>{const cw=(n.width-56)/2,px=n.x+24+i%2*(cw+8),py=gy+30+Math.floor(i/2)*25;fill(ctx,{...n,x:px,y:py,width:cw,height:20},'#101522dd',4,group.team==='blue'?'#7dd3fc77':'#fca5a577');write(name,px+5,py+10,cw-10,10.5,'left',sans,'600',group.team==='blue'?'#cdeaff':'#ffd0ca');});gy+=gh+8;
    }return;
  }
  if(n.skin==='mission-card'){
    const success=n.tone==='green';ctx.save();if(n.selected)shadow(ctx,success?'#34d399':'#f87171',12,0);fill(ctx,n,gradient(ctx,n,success?['#123b31','#08231e']:['#4d1715','#270b0a']),12,n.selected?'#ffd875':success?'#34d399aa':'#f87171aa');ctx.restore();
    if(n.height<=60){write((success?'🪷':'🔥')+' '+n.text+(n.selected?' ✓':''),cx,cy,n.width-12,15,'center',display,'700',success?'#7ee7cf':'#fca5a5');return;}
    write(success?'🪷':'🔥',cx,n.y+20,n.width-10,22);write(n.text,cx,n.y+45,n.width-10,15,'center',display,'700',success?'#7ee7cf':'#fca5a5');write(n.detail??'',cx,n.y+64,n.width-8,10.5,'center',sans,'400','#eddcc4');write(n.selected?'✓ 已选中':'点击选择',cx,n.y+88,n.width-10,10.5,'center',sans,'700','#eddcc4');return;
  }
  if(n.skin==='count'){ctx.save();if(n.selected)shadow(ctx,'#5ef2ffaa',12,0);circle(ctx,cx,cy,Math.min(n.width,n.height)/2-1,n.selected?'#246d7b':'#17354b',n.selected?'#b5ffff':'#d0be8d');ctx.restore();write(n.text,cx,cy,n.width-5,n.fontSize??18,'center',display,'700');return;}
  if(n.skin==='setup-mode') {fill(ctx,n,gradient(ctx,n,n.selected?['#235467','#123440']:['#191c27','#111520']),16,'#d4a359');const [title,sub]=n.text.split('\n');write(title??'',cx,n.y+17,n.width-12,13.5,'center',sans,'700',n.selected?'#ffd54f':'#b8a99b');write(sub??'',cx,n.y+36,n.width-10,10.5,'center',sans,'400','#b5cddd');return;}
  if(n.skin==='setup-role'){
    const imgSize=n.width-4;
    fill(ctx,n,gradient(ctx,n,n.team==='blue'?['#1a4bb8','#102a4b']:['#9e1115','#4b1015']),8,n.team==='blue'?'#4d88ff':'#e04a4e');
    image(n.image,n.x+2,n.y+2,imgSize,imgSize);
    const labelY=n.y+2+imgSize;
    const nameSize=n.text.length>3&&n.badge?11:12.5;
    ctx.font=`700 ${nameSize}px ${sans}`;
    const nameW=ctx.measureText(n.text).width;
    if(n.badge){
      const badgeW=18,badgeH=14,gap=4,totalW=nameW+gap+badgeW,startX=cx-totalW/2;
      text(ctx,n.text,startX+nameW/2,labelY+14,nameW+2,nameSize,'#ffffff','center',sans,'700');
      fill(ctx,{...n,x:startX+nameW+gap,y:labelY+7,width:badgeW,height:badgeH},'#ffffff',3);
      text(ctx,n.badge,startX+nameW+gap+badgeW/2,labelY+14,badgeW,10,'#1a3878','center',sans,'700');
    } else {
      text(ctx,n.text,cx,labelY+14,n.width-6,nameSize,'#ffffff','center',sans,'700');
    }
    write(n.detail??'',cx,labelY+30,n.width-6,9.5,'center',sans,'400','rgba(255,255,255,0.65)');
    return;
  }
  if(n.skin==='identity-card') {
    fill(ctx,n,gradient(ctx,n,['#102b43e0','#081826f5']),14,n.team==='blue'?'#52b0ff88':'#ff5e5788');
    const diameter=clamp(56,(n.width+54)*.14,68),px=n.x+12,py=cy-diameter/2;
    image(n.image,px,py,diameter,diameter,true);
    for(const extra of [0,4]){ctx.beginPath();ctx.arc(px+diameter/2,cy,diameter/2+extra,0,Math.PI*2);ctx.strokeStyle=n.team==='blue'?(extra?'#52b0ff':'#9cd4ff'):(extra?'#ff5e57':'#ff9e96');ctx.lineWidth=2;ctx.stroke();}
    const tx=px+diameter+14,tw=n.x+n.width-tx-10,[title,motto]=n.detail?.split('|')??[];
    fill(ctx,{...n,x:tx,y:n.y+10,width:tw,height:24},'#0a1b28cc',6,'#d0be8d66');
    write((n.badge??(n.team==='blue'?'蓝方 · 取经正果':'红方 · 群妖乱道'))+' · '+(title??''),tx+tw/2,n.y+22,tw-10,11,'center',display,'700','#e5d7ae');
    write(n.text,tx,n.y+52,tw,22,'left',display,'700','#f1dba7');
    write(motto??'',tx,n.y+72,tw,10.5,'left',sans,'400','#cbdbe8');
    write('🔍 点击赏析高清大图',tx,n.y+93,tw,10,'left',sans,'400','#ffd875');return;
  }
  if(n.skin==='waiting-seat') {
    const d=Math.min(54,n.width*.48),py=n.y+25;
    if(n.image){ctx.save();if(n.selected)shadow(ctx,'#ffd875',13,0);circle(ctx,cx,py+d/2,d/2+2,'#2b0c0a','#e5b964');ctx.restore();
      if(n.image.startsWith('emblems/'))art(ctx,artwork,n.image.slice(8,-4),cx-14,py+d/2-14,28,28);else image(n.image,cx-d/2,py,d,d,true);
    } else {circle(ctx,cx,py+d/2,d/2,'#16344e55','#d4a35966');write('+',cx,py+d/2,40,25);}
    if(n.badge){fill(ctx,{...n,x:cx-24,y:n.y+7,width:48,height:17},n.badge==='房主'?'#ffd875':'#9b3434',7,'#d4a359');write(n.badge,cx,n.y+16,46,10,'center',sans,'600',n.badge==='房主'?'#392012':'#fff');}
    fill(ctx,{...n,x:n.x+12,y:py+d+10,width:n.width-24,height:23},'#2b0c0a',10,'#d4a35977');write(n.text,cx,py+d+22,n.width-28,12,'center',display,'600',n.selfPlayer?'#ffd875':'#fff3d6');
    if(n.selected)fill(ctx,{...n,x:cx-34,y:py+d+36,width:68,height:20},'#0eaa75',10,'#b1ffe0');
    write(n.detail??'',cx,py+d+46,n.width-12,12,'center',sans,'600',n.selected?'#fff':'#ead8b8');return;
  }
  if(n.skin==='waiting-option'){fill(ctx,n,'#15334caa',8,'#d4a35988');write(n.text,cx,n.y+14,n.width-8,12,'center',sans,'400','#ede2cb');write(n.detail??'',cx,n.y+32,n.width-8,10,'center',sans,'600','#ffd875');return;}
  if(n.skin==='waiting-primary'){fill(ctx,n,gradient(ctx,n,n.selected?['#294c59','#17323c']:['#258298','#155366']),16,'#dec895');write(n.text,cx,cy,n.width-12,13,'center',display,'600','#fff1ce');return;}
  if(n.skin==='token'||n.skin==='avatar'||n.skin==='avatar-choice') {
    if(n.skin==='avatar-choice'){box('button');image(n.image,n.x+4,n.y+4,n.width-8,n.height-8,true);return;}
    const party=n.detail?.startsWith('出征'),diameter=n.skin==='avatar'?Math.min(n.width,n.height):party?36:Math.min(38,n.width-10),px=cx-diameter/2,py=party?n.y+26:n.y+1;
    if(party){const frame=artwork?.get('emblems/'+(n.detail?.includes('|我')?'ruyi-self':'ruyi')+'.png');if(frame)ctx.drawImage(frame as CanvasImageSource,n.x,n.y,n.width,n.height);else box('tip');}
    circle(ctx,cx,py+diameter/2,diameter/2+2,n.skin==='avatar'?'#122b34':'#2b0c0a',party&&n.detail?.includes('|我')?'#00d2ff':'#d0be8d');
    if(n.image?.startsWith('emblems/')){art(ctx,artwork,n.image.slice(8,-4),px+diameter*.28,py+diameter*.28,diameter*.44,diameter*.44);}else image(n.image,px,py,diameter,diameter,true);
    if(n.skin!=='avatar'){const caption=party?n.text+(n.detail?.includes('|我')?'（你）':''):String(n.count)+'号 '+n.text;if(!party)fill(ctx,{...n,x:cx-n.width/2,y:py+diameter+5,width:n.width,height:16},'#2b0c0a',8,'#d4a35977');write(caption,cx,party?n.y+81:py+diameter+13,n.width-4,10.5,'center',sans,'600','#f1dba7');if(party)write('⚔️ 出征',cx,n.y+105,n.width-8,10,'center',sans,'400','#7dd3fc');}
    return;
  }
  if(n.skin==='art-image') {image(n.image,n.x,n.y,n.width,n.height);return;}
  if(n.skin==='captain-banner'){box();const d=44;circle(ctx,n.x+38,cy,d/2+2,'#122b40');if(n.image?.startsWith('emblems/'))art(ctx,artwork,n.image.slice(8,-4),n.x+24,cy-14,28,28);else image(n.image,n.x+16,cy-22,44,44,true);art(ctx,artwork,'imperial-crown',n.x+26,n.y+1,24,16);write(n.text,n.x+74,cy,n.width-84,19,'left',calligraphy,'400','#ffd875');return;}
  if(n.skin==='vote-choice'){
    const c=n.tone==='green'?'#10b981':n.tone==='red'?'#ef4444':'#f59e0b';
    ctx.save();if(n.selected)shadow(ctx,c,16,0);fill(ctx,n,gradient(ctx,n,['#32110f','#1b0807']),16,c);ctx.restore();
    write(n.badge??'',cx,n.y+25,n.width-10,25,'center',sans,'700',c);write(n.text,cx,n.y+48,n.width-10,18,'center',calligraphy,'700',c);write(n.detail??'',cx,n.y+70,n.width-10,11,'center',sans,'400','#eddcc4');return;
  }
  if(n.skin==='voter-chip'||n.skin==='badge'||n.skin==='code-badge'){box(n.skin==='voter-chip'?'progress':'tip');write(n.text,cx,cy,n.width-8,n.fontSize??10.5,'center',sans,'700');return;}
  if(n.skin==='treasure-entry'){ctx.save();ctx.globalAlpha=n.disabled?.5:1;box();write('📿',n.x+24,cy,32,23);write(n.text,n.x+46,n.y+13,n.width-70,12,'left',display,'700','#ffd875');write(n.detail??'',n.x+46,n.y+31,n.width-70,10,'left',sans,'400','#cbdbe8');write(n.disabled?'🔒':'❯',n.x+n.width-16,cy,20,13);ctx.restore();return;}
  if(n.skin==='metric'){write(n.text,cx,n.y+20,n.width-4,20,'center',display,'400','#f1deba');write(n.detail??'',cx,n.y+42,n.width-4,11.5,'center',sans,'400','#eddcc4');return;}
  if(n.skin==='score-card'){
    fill(ctx,n,n.team==='blue'?'#14374fda':'#402e40da',14,'#d4a35966');
    const isRole=n.image?.startsWith('roles/'),d=isRole?54:38,py=n.y+12;
    if(isRole)image(n.image,cx-d/2,py,d,d,true);else if(n.image)art(ctx,artwork,n.image.slice(8,-4),cx-d/2,py,d,d);
    write(n.text,cx,py+d+17,n.width-10,15,'center',display,'700','#fff2d8');
    const [rate,record,footer]=n.detail?.split('|')??[];write((rate??'—')+' 胜率',cx,py+d+45,n.width-10,20,'center',display,'400','#f1deba');write(record??'',cx,py+d+72,n.width-10,12,'center',sans,'400','#eddcc4');write(footer??'',cx,n.y+n.height-14,n.width-8,10.5,'center',sans,'400','#eddcc4');return;
  }
  if(n.skin==='gallery-card'){fill(ctx,n,gradient(ctx,n,n.team==='blue'?['#204b79','#13325e']:['#641b25','#310d18']),14,n.team==='blue'?'#488eff':'#d63249');image(n.image,n.x+8,n.y+8,n.width-16,n.height-77);write(n.text,cx,n.y+n.height-49,n.width-12,16,'center',display,'700');write(n.detail??'',cx,n.y+n.height-22,n.width-12,11,'center',sans,'400');return;}
  if(n.skin==='friend-card'){box('profile');circle(ctx,n.x+34,cy,23,'#122d43');if(n.image?.startsWith('emblems/'))art(ctx,artwork,n.image.slice(8,-4),n.x+19,cy-15,30,30);else image(n.image,n.x+11,cy-23,46,46,true);write(n.text,n.x+70,n.y+25,n.width-88,16,'left',display,'700');write(n.detail??'',n.x+70,n.y+52,n.width-88,11,'left',sans,'400','#b7cbd9');return;}
  if(n.skin==='message'){box(n.selected?'captain-banner':'message');write(n.detail??'',n.x+10,n.y+13,n.width-20,10,'left',sans,'400','#d4a359');(n.lines??[n.text]).forEach((line,i)=>write(line,n.x+10,n.y+34+i*20,n.width-20,13,'left',sans));return;}
  if(n.kind==='panel'){box();return;}
  if(n.kind==='button'||n.kind==='tab'||n.kind==='choice'){
    ctx.save();ctx.globalAlpha=n.disabled?.58:1;if(n.skin==='account-tab'){if(n.selected)fill(ctx,n,'#27657b',24,'transparent');}else box(n.skin==='tab'&&n.selected?'captain-banner':n.skin);
    if(n.skin==='setting'){write(n.text,n.x+12,cy,n.width-64,13,'left',sans);fill(ctx,{...n,x:n.x+n.width-40,y:cy-10,width:24,height:20},n.selected?'#249c8d':'#12283b',4,n.selected?'#7dd3b4':'#d4a35966');if(n.selected)write('✓',n.x+n.width-28,cy,20,15,'center',sans,'700');}
    else if(n.skin==='profile-toggle'){write(n.text,n.x+14,cy,n.width-28,15,'left',sans,'400','#fbe1ad');}
    else if(n.skin==='account-tab'){write(n.text,cx,cy,n.width-8,13,'center',sans,n.selected?'700':'500',n.selected?'#e5fbff':'#eddcc4');}
    else if(n.skin==='accordion'){write(n.text,n.x+12,cy,n.width-30,12,'left',display,'700','#ffd875');if(n.detail)write(n.detail,n.x+n.width-8,n.y+n.height-12,n.width-20,10,'right',sans,'400','#d4a359');}
    else {
      const gold=n.skin==='gold-button'||n.skin==='cyan-button',input=n.skin==='input',lines=n.lines??wrapText(n.text,n.width-20,t=>Array.from(t).length*(n.fontSize??13));
      if(n.skin==='dragon-button'){art(ctx,artwork,'cloud-left',n.x+8,cy-7,24,14);art(ctx,artwork,'cloud-right',n.x+n.width-32,cy-7,24,14);}
      lines.forEach((line,i)=>write(line,input?n.x+12:cx,cy+(i-(lines.length-1)/2)*(n.fontSize??13)*1.4,n.width-(input?24:16),n.fontSize??13,input?'left':'center',family,n.weight??(gold?'500':'500'),gold?'#1e0908':color));
    }
    ctx.restore();return;
  }
  box();write(n.text,cx,cy,n.width-12);
}

function drawNode(ctx: CanvasRenderingContext2D, n: WebNode, model: ScreenModel, artwork?: Artwork) {
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
    art(ctx,artwork,'quest-'+n.id.slice(8),cx-radius+3,n.y+26.3,diameter-6,diameter-6);
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
      if (n.image?.startsWith('emblems/')) {
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
      const diameter = clamp(38, n.height, 44), left = n.x < (ctx.canvas ? ctx.canvas.width / 2 : 150);
      const avatarX = left ? n.x : n.x + n.width - diameter;
      const avatarY = n.y + (n.height - diameter) / 2;
      const labelX = left ? avatarX + diameter + 5 : n.x;
      const labelW = n.width - diameter - 5;
      const labelH = clamp(26, n.height * 0.76, 32);
      const nameY = n.y + (n.height - labelH) / 2;

      ctx.save();
      shadow(ctx, n.selected ? '#38bdf866' : n.badge ? '#ffd87566' : 'rgba(0,0,0,.6)', 6, 2);
      fill(ctx, { ...n, x: labelX, y: nameY, width: labelW, height: labelH },
        n.teamStatus ? '#087f78' : gradient(ctx, n, n.selected ? ['#0e2636f5', '#081622fa'] : ['#2e0e0df0', '#140606f5']),
        labelH / 2, n.teamStatus ? '#7ef5dc' : n.selected ? '#38bdf8' : n.badge ? '#ffd875' : '#d4a35999');
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
      circle(ctx, avatarX + diameter / 2, avatarY + diameter / 2, diameter / 2, '#36110f');
      ctx.restore();

      const img = n.image ? artwork?.get(n.image) : undefined;
      if (n.image?.startsWith('emblems/')) {
        if (img) ctx.drawImage(img as CanvasImageSource, avatarX + 8, avatarY + 8, diameter - 16, diameter - 16);
      } else if (img) {
        portrait(ctx, { ...n, x: avatarX + 2, y: avatarY + 2, width: diameter - 4, height: diameter - 4 }, artwork, true);
      } else {
        text(ctx, '◇', avatarX + diameter / 2, avatarY + diameter / 2, diameter, 20, webTheme.accent);
      }

      if (n.online === false) circle(ctx, avatarX + diameter - 3, avatarY + diameter - 3, 3.5, '#64748b', '#1c0808');
      else circle(ctx, avatarX + diameter - 3, avatarY + diameter - 3, 3.5, '#22c55e', '#1c0808');

      if (n.micState) drawSeatMicBadge(ctx, avatarX - 2, avatarY + diameter - 16, n.micState);

      if (labelW < 82) {
        text(ctx, String(n.count) + '号·' + n.text, labelX + labelW / 2, nameY + labelH / 2, labelW - 5, 10, '#f5eedf', 'center', sans, '600');
      } else {
        const meW = n.selfPlayer ? 15 : 0;
        text(ctx, String(n.count) + '号', labelX + 7, nameY + labelH / 2, 25, 11, n.teamStatus ? '#fff' : webTheme.accent, 'left', sans, '700');
        text(ctx, '·', labelX + 30, nameY + labelH / 2, 7, 10, '#d4a359aa');
        text(ctx, n.text, labelX + 36 + (labelW - 42 - meW) / 2, nameY + labelH / 2, labelW - 42 - meW, 11.5, '#f5eedf', 'center', sans, '600');
        if (n.selfPlayer) {
          fill(ctx, { ...n, x: labelX + labelW - 19, y: nameY + (labelH - 13) / 2, width: 13, height: 13 }, '#38bdf840', 3, '#38bdf899');
          text(ctx, '我', labelX + labelW - 12.5, nameY + labelH / 2, 12, 8.5, '#38bdf8');
        }
      }

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
      const w=n.width+32, size=clamp(24,w*.068,40);
      ctx.save();ctx.font='800 '+size+'px '+calligraphy;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.lineWidth=.6;ctx.strokeStyle='#f8e4b7';shadow(ctx,'rgba(249,231,191,.65)',14,4);
      ctx.strokeText('嘻游 · 真假猴王',cx,cy);ctx.fillStyle='#7d231f';ctx.fillText('嘻游 · 真假猴王',cx,cy);ctx.restore();
      text(ctx,n.detail??'',cx,n.y+n.height+5+clamp(12,w*.034,15)*.875,n.width,clamp(12,w*.034,15),'#fff2d6','center',sans,'600',clamp(1,w*.005,2.5));
    } else if (n.id === 'ribbon') {
      const g=ctx.createLinearGradient(n.x,n.y,n.x+n.width,n.y);for(const [p,c] of [[0,'transparent'],[.15,'#5f1816eb'],[.5,'#87221ef7'],[.85,'#5f1816eb'],[1,'transparent']] as const)g.addColorStop(p,c);
      ctx.fillStyle=g;ctx.fillRect(n.x,n.y,n.width,n.height);rule(ctx,n,'#ffd875');rule(ctx,{...n,y:n.y+n.height},'#ffd875');
      art(ctx,artwork,'cloud-left',n.x+3,n.y+9,26,14);art(ctx,artwork,'cloud-right',n.x+n.width-29,n.y+9,26,14);
      const lines=n.text.split('\n');lines.forEach((line,i)=>text(ctx,line,cx,cy+(i-(lines.length-1)/2)*19,n.width-48,model.web?.room&&!model.web.room.game?21:clamp(12.5,(n.width+20)*.034,15),'#fff4d6','center',calligraphy,'700'));
    } else if(n.id==='free-access') {
      ctx.save();shadow(ctx,'#ffd87566',12,0);fill(ctx,n,gradient(ctx,n,['#a81e18f0','#780f0cfa']),14,'#ffd875');ctx.restore();
      text(ctx,n.text,cx,cy,n.width-20,clamp(11.5,(n.width-45.1)/16.49,13),'#fff9e6','center',sans,'700',.8);
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
    const color=n.kind==='input'?'rgba(26,8,8,.97)':primary ? gradient(ctx,n,home?['#328ea0','#145b6c']:isCTA?['#74291d','#44120e']:['#27657b','#15404f']) : isDirection?gradient(ctx,n,['#581816','#260a09']):gradient(ctx,n,['rgba(62,22,20,.92)','rgba(28,9,8,.96)']);
    ctx.save();ctx.globalAlpha=n.disabled ? .58 : 1;
    const radius=home&&['create','join'].includes(n.id)?14:n.badge==='utility'?6:n.id==='copyRoom'?5:n.kind==='choice'?12:n.height/2;
    if(n.badge==='utility')utilityFill(ctx,n);
    else if(!n.muted){shadow(ctx);fill(ctx,n,color,radius,primary&&home?'#f5dfa8':n.selected?'#f5dfa8':webTheme.border);ctx.shadowBlur=0;ctx.shadowOffsetY=0;if(!n.fixed)edge(ctx,n,radius);}
    if(home&&n.id==='mode:offline'){fill(ctx,n,gradient(ctx,n,['#27657b','#15404f']),16,'#f5dfa8');}
    if(n.id==='sound'){soundIcon(ctx,cx,cy);ctx.restore();return;}
    if(table&&n.fixed&&['leave','exitPractice'].includes(n.id)){ctx.save();ctx.translate(n.x+1,n.y+1);ctx.strokeStyle='#ffd875';ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(9,14);ctx.lineTo(5,10);ctx.lineTo(9,6);ctx.moveTo(5,10);ctx.lineTo(16,10);ctx.bezierCurveTo(22,10,22,18,16,18);ctx.stroke();ctx.restore();ctx.restore();return;}
    if(n.id==='copyRoom'){
      circle(ctx,n.x+8,n.y+8,3,'#22c55e','#22c55e');text(ctx,n.text,n.x+14,n.y+8,n.width-16,11,webTheme.accent,'left',sans,'700');text(ctx,n.detail??'',n.x+5,n.y+20,n.width-6,8,webTheme.muted,'left');ctx.restore();return;
    }
    if(home&&n.id==='account'&&n.image){circle(ctx,n.x+17,cy,14,'#183041','#d4a359');art(ctx,artwork,n.image.slice(8,-4),n.x+7,cy-10,20,20);text(ctx,n.text,n.x+32+(n.width-37)/2,cy,n.width-36,12,webTheme.text,'center',sans,'700');ctx.restore();return;}
    if(isCTA){art(ctx,artwork,'cloud-left',n.x+5,cy-8,24,14);art(ctx,artwork,'cloud-right',n.x+n.width-29,cy-8,24,14);}
    if(home&&n.image){art(ctx,artwork,n.image.slice(8,-4),n.x+n.width/2-55,cy-10,20,20);}
    if (n.id.startsWith('mission-choice:')) {
      const success = n.id.endsWith('success'), icon = artwork?.get('emblems/' + (success ? 'blue' : 'red') + '.png');
      if (icon) ctx.drawImage(icon as CanvasImageSource, cx - 30, n.y + 24, 60, 60);
      text(ctx, n.text, cx, n.y + 108, n.width - 20, 20, success ? '#5ef2cf' : '#ff9c8f');
      text(ctx, n.selected ? '✓ 已选中' : '点击选择', cx, n.y + 132, n.width - 20, 11, webTheme.muted);
      ctx.restore(); return;
    }
    const lines = n.height <= 38 || n.badge==='utility' ? [table && n.fixed && n.width<45 ? n.text.replace(' ', '') : n.text] : n.lines ?? wrapText(n.text, n.width - 20);
    const fontFace = n.kind === 'input' || n.kind === 'tab' ? sans : isDirection || isCTA ? calligraphy : home && n.height > 38 && n.kind !== 'button' ? display : sans;
    const fontWt = n.kind === 'input' ? '400' : home && n.height <= 36 ? '500' : '700';
    lines.forEach((line, index) => text(ctx, line, cx, n.y + (n.height - lines.length * 21) / 2 + 10 + index * 21, table ? n.width-4 : n.width - 14, home ? n.height<=36?12.5:clamp(15,(n.width*2+40)*.041,17.5) : n.badge==='utility'?14.5:table&&n.fixed?n.width<45?10:11:isDirection?14.5:14, n.kind === 'input' ? webTheme.muted : n.id==='logout'?'#fca5a5':isDirection||isCTA?webTheme.accent:'#fff3d6', 'center', fontFace, fontWt));
    ctx.restore();
  }
}

export function renderWebScreen(model: ScreenModel, canvas: HTMLCanvasElement, v: SafeViewport, artwork?: Artwork, preparedLayout?: WebLayout): HitRegion[] {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D is unavailable');
  const modal = model.web!.document?.modal;
  if (modal) {
    renderWebScreen(model.web!.underlay ?? { title: '', rows: [], web: { page: 'home', user: model.web!.document?.user } }, canvas, v, artwork);
    ctx.fillStyle = 'rgba(7, 26, 44, 0.82)';
    ctx.fillRect(0, 0, v.width, v.height);
  }
  const scene = model.web!.background ?? (model.web!.page === 'home' ? 'gate' : model.web!.page === 'setup' ? 'library' : model.web!.page === 'table' ? model.web!.room?.game ? 'sword' : 'pavilion' : 'library');
  if (!modal) { ctx.fillStyle = '#0c0505'; ctx.fillRect(0, 0, v.width, v.height); }
  const bg = artwork?.get('scenes/' + scene + '.webp');
  if (!modal && bg?.width && bg.height) {
    const scale = Math.max(v.width / bg.width, v.height / bg.height);
    ctx.drawImage(bg as CanvasImageSource, (v.width - bg.width * scale) / 2, (v.height - bg.height * scale) * (scene === 'gate' ? 0.46 : scene === 'sword' ? 0.4 : scene === 'pavilion' ? 0.55 : 0.5), bg.width * scale, bg.height * scale);
  }
  // Web scene is shown at full opacity; do not add an extra Mini Game dark veil.
  const layout = preparedLayout ?? layoutWebScreen(model, v);
  for (const node of [...layout.nodes.filter(item => item.fixed && item.kind === 'panel'), ...layout.nodes.filter(item => !item.fixed), ...layout.nodes.filter(item => item.fixed && item.kind !== 'panel')]) {
    // Clipping alone still issues all text/image draw calls for long documents.
    if (node.y + node.height < (node.clipTop ?? v.top) - 24 || node.y > (node.clipBottom ?? v.height-v.bottom) + 24) continue;
    ctx.save();
    if (!node.fixed) { ctx.beginPath(); ctx.rect(0, node.clipTop ?? layout.contentTop, v.width, (node.clipBottom ?? layout.contentBottom) - (node.clipTop ?? layout.contentTop)); ctx.clip(); }
    drawNode(ctx, node, model, artwork); ctx.restore();
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
