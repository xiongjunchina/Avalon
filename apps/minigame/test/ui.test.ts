import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRows, hitTest, hideSensitiveView } from '../src/ui/layout.js';
import { fitRowText } from '../src/ui/widgets.js';

test('rows respect safe area, scroll and touch target size', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i), text: `Row ${i}` }));
  const first = layoutRows(rows, { width: 320, height: 480, top: 36, bottom: 20 }, 0);
  assert.ok(first[0]!.y >= 36);
  assert.ok(first[0]!.height >= 44);
  assert.equal(hitTest(first, first[0]!.x + 2, first[0]!.y + 2)?.id, '0');
  const scrolled = layoutRows(rows, { width: 320, height: 480, top: 36, bottom: 20 }, 200);
  assert.notEqual(scrolled[0]?.id, '0');
  assert.ok(scrolled.every(row => row.y + row.height <= 460));
});

test('backgrounding hides private role and ballot overlays', () => {
  const state = { privateRoleVisible: true, ballotVisible: true, menu: 'game' };
  hideSensitiveView(state);
  assert.deepEqual(state, { privateRoleVisible: false, ballotVisible: false, menu: 'game' });
});

test('long row labels fit within the drawable card width', () => {
  const measure = (text: string) => text.length * 16;
  const fitted = fitRowText('花果山美猴王，炼就火眼金睛。开局可看破群妖', 300, measure);
  assert.ok(measure(fitted) <= 300);
  assert.ok(fitted.endsWith('…'));
});
