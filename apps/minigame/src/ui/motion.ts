/** A slow time-based loop independent of display refresh rate. */
export function sceneMotion(timeMs:number){const t=timeMs/1000;return {zoom:1.012+Math.sin(t*Math.PI/12)*.006,driftX:Math.sin(t*Math.PI/16)*2,angle:t*Math.PI/8};}
