import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer} from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {WebSocket, WebSocketServer} from 'ws';
import {validateGames, generatePortal, portalCaddy, portalCompose, portalHtml} from '../../deploy/portal/generate.mjs';

const games = JSON.parse(await readFile(new URL('../../deploy/portal/games.json', import.meta.url), 'utf8'));
const caddy = process.env.CADDY_BIN;

test('registry supports another independent game without changing existing game code', () => {
  const registry = validateGames([...games, {...games[1], id:'chess', path:'/chess/', healthPath:'/chess/api/health', upstream:'chess-ingress:8080', network:'game-chess-ingress'}]);
  assert.match(portalCaddy(registry), /handle \/chess\/\*/);
  assert.match(portalCompose(registry), /name: game-chess-ingress/);
  assert.match(portalHtml(registry), /href="\/chess\/"/);
  assert.doesNotMatch(portalHtml(registry), /mafia-ingress|avalon-ingress|healthPath/);
  for (const invalid of [
    [...games,games[0]], [{...games[0],id:'api',path:'/api/'}],
    [{...games[0],upstream:'evil.example/path'}], [{...games[0],network:'network\nservices:'}],
    [{...games[0],path:'/'}],
  ]) assert.throws(() => validateGames(invalid));
  assert.match(portalHtml([{...games[0], name:'<script>unsafe</script>'}]), /&lt;script&gt;/);
});

test('legacy invitation and administration bookmarks preserve query and fragment', async () => {
  const source = await readFile(new URL('../../deploy/portal/assets/portal.js', import.meta.url), 'utf8');
  for (const suffix of ['?invite=a%2Bb#seat', '?admin', '?page=admin#users', '#admin']) {
    let destination;
    runInNewContext(source, {URL, location:{href:'https://game.example/'+suffix, replace:value=>destination=value}});
    assert.equal(destination, '/avalon/'+suffix);
  }
  let destination;
  runInNewContext(source, {URL, location:{href:'https://game.example/', replace:value=>destination=value}});
  assert.equal(destination, undefined);
});

