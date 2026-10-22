import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRows, hitTest, hideSensitiveView } from '../src/ui/layout.js';
import { fitRowText, rowTone } from '../src/ui/widgets.js';

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

test('entry artwork leaves a hero area while actions stay touchable and scrollable', () => {
  const viewport = { width: 390, height: 844, top: 44, bottom: 34 };
  const rows = Array.from({ length: 10 }, (_, index) => ({ id: String(index), text: `动作${index}` }));
  const visible = layoutRows(rows, viewport, 0, 'entry');
  assert.ok(visible[0]!.y > viewport.top + 180);
  assert.ok(visible.every(row => row.height >= 44));
  assert.ok(layoutRows(rows, viewport, 300, 'entry').some(row => row.id === '9'));
});

test('primary actions and warnings receive distinct visual treatments', () => {
  assert.equal(rowTone('login'), 'primary');
  assert.equal(rowTone('propose'), 'primary');
  assert.equal(rowTone('endGame'), 'danger');
  assert.equal(rowTone('role'), 'secret');
  assert.equal(rowTone('status'), 'info');
});

test('game seats form a two-column board before action cards', () => {
  const viewport = { width: 390, height: 844, top: 44, bottom: 34 };
  const rows = [
    { id: 'status', text: '第1轮' }, { id: 'progress', text: '任务进度' },
    ...Array.from({ length: 6 }, (_, index) => ({ id: `player:${index}`, text: `${index + 1}号 仙友` })),
    { id: 'role', text: '查看身份' },
  ];
  const placed = layoutRows(rows, viewport, 0, 'game');
  const seats = placed.filter(row => row.id.startsWith('player:'));
  assert.equal(seats.length, 6);
  assert.equal(seats[0]!.y, seats[1]!.y);
  assert.ok(seats[0]!.x < seats[1]!.x);
  assert.equal(seats[2]!.y, seats[3]!.y);
  assert.ok(placed.find(row => row.id === 'role')!.y > seats[5]!.y);
  assert.equal(rowTone('player:1'), 'seat');
});
