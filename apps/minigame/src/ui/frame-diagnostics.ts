/** Counts real frame callbacks and draw submissions separately; neither is screen presentation FPS. */
export class FrameDiagnostics {
 private ticks:number[]=[];private draws:number[]=[];private costs:number[]=[];private delays:number[]=[];
 tick(now:number){this.ticks.push(now);this.trim(this.ticks,now);}
 paint(start:number,end:number,input?:number){this.draws.push(end);this.trim(this.draws,end);this.costs.push(Math.max(0,end-start));if(this.costs.length>60)this.costs.shift();if(input!==undefined){this.delays.push(Math.max(0,end-input));if(this.delays.length>30)this.delays.shift();}}
 private trim(values:number[],now:number){while(values.length>1&&values[0]!<now-1000)values.shift();}
 snapshot(){const hz=(a:number[])=>a.length<2?0:Math.round((a.length-1)*1000/Math.max(1,a.at(-1)!-a[0]!)),avg=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;return {callbacks:hz(this.ticks),draws:hz(this.draws),cost:avg(this.costs),inputDelay:avg(this.delays)};}
 draw(ctx:CanvasRenderingContext2D,width:number,bottom:number){const s=this.snapshot();ctx.save();ctx.fillStyle='rgba(0,0,0,.85)';ctx.fillRect(0,bottom-25,width,25);ctx.font='10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#b9ffe3';ctx.fillText(`回调 ${s.callbacks}Hz · 绘制 ${s.draws}/s · 耗时 ${s.cost.toFixed(1)}ms · 输入 ${s.inputDelay.toFixed(1)}ms`,width/2,bottom-12,width-8);ctx.restore();}
}
