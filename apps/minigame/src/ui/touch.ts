import type {WxRuntime} from '../platform/wechat.js';
/** Track the whole gesture, so dragging back to the start never clicks a seat. */
export function attachTouchNavigation(runtime:WxRuntime, actions:{scrollBy(delta:number):void;tap(x:number,y:number):void}) {
 let start:{clientX:number;clientY:number}|undefined,lastY=0,dragged=false;
 runtime.onTouchStart?.(event=>{start=event.touches.length===1?event.touches[0]:undefined;lastY=start?.clientY??0;dragged=false;});
 const move=(point:{clientX:number;clientY:number})=>{
   if(!start)return;
   if(Math.hypot(point.clientX-start.clientX,point.clientY-start.clientY)>10)dragged=true;
   if(dragged){actions.scrollBy(lastY-point.clientY);lastY=point.clientY;}
 };
 runtime.onTouchMove?.(event=>{if(event.touches.length!==1){start=undefined;return;}move(event.touches[0]);});
 runtime.onTouchEnd?.(event=>{const p=event.changedTouches[0];if(!p||!start)return;move(p);if(!dragged)actions.tap(p.clientX,p.clientY);start=undefined;});
 runtime.onTouchCancel?.(()=>{start=undefined;});
}
