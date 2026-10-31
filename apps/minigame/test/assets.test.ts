import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArtwork} from '../src/ui/assets.js';
import type {WxRuntime,WxImage} from '../src/platform/wechat.js';
test('failed images do not restart a request on every redraw',()=>{
 const images:WxImage[]=[];
 const runtime={createImage:()=>{const image={width:0,height:0,src:'',onload:null,onerror:null} as WxImage;images.push(image);return image;}} as unknown as WxRuntime;
 const art=createArtwork(runtime,()=>{},'https://example.com');
 art.get('/art/roles/merlin-640.webp');images[0]!.onerror?.();
 for(let i=0;i<100;i++)art.get('/art/roles/merlin-640.webp');
 assert.equal(images.length,1);
});
test('large role art keeps a packaged preview while the HD subpackage is unavailable',()=>{
 const images:WxImage[]=[];const runtime={createImage:()=>{const image={width:160,height:160,src:'',onload:null,onerror:null} as WxImage;images.push(image);return image;}} as unknown as WxRuntime;
 const art=createArtwork(runtime,()=>{},'https://example.com');art.get('/art/roles/merlin-640.webp');
 const local=images.find(i=>i.src==='art/roles/merlin-160.jpg');assert.ok(local);local.onload?.();
 assert.equal(art.get('/art/roles/merlin-640.webp'),local);
});
test('built-in web avatars use packaged originals without a network request',()=>{const images:WxImage[]=[];const runtime={createImage:()=>{const i={width:160,height:160,src:'',onload:null,onerror:null} as WxImage;images.push(i);return i;}} as unknown as WxRuntime;const a=createArtwork(runtime,()=>{},'https://example.com');a.get('emblems/leaf.png');a.get('/art/avatars/wx-12.webp?v=artifact1');assert.deepEqual(images.map(i=>i.src),['art/avatars/wx-1.jpg','art/avatars/wx-12.jpg']);});

test('HD package replaces preview locally without calling the backend',()=>{
 const images:WxImage[]=[];let success:()=>void=()=>{};let loads=0;
 const runtime={loadSubpackage:(o:any)=>{loads++;success=o.success;},createImage:()=>{const i={width:640,height:640,src:'',onload:null,onerror:null} as WxImage;images.push(i);return i;}} as unknown as WxRuntime;
 const art=createArtwork(runtime,()=>{},'https://unavailable.invalid/avalon');
 art.get('roles/merlin-160.webp');images[0]!.onload?.();
 assert.equal(art.get('/art/roles/merlin-640.webp'),images[0]);assert.equal(loads,1);
 success();assert.equal(art.get('/art/roles/merlin-640.webp'),images[0]);
 assert.equal(images[1]!.src,'hd-art/merlin-640.jpg');images[1]!.onload?.();
 assert.equal(art.get('roles/merlin-160.webp'),images[1]);assert.equal(loads,1);
 assert.ok(images.every(i=>!i.src.startsWith('https:')));
});
test('subpackage exceptions preserve the packaged preview and throttle retries',()=>{
 let loads=0;const images:WxImage[]=[];
 const runtime={loadSubpackage:()=>{loads++;throw Error('offline');},createImage:()=>{const i={width:160,height:160,src:'',onload:null,onerror:null} as WxImage;images.push(i);return i;}} as unknown as WxRuntime;
 const art=createArtwork(runtime,()=>{});
 assert.doesNotThrow(()=>art.get('roles/merlin-160.webp'));images[0]!.onload?.();
 for(let i=0;i<100;i++)assert.equal(art.get('roles/merlin-160.webp'),images[0]);
 assert.equal(loads,1);
});

test('scene quality upgrade retains the first frame until its local HD image decodes',()=>{
 const images:WxImage[]=[];let ready=()=>{};
 const runtime={loadSubpackage:(o:any)=>{ready=o.success;},createImage:()=>{const image={width:768,height:1376,src:'',onload:null,onerror:null} as WxImage;images.push(image);return image;}} as unknown as WxRuntime;
 const art=createArtwork(runtime,()=>{},'https://unavailable.invalid/avalon');art.get('scenes/gate.webp');images[0]!.onload?.();ready();
 assert.equal(art.get('scenes/gate.webp'),images[0]);assert.equal(images[1]!.src,'hd-art/scene-gate.jpg');images[1]!.onload?.();assert.equal(art.get('scenes/gate.webp'),images[1]);
 assert.ok(images.every(i=>!i.src.startsWith('https:')));
});
