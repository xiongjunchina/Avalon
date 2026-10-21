export interface SafeViewport { width: number; height: number; top: number; bottom: number }
export interface HitRegion { id: string; x: number; y: number; width: number; height: number; text: string }

export function layoutRows(rows: { id: string; text: string }[], viewport: SafeViewport, scroll: number): HitRegion[] {
  const rowHeight = 52;
  const contentTop = viewport.top + 64;
  const bottom = viewport.height - viewport.bottom;
  return rows.map((row, index) => ({
    ...row, x: 18, y: contentTop + index * rowHeight - scroll,
    width: viewport.width - 36, height: 46,
  })).filter(row => row.y >= viewport.top && row.y + row.height <= bottom);
}

export function hitTest(rows: HitRegion[], x: number, y: number): HitRegion | undefined {
  return rows.find(row => x >= row.x && x <= row.x + row.width && y >= row.y && y <= row.y + row.height);
}

export function hideSensitiveView(state: { privateRoleVisible: boolean; ballotVisible: boolean }): void {
  state.privateRoleVisible = false;
  state.ballotVisible = false;
}
