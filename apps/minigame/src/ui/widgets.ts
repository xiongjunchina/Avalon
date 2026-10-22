import { hitTest, layoutRows, contentTop, clampScroll, type HitRegion, type SafeViewport } from './layout.js';
import type { Artwork } from './assets.js';
import { theme } from './theme.js';
import type { WebSurface, WebLayout } from './web-layout.js';
import { renderWebScreen } from './web-render.js';

export interface ScreenModel {
  web?: WebSurface;
  title: string;
  subtitle?: string;
  rows: { id: string; text: string }[];
  scroll?: number;
  scene?: 'entry' | 'standard' | 'game' | 'admin';
  portrait?: string;
}

export type RowTone = 'primary' | 'danger' | 'secret' | 'info' | 'seat' | 'standard';

export function rowTone(id: string): RowTone {
  if (id.startsWith('player:') || id.startsWith('member:')) return 'seat';
  if (['login', 'create', 'start', 'ready', 'propose', 'startTeamVote', 'confirmRole', 'approve', 'missionSuccess', 'confirmInspection', 'rematch', 'confirm:yes', 'apply', 'generate'].includes(id)) return 'primary';
  if (['endGame', 'requestAbort', 'leave', 'logout', 'reject', 'missionFail', 'assassinate', 'confirm:no', 'cleanup', 'error'].includes(id)
    || ['ban:', 'delete:', 'reset:', 'room:'].some(prefix => id.startsWith(prefix))) return 'danger';
  if (id === 'role' || id === 'clue' || id.startsWith('inspection:') || id === 'evil' || id.endsWith('Candidates')
    || (id.startsWith('treasure:') && !['treasure:banNotice', 'treasure:fanNotice'].includes(id))) return 'secret';
  if (['status', 'progress', 'result', 'team', 'teamVoteProgress', 'missionProgress', 'dealCountdown', 'notice', 'invitation', 'treasure:banNotice', 'treasure:fanNotice'].includes(id)
    || id === 'empty' || id === 'announcement' || id === 'submitted' || id.startsWith('ballot:') || id.startsWith('guide:') && id !== 'guide:roles' || id.startsWith('role-')
    || ['round:', 'revealed:', 'stats:', 'replay:'].some(prefix => id.startsWith(prefix))) return 'info';
  return 'standard';
}

