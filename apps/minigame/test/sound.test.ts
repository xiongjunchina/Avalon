import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MiniGameSound } from '../src/platform/sound.js';
test('audio reuses web assets, stays opt-in and pauses on background', () => {
  const played: string[] = [], paused: string[] = [];
  const platform = { get() {}, set() {}, runtime: { createInnerAudioContext: () => ({ src: '', play() { played.push(this.src); }, pause() { paused.push(this.src); }, stop() {}, destroy() {} }) } } as any;
  const sound = new MiniGameSound(platform, 'https://game.example/avalon', () => {});
  sound.activate(); assert.equal(played.length, 0);
  sound.configure('music', true);
  assert.ok(played[0]?.startsWith('https://game.example/avalon/audio/v2/yungong-xunyin'));
  sound.foreground(false); assert.equal(paused.length, 1);
  sound.effect('tap'); assert.equal(played.length, 1);
});

test('voice takes audio priority and background music resumes only after voice ends',()=>{
 let plays=0,pauses=0;const sound=new MiniGameSound({get(){},set(){},runtime:{createInnerAudioContext:()=>({src:'',play(){plays++;},pause(){pauses++;},stop(){},destroy(){}})}} as any,'https://game.example/avalon',()=>{});
 sound.configure('music',true);assert.equal(plays,1);sound.voiceActive(true);assert.equal(pauses,1);sound.activate();sound.effect('tap');sound.foreground(true);assert.equal(plays,1);
 sound.voiceActive(false);assert.equal(plays,2);
});
