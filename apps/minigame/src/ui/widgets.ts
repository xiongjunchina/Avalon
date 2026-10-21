import { hitTest, layoutRows, type HitRegion, type SafeViewport } from './layout.js';
import { theme } from './theme.js';

export interface ScreenModel { title: string; subtitle?: string; rows: { id: string; text: string }[]; scroll?: number }

export function fitRowText(value: string, maxWidth: number, measure: (text: string) => number): string {
  if (measure(value) <= maxWidth) return value;
  const chars = Array.from(value);
  while (chars.length && measure(`${chars.join('')}…`) > maxWidth) chars.pop();
  return `${chars.join('')}…`;
}

export function renderScreen(model: ScreenModel, canvas: HTMLCanvasElement, viewport: SafeViewport): HitRegion[] {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(fitRowText(model.title, viewport.width - 36, text => ctx.measureText(text).width), 18, viewport.top + 34);
  if (model.subtitle) {
    ctx.fillStyle = theme.muted;
    ctx.font = '13px sans-serif';
    ctx.fillText(fitRowText(model.subtitle, viewport.width - 36, text => ctx.measureText(text).width), 18, viewport.top + 55);
  }
  const rows = layoutRows(model.rows, viewport, model.scroll ?? 0);
  for (const row of rows) {
    ctx.fillStyle = theme.panel;
    ctx.fillRect(row.x, row.y, row.width, row.height);
    ctx.strokeStyle = theme.border;
    ctx.strokeRect(row.x, row.y, row.width, row.height);
    ctx.fillStyle = theme.text;
    ctx.font = '16px sans-serif';
    ctx.fillText(fitRowText(row.text, row.width - 24, text => ctx.measureText(text).width), row.x + 12, row.y + 29);
  }
  return rows;
}

export { hitTest };
