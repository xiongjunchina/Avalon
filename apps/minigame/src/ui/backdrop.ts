// Three separable box passes approximate the web's 4px Gaussian backdrop.
// Work at logical resolution and cache the result, never at phone DPR resolution.
export function blurBackdrop(data:Uint8ClampedArray,width:number,height:number){
  let source=new Uint8ClampedArray(data),target=new Uint8ClampedArray(data.length);
  for(const radius of [3,3,4])for(const horizontal of [true,false]){
    const lines=horizontal?height:width,length=horizontal?width:height,step=horizontal?4:width*4,window=radius*2+1;
    for(let line=0;line<lines;line++)for(let channel=0;channel<4;channel++){
      const base=(horizontal?line*width:line)*4+channel;let sum=0;
      for(let i=-radius;i<=radius;i++)sum+=source[base+Math.max(0,Math.min(length-1,i))*step]!;
      for(let i=0;i<length;i++){
        target[base+i*step]=sum/window;
        sum+=source[base+Math.min(length-1,i+radius+1)*step]!-source[base+Math.max(0,i-radius)*step]!;
      }
    }
    [source,target]=[target,source];
  }
  data.set(source);
}
