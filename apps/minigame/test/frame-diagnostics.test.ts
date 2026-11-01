import {test} from 'node:test';import assert from 'node:assert/strict';
import {FrameDiagnostics} from '../src/ui/frame-diagnostics.js';
test('frame diagnostics distinguishes frame callbacks from slower drawing and measures submission latency',()=>{
 const d=new FrameDiagnostics();for(let i=0;i<=60;i++)d.tick(i*1000/60);for(let i=0;i<=24;i++)d.paint(i*1000/24-4,i*1000/24,i*1000/24-7);
 const s=d.snapshot();assert.equal(s.callbacks,60);assert.equal(s.draws,24);assert.equal(s.cost,4);assert.equal(s.inputDelay,7);
});
