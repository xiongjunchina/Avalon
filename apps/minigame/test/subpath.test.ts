import {test} from 'node:test';import assert from 'node:assert/strict';
import {applicationUrl,invitationUrl} from '../src/net/urls.js';
import {MiniGameApi} from '../src/net/api.js';
import {MiniGameSound} from '../src/platform/sound.js';
import {createArtwork} from '../src/ui/assets.js';
import {AdminApi} from '../src/screens/admin/auth.js';
test('Avalon subpath is retained for API, admin, media and invitation with either trailing slash',async()=>{
 for(const base of ['https://game.ccnepower.com/avalon','https://game.ccnepower.com/avalon/']){
 const requested:string[]=[];const platform:any={get:()=>undefined,set:()=>{},request:(o:any)=>{requested.push(o.url);o.success({statusCode:200,data:{ok:true}});},runtime:{createInnerAudioContext:()=>({src:'',play(){requested.push(this.src);},stop(){},destroy(){}})}};
 await new MiniGameApi(platform,base).request('/health');const admin=new AdminApi(platform,base);await admin.verify('test');await admin.overview();const sound=new MiniGameSound(platform,base,()=>{});sound.configure('music',true);sound.configure('effects',true);sound.effect('tap');const art=createArtwork({createImage:()=>({set src(value:string){requested.push(value);}})} as any,()=>{},base);art.get('/art/custom/example.png');
 assert.ok(requested.includes('https://game.ccnepower.com/avalon/api/health'));assert.ok(requested.includes('https://game.ccnepower.com/avalon/api/admin/overview'));assert.ok(requested.includes('https://game.ccnepower.com/avalon/art/custom/example.png'));assert.ok(requested.some(u=>u.startsWith('https://game.ccnepower.com/avalon/audio/')));assert.ok(requested.filter(u=>u.startsWith('https:')).every(u=>u.startsWith('https://game.ccnepower.com/avalon/')));
 assert.equal(invitationUrl(base,'a/b'),'https://game.ccnepower.com/avalon/?invite=a%2Fb');assert.equal(applicationUrl(base.replace('https:','wss:'),'/api/rooms/r/socket'),'wss://game.ccnepower.com/avalon/api/rooms/r/socket');
 }
});