export function fitRowText(value: string, maxWidth: number, measure: (text: string) => number): string {
  if (measure(value) <= maxWidth) return value;
  const chars = Array.from(value);
  while (chars.length && measure(`${chars.join('')}…`) > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function cover(ctx: CanvasRenderingContext2D, image: { width: number; height: number }, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale, sourceHeight = height / scale;
  ctx.drawImage(image as CanvasImageSource, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2,
    sourceWidth, sourceHeight, 0, 0, width, height);
}

function background(ctx: CanvasRenderingContext2D, viewport: SafeViewport, artwork?: Artwork) {
  const { width, height } = viewport;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);
  const image = artwork?.get('moonlit.png');
  if (image?.width && image.height) cover(ctx, image, width, height);
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(5, 9, 24, 0.38)');
  shade.addColorStop(0.32, 'rgba(6, 8, 20, 0.82)');
  shade.addColorStop(1, 'rgba(8, 6, 15, 0.97)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

function header(ctx: CanvasRenderingContext2D, model: ScreenModel, viewport: SafeViewport, artwork?: Artwork) {
  const entry = model.scene === 'entry';
  const center = viewport.width / 2;
  ctx.textAlign = entry ? 'center' : 'left';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = theme.accent;
  ctx.font = entry ? 'bold 33px STKaiti, KaiTi, serif' : 'bold 27px STKaiti, KaiTi, serif';
  const titleWidth = entry ? viewport.width - 44 : viewport.width - (model.portrait ? 118 : 40);
  ctx.fillText(fitRowText(model.title, titleWidth, text => ctx.measureText(text).width), entry ? center : 20, viewport.top + (entry ? 88 : 44));
  ctx.shadowBlur = 0;
  ctx.fillStyle = entry ? '#f6e8c8' : theme.muted;
  ctx.font = entry ? '15px STKaiti, KaiTi, serif' : '14px sans-serif';
  if (model.subtitle) ctx.fillText(fitRowText(model.subtitle, viewport.width - 44, text => ctx.measureText(text).width), entry ? center : 20, viewport.top + (entry ? 121 : 70));
  ctx.strokeStyle = 'rgba(255, 216, 117, 0.68)';
  ctx.lineWidth = 1;
  const lineY = viewport.top + (entry ? 150 : 89);
  ctx.beginPath();
  ctx.moveTo(entry ? center - 96 : 20, lineY);
  ctx.lineTo(entry ? center + 96 : viewport.width - 20, lineY);
  ctx.stroke();
  if (entry) {
    ctx.fillStyle = theme.accent;
    ctx.font = '19px STKaiti, KaiTi, serif';
    ctx.fillText('✦  五岳为局  ·  剑问真假  ✦', center, viewport.top + 183);
  }
  if (model.portrait) {
    const portrait = artwork?.get(`roles/${model.portrait}`);
    if (portrait) {
      roundedRect(ctx, viewport.width - 86, viewport.top + 5, 65, 65, 10);
      ctx.save(); ctx.clip();
      ctx.drawImage(portrait as CanvasImageSource, viewport.width - 86, viewport.top + 5, 65, 65);
      ctx.restore();
      ctx.strokeStyle = theme.border;
      roundedRect(ctx, viewport.width - 86, viewport.top + 5, 65, 65, 10);
      ctx.stroke();
    }
  }
}

function card(ctx: CanvasRenderingContext2D, row: HitRegion) {
  const tone = rowTone(row.id);
  if (tone === 'seat') {
    const selected = row.text.includes('已选');
    roundedRect(ctx, row.x, row.y, row.width, row.height, 12);
    const seatFill = ctx.createLinearGradient(row.x, row.y, row.x, row.y + row.height);
    seatFill.addColorStop(0, selected ? 'rgba(96, 70, 27, 0.98)' : 'rgba(31, 45, 62, 0.96)');
    seatFill.addColorStop(1, selected ? 'rgba(55, 36, 23, 0.98)' : 'rgba(23, 17, 32, 0.98)');
    ctx.fillStyle = seatFill; ctx.fill();
    ctx.strokeStyle = selected ? theme.accent : 'rgba(213, 176, 106, 0.74)'; ctx.lineWidth = selected ? 2 : 1; ctx.stroke();
    const match = /^(\d+)号\s*(.*)$/.exec(row.text);
    const seat = match?.[1] ?? '·';
    const label = match?.[2] ?? row.text;
    ctx.beginPath(); ctx.arc(row.x + 30, row.y + 33, 19, 0, Math.PI * 2);
    ctx.fillStyle = selected ? '#f9dc98' : 'rgba(203, 166, 91, 0.24)'; ctx.fill();
    ctx.strokeStyle = theme.border; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = selected ? '#3d270f' : theme.accent;
    ctx.font = 'bold 16px sans-serif'; ctx.fillText(seat, row.x + 30, row.y + 39);
    const [name, ...badges] = label.split(' · ');
    ctx.textAlign = 'left'; ctx.fillStyle = theme.text; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(fitRowText(name!, row.width - 71, text => ctx.measureText(text).width), row.x + 60, row.y + 29);
    ctx.fillStyle = selected ? theme.accent : theme.muted; ctx.font = '11px sans-serif';
    ctx.fillText(fitRowText(badges.join(' · ') || '等待行动', row.width - 71, text => ctx.measureText(text).width), row.x + 60, row.y + 49);
    return;
  }
  const active = tone !== 'info';
  const gradient = ctx.createLinearGradient(row.x, row.y, row.x, row.y + row.height);
  if (tone === 'primary') { gradient.addColorStop(0, '#ffe5a0'); gradient.addColorStop(1, '#d9973f'); }
  else if (tone === 'danger') { gradient.addColorStop(0, 'rgba(89, 31, 35, 0.94)'); gradient.addColorStop(1, 'rgba(47, 16, 28, 0.96)'); }
  else if (tone === 'secret') { gradient.addColorStop(0, 'rgba(27, 55, 72, 0.96)'); gradient.addColorStop(1, 'rgba(16, 30, 46, 0.96)'); }
  else { gradient.addColorStop(0, tone === 'info' ? 'rgba(18, 30, 46, 0.88)' : 'rgba(31, 37, 54, 0.96)'); gradient.addColorStop(1, 'rgba(16, 20, 34, 0.96)'); }
  roundedRect(ctx, row.x, row.y, row.width, row.height, tone === 'primary' ? 17 : 11);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = tone === 'primary' ? '#fff0b6' : tone === 'danger' ? '#b96b63' : 'rgba(219, 177, 102, 0.36)';
  ctx.lineWidth = tone === 'primary' ? 1.5 : 1;
  ctx.stroke();
  if (tone !== 'primary') {
    ctx.fillStyle = tone === 'danger' ? '#d27b6f' : theme.border;
    ctx.fillRect(row.x + 1, row.y + 10, 3, row.height - 20);
  }
  ctx.fillStyle = tone === 'primary' ? '#381c09' : theme.text;
  ctx.textAlign = tone === 'primary' ? 'center' : 'left';
  ctx.font = tone === 'primary' ? 'bold 18px STKaiti, KaiTi, serif' : active ? '16px sans-serif' : '15px sans-serif';
  const x = tone === 'primary' ? row.x + row.width / 2 : row.x + 16;
  const textWidth = row.width - (tone === 'primary' ? 30 : active ? 46 : 30);
  const lines = row.lines ?? [fitRowText(row.text, textWidth, text => ctx.measureText(text).width)];
  const firstBaseline = row.y + (row.height - lines.length * 23) / 2 + 17;
  lines.forEach((line, index) => ctx.fillText(line, x, firstBaseline + index * 23));
  if (active && tone !== 'primary') {
    ctx.fillStyle = tone === 'danger' ? '#efa99d' : theme.accent;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('›', row.x + row.width - 15, row.y + 33);
  }
}

export function renderScreen(model: ScreenModel, canvas: HTMLCanvasElement, viewport: SafeViewport, artwork?: Artwork, layout?: WebLayout): HitRegion[] {
  if (model.web) return renderWebScreen(model, canvas, viewport, artwork, layout);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  background(ctx, viewport, artwork);
  header(ctx, model, viewport, artwork);
  const rows = layoutRows(model.rows, viewport, model.scroll ?? 0, model.scene ?? 'standard');
  ctx.save();
  ctx.beginPath();
  const top = contentTop(viewport, model.scene ?? 'standard');
  ctx.rect(0, top, viewport.width, Math.max(0, viewport.height - viewport.bottom - top));
  ctx.clip();
  for (const row of rows) card(ctx, row);
  ctx.restore();
  const maxScroll = clampScroll(model.rows, viewport, Number.MAX_SAFE_INTEGER, model.scene ?? 'standard');
  if (maxScroll > 0) {
    const visible = viewport.height - viewport.bottom - top;
    const thumb = Math.max(24, visible * visible / (visible + maxScroll));
    const y = top + ((model.scroll ?? 0) / maxScroll) * (visible - thumb);
    ctx.fillStyle = 'rgba(255, 216, 117, 0.55)';
    ctx.fillRect(viewport.width - 7, y, 3, thumb);
  }
  return rows;
}

export { hitTest };
