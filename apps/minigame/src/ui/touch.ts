import type {WxRuntime} from '../platform/wechat.js';
/** Track the whole gesture, so dragging back to the start never clicks a seat. */
export function attachTouchNavigation(runtime:WxRuntime, actions:{scrollBy(delta:number):void;tap(x:number,y:number):void;canScrollHorizontal?(x:number,y:number):boolean;scrollHorizontal?(delta:number):void}) {
 let start:{clientX:number;clientY:number}|undefined,lastY=0,lastX=0,dragged=false,horizontal=false;
 runtime.onTouchStart?.(event=>{start=event.touches.length===1?event.touches[0]:undefined;lastY=start?.clientY??0;lastX=start?.clientX??0;dragged=false;horizontal=false;});
 const move=(point:{clientX:number;clientY:number})=>{
   if(!start)return;
   if(!dragged&&Math.hypot(point.clientX-start.clientX,point.clientY-start.clientY)>10){dragged=true;horizontal=Math.abs(point.clientX-start.clientX)>Math.abs(point.clientY-start.clientY)&&!!actions.canScrollHorizontal?.(start.clientX,start.clientY);}
   if(dragged){if(horizontal)actions.scrollHorizontal?.(lastX-point.clientX);else actions.scrollBy(lastY-point.clientY);lastY=point.clientY;lastX=point.clientX;}
 };
 runtime.onTouchMove?.(event=>{if(event.touches.length!==1){start=undefined;return;}move(event.touches[0]);});
 runtime.onTouchEnd?.(event=>{const p=event.changedTouches[0];if(!p||!start)return;move(p);if(!dragged)actions.tap(p.clientX,p.clientY);start=undefined;});
 runtime.onTouchCancel?.(()=>{start=undefined;});
}
