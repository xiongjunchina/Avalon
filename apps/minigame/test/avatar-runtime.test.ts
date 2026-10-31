import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAvatar } from '../src/platform/avatar.js';

test('avatar export uses an exportable canvas even when OffscreenCanvas is available', async () => {
  let privacy = false;
  const image = { width: 200, height: 200, set src(_s: string) { (this as any).onload(); } };
  const wx = {
    requirePrivacyAuthorize: (o: any) => { privacy = true; o.success(); },
    chooseImage: (o: any) => { assert.equal(privacy, true); o.success({tempFilePaths:['photo.jpg']}); },
    createOffscreenCanvas: () => ({getContext: () => ({drawImage() {}})}),
    createCanvas: () => ({getContext: () => ({drawImage() {}}), toTempFilePathSync: () => 'avatar.jpg'}),
    createImage: () => image, getFileSystemManager: () => ({readFileSync: () => 'AAAA'})
  } as any;
  assert.equal(await chooseAvatar(wx), 'data:image/jpeg;base64,AAAA');
});

test('avatar picker reports photo access denial clearly', async () => {
  const wx = {chooseImage: (o: any) => o.fail({errMsg:'chooseImage:fail auth deny'}), createImage() {}, getFileSystemManager() {}} as any;
  await assert.rejects(chooseAvatar(wx), /相册|照片/);
});


test('cancelled photo selection is distinguishable from a permission failure', async () => {
  const wx = {chooseImage: (o: any) => o.fail({errMsg:'chooseImage:fail cancel'}), createImage() {}, getFileSystemManager() {}} as any;
  await assert.rejects(chooseAvatar(wx), /AVATAR_CANCELLED/);
});

test('failed privacy authorization never opens the photo picker', async () => {
  let selected = false;
  const wx = {requirePrivacyAuthorize: (o: any) => o.fail({}), chooseImage: () => {selected = true;}, createImage() {}, getFileSystemManager() {}} as any;
  await assert.rejects(chooseAvatar(wx), /隐私授权/);
  assert.equal(selected, false);
});
