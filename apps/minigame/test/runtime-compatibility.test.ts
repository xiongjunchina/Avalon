import {test} from 'node:test';
import assert from 'node:assert/strict';
import {entryScreen} from '../src/screens/entry.js';
import {renderScreen} from '../src/ui/widgets.js';
import {textGraphemes} from '../src/ui/layout.js';
import type {Artwork} from '../src/ui/assets.js';

// ES2020 engines may lack Array.prototype.at even when the code parses correctly.
// Keep the simulation synchronous and restore the host before asserting results.
function withoutArrayAt<T>(run:()=>T):T {
 const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'at');
 try{Object.defineProperty(Array.prototype,'at',{configurable:true,writable:true,value:undefined});return run();}
 finally{if(descriptor)Object.defineProperty(Array.prototype,'at',descriptor);else delete (Array.prototype as {at?:unknown}).at;}
}

test('older native runtimes draw the full home after its background and title without Array.at',()=>{
 const labels:string[]=[],images:unknown[][]=[];
 const methods={measureText:(value:string)=>({width:Array.from(value).length*8}),
  createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),
  drawImage:(...args:unknown[])=>images.push(args),fillText:(value:string)=>labels.push(value)};
 const ctx=new Proxy(methods,{get:(target,key)=>target[key as keyof typeof methods]??(()=>{})});
 const canvas={getContext:()=>ctx} as unknown as HTMLCanvasElement;
 const img={width:640,height:1280},artwork={get:(path:string)=>path==='home/duel-mobile.jpg'?img:undefined} as Artwork;
 for(const user of [undefined,{id:'u',nickname:'行者'}]){
  labels.length=0;images.length=0;
  const hits=withoutArrayAt(()=>renderScreen(entryScreen(user),canvas,{width:390,height:844,top:88,bottom:34},artwork));
  assert.equal(images.length,3,'all home artwork bands render');
  assert.ok(labels.includes('一念佛魔皆幻相，谁是修道取经人'),'rendering continues past the manually painted title');
  for(const label of ['开常规房','加入房间','🐒 幻境单人试玩 ›','玩法与角色'])assert.ok(labels.includes(label),label);
  for(const id of ['create','join','practice','guide','sound',user?'account':'loginOpen'])assert.ok(hits.some(hit=>hit.id===id),id);
 }
});

test('legacy-safe grapheme grouping preserves emoji and combining marks',()=>{
 const actual=withoutArrayAt(()=>textGraphemes('Á👩🏽‍💻🇨🇳猴'));
 assert.deepEqual(actual,['Á','👩🏽‍💻','🇨🇳','猴']);
});
