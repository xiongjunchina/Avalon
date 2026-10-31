// Reproduce local runtime image loading from the actual generated package.
import {createServer} from 'node:http';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'../../..'),dir=join(root,'dist/minigame');
const {chromium}=await import(process.env.MINIGAME_PLAYWRIGHT_PATH?pathToFileURL(process.env.MINIGAME_PLAYWRIGHT_PATH).href:'playwright');
const js=await build({entryPoints:[join(root,'apps/minigame/src/ui/assets.ts')],bundle:true,write:false,format:'iife',globalName:'Art',platform:'browser'});
const server=createServer(async(req,res)=>{try{const p=resolve(dir,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(dir+'/')&&!p.startsWith(dir+'\\'))throw Error('path');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.MINIGAME_CHROMIUM_PATH?{executablePath:process.env.MINIGAME_CHROMIUM_PATH}:{})});
try{const names=[];for(const d of ['scenes','roles','avatars'])for(const n of await readdir(join(dir,'art',d)))if(n.endsWith('.jpg'))names.push(d+'/'+n.replace(/\.jpg$/,'.webp'));
const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/game.json`);await page.addScriptTag({content:js.outputFiles[0].text});
const result=await page.evaluate(async names=>{
 const requests=[];let packageLoads=0;
 const art=Art.createArtwork({createImage:()=>{const i=new Image();requests.push(i);return i;},loadSubpackage:({success})=>{packageLoads++;setTimeout(success,20);}},()=>{},'https://unavailable.invalid/avalon');
 const expected=names.map(name=>({name,minWidth:name.startsWith('roles/')?640:1}));
 const deadline=Date.now()+8000;
 let results=[];
 do{results=expected.map(({name,minWidth})=>{const i=art.get(name);return {name,width:i?.width??0,height:i?.height??0,src:i?.src??'',loaded:(i?.width??0)>=minWidth&&(!name.startsWith('scenes/')||i?.src?.includes('/hd-art/scene-'))};});if(results.every(r=>r.loaded))break;await new Promise(r=>setTimeout(r,20));}while(Date.now()<deadline);
 if(packageLoads!==1)throw Error('unexpected subpackage loads '+packageLoads);
 if(requests.some(i=>i.src.startsWith('https:')))throw Error('local artwork requested backend');
 return results;
},names);
await writeFile(join(dir,'../packaged-art-verification.json'),JSON.stringify(result,null,2));if(result.some(r=>!r.loaded))throw Error(JSON.stringify(result.filter(r=>!r.loaded)));console.log(`Loaded ${result.length}/${result.length} packaged images including all 640px portraits through production Artwork loader; no backend required.`);
}finally{await browser.close();server.close();}
