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
const result=await page.evaluate(async names=>{const requests=[];const art=Art.createArtwork({createImage:()=>{const i=new Image();requests.push(i);return i;}},()=>{},'https://unavailable.invalid/avalon');names.forEach(n=>art.get(n));await Promise.all(requests.map(i=>new Promise(r=>{i.addEventListener('load',r);i.addEventListener('error',r);})));return names.map(n=>({name:n,loaded:!!art.get(n)?.width}));},names);
await writeFile(join(dir,'../packaged-art-verification.json'),JSON.stringify(result,null,2));if(result.some(r=>!r.loaded))throw Error(JSON.stringify(result.filter(r=>!r.loaded)));console.log(`Loaded ${result.length}/${result.length} packaged images through production Artwork loader; no backend required.`);
}finally{await browser.close();server.close();}