test('real Caddy serves both games, strips Avalon exactly once, and preserves legacy POST/WebSocket', {timeout:15000, skip: !caddy && 'Set CADDY_BIN to run the real gateway integration'}, async t => {
  const directory = await mkdtemp(join(tmpdir(),'avalon-portal-routing-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  await generatePortal(directory);
  const www = join(directory,'avalon-www');
  await mkdir(join(www,'art'),{recursive:true});
  await writeFile(join(www,'index.html'),'Avalon frontend');
  await writeFile(join(www,'art/proof.svg'),'<svg/>');
  const requests = [];
  const backend = createServer(async(req,res)=>{
    let body=''; for await(const chunk of req) body+=chunk;
    requests.push({url:req.url,method:req.method,body,client:req.headers['x-forwarded-for']});
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:req.url,method:req.method,body}));
  });
  const sockets = new WebSocketServer({noServer:true});
  backend.on('upgrade',(req,socket,head)=>sockets.handleUpgrade(req,socket,head,ws=>{
    requests.push({url:req.url,method:'WS'});ws.on('message',data=>ws.send(data));
  }));
  await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
  t.after(()=>{sockets.close();backend.closeAllConnections();backend.close();});
  const backendPort=backend.address().port;
  async function freePort(){const s=createServer();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
  const innerPort=await freePort(),publicPort=await freePort();
  const env={...process.env,APP_BASE_PATH:'/avalon/',HTTPS_GLOBAL_OPTIONS:'auto_https off',TLS_DIRECTIVE:'',LOCAL_SNI:'',CLIENT_IP_SOURCE:'{http.request.header.X-Forwarded-For}',CLIENT_PROTO_SOURCE:'{http.request.header.X-Forwarded-Proto}',XDG_DATA_HOME:join(directory,'data'),XDG_CONFIG_HOME:join(directory,'config')};
  async function start(name,config,port,overrides={}){
    const path=join(directory,name+'.Caddyfile');await writeFile(path,config);
    const childEnv={...env,SITE_ADDRESS:`http://127.0.0.1:${port}`,...overrides};
    const validation=spawnSync(caddy,['validate','--config',path,'--adapter','caddyfile'],{env:childEnv,encoding:'utf8'});
    assert.equal(validation.status,0,validation.stderr);
    const child=spawn(caddy,['run','--config',path,'--adapter','caddyfile'],{env:childEnv,stdio:['ignore','ignore','pipe']});
    let errors='';child.stderr.on('data',data=>errors+=data);
    t.after(async()=>{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));});
    for(let attempt=0;attempt<50;attempt++){
      try{await fetch(`http://127.0.0.1:${port}/`);return;}catch{}
      if(child.exitCode!==null)assert.fail(errors);
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.fail('Caddy did not start: '+errors);
  }
  const inner=(await readFile(new URL('../../deploy/Caddyfile',import.meta.url),'utf8')).replaceAll('server:3001',`127.0.0.1:${backendPort}`).replace('root * /srv',`root * "${www}"`);
  const rootPort=await freePort();
  await start('root-compatibility',inner,rootPort,{APP_BASE_PATH:'/'});
  assert.equal((await(await fetch(`http://127.0.0.1:${rootPort}/api/health`)).json()).url,'/api/health');
  await start('inner',inner,innerPort);
  const main=portalCaddy(games).replace('admin localhost:2019','admin off').replaceAll('avalon-ingress:8080',`127.0.0.1:${innerPort}`).replaceAll('mafia-ingress:8080',`127.0.0.1:${backendPort}`).replace('root * {$PORTAL_WEB_ROOT:/srv}',`root * "${join(directory,'www')}"`);
  await start('public',main,publicPort);
  const origin=`http://127.0.0.1:${publicPort}`;
  assert.match(await(await fetch(origin+'/')).text(),/游戏大厅/);
  assert.equal(await(await fetch(origin+'/avalon/')).text(),'Avalon frontend');
  assert.equal(await(await fetch(origin+'/avalon/art/proof.svg')).text(),'<svg/>');
  assert.equal(await(await fetch(origin+'/art/proof.svg')).text(),'<svg/>');
  for(const id of ['avalon','mafia']){
    const redirect=await fetch(origin+`/${id}?invite=abc`,{redirect:'manual'});
    assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),`/${id}/?invite=abc`);
  }
  assert.equal((await fetch(origin+'/admin?test=1',{redirect:'manual'})).headers.get('location'),'/avalon/admin?test=1');
  assert.equal((await(await fetch(origin+'/avalon/api/me?x=1')).json()).url,'/api/me?x=1');
  assert.equal((await(await fetch(origin+'/mafia/api/health')).json()).url,'/mafia/api/health');
  const body=await(await fetch(origin+'/api/rooms?old=1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"invite":"abc"}'})).json();
  assert.deepEqual(body,{url:'/api/rooms?old=1',method:'POST',body:'{"invite":"abc"}'});
  for(const path of ['/api/rooms/room/socket?ticket=legacy','/avalon/api/rooms/room/socket?ticket=new']){
    const ws=new WebSocket(origin.replace('http:','ws:')+path);
    const echo=await new Promise((resolve,reject)=>{ws.on('error',reject);ws.on('open',()=>ws.send('roundtrip'));ws.on('message',data=>{resolve(data.toString());ws.close();});});
    assert.equal(echo,'roundtrip');
  }
  assert.ok(requests.some(req=>req.method==='WS'&&req.url==='/api/rooms/room/socket?ticket=new'));
  assert.equal((await fetch(origin+'/unregistered/')).status,404);
  assert.equal((await fetch(origin+'/avalonish')).status,404);
  assert.ok(requests.filter(req=>req.method!=='WS'&&req.url!=='/api/health').every(req=>req.client==='127.0.0.1'));
});
