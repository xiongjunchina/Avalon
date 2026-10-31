import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blurBackdrop} from '../src/ui/backdrop.js';

test('backdrop blur preserves a solid opaque surface, including narrow screens',()=>{
 for(const [width,height] of [[1,1],[2,19],[40,20]]){
  const pixels=new Uint8ClampedArray(width!*height!*4);
  for(let i=0;i<pixels.length;i+=4)pixels.set([21,46,73,255],i);
  const before=new Uint8ClampedArray(pixels);blurBackdrop(pixels,width!,height!);assert.deepEqual(pixels,before);
 }
});
test('backdrop blur softens an edge without moving it or creating transparent seams',()=>{
 const width=80,height=20,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set([x<40?0:255,0,0,255],(y*width+x)*4);
 blurBackdrop(pixels,width,height);
 const value=(x:number)=>pixels[(10*width+x)*4]!;
 assert.equal(value(0),0);assert.equal(value(79),255);assert.ok(value(39)>0&&value(39)<128);assert.ok(value(40)>127&&value(40)<255);
 for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);
});
