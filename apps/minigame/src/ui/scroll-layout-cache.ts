import {layoutWebScreen,type WebLayout} from './web-layout.js';
import type {ScreenModel} from './widgets.js';
import type {SafeViewport} from './layout.js';
/** Cache scroll-independent geometry only for surfaces with linear vertical scrolling. */
export function createScrollLayoutCache(compute=layoutWebScreen){
 let key='',base:WebLayout|undefined;
 return (model:ScreenModel,viewport:SafeViewport,fontRevision=0):WebLayout=>{
  const doc=model.web?.document;
  const safe=model.web?.page==='table'||doc?.kind==='sound'||doc?.kind==='account'&&!!doc.profileEditing||doc?.kind==='settings';
  if(!safe)return compute(model,viewport);
  const next=JSON.stringify([{...model,scroll:0},viewport,fontRevision]);
  if(next!==key||!base){base=compute({...model,scroll:0},viewport);key=next;}
  const scroll=Math.max(0,Math.min(model.scroll??0,base.maxScroll));
  return {...base,nodes:base.nodes.map(n=>n.fixed?n:{...n,y:n.y-scroll})};
 };
}
