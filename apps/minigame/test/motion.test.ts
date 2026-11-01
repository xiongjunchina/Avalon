import {test} from 'node:test';import assert from 'node:assert/strict';import {sceneMotion} from '../src/ui/motion.js';
test('scene motion remains bounded and altar rotates continuously without shifting controls',()=>{
 for(let t=0;t<60000;t+=100){const m=sceneMotion(t);assert.ok(m.zoom>=1.006&&m.zoom<=1.018);assert.ok(Math.abs(m.driftX)<=2);}
 assert.ok(Math.abs(sceneMotion(16000).angle-Math.PI*2)<1e-9);assert.ok(sceneMotion(1001).angle>sceneMotion(1000).angle);
});
