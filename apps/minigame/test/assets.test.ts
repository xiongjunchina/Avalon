import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArtwork} from '../src/ui/assets.js';
import type {WxRuntime,WxImage} from '../src/platform/wechat.js';
test('failed images do not restart a request on every redraw',()=>{
 const images:WxImage[]=[];
 const runtime={createImage:()=>{const image={width:0,height:0,src:'',onload:null,onerror:null} as WxImage;images.push(image);return image;}} as WxRuntime;
 const art=createArtwork(runtime,()=>{},'https://example.com');
 art.get('/art/roles/merlin-640.webp');images.find(i=>i.src.startsWith('https:'))!.onerror?.();
 for(let i=0;i<100;i++)art.get('/art/roles/merlin-640.webp');
 assert.equal(images.filter(i=>i.src.startsWith('https:')).length,1);
});
test('large role art keeps a packaged preview while the remote image is unavailable',()=>{
 const images:WxImage[]=[];const runtime={createImage:()=>{const image={width:160,height:160,src:'',onload:null,onerror:null} as WxImage;images.push(image);return image;}} as WxRuntime;
 const art=createArtwork(runtime,()=>{},'https://example.com/avalon');art.get('/art/roles/merlin-640.webp');
 assert.ok(images.some(i=>i.src==='https://example.com/avalon/art/roles/merlin-640.webp'));
 const local=images.find(i=>i.src==='art/roles/merlin-160.webp');assert.ok(local);local.onload?.();
 assert.equal(art.get('/art/roles/merlin-640.webp'),local);
});
