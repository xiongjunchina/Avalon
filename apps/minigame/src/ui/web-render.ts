import type { Artwork } from './assets.js';
import { hitTest, wrapText, type HitRegion, type SafeViewport } from './layout.js';
import { layoutWebScreen, type WebNode } from './web-layout.js';
import type { ScreenModel } from './widgets.js';

// Matches apps/web/src/scenes.css (Scheme A-2). No alternate Mini Game visual theme.
let sans = '"Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
let display = '"ZCOOL XiaoWei","Ma Shan Zheng",STKaiti,"Kaiti SC",sans-serif';
let calligraphy = '"Ma Shan Zheng","ZCOOL XiaoWei",STKaiti,"Kaiti SC",cursive,sans-serif';
export function setWebFonts(fonts: { sans?: string; display?: string; calligraphy?: string }) {
  if(fonts.sans) sans=JSON.stringify(fonts.sans)+',sans-serif';
  if(fonts.display) display=JSON.stringify(fonts.display)+',serif';
  if(fonts.calligraphy) calligraphy=JSON.stringify(fonts.calligraphy)+',serif';
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
function drawNode(ctx: CanvasRenderingContext2D, n: WebNode, model: ScreenModel, artwork?: Artwork) {
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
    ctx.save(); if(n.selected) shadow(ctx,'rgba(255,215,100,1)',20,0);
    circle(ctx,cx,n.y+23.3+radius,radius,n.selected?'#f5b545':'#25100d',n.selected?'#fff4b8':webTheme.border);ctx.restore();
    if(n.selected) {ctx.beginPath();ctx.arc(cx,n.y+23.3+radius,radius+3,0,Math.PI*2);ctx.strokeStyle='#ffe082';ctx.lineWidth=2;ctx.stroke();}
    art(ctx,artwork,'quest-'+n.id.slice(8),cx-radius+3,n.y+26.3,diameter-6,diameter-6);
    if(n.passed!==undefined) text(ctx,n.passed?'✓':'×',cx,n.y+23.3+radius,n.width-8,23,webTheme.accent);
    const countY=n.y+n.height-42;
    fill(ctx,{...n,x:cx-16,y:countY,width:32,height:20},'#2b0c0a',10);
    text(ctx,n.count+'人',cx,countY+10,30,11.5,webTheme.accent,'center',sans,'700');
    if(n.detail==='需2败')text(ctx,n.detail,cx,n.y+n.height-10,n.width-3,9.5,'#ff9800');
  } else if (n.kind === 'seat') {
    const diameter=clamp(38,n.height,44),left=n.x<80,avatarX=left?n.x:n.x+n.width-diameter;
    const avatarY=n.y+(n.height-diameter)/2;
    const labelX=left?avatarX+diameter+5:n.x,labelW=n.width-diameter-5,labelH=clamp(26,n.height*.76,32);
    const nameY=n.y+(n.height-labelH)/2;
    ctx.save();shadow(ctx,n.selected?'#38bdf866':n.badge?'#ffd87566':'rgba(0,0,0,.6)',6,2);
    fill(ctx,{...n,x:labelX,y:nameY,width:labelW,height:labelH},gradient(ctx,n,n.selected?['#0e2636f5','#081622fa']:['#2e0e0df0','#140606f5']),labelH/2,n.selected?'#38bdf8':n.badge?'#ffd875':'#d4a35999');
    circle(ctx,avatarX+diameter/2,avatarY+diameter/2,diameter/2,'#36110f');ctx.restore();
    const img=n.image?artwork?.get(n.image):undefined;
    if(n.image?.startsWith('emblems/')) {if(img)ctx.drawImage(img as CanvasImageSource,avatarX+8,avatarY+8,diameter-16,diameter-16);}
    else if(img) portrait(ctx,{...n,x:avatarX+2,y:avatarY+2,width:diameter-4,height:diameter-4},artwork,true);
    else text(ctx,'◇',avatarX+diameter/2,avatarY+diameter/2,diameter,20,webTheme.accent);
    if(n.selected||n.badge){ctx.save();shadow(ctx,n.selected?'#38bdf8':'#ffd875',10,0);ctx.beginPath();ctx.arc(avatarX+diameter/2,avatarY+diameter/2,diameter/2+3,0,Math.PI*2);ctx.strokeStyle=n.selected?'#38bdf8':'#ffd875';ctx.lineWidth=2;ctx.stroke();ctx.restore();}
    circle(ctx,avatarX+diameter-3,avatarY+diameter-3,3.5,n.online===false?'#64748b':'#22c55e','#1c0808');
    if(labelW<82){text(ctx,String(n.count)+'号·'+n.text,labelX+labelW/2,nameY+labelH/2,labelW-5,10,'#f5eedf','center',sans,'600');}
    else {
    const meW=n.selfPlayer?15:0;
    text(ctx,String(n.count)+'号',labelX+7,nameY+labelH/2,25,11,webTheme.accent,'left',sans,'700');
    text(ctx,'·',labelX+30,nameY+labelH/2,7,10,'#d4a359aa');
    text(ctx,n.text,labelX+36+(labelW-42-meW)/2,nameY+labelH/2,labelW-42-meW,11.5,'#f5eedf','center',sans,'600');
    if(n.selfPlayer){fill(ctx,{...n,x:labelX+labelW-19,y:nameY+(labelH-13)/2,width:13,height:13},'#38bdf840',3,'#38bdf899');text(ctx,'我',labelX+labelW-12.5,nameY+labelH/2,12,8.5,'#38bdf8');}
    }
    if(n.badge){const bw=46;fill(ctx,{...n,x:avatarX+diameter/2-bw/2,y:avatarY-8,width:bw,height:14},gradient(ctx,n,['#f59e0b','#d97706']),7,'#fef3c7');text(ctx,n.badge,avatarX+diameter/2,avatarY-1,bw-3,9.5,'#fffbeb','center',sans,'700');}
    if(n.detail){if(model.web!.room?.game)text(ctx,n.detail,avatarX+diameter/2,avatarY+diameter-5,30,12);else text(ctx,n.detail,labelX+labelW/2,nameY+labelH+10,labelW,9,webTheme.muted);}
  } else if (n.kind === 'altar') {
    const r=n.width/2;
    ctx.save();shadow(ctx,'#ffd87555',20,0);circle(ctx,cx,cy,r,'#190808','#ffd875');ctx.restore();
    circle(ctx,cx,cy,r-4,'#170706','#d4a35999');
    ctx.save();shadow(ctx,'#ffd875cc',12,0);text(ctx,n.text,cx,cy-15,n.width,clamp(26,n.width/.19*.065,34),webTheme.accent);ctx.restore();
    fill(ctx,{...n,x:cx-30,y:cy+2,width:60,height:14},'#0f0404cc',7,'#e5b96480');
    text(ctx,n.detail??'',cx,cy+9,60,9.5,'#eedcc4','center',sans,'700');text(ctx,'第 '+n.count+' 难',cx,cy+23,n.width,9,webTheme.accent,'center',sans,'600');
  } else if (n.kind === 'panel') {
    ctx.save();
    if(n.id==='arena-frame') {
      arenaFill(ctx,n);
    } else if(n.id==='mode-frame') fill(ctx,n,'rgba(15,25,31,.88)',24,'#d4a35966');
    else {shadow(ctx,'rgba(0,0,0,.75)',22,n.id==='action-dock'?-8:3);fill(ctx,n,gradient(ctx,n,['rgba(58,20,18,.96)','rgba(28,9,8,.98)']),n.id==='action-dock'?26:18,n.id==='action-dock'?'#e5b964':'#e5b96488');}
    ctx.restore();
    if(n.id==='action-dock'){
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
      text(ctx,n.text,cx,cy,n.width-48,clamp(12.5,(n.width+20)*.034,15),'#fff4d6','center',calligraphy,'700');
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
    lines.forEach((line, index) => text(ctx, line, cx, n.y + (n.height - lines.length * 21) / 2 + 10 + index * 21, table ? n.width-4 : n.width - 14, home ? n.height<=36?12.5:clamp(15,(n.width*2+40)*.041,17.5) : n.badge==='utility'?14.5:table&&n.fixed?n.width<45?10:11:isDirection?14.5:14, n.kind === 'input' ? webTheme.muted : n.id==='logout'?'#fca5a5':isDirection||isCTA?webTheme.accent:'#fff3d6', 'center', isDirection||isCTA?calligraphy:home&&n.height>38?display:sans, home&&n.height<=36?'500':'700'));
    ctx.restore();
  }
}

export function renderWebScreen(model: ScreenModel, canvas: HTMLCanvasElement, v: SafeViewport, artwork?: Artwork): HitRegion[] {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas 2D is unavailable');
  const scene = model.web!.background ?? (model.web!.page === 'home' ? 'gate' : model.web!.page === 'setup' ? 'library' : model.web!.page === 'table' ? model.web!.room?.game ? 'sword' : 'pavilion' : 'library');
  ctx.fillStyle = '#0c0505'; ctx.fillRect(0, 0, v.width, v.height);
  const bg = artwork?.get('scenes/' + scene + '.webp');
  if (bg?.width && bg.height) {
    const scale = Math.max(v.width / bg.width, v.height / bg.height);
    ctx.save();if(scene!=='sword')ctx.filter='saturate(1.05) brightness(1.02)';
    ctx.drawImage(bg as CanvasImageSource, (v.width - bg.width * scale) / 2, (v.height - bg.height * scale) * (scene==='gate'?.46:scene==='sword'?.4:scene==='pavilion'?.55:.5), bg.width * scale, bg.height * scale);ctx.restore();
  }
  // Web scene is shown at full opacity; do not add an extra Mini Game dark veil.
  const layout = layoutWebScreen(model, v);
  for (const node of [...layout.nodes.filter(item => item.fixed && item.kind === 'panel'), ...layout.nodes.filter(item => !item.fixed), ...layout.nodes.filter(item => item.fixed && item.kind !== 'panel')]) {
    ctx.save();
    if (!node.fixed) { ctx.beginPath(); ctx.rect(0, node.clipTop ?? layout.contentTop, v.width, (node.clipBottom ?? layout.contentBottom) - (node.clipTop ?? layout.contentTop)); ctx.clip(); }
    drawNode(ctx, node, model, artwork); ctx.restore();
  }
  if (layout.maxScroll > 0) {
    const height = layout.contentBottom - layout.contentTop, thumb = Math.max(24, height * height / (height + layout.maxScroll));
    ctx.fillStyle = '#ffd87588'; ctx.fillRect(v.width - 5, layout.contentTop + (model.scroll ?? 0) / layout.maxScroll * (height - thumb), 2, thumb);
  }
  // Reverse paint order so a toast or fixed dock owns the tap instead of a covered seat.
  return [...layout.nodes].sort((a, b) => Number(Boolean(b.fixed)) - Number(Boolean(a.fixed)))
    .filter(node => !node.disabled && !['label', 'panel', 'altar', 'metric'].includes(node.kind)
      && node.y + node.height > (node.clipTop ?? v.top) && node.y < (node.clipBottom ?? v.height - v.bottom));
}
