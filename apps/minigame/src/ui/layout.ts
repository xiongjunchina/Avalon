export interface SafeViewport { width: number; height: number; top: number; bottom: number }
export interface HitRegion { id: string; x: number; y: number; width: number; height: number; text: string }

export function layoutRows(rows: { id: string; text: string }[], viewport: SafeViewport, scroll: number, scene: 'entry' | 'standard' | 'game' | 'admin' = 'standard'): HitRegion[] {
  const rowHeight = 60;
  const contentTop = scene === 'entry'
    ? viewport.top + Math.min(270, Math.round((viewport.height - viewport.top - viewport.bottom) * 0.32))
    : viewport.top + 108;
  const bottom = viewport.height - viewport.bottom;
  if (scene === 'game') {
    const placed: HitRegion[] = [];
    let y = contentTop - scroll, seatColumn = 0;
    for (const row of rows) {
      if (row.id.startsWith('player:')) {
        const gap = 9, seatWidth = (viewport.width - 36 - gap) / 2;
        placed.push({ ...row, x: 18 + seatColumn * (seatWidth + gap), y, width: seatWidth, height: 66 });
        seatColumn++;
        if (seatColumn === 2) { seatColumn = 0; y += 74; }
      } else {
        if (seatColumn) { seatColumn = 0; y += 74; }
        placed.push({ ...row, x: 18, y, width: viewport.width - 36, height: 52 });
        y += rowHeight;
      }
    }
    return placed.filter(row => row.y >= viewport.top && row.y + row.height <= bottom);
  }
  if (scene === 'admin') {
    const navCount = rows.findIndex(row => !row.id.startsWith('page:') && row.id !== 'back');
    const count = navCount < 0 ? rows.length : navCount;
    const gap = 9, columnWidth = (viewport.width - 36 - gap) / 2;
    const placed = rows.map((row, index) => index < count
      ? { ...row, x: 18 + (index % 2) * (columnWidth + gap), y: contentTop + Math.floor(index / 2) * 60 - scroll, width: columnWidth, height: 52 }
      : { ...row, x: 18, y: contentTop + Math.ceil(count / 2) * 60 + 12 + (index - count) * rowHeight - scroll, width: viewport.width - 36, height: 52 });
    return placed.filter(row => row.y >= viewport.top && row.y + row.height <= bottom);
  }
  return rows.map((row, index) => ({ ...row, x: 18, y: contentTop + index * rowHeight - scroll,
    width: viewport.width - 36, height: 52 })).filter(row => row.y >= viewport.top && row.y + row.height <= bottom);
}

export function hitTest(rows: HitRegion[], x: number, y: number): HitRegion | undefined {
  return rows.find(row => x >= row.x && x <= row.x + row.width && y >= row.y && y <= row.y + row.height);
}

export function hideSensitiveView(state: { privateRoleVisible: boolean; ballotVisible: boolean }): void {
  state.privateRoleVisible = false;
  state.ballotVisible = false;
}
