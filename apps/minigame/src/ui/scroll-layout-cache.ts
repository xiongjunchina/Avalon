import {layoutWebScreen,type WebLayout} from './web-layout.js';
import type {ScreenModel} from './widgets.js';
import type {SafeViewport} from './layout.js';
export function hasLinearScrollGeometry(model:ScreenModel){
 const doc=model.web?.document;
 // Menus anchored to a scrolling field and round-history sticky headers need direct layout.
 if(doc?.settingChoice||doc?.adminReplay)return false;
 return model.web?.page==='table'||!!doc&&['sound','account','settings','guide','guide-role','admin','friends','presets','chat','tools','join'].includes(doc.kind);
}
/** Cache scroll-independent geometry only for surfaces with linear vertical scrolling. */
export function createScrollLayoutCache(compute=layoutWebScreen){
 let key='',metrics='',base:WebLayout|undefined;
 return (model:ScreenModel,viewport:SafeViewport,fontRevision=0,reuseContent=false):WebLayout=>{
  const doc=model.web?.document;
  if(!hasLinearScrollGeometry(model))return compute(model,viewport);
  const nextMetrics=JSON.stringify([viewport,fontRevision]);
  const next=reuseContent&&base&&metrics===nextMetrics?key:JSON.stringify([{...model,scroll:0},nextMetrics]);
  if(next!==key||!base){base=compute({...model,scroll:0},viewport);key=next;metrics=nextMetrics;}
  const scroll=Math.max(0,Math.min(model.scroll??0,base.maxScroll));
  return {...base,nodes:base.nodes.map(n=>n.fixed?(doc?.kind==='guide'||doc?.kind==='guide-role'?{...n,y:n.y-Math.min(scroll,14)}:n):{...n,y:n.y-scroll})};
 };
}
