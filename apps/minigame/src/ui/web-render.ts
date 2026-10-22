import type { Artwork } from './assets.js';
import { hitTest, wrapText, type HitRegion, type SafeViewport } from './layout.js';
import { layoutWebScreen, type WebNode } from './web-layout.js';
import type { ScreenModel } from './widgets.js';

// Matches apps/web/src/scenes.css (Scheme A-2). No alternate Mini Game visual theme.
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
function fill(ctx: CanvasRenderingContext2D, n: WebNode, color: string | CanvasGradient, radius = 14, border = webTheme.border) {
  rect(ctx, n.x, n.y, n.width, n.height, radius); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = border; ctx.lineWidth = n.selected ? 2 : 1; ctx.stroke();
}
function gradient(ctx: CanvasRenderingContext2D, n: WebNode, colors: string[]) {
  const value = ctx.createLinearGradient(n.x, n.y, n.x + n.width * .25, n.y + n.height);
  colors.forEach((color, index) => value.addColorStop(index / (colors.length - 1), color)); return value;
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, size = 14, color = webTheme.text, align: CanvasTextAlign = 'center') {
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.font = size >= 20 ? 'bold ' + size + 'px STKaiti, KaiTi, serif' : size + 'px "Microsoft YaHei",sans-serif'; ctx.fillStyle = color;
  let output = value;
  while (output.length && ctx.measureText(output).width > width) output = output.slice(0, -1);
  if (output !== value) output = output.slice(0, -1) + '…';
  ctx.fillText(output, x, y);
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
function drawNode(ctx: CanvasRenderingContext2D, n: WebNode, model: ScreenModel, artwork?: Artwork) {
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  if (n.kind === 'metric') {
    fill(ctx, n, '#21110d', 12); const [value, label] = n.text.split('|');
    text(ctx, value!, cx, n.y + 28, n.width - 6, 24, webTheme.accent); text(ctx, label!, cx, n.y + 57, n.width - 6, 11, webTheme.muted);
  } else if (n.kind === 'portrait') {
    portrait(ctx, n, artwork, n.id === 'showcase');
    if (n.id === 'showcase') {
      fill(ctx, { ...n, x: cx - 58, y: n.y + n.height + 12, width: 116, height: 28 }, '#2a100e', 14);
      if (n.detail) fill(ctx, { ...n, x: 35, y: n.y + n.height + 46, width: model.web!.page === 'home' ? 320 : n.width, height: 26 }, 'rgba(20,38,47,.75)', 12);
    }
    text(ctx, n.text, cx, n.y + n.height + 26, n.width + 100, n.id === 'showcase' ? 20 : 16, webTheme.accent);
    if (n.detail) text(ctx, n.detail, cx, n.y + n.height + 59, model.web?.page === 'home' ? 330 : n.width + 30, 12, webTheme.muted);
  } else if (n.kind === 'quest') {
    fill(ctx, n, gradient(ctx, n, n.selected ? ['#d48816', '#4d190c'] : ['#35140f', '#1c0908']), 14);
    const radius = Math.min(n.width / 2 - 10, 22);
    text(ctx, n.text, cx, n.y + 16, n.width - 6, 12, webTheme.accent);
    circle(ctx, cx, n.y + 52, radius, '#25100d', n.selected ? '#fff1b2' : webTheme.border);
    const icon = artwork?.get('emblems/quest-' + n.id.slice(8) + '.png');
    if (icon) ctx.drawImage(icon as CanvasImageSource, cx - radius + 4, n.y + 52 - radius + 4, radius * 2 - 8, radius * 2 - 8);
    if (n.passed !== undefined) text(ctx, n.passed ? '✓' : '×', cx, n.y + 52, n.width - 8, 23, webTheme.accent);
    text(ctx, n.count + '人' + (n.detail ? ' · 双败' : ''), cx, n.y + 86, n.width - 4, 12, webTheme.accent);
  } else if (n.kind === 'seat') {
    const diameter = Math.min(44, n.height - 20);
    const left = n.x < 80, avatarCx = left ? n.x + 27 : n.x + n.width - 27;
    const labelX = left ? n.x + 53 : n.x + 6, labelWidth = n.width - 58;
    fill(ctx, { ...n, x: labelX, y: n.y + 10, width: labelWidth, height: 30 }, n.selected ? '#70421b' : '#29100c', 15, n.selected ? '#fff2b2' : '#d4a359aa');
    circle(ctx, avatarCx, n.y + n.height / 2 - 2, diameter / 2, '#4b2520', n.selected ? '#ffe5a0' : webTheme.border);
    if (n.image) portrait(ctx, { ...n, x: avatarCx - diameter / 2, y: n.y + n.height / 2 - 2 - diameter / 2, width: diameter, height: diameter }, artwork, true);
    else text(ctx, String(n.count), avatarCx, n.y + n.height / 2 - 2, diameter, 20, webTheme.accent);
    if (n.image) { circle(ctx, avatarCx + diameter / 2 - 4, n.y + n.height - 12, 9, '#2a100e'); text(ctx, String(n.count), avatarCx + diameter / 2 - 4, n.y + n.height - 12, 16, 10, webTheme.accent); }
    text(ctx, n.text, labelX + labelWidth / 2, n.y + n.height * .37, labelWidth, 12);
    text(ctx, n.detail ?? '', labelX + labelWidth / 2, n.y + n.height * .7, labelWidth, 10, n.selected ? '#ffd875' : webTheme.muted);
    if (n.badge) text(ctx, n.badge, cx, n.y - 3, n.width, 9, webTheme.accent);
  } else if (n.kind === 'altar') {
    circle(ctx, cx, cy - 7, 34, '#210b0a', '#ffd875'); circle(ctx, cx, cy - 7, 28, '#2d100c', '#b99457');
    text(ctx, n.text, cx, cy - 13, n.width, 35, webTheme.accent); text(ctx, n.detail ?? '', cx, cy + 16, n.width, 10, webTheme.accent);
  } else if (n.kind === 'panel') {
    fill(ctx, n, gradient(ctx, n, n.id === 'arena-frame' ? ['rgba(25,16,13,.62)', 'rgba(12,5,5,.92)'] : ['rgba(58,20,18,.95)', 'rgba(28,9,8,.98)']), 22);
    if (n.text) text(ctx, n.text, cx, n.y + 28, n.width - 30, 22, webTheme.accent);
  } else if (n.kind === 'label') {
    if (n.id === 'brand') {
      ctx.save(); ctx.font = 'bold ' + Math.min(33, model.web!.page === 'home' ? model.web!.user ? 32 : 30 : 28) + 'px STKaiti,KaiTi,serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1.3; ctx.strokeStyle = '#f8e4b7'; ctx.strokeText(n.text, cx, cy);
      ctx.fillStyle = '#7d231f'; ctx.fillText(n.text, cx, cy); ctx.restore();
      text(ctx, n.detail ?? '', cx, n.y + n.height + 17, n.width, 12, '#fff2d6');
    } else if (n.id === 'ribbon') {
      fill(ctx, n, 'rgba(35,9,8,.84)', 3, '#d4a35977');
      text(ctx, n.text, cx, cy - (n.detail ? 6 : 0), n.width - 24, 16, webTheme.accent);
      if (n.detail) text(ctx, n.detail, cx, cy + 17, n.width - 14, 11);
    } else {
      if (n.id === 'score' || n.id === 'free-access' || n.id === 'mode') fill(ctx, n, 'rgba(30,10,9,.8)', 12, '#d4a35977');
      if (model.web?.page === 'sheet' && !['page-title'].includes(n.id)) fill(ctx, n, 'rgba(21,29,41,.75)', 10, 'rgba(212,163,89,.26)');
      const lines = n.id === 'score' || n.id === 'page-title' ? [n.text] : n.lines ?? wrapText(n.text, n.width - 20);
      const fontSize = n.id === 'score' ? 10 : n.id === 'page-title' ? 16 : n.muted ? 11 : 13;
      lines.forEach((line, index) => text(ctx, line, cx, n.y + (n.height - lines.length * 22) / 2 + 11 + index * 22, n.width - 16, fontSize, n.team === 'blue' ? webTheme.blue : n.team === 'red' ? webTheme.red : n.muted ? webTheme.muted : webTheme.text));
    }
  } else {
    const primary = n.primary;
    const color = n.kind === 'input' ? 'rgba(26,8,8,.97)' : primary ? gradient(ctx, n, ['#27657b', '#15404f']) : n.selected ? gradient(ctx, n, ['#72411c', '#3b1a10']) : gradient(ctx, n, ['rgba(62,22,20,.92)', 'rgba(28,9,8,.96)']);
    ctx.save(); ctx.globalAlpha = n.disabled ? .48 : 1;
    if (!n.muted) fill(ctx, n, color, n.kind === 'choice' ? 12 : n.height / 2, primary || n.selected ? '#ffd54f' : '#d4a35988');
    if (n.id.startsWith('mission-choice:')) {
      const success = n.id.endsWith('success'), icon = artwork?.get('emblems/' + (success ? 'blue' : 'red') + '.png');
      if (icon) ctx.drawImage(icon as CanvasImageSource, cx - 30, n.y + 24, 60, 60);
      text(ctx, n.text, cx, n.y + 108, n.width - 20, 20, success ? '#5ef2cf' : '#ff9c8f');
      text(ctx, n.selected ? '✓ 已选中' : '点击选择', cx, n.y + 132, n.width - 20, 11, webTheme.muted);
      ctx.restore(); return;
    }
    const lines = n.height <= 38 ? [n.text] : n.lines ?? wrapText(n.text, n.width - 20);
    lines.forEach((line, index) => text(ctx, line, cx, n.y + (n.height - lines.length * 21) / 2 + 10 + index * 21, n.width - 14, n.height <= 36 ? 11 : 14, n.kind === 'input' ? webTheme.muted : '#fff3d6'));
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
    ctx.drawImage(bg as CanvasImageSource, (v.width - bg.width * scale) / 2, (v.height - bg.height * scale) / 2, bg.width * scale, bg.height * scale);
  }
  ctx.fillStyle = model.web!.page === 'home' ? 'rgba(12,5,5,.1)' : 'rgba(12,5,5,.24)'; ctx.fillRect(0, 0, v.width, v.height);
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
