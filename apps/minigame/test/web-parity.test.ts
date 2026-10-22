import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings } from '@avalon/contracts';
import { entryScreen } from '../src/screens/entry.js';
import { lobbyScreen } from '../src/screens/lobby.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';

test('home preserves web role showcase, paired room actions and compact account tools', () => {
  const model = entryScreen({ id: 'u', nickname: '行者', playerCode: '123456' });
  assert.equal(model.web?.page, 'home');
  const nodes = layoutWebScreen(model, { width: 390, height: 844, top: 44, bottom: 34 }).nodes;
  assert.ok(nodes.some(node => node.kind === 'portrait' && node.id === 'showcase'));
  assert.equal(nodes.find(node => node.id === 'create')?.y, nodes.find(node => node.id === 'join')?.y);
  assert.ok(nodes.some(node => node.id === 'account' && node.y < 120));
});

test('waiting table preserves five mission medallions, vacant seats and scrolling action dock', () => {
  const room = { id: 'r', code: '123456', hostId: 'u', settings: defaultSettings, acceptingNewMembers: true, members: [{ id: 'u', nickname: '行者', seat: 1, online: true, ready: false }] } as any;
  const model = lobbyScreen(room, room.members[0]);
  const result = layoutWebScreen(model, { width: 390, height: 844, top: 44, bottom: 34 });
  assert.equal(result.nodes.filter(node => node.kind === 'quest').length, 5);
  assert.equal(result.nodes.filter(node => node.kind === 'seat').length, defaultSettings.playerCount);
  assert.ok(result.nodes.some(node => node.id === 'altar'));
  assert.ok(result.nodes.some(node => node.id === 'ready' && node.y > result.nodes.find(n => n.id === 'arena-frame')!.y));
});


test('390px home geometry follows the web CSS instead of a separate mini game composition', () => {
  const model = entryScreen({ id: 'u', nickname: '行者', playerCode: '123456' });
  const { nodes } = layoutWebScreen(model, { width: 390, height: 844, top: 0, bottom: 0 });
  const role = nodes.find(n => n.id === 'showcase')!;
  assert.ok(Math.abs(role.width - 132.6) < 1);
  assert.ok(Math.abs(role.y - 182) < 1);
  assert.ok(Math.abs(nodes.find(n => n.id === 'brand')!.y - 68) < 1);
  assert.ok(Math.abs(nodes.find(n => n.id === 'create')!.y - 702.14) < 1);
});

test('same proposing fixture uses alternating flanks and the web arena/dock proportions', async () => {
  const { parityFixture } = await import('../scripts/parity-fixture.js');
  const { gameScreen } = await import('../src/screens/game.js');
  const { user, room } = parityFixture();
  assert.equal(room.game.phase, 'proposing');
  const model = gameScreen(room, user, { privateRoleVisible: false, ballotVisible: false, selectedIds: [] });
  const { nodes, maxScroll } = layoutWebScreen(model, { width: 390, height: 844, top: 0, bottom: 0 });
  const arena = nodes.find(n => n.id === 'arena-frame')!;
  assert.ok(Math.abs(arena.y - 273.3) < 1);
  assert.ok(Math.abs(arena.height - 303.84) < 1);
  assert.ok(Math.abs(nodes.find(n => n.id === 'action-dock')!.y - 595.14) < 1);
  assert.deepEqual(nodes.filter(n => n.kind === 'seat' && n.x < 100).map(n => n.count), [1, 3, 5]);
  assert.equal(nodes.filter(n => n.kind === 'seat').length, 6);
  assert.ok(nodes.some(n => n.id === 'endGame'));
  assert.equal(nodes.find(n => n.id === 'propose')!.disabled, true);
  assert.equal(maxScroll, 0);
});


test('small and safe-area screens can scroll the live dock into view without offscreen targets', async () => {
  const { PracticeSession }=await import('../src/screens/practice.js');
  const { gameScreen }=await import('../src/screens/game.js');
  for(const width of [320,390,430]) for(const count of [5,6,7,8,9,10,11,12]) {
    const practice=new PracticeSession({...defaultSettings,playerCount:count},'行者');
    const model=gameScreen(practice.view(),practice.user,{privateRoleVisible:false,ballotVisible:false});
    const viewport={width,height:width===320?568:844,top:44,bottom:34};
    const first=layoutWebScreen(model,viewport);
    const last=layoutWebScreen({...model,scroll:first.maxScroll},viewport);
    assert.equal(last.nodes.filter(n=>n.kind==='seat').length,count);
    for(const node of last.nodes.filter(n=>n.kind==='button'||n.kind==='seat')) {
      assert.ok(node.x>=0 && node.x+node.width<=width+.1,`${width}/${count}: ${node.id} offscreen horizontally`);
    }
    const action=last.nodes.find(n=>n.id==='confirmRole');
    assert.ok(action && action.y>=viewport.top && action.y+action.height<=viewport.height-viewport.bottom);
  }
});
