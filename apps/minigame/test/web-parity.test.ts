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

test('waiting table preserves five mission medallions, vacant seats and bottom ready dock', () => {
  const room = { id: 'r', code: '123456', hostId: 'u', settings: defaultSettings, acceptingNewMembers: true, members: [{ id: 'u', nickname: '行者', seat: 1, online: true, ready: false }] } as any;
  const model = lobbyScreen(room, room.members[0]);
  const result = layoutWebScreen(model, { width: 390, height: 844, top: 44, bottom: 34 });
  assert.equal(result.nodes.filter(node => node.kind === 'quest').length, 5);
  assert.equal(result.nodes.filter(node => node.kind === 'seat').length, defaultSettings.playerCount);
  assert.ok(result.nodes.some(node => node.id === 'altar'));
  assert.ok(result.nodes.some(node => node.id === 'ready' && node.fixed));
});
