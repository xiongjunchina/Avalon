import { cli,instance,run } from './deploy/lib.mjs';
import { matchingEndpoint, startMacAgent, waitForEndpoint } from './deploy/tunnel-runtime.mjs';
cli(async()=>{
  const context=instance(process.argv[2]??'friends');
  if(context.env.EXPOSURE!=='ngrok')throw new Error('This instance is not configured for ngrok.');
  const action=process.argv[3]??'start',name=`avalon-${context.name}`,upstream=`http://127.0.0.1:${context.env.GATEWAY_PORT}`;
  if(!['start','foreground','stop','status'].includes(action))throw new Error('Usage: npm run tunnel -- friends [start|foreground|stop|status]');
  const agent='http://127.0.0.1:4040/api/endpoints';
  const call=async(path='',options={})=>fetch(`${agent}${path}`,{...options,signal:AbortSignal.timeout(10000)});
  let response;
  try {response=await call();}catch(error){
    if(error.cause?.code!=='ECONNREFUSED')throw new Error('Cannot safely inspect local ngrok agent on port 4040.');
  }
  if(response&&!response.ok)throw new Error('Local ngrok endpoint API unavailable. Existing agent preserved.');
  const endpoints=response?(await response.json()).endpoints:[];
  const expected=[name,context.env.APP_ORIGIN,upstream];
  const existing=matchingEndpoint(endpoints,...expected);
  if(action==='status'){console.log(existing?`Running: ${existing.url} -> ${upstream}`:'This instance has no running endpoint.');return;}
  if(action==='stop'){
    if(existing){const stopped=await call(`/${name}`,{method:'DELETE'});if(stopped.status!==204)throw new Error('Failed to stop this endpoint.');}
    console.log('Avalon endpoint stopped. Containers, data and other endpoints preserved.');return;
  }
  if(existing){console.log(`Already running: ${existing.url}`);return;}
  console.log(`Public friend-test endpoint: ${context.env.APP_ORIGIN}. Keep the ngrok agent, Docker and this Mac running.`);
  if(response){
    const started=await call('',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,url:context.env.APP_ORIGIN,upstream:{url:upstream},inspect:false})});
    if(started.status!==201)throw new Error('Failed to create Avalon endpoint on the existing agent.');
    console.log('Started on the existing local ngrok agent.');
  }else if(process.platform==='darwin'&&action==='start'){
    await startMacAgent(context);
    await waitForEndpoint(async()=>{
      let ready;
      try { ready=await call(); } catch(error) { if(error.cause?.code==='ECONNREFUSED')return []; throw error; }
      if(!ready.ok)throw new Error('Local ngrok endpoint API unavailable.');
      return (await ready.json()).endpoints;
    },expected);
    console.log('Started under macOS launchd; independent of this command session. No boot/login autostart.');
  }else{
    console.log('Ctrl+C stops this foreground agent.');
    await run('ngrok',['http',upstream,'--url',context.env.APP_ORIGIN,'--inspect=false','--name',name],{stdio:'inherit'});
  }
});
