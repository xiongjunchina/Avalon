import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentUrls } from '../src/deployment';

test('nested deployments keep APIs, sockets, assets and invitations under one prefix', () => {
  const urls = deploymentUrls('/avalon');
  assert.equal(urls.path('api/me'), '/avalon/api/me');
  assert.equal(urls.socket('https://game.example', 'room'), 'wss://game.example/avalon/api/rooms/room/socket');
  assert.equal(urls.invite('https://game.example', 'a+b'), 'https://game.example/avalon/?invite=a%2Bb');
  for (const folder of ['art', 'audio', 'assets']) assert.equal(urls.asset(`/${folder}/file?v=old`), `/avalon/${folder}/file?v=old`);
  for (const source of ['data:image/png;base64,AAAA', 'https://example.com/photo', '/avalon/art/photo']) assert.equal(urls.asset(source), source);
  assert.equal(urls.isAdmin('/avalon/admin'), true);
  assert.equal(urls.isAdmin('/avalon/admin/users'), true);
  assert.equal(urls.isAdmin('/admin'), false);
  assert.equal(urls.isAdmin('/avalon/administrator'), false);
});

test('root development stays compatible and URL prefixes cannot be arbitrary URLs', () => {
  const urls = deploymentUrls();
  assert.equal(urls.path('/api/me'), '/api/me');
  assert.equal(urls.asset('/art/photo'), '/art/photo');
  assert.equal(urls.isAdmin('/admin'), true);
  for (const prefix of ['https://example.com/', '/../mafia/', '/avalon?x=1', '/avalon//']) assert.throws(() => deploymentUrls(prefix));
});
