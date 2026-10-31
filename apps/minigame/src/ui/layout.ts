export interface SafeViewport { width: number; height: number; top: number; bottom: number }
export interface HitRegion { id: string; x: number; y: number; width: number; height: number; text: string; lines?: string[]; clipLeft?:number;clipRight?:number;scrollMaxX?:number;clipTop?: number; clipBottom?: number }
export type Scene = 'entry' | 'standard' | 'game' | 'admin';
type Row = { id: string; text: string };

// Keep emoji presentation selectors, modifiers and joined emoji together when
// Canvas paints letter-spaced labels; splitting them changes the icon itself.
export function textGraphemes(value:string):string[]{
  const result:string[]=[];
  for(const char of Array.from(value)){
    const previous=result.at(-1);
    if(previous&&(/^[\p{Mark}\u200d\u{1f3fb}-\u{1f3ff}]$/u.test(char)||previous.endsWith('\u200d')||/^\p{Regional_Indicator}$/u.test(previous)&&/^\p{Regional_Indicator}$/u.test(char)))result[result.length-1]+=char;
    else result.push(char);
  }
  return result;
}

// Conservative widths keep CJK readable before device fonts have loaded.
export function textWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => sum + (/[^\u0020-\u007e]/.test(char) ? 17 : 9), 0);
}
export function wrapText(text: string, width: number, measure = textWidth): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    const units=paragraph.match(/[A-Za-z0-9_]+|[^]/gu)??[];
    for (const unit of units) {
      // CSS keeps an ordinary Latin word together; oversized IDs still break.
      if(unit.length>1&&measure(unit)<=width){
        if(line&&measure(line+unit)>width){lines.push(line.trimEnd());line='';}
        line+=unit;continue;
      }
      for (const char of Array.from(unit)) {
      if (line && measure(line + char) > width) {
        const chars=Array.from(line);
        // Match CSS line breaking: opening brackets cannot end a line and
        // closing punctuation must stay with its preceding character.
        const carry=chars.length>1&&(/[（《「『【“‘]$/.test(line)||/^[，。！？；：、）》」』】”’]/.test(char))?chars.pop()!:'';
        lines.push(chars.join('')); line=carry;
      }
      if(line||char!==' ')line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
export function contentTop(viewport: SafeViewport, scene: Scene): number {
  return scene === 'entry'
    ? viewport.top + Math.min(270, Math.round((viewport.height - viewport.top - viewport.bottom) * 0.32))
    : viewport.top + 108;
}
function placeRows(rows: Row[], viewport: SafeViewport, scene: Scene): HitRegion[] {
  const placed: HitRegion[] = [];
  const top = contentTop(viewport, scene), gap = 9, columnWidth = (viewport.width - 36 - gap) / 2;
  const navEnd = scene === 'admin' ? rows.findIndex(row => !row.id.startsWith('page:') && row.id !== 'back') : 0;
  const navCount = navEnd < 0 ? rows.length : navEnd;
  let y = top, column = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const seat = scene === 'game' && (row.id.startsWith('player:') || row.id.startsWith('member:'));
    const entryTile = scene === 'entry' && ['account', 'friends', 'switch', 'practice', 'guide', 'admin'].includes(row.id);
    const compact = seat || entryTile || (scene === 'admin' && index < navCount);
    if (compact) {
      const height = seat ? 74 : entryTile ? 70 : 52;
      placed.push({ ...row, ...(entryTile ? { lines: wrapText(row.text, columnWidth - 46) } : {}), x: 18 + column * (columnWidth + gap), y, width: columnWidth, height });
      column++;
      if (column === 2) { column = 0; y += height + 8; }
    } else {
      if (column) { y += scene === 'game' ? 82 : scene === 'entry' ? 78 : 60; column = 0; }
      const lines = wrapText(row.text, viewport.width - 88);
      const height = Math.max(52, lines.length * 23 + 26);
      placed.push({ ...row, lines, x: 18, y, width: viewport.width - 36, height });
      y += height + 8;
    }
  }
  return placed;
}
export function clampScroll(rows: Row[], viewport: SafeViewport, scroll: number, scene: Scene = 'standard'): number {
  const placed = placeRows(rows, viewport, scene);
  const end = placed.reduce((max, row) => Math.max(max, row.y + row.height + 12), contentTop(viewport, scene));
  return Math.max(0, Math.min(scroll, Math.max(0, end - (viewport.height - viewport.bottom))));
}
export function layoutRows(rows: Row[], viewport: SafeViewport, scroll: number, scene: Scene = 'standard'): HitRegion[] {
  const clipTop = contentTop(viewport, scene), clipBottom = viewport.height - viewport.bottom;
  return placeRows(rows, viewport, scene).map(row => ({ ...row, y: row.y - Math.max(0, scroll), clipTop, clipBottom }))
    .filter(row => row.y < clipBottom && row.y + row.height > clipTop);
}
export function hitTest(rows: HitRegion[], x: number, y: number): HitRegion | undefined {
  return rows.find(row => y >= (row.clipTop ?? row.y) && y <= (row.clipBottom ?? row.y + row.height)
    && x >= (row.clipLeft??row.x) && x <= (row.clipRight??row.x+row.width) && x >= row.x && x <= row.x + row.width && y >= row.y && y <= row.y + row.height);
}
export function hideSensitiveView(state: { privateRoleVisible: boolean; ballotVisible: boolean; overlay?: string;overlayReturn?:string }): void {
  state.privateRoleVisible = false;
  state.ballotVisible = false;delete state.overlayReturn;
  if (state.overlay !== undefined) state.overlay = undefined;
}
