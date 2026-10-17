// Original non-vocal game foley: wood, metal, cloth/air and a sword draw.
// Requires Node and ffmpeg. No speech, music synthesis or third-party samples.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = `${root}apps/web/public/audio/v3`, temp = `${root}tmp/audio-render-v3`;
mkdirSync(out, { recursive: true }); mkdirSync(temp, { recursive: true });
const rate = 48000, tau = 2 * Math.PI;
let seed = 1729;
const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
const mono = seconds => new Float32Array(Math.ceil(rate * seconds));
const track = seconds => [mono(seconds), mono(seconds)];
function metal(frequency, seconds, decay = 5) {
  const a = mono(seconds), partials = [1, 1.473, 2.091, 2.837, 4.137];
  for (let i = 0; i < a.length; i++) {
    const t = i / rate;
    for (let h = 0; h < partials.length; h++)
      a[i] += Math.sin(tau * frequency * partials[h] * t) * Math.exp(-t * (decay + h * 1.9)) / (1 + h * 1.8);
    a[i] *= Math.min(1, t / .002);
  }
  return a;
}
function air(seconds, strength = 1) {
  const a = mono(seconds); let slow = 0, fast = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / a.length, white = noise();
    slow += .025 * (white - slow); fast += (.13 + .25 * Math.sin(Math.PI * t)) * (white - fast);
    a[i] = (fast - slow) * Math.sin(Math.PI * t) ** 2 * strength;
  }
  return a;
}
function impact(seconds, frequency) {
  const a = mono(seconds);
  for (let i = 0; i < a.length; i++) {
    const t = i / rate;
    a[i] = Math.sin(tau * (frequency * t + .6 * (1 - Math.exp(-40 * t)))) * Math.exp(-t * 18) * Math.min(1, t / .003)
      + noise() * Math.exp(-t * 120) * .1;
  }
  return a;
}
function mix(a, sound, at, gain, pan = 0) {
  const start = Math.round(at * rate);
  for (let i = 0; i < sound.length && start + i < a[0].length; i++) {
    a[0][start+i] += sound[i] * gain * Math.sqrt((1-pan)/2);
    a[1][start+i] += sound[i] * gain * Math.sqrt((1+pan)/2);
  }
}
function save(name, a, room = .12) {
  const dry = a.map(ch => ch.slice());
  for (const [seconds, gain] of [[.073, room], [.167, room*.65], [.293, room*.35]]) {
    const n = Math.round(seconds * rate);
    for (let c = 0; c < 2; c++) for (let i = n; i < a[c].length; i++) a[c][i] += dry[1-c][i-n] * gain;
  }
  let peak = .001; for (const ch of a) for (const sample of ch) peak = Math.max(peak, Math.abs(sample));
  const bytes = a[0].length * 4, wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF'); wav.writeUInt32LE(36+bytes,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22); wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*4,28);
  wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(bytes,40);
  for (let i = 0; i < a[0].length; i++) for (let c = 0; c < 2; c++) {
    const fade = Math.min(1, i/(rate*.002), (a[0].length-i)/(rate*.045));
    wav.writeInt16LE(Math.round(a[c][i]/peak*.88*fade*32767),44+i*4+c*2);
  }
  const path = `${temp}/${name}.wav`; writeFileSync(path,wav);
  const filters = ['game-start','sword','victory','defeat','game-over'].includes(name)
    ? ['-af','acompressor=threshold=0.16:ratio=4:attack=2:release=120:makeup=1.5,loudnorm=I=-14:TP=-1.5:LRA=7'] : [];
  execFileSync('ffmpeg',['-y','-v','error','-i',path,...filters,'-c:a','libmp3lame','-b:a','160k',`${out}/${name === 'victory' ? 'victory-r2' : name}.mp3`]);
}
// Soft wooden catch and short metal contact; deliberately no musical arpeggio.
for (const name of ['tap','tick','ready','confirm','notice']) {
  const a = track(name === 'tap' || name === 'tick' ? .22 : .55);
  mix(a,impact(.16,name === 'tick' ? 720 : 520),0,.5);
  mix(a,metal(name === 'notice' ? 960 : 1760,.5,14),.004,.32);
  if (name === 'ready' || name === 'confirm') mix(a,metal(1680,.4,12),.095,.18,.15);
  save(name,a,.06);
}
const page = track(.6); mix(page,air(.42),0,1,-.1); mix(page,metal(1350,.48,9),.08,.16,.15); mix(page,impact(.16,320),.05,.14); save('page',page,.08);
const deal = track(.85);
for (let i = 0; i < 4; i++) { mix(deal,air(.13),i*.12,.5,(i-1.5)*.25); mix(deal,impact(.12,400),i*.12,.06); }
save('deal',deal,.08);
const chime = track(1.25); mix(chime,metal(1480,1.2,4),0,.4); save('chime',chime,.18);
const success = track(1.4); mix(success,metal(880,1.3,4),0,.4,-.12); mix(success,metal(1320,1.1,5),.16,.22,.12); save('success-tone',success,.15);
const failure = track(1.5); mix(failure,impact(.5,90),0,.55); mix(failure,metal(310,1.4,3.5),.03,.18); mix(failure,air(.5),.02,.35); save('failure-tone',failure,.18);
// Critical accents emphasize the 180 Hz–4 kHz band for phone speakers.
function drum(seconds = 1.2, frequency = 155) {
  const a = mono(seconds); let body = 0;
  for (let i=0; i<a.length; i++) {
    const t=i/rate; body += .08*(noise()-body);
    const phase=tau*(frequency*t + 3*(1-Math.exp(-22*t)));
    a[i]=(Math.sin(phase)+.45*Math.sin(phase*1.52))*Math.exp(-t*4.5)*Math.min(1,t/.002)
      +body*Math.exp(-t*13)*.8;
  }
  return a;
}
function gong(seconds, fundamental = 170) {
  const a=mono(seconds), ratios=[1,1.43,2.27,3.74,5.12,7.29,9.56];
  for (let i=0;i<a.length;i++) {
    const t=i/rate;
    for (let h=0;h<ratios.length;h++) a[i]+=Math.sin(tau*fundamental*ratios[h]*t + .10*Math.sin(tau*(6+h)*t))
      *Math.exp(-t*(1.8+h*.4))/(1+h*.7);
    a[i]*=Math.min(1,t/.003);
  }
  return a;
}
function brass(frequency, seconds) {
  const a=mono(seconds); let phase=0;
  for(let i=0;i<a.length;i++) {
    const t=i/rate, envelope=Math.min(1,t/.045)*Math.min(1,(seconds-t)/.22);
    phase+=tau*frequency/rate*(1+.0015*Math.sin(tau*5*t));
    a[i]=envelope*(Math.sin(phase)+.35*Math.sin(2*phase)+.18*Math.sin(3*phase)+.08*Math.sin(4*phase));
  }
  return a;
}
// Immediate steel strike, fast unsheathing and a heavy clang, instead of a quiet delayed hiss.
const sword=track(2.7), scrape=mono(.34);let smooth=0, phase=0;
for(let i=0;i<scrape.length;i++) {
  const t=i/rate,p=t/.34; smooth+=.3*(noise()-smooth);
  phase+=tau*(1200+2400*p*p)/rate;
  scrape[i]=(smooth*.8 + Math.sin(phase)*.14 + Math.sin(phase*1.47)*.08)*Math.sin(Math.PI*p)**.7;
}
mix(sword,metal(1960,1.3,5),0,.65,-.1);
mix(sword,drum(1.25,190),0,.38);
mix(sword,scrape,.025,.9,.1); mix(sword,air(.24),.025,.75);
mix(sword,gong(2.4,240),.22,.38); mix(sword,metal(2470,1.9,3),.22,.45,.1);
mix(sword,metal(1330,2,2.7),.23,.3,-.12); mix(sword,drum(1.7,145),.22,.45);
save('sword',sword,.26);
// Entrance: rolling battle drums, open fifth brass and a decisive gong.
const entrance=track(3.2);
for(const [at,gain] of [[0,.35],[.15,.4],[.29,.46],[.42,.5]]) mix(entrance,drum(.85,170),at,gain);
mix(entrance,gong(2.5,205),.56,.36);mix(entrance,air(.42),.18,.7);
mix(entrance,brass(293.66,1.55),.54,.19,-.15);mix(entrance,brass(440,1.55),.54,.16,.15);
mix(entrance,metal(1760,2.4,2.5),.56,.13);save('game-start',entrance,.24);
// Victory r2: brisk heroic fanfare, brass ensemble, accelerating rolls and a full major-chord finish.
function heroBrass(frequency, seconds) {
  const a=mono(seconds), weights=[1,.64,.44,.27,.16,.10,.055];
  let phase=0;
  for(let i=0;i<a.length;i++) {
    const t=i/rate, attack=Math.min(1,t/.018), release=Math.min(1,(seconds-t)/.15);
    phase+=tau*frequency/rate*(1-.018*Math.exp(-t*45)+.0017*Math.sin(tau*5.3*t));
    let tone=0;
    for(let h=0;h<weights.length;h++) tone+=Math.sin((h+1)*phase)*weights[h];
    a[i]=Math.tanh(tone*.7)*attack*release*(.94+.06*Math.sin(tau*6*t));
  }
  return a;
}
function snare(seconds=.25) {
  const a=mono(seconds); let low=0;
  for(let i=0;i<a.length;i++) {const t=i/rate,n=noise();low+=.14*(n-low);a[i]=((n-low)*.55+Math.sin(tau*230*t)*.3)*Math.exp(-t*22)*Math.min(1,t/.002);}
  return a;
}
function crash(seconds) {
  const a=mono(seconds);let low=0, high=0;
  for(let i=0;i<a.length;i++) {const t=i/rate,n=noise();low+=.035*(n-low);high+=.58*(n-high);a[i]=(high-low)*Math.exp(-t*3)*Math.min(1,t/.002);}
  return a;
}
const victory=track(5.6), beat=60/150;
// Immediate full-band impact; an upper-register call answers in wider stereo.
mix(victory,drum(1.4,180),0,.6);mix(victory,crash(1.5),0,.34);
for(const [at,f,d] of [[0,440,.22],[.20,440,.17],[.40,587.33,.52],[1,659.25,.22],[1.2,739.99,.25],[1.5,880,.62],[2.2,739.99,.2],[2.4,880,.2],[2.6,1108.73,.2],[2.8,1174.66,1.5]]) {
  mix(victory,heroBrass(f,d),at,.27,-.20);
  mix(victory,heroBrass(f*.998,d),at+.009,.18,.22);
  mix(victory,heroBrass(f/2,d),at,.18,.04);
}
for(let i=0;i<8;i++) {mix(victory,drum(.8,i%2?170:145),i*beat,.32);if(i%2)mix(victory,snare(),i*beat,.22);}
for(const [i,at] of [2.12,2.28,2.42,2.54,2.64,2.72].entries())mix(victory,snare(.20),at,.13+i*.025,(i%2?1:-1)*.2);
// Dominant fanfare resolves to D major, with bright metal and cymbal shimmer.
for(const f of [440,554.37,659.25])mix(victory,heroBrass(f,.55),2.2,.12);
for(const [i,f] of [293.66,369.99,440,587.33,739.99].entries())mix(victory,heroBrass(f,1.9),2.8,.12,(i-2)*.12);
mix(victory,gong(2.7,220),2.8,.17);mix(victory,crash(2.7),2.8,.5);mix(victory,drum(1.8,150),2.8,.6);
for(const [i,f] of [1174.66,1479.98,1760,2349.32].entries())mix(victory,metal(f,1.7,3),3+i*.10,.08,(i-1.5)*.2);
save('victory',victory,.20);
// Defeat: descending minor cadence, lower metal and a restrained closing impact.
const defeat=track(3.7);
for(const [at,f,d] of [[0,293.66,.65],[.48,261.63,.65],[.96,233.08,.65],[1.44,174.61,1.65]]) {
  mix(defeat,brass(f,d),at,.22,-.08);mix(defeat,brass(f*1.5,d),at,.09,.08);
}
mix(defeat,drum(1.5,145),0,.55);mix(defeat,gong(3,135),.03,.3);
mix(defeat,drum(1.8,130),1.44,.23);save('defeat',defeat,.23);
const ended=track(2.2);mix(ended,gong(2.1,180),0,.45);mix(ended,air(.4),.03,.35);save('game-over',ended,.18);
console.log(`Rendered 15 non-vocal effects to ${out}`);
