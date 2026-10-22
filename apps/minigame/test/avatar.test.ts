import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAvatar } from '../src/platform/avatar.js';

test('avatar picker crops a chosen image to a bounded JPEG data URL', async () => {
  const drawn: number[] = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args: unknown[]) => { drawn.push(args.length); } }),
    toTempFilePathSync: () => 'cropped.jpg' };
  const image = { width: 400, height: 200, onload: undefined as (() => void) | undefined, onerror: undefined as (() => void) | undefined,
    set src(_value: string) { this.onload?.(); } };
  const wx = { chooseImage: (options: { success: (result: unknown) => void }) => options.success({ tempFilePaths: ['photo.png'], tempFiles: [{ size: 1000 }] }),
    createCanvas: () => canvas, createImage: () => image,
    getFileSystemManager: () => ({ readFileSync: () => 'AAAA' }) } as any;
  const result = await chooseAvatar(wx);
  assert.equal(result, 'data:image/jpeg;base64,AAAA');
  assert.deepEqual(drawn, [9]);
  assert.equal(canvas.width, 160);
});

test('avatar picker rejects files larger than the profile limit before decoding', async () => {
  const wx = { chooseImage: (options: { success: (result: unknown) => void }) => options.success({ tempFilePaths: ['large.png'], tempFiles: [{ size: 8 * 1024 * 1024 + 1 }] }),
    createCanvas: () => { throw new Error('canvas should not run'); }, createImage: () => ({}), getFileSystemManager: () => ({}) } as any;
  await assert.rejects(chooseAvatar(wx), /8MB/);
});
