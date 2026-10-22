import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InviteInbox } from '../src/screens/invites.js';

test('invite inbox retains latest share or room invitation until accepted', () => {
  const inbox = new InviteInbox();
  inbox.receive('123456');
  assert.equal(inbox.code, '123456');
  inbox.receive('654321', '仙友');
  assert.equal(inbox.label(), '仙友 邀请你加入房间 654321');
  assert.equal(inbox.take(), '654321');
  assert.equal(inbox.code, undefined);
});

test('invite inbox ignores empty or overlong values', () => {
  const inbox = new InviteInbox();
  inbox.receive('  ');
  inbox.receive('a'.repeat(201));
  assert.equal(inbox.code, undefined);
});
