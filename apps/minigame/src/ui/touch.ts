import type {WxRuntime} from '../platform/wechat.js';
/** Track the whole gesture, so dragging back to the start never clicks a seat. */
export function attachTouchNavigation(runtime:WxRuntime, actions:{scrollBy(delta:number):unknown;tap(x:number,y:number):void;canScrollHorizontal?(x:number,y:number):boolean;scrollHorizontal?(delta:number):void}) {
 let generation=0,lastTime=0,lastMotion=0,velocity=0;
 const raf=runtime.requestAnimationFrame?.bind(runtime);
 const coast=(token:number)=>{let previous=Date.now();const frame=()=>{if(token!==generation)return;const now=Date.now(),dt=Math.min(32,Math.max(1,now-previous));previous=now;velocity*=Math.exp(-dt/180);if(Math.abs(velocity)<.025)return;if(actions.scrollBy(velocity*dt)===false)return;raf?.(frame);};raf?.(frame);};
 let start:{clientX:number;clientY:number}|undefined,lastY=0,lastX=0,dragged=false,horizontal=false;
 runtime.onTouchStart?.(event=>{generation++;velocity=0;lastTime=lastMotion=Date.now();start=event.touches.length===1?event.touches[0]:undefined;lastY=start?.clientY??0;lastX=start?.clientX??0;dragged=false;horizontal=false;});
 const move=(point:{clientX:number;clientY:number})=>{
   if(!start)return;
   if(!dragged&&Math.hypot(point.clientX-start.clientX,point.clientY-start.clientY)>10){dragged=true;horizontal=Math.abs(point.clientX-start.clientX)>Math.abs(point.clientY-start.clientY)&&!!actions.canScrollHorizontal?.(start.clientX,start.clientY);}
   if(dragged){const now=Date.now(),delta=lastY-point.clientY;if(delta){velocity=Math.max(-2.5,Math.min(2.5,delta/Math.max(8,now-lastTime)));lastMotion=now;}lastTime=now;if(horizontal)actions.scrollHorizontal?.(lastX-point.clientX);else actions.scrollBy(lastY-point.clientY);lastY=point.clientY;lastX=point.clientX;}
 };
 runtime.onTouchMove?.(event=>{if(event.touches.length!==1){start=undefined;return;}move(event.touches[0]);});
 runtime.onTouchEnd?.(event=>{const p=event.changedTouches[0];if(!p||!start)return;move(p);if(!dragged)actions.tap(p.clientX,p.clientY);else if(!horizontal&&Date.now()-lastMotion<80&&Math.abs(velocity)>.08)coast(generation);start=undefined;});
 runtime.onTouchCancel?.(()=>{generation++;start=undefined;});
 return ()=>{generation++;start=undefined;};
}
