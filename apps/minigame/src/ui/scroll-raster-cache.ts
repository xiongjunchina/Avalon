import type {WebNode} from './web-layout.js';

/** Keep only nearby, native-resolution strips. Long documents never become one huge texture. */
export class ScrollRasterCache {
 private key='';private tiles=new Map<number,HTMLCanvasElement>();
 draw(target:CanvasRenderingContext2D,options:{key:string;width:number;ratio:number;scroll:number;top:number;bottom:number;nodes:WebNode[];factory:()=>HTMLCanvasElement;paint:(ctx:CanvasRenderingContext2D,node:WebNode)=>void}){
  const {width,ratio,scroll,top,bottom,nodes,factory,paint}=options,height=256,bleed=32;
  const key=options.key+'|'+width+'|'+ratio;
  if(key!==this.key){this.clear();this.key=key;}
  const first=Math.max(0,Math.floor((top+scroll)/height)),last=Math.floor((bottom+scroll-1)/height);
  const limit=Math.max(6,last-first+2);
  target.save();target.beginPath();target.rect(0,top,width,bottom-top);target.clip();
  try{
   for(let i=first;i<=last;i++){
    let tile=this.tiles.get(i);this.tiles.delete(i);
    if(!tile){
     tile=factory();const ctx=tile.getContext('2d');if(!ctx||ctx===target)return false;
     tile.width=Math.ceil(width*ratio);tile.height=Math.ceil((height+bleed*2)*ratio);
     ctx.scale(ratio,ratio);ctx.translate(0,bleed-i*height);
     for(const node of nodes){const original={...node,y:node.y+scroll};if(original.y+original.height>=i*height-bleed&&original.y<=(i+1)*height+bleed)paint(ctx,original);}
    }
    this.tiles.set(i,tile);
    target.drawImage(tile,0,Math.round(bleed*ratio),tile.width,Math.round(height*ratio),0,i*height-scroll,width,height);
   }
   while(this.tiles.size>limit){const id=this.tiles.keys().next().value!;const tile=this.tiles.get(id)!;this.tiles.delete(id);tile.width=tile.height=1;}
   return true;
  }catch{this.clear();return false;}finally{target.restore();}
 }
 clear(){for(const tile of this.tiles.values())tile.width=tile.height=1;this.tiles.clear();this.key='';}
 get size(){return this.tiles.size;}
}
