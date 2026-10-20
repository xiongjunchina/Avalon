import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { commandSchema, nicknameSchema, profileSchema, presetSchema, settingsSchema, type ServerMessage, type User } from '@avalon/contracts';
import { DomainError, PostgresStore } from './store.js';
import { Accounts, historyQuery } from './accounts.js';
import { generateVoiceToken, uuidToRtcUid } from './agora.js';
import { FriendsService } from './friends.js';
import { AdminService } from './admin.js';

export async function buildApp(options: { store: PostgresStore; origin?: string; secure?: boolean; trustProxy?: boolean; heartbeatMs?: number; maintenanceMs?: number }) {
  const { store }=options;
  const accounts=new Accounts(store);
  const friendsService=new FriendsService(store);
  const adminService=new AdminService(store);
  const origin=options.origin??'http://localhost:5173';
  const app=Fastify({logger:false,bodyLimit:131072,trustProxy:options.trustProxy ? (_address, hop) => hop === 0 : false});
  // One active server per database schema. Never rebuild presence underneath another server.
  const owner=await store.pool.connect();
  const lock=(await owner.query("SELECT pg_try_advisory_lock(hashtext(current_schema() || ':server')) AS acquired")).rows[0].acquired;
  if(!lock) { owner.release(); throw new Error('Another Avalon server owns this database.'); }
  let storageHealthy=true,closing=false;
  type Connection={socket:WebSocket;roomId:string;id:string;alive:boolean;token?:string; userId:string};
  const connections=new Map<string,Connection>();
  const tasks=new Set<Promise<unknown>>();
  const queues=new Map<string,Promise<unknown>>();
  function track<T>(p:Promise<T>):Promise<T> { tasks.add(p); void p.finally(()=>tasks.delete(p)).catch(()=>{}); return p; }
  function serial<T>(key:string,fn:()=>Promise<T>):Promise<T> {
    const p=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(fn);
    queues.set(key,p); track(p);
    void p.finally(()=>{if(queues.get(key)===p) queues.delete(key);}).catch(()=>{}); return p;
  }
  const send=(socket:WebSocket,data:ServerMessage)=>{if(socket.readyState===1) socket.send(JSON.stringify(data));};
  function storageFailure() {
    storageHealthy=false;
    for(const c of connections.values()) {send(c.socket,{type:'error',error:'SERVICE_UNAVAILABLE'});c.socket.close(1013,'Service unavailable');}
  }
  owner.on('error',storageFailure);
  try { await store.recoverPresence(); await store.maintain(); }
  catch(err) { owner.release(true); throw err; }
  const broadcast=(roomId:string)=>serial(`broadcast:${roomId}`,async()=>{
    for(const c of connections.values()) if(c.roomId===roomId) {
      // Each socket receives only its authenticated player's projection.
      const room=await store.snapshot(roomId,c.userId);
      send(c.socket,room?{type:'snapshot',room}:{type:'roomClosed'});
      if(!room)c.socket.close(1000,'Room closed');
    }
  });
  const publish=(id:string)=>{void broadcast(id).catch(()=>{
    for(const c of connections.values())if(c.roomId===id)send(c.socket,{type:'error',error:'SERVICE_UNAVAILABLE'});
  });};
  // Deadlines are durable; timers are only wake-ups and are reconstructed after restart.
  const dealTimers=new Map<string,ReturnType<typeof setTimeout>>();
  function scheduleDeal(roomId:string,deadline:string,retry=false) {
    if(closing||!storageHealthy||dealTimers.has(roomId))return;
    const delay=retry?1000:Math.max(0,Date.parse(deadline)-store.now());
    const timer=setTimeout(()=>{
      dealTimers.delete(roomId);
      track((async()=>{
        if(closing||!storageHealthy)return;
        try {
          const release=await store.releaseDeal(roomId);
          if(release.changed)publish(roomId);
          else if(release.deadline)scheduleDeal(roomId,release.deadline);
        } catch {
          for(const c of connections.values())if(c.roomId===roomId)send(c.socket,{type:'error',error:'SERVICE_UNAVAILABLE'});
          scheduleDeal(roomId,deadline,true);
        }
      })());
    },delay);
    timer.unref();dealTimers.set(roomId,timer);
  }
  try { for(const deal of await store.pendingDeals())scheduleDeal(deal.roomId,deal.deadline); }
  catch(err) { owner.release(true);throw err; }
  await app.register(cookie);
  await app.register(rateLimit,{max:240,timeWindow:'1 minute'});
  await app.register(websocket,{options:{maxPayload:8192}});
  const setSession=(reply:FastifyReply,token:string)=>reply.setCookie('avalon_session',token,{httpOnly:true,sameSite:'strict',secure:options.secure??false,path:'/',maxAge:30*86400});
  const authenticate=async(req:FastifyRequest,reply?:FastifyReply)=>{
    const token=req.cookies.avalon_session;
    const user=await store.authenticate(token,!!reply);
    if(reply)setSession(reply,token!); return user;
  };
  app.addHook('onRequest',async req=>{
    if(!storageHealthy||closing)throw new DomainError('SERVICE_UNAVAILABLE',503);
    if(!['GET','HEAD','OPTIONS'].includes(req.method)||req.headers.upgrade==='websocket') {
      if(req.headers.origin!==origin)throw new DomainError('ORIGIN_REJECTED',403);
    }
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers['x-avalon-request']!=='1')throw new DomainError('CSRF_REJECTED',403);
  });
  app.addHook('onSend',async(_req,reply)=>{reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');});
  app.setErrorHandler((err,_req,reply)=>{
    if(err instanceof DomainError)return reply.code(err.status).send({error:err.code});
    if(err instanceof z.ZodError)return reply.code(400).send({error:'INVALID_INPUT'});
    const status=(err as {statusCode?:number}).statusCode??500;
    return reply.code(status).send({error:status===429?'RATE_LIMITED':status<500?'INVALID_REQUEST':'INTERNAL_ERROR'});
  });
  app.get('/api/health',async()=>{await store.health();return {status:'ok',storage:'postgresql',stage:6};});
  app.post('/api/sessions/guest',{config:{rateLimit:{max:15,timeWindow:'1 minute'}}},async(req,reply)=>{
    const {nickname, forceNew}=z.object({nickname:nicknameSchema, forceNew:z.boolean().optional()}).strict().parse(req.body);
    if (!forceNew) {
      try{return {user:await authenticate(req,reply)};}catch(err){if(!(err instanceof DomainError)||err.code!=='UNAUTHENTICATED')throw err;}
    }
    const {user,token}=await store.createGuest(nickname); setSession(reply,token);return {user};
  });
  app.post('/api/sessions/refresh',async(req,reply)=>({user:await authenticate(req,reply)}));
  app.delete('/api/sessions',async(_req,reply)=>{
    reply.clearCookie('avalon_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/me',async(req,reply)=>{const user=await authenticate(req,reply);return {user,roomId:await store.currentRoom(user.id)};});
  app.patch('/api/me',async(req,reply)=>{
    const user=await accounts.updateProfile((await authenticate(req,reply)).id,profileSchema.parse(req.body));
    const roomId=await store.currentRoom(user.id);if(roomId)publish(roomId);return {user};
  });
  app.get('/api/me/stats',async(req,reply)=>accounts.statistics((await authenticate(req,reply)).id));
  app.get('/api/me/games',async(req,reply)=>accounts.history((await authenticate(req,reply)).id,historyQuery.parse(req.query)));
  app.get<{Params:{id:string}}>('/api/games/:id/replay',async(req,reply)=>accounts.replay((await authenticate(req,reply)).id,z.string().uuid().parse(req.params.id)));
  app.put<{Params:{id:string}}>('/api/me/favorites/:id',async(req,reply)=>accounts.favorite((await authenticate(req,reply)).id,z.string().uuid().parse(req.params.id),true));
  app.delete<{Params:{id:string}}>('/api/me/favorites/:id',async(req,reply)=>accounts.favorite((await authenticate(req,reply)).id,z.string().uuid().parse(req.params.id),false));
  app.get('/api/me/presets',async(req,reply)=>({presets:await accounts.presets((await authenticate(req,reply)).id)}));
  app.post('/api/me/presets',async(req,reply)=>({preset:await accounts.savePreset((await authenticate(req,reply)).id,presetSchema.parse(req.body))}));
  app.delete<{Params:{id:string}}>('/api/me/presets/:id',async(req,reply)=>accounts.deletePreset((await authenticate(req,reply)).id,z.string().uuid().parse(req.params.id)));
  const createRoomBody = z.union([settingsSchema, z.object({ settings: settingsSchema.optional() }).strict()]).optional();
  app.post('/api/rooms',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const parsed=createRoomBody.parse(req.body);
    const initialSettings=parsed && 'playerCount' in parsed ? parsed : parsed?.settings;
    return {room:await store.createRoom(user,initialSettings)};
  });
  app.post('/api/rooms/join',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
    const user=await authenticate(req,reply);
    const {key}=z.object({key:z.string().trim().min(1).max(200)}).strict().parse(req.body);
    const room=await store.join(user,key);publish(room.id);return {room};
  });
  app.get<{Params:{id:string}}>('/api/rooms/:id',async(req,reply)=>store.roomFor((await authenticate(req,reply)).id,z.string().uuid().parse(req.params.id)));

  app.get<{Params:{id:string}}>('/api/rooms/:id/voice-token',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const roomId=z.string().uuid().parse(req.params.id);
    const { room } = await store.roomFor(user.id,roomId);
    if (!room.settings.voiceChatEnabled) {
      reply.status(403);
      return { error: 'VOICE_DISABLED', message: '本房间为常规聚会房，未开启语音功能。' };
    }
    const rtcUid=uuidToRtcUid(user.id);
    const channelName=`avalon-${roomId}`;
    return generateVoiceToken(channelName,rtcUid);
  });

  app.get('/api/friends',async(req,reply)=>{
    const user=await authenticate(req,reply);
    return {friends:await friendsService.listFriends(user.id)};
  });

  app.post('/api/friends/request',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
    const user=await authenticate(req,reply);
    const {query}=z.object({query:z.string().trim().min(1).max(50)}).strict().parse(req.body);
    return friendsService.sendRequest(user.id,query);
  });

  app.post<{Params:{id:string}}>('/api/friends/:id/accept',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const requesterId=z.string().uuid().parse(req.params.id);
    return friendsService.respondRequest(user.id,requesterId,true);
  });

  app.delete<{Params:{id:string}}>('/api/friends/:id',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const targetId=z.string().uuid().parse(req.params.id);
    return friendsService.removeFriend(user.id,targetId);
  });

  app.get<{Params:{id:string}}>('/api/friends/:id/chat',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const friendId=z.string().uuid().parse(req.params.id);
    const client=await store.pool.connect();
    try{
      const res=await client.query<any>(`
        SELECT id, sender_id, receiver_id, message, created_at
        FROM direct_messages
        WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
        ORDER BY created_at DESC
        LIMIT 50
      `,[user.id,friendId]);
      const list=res.rows.reverse().map((r: any)=>({
        id:r.id,
        senderId:r.sender_id,
        receiverId:r.receiver_id,
        message:r.message,
        createdAt:new Date(r.created_at).toISOString(),
        isSelf:r.sender_id===user.id,
      }));
      return {messages:list};
    }finally{client.release();}
  });

  app.post<{Params:{id:string}}>('/api/friends/:id/chat',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const friendId=z.string().uuid().parse(req.params.id);
    const {text}=z.object({text:z.string().trim().min(1).max(500)}).strict().parse(req.body);
    const client=await store.pool.connect();
    const msgId=randomUUID();
    const timestamp=new Date().toISOString();
    try{
      await client.query(`
        INSERT INTO direct_messages(id, sender_id, receiver_id, message, created_at)
        VALUES($1,$2,$3,$4,now())
      `,[msgId,user.id,friendId,text]);
    }finally{client.release();}

    // If target friend has an active WebSocket, push directChat in real time
    const targetConn=connections.get(friendId);
    if(targetConn&&targetConn.socket.readyState===1){
      send(targetConn.socket,{
        type:'directChat',
        messageId:msgId,
        fromUser:user,
        text,
        timestamp,
      });
    }
    return {ok:true,messageId:msgId,timestamp};
  });

  app.post<{Params:{id:string}}>('/api/rooms/:id/chat',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const roomId=z.string().uuid().parse(req.params.id);
    const {room}=await store.roomFor(user.id,roomId);
    const {text}=z.object({text:z.string().trim().min(1).max(200)}).strict().parse(req.body);
    const member=room.members.find(m=>m.id===user.id);
    const seat=member?.seat??0;
    const messageId=randomUUID();
    const timestamp=new Date().toISOString();
    for(const c of connections.values()){
      if(c.roomId===roomId){
        send(c.socket,{
          type:'roomChat',
          messageId,
          fromUserId:user.id,
          seat,
          nickname:user.nickname,
          text,
          timestamp,
        });
      }
    }
    return {ok:true,messageId};
  });

  app.post<{Params:{id:string}}>('/api/rooms/:id/invite',async(req,reply)=>{
    const user=await authenticate(req,reply);
    const roomId=z.string().uuid().parse(req.params.id);
    const {room}=await store.roomFor(user.id,roomId);
    const {targetUserId}=z.object({targetUserId:z.string().uuid()}).strict().parse(req.body);
    const targetConn=connections.get(targetUserId);
    if(targetConn&&targetConn.socket.readyState===1){
      send(targetConn.socket,{
        type:'roomInvitation',
        fromUser:user,
        roomId:room.id,
        roomCode:room.code,
      });
      return {sent:true,online:true};
    }
    return {sent:true,online:false};
  });

  // --- Admin & Growth System (Scheme 2) ---
  const requireAdmin = (req: FastifyRequest, reply: FastifyReply) => {
    const key = (req.headers['x-admin-key'] as string) || (req.query as any)?.admin_key;
    if (!adminService.verifyKey(key)) {
      reply.code(401);
      throw new DomainError('UNAUTHORIZED_ADMIN', 401);
    }
  };

  app.post('/api/admin/verify', async (req, reply) => {
    const { key } = z.object({ key: z.string() }).parse(req.body);
    if (!adminService.verifyKey(key)) {
      reply.code(401);
      return { ok: false };
    }
    return { ok: true };
  });

  app.get('/api/admin/overview', async (req, reply) => {
    requireAdmin(req, reply);
    return adminService.getOverview(connections.size);
  });

  app.get('/api/admin/settings', async (req, reply) => {
    requireAdmin(req, reply);
    return adminService.getSystemSettings();
  });

  app.post('/api/admin/settings', async (req, reply) => {
    requireAdmin(req, reply);
    const { key, value } = z.object({ key: z.string(), value: z.any() }).parse(req.body);
    await adminService.updateSystemSetting(key, value);
    if (key === 'broadcast_announcement' && value && typeof value === 'object') {
      for (const c of connections.values()) {
        send(c.socket, { type: 'systemAnnouncement', text: value.text || '', enabled: Boolean(value.enabled) });
      }
    }
    return { ok: true };
  });

  app.get('/api/admin/users', async (req, reply) => {
    requireAdmin(req, reply);
    const { query, limit, offset } = req.query as any;
    return adminService.searchUsers(query, limit ? Number(limit) : 50, offset ? Number(offset) : 0);
  });

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/ban', async (req, reply) => {
    requireAdmin(req, reply);
    const userId = z.string().uuid().parse(req.params.id);
    const { isBanned, reason } = z.object({ isBanned: z.boolean(), reason: z.string().optional() }).parse(req.body);
    await adminService.banUser(userId, isBanned, reason);
    if (isBanned) {
      const conn = connections.get(userId);
      if (conn) {
        send(conn.socket, { type: 'error', error: 'USER_BANNED' });
        conn.socket.close(4003, 'User banned');
        connections.delete(userId);
      }
    }
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/vip', async (req, reply) => {
    requireAdmin(req, reply);
    const userId = z.string().uuid().parse(req.params.id);
    const { days } = z.object({ days: z.number().int().min(1).max(3650) }).parse(req.body);
    const vipUntil = await adminService.grantVip(userId, days);
    return { ok: true, vipUntil };
  });

  app.post<{ Params: { id: string } }>('/api/admin/users/:id/reset-profile', async (req, reply) => {
    requireAdmin(req, reply);
    const userId = z.string().uuid().parse(req.params.id);
    const { resetNickname, resetAvatar } = z.object({ resetNickname: z.boolean().optional(), resetAvatar: z.boolean().optional() }).parse(req.body);
    await adminService.resetUserProfile(userId, resetNickname, resetAvatar);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/admin/users/:id/friends', async (req, reply) => {
    requireAdmin(req, reply);
    const userId = z.string().uuid().parse(req.params.id);
    return { friends: await adminService.getUserFriends(userId) };
  });

  app.get('/api/admin/rooms', async (req, reply) => {
    requireAdmin(req, reply);
    return { rooms: await adminService.getActiveRooms() };
  });

  app.post<{ Params: { id: string } }>('/api/admin/rooms/:id/kill', async (req, reply) => {
    requireAdmin(req, reply);
    const roomId = z.string().uuid().parse(req.params.id);
    await store.forceCloseRoom(roomId);
    for (const [uid, c] of connections.entries()) {
      if (c.roomId === roomId) {
        send(c.socket, { type: 'roomClosed' });
        c.socket.close(1000, 'Room closed by admin');
        connections.delete(uid);
      }
    }
    publish(roomId);
    return { ok: true };
  });

  app.get('/api/admin/games', async (req, reply) => {
    requireAdmin(req, reply);
    const { limit, offset } = req.query as any;
    return { games: await adminService.getGameHistory(limit ? Number(limit) : 20, offset ? Number(offset) : 0) };
  });

  app.get('/api/admin/redemption-codes', async (req, reply) => {
    requireAdmin(req, reply);
    return { codes: await adminService.listRedemptionCodes() };
  });

  app.post('/api/admin/redemption-codes/generate', async (req, reply) => {
    requireAdmin(req, reply);
    const { count, days, note } = z.object({
      count: z.number().int().min(1).max(100),
      days: z.number().int().min(1).max(365),
      note: z.string().optional(),
    }).parse(req.body);
    const codes = await adminService.generateRedemptionCodes(count, days, note);
    return { codes };
  });

  app.post('/api/admin/broadcast', async (req, reply) => {
    requireAdmin(req, reply);
    const { text, enabled } = z.object({ text: z.string(), enabled: z.boolean() }).parse(req.body);
    await adminService.updateSystemSetting('broadcast_announcement', { text, enabled });
    for (const c of connections.values()) {
      send(c.socket, { type: 'systemAnnouncement', text, enabled });
    }
    return { ok: true };
  });

  // Public system status & user redemption
  app.get('/api/system/announcement', async () => {
    const settings = await adminService.getSystemSettings();
    return {
      announcement: settings.announcement,
      freeAccessMode: settings.freeAccessMode,
    };
  });

  app.post('/api/me/redeem', async (req, reply) => {
    const user = await authenticate(req, reply);
    const { code } = z.object({ code: z.string().trim().min(4).max(16) }).parse(req.body);
    return adminService.redeemCode(user.id, code);
  });

  const wsUsers=new WeakMap<FastifyRequest,User>();
  app.get<{Params:{id:string}}>('/api/rooms/:id/socket',{
    websocket:true,preValidation:async req=>{
      const user=await authenticate(req);await store.roomFor(user.id,z.string().uuid().parse(req.params.id));wsUsers.set(req,user);
    },
  },(socket,req)=>{
    const user=wsUsers.get(req)!;
    const c:Connection={socket,roomId:req.params.id,id:randomUUID(),alive:true,token:req.cookies.avalon_session,userId:user.id};
    let count=0,windowStart=Date.now();
    const ready=serial(`user:${user.id}`,async()=>{
      if(closing||socket.readyState!==1)return;
      await store.connect(user.id,c.roomId,c.id);
      const old=connections.get(user.id); connections.set(user.id,c);
      if(old){send(old.socket,{type:'takenOver'});old.socket.close(4001,'Taken over');}
      publish(c.roomId);
    });
    void ready.catch(err=>{send(socket,{type:'error',error:err instanceof DomainError?err.code:'SERVICE_UNAVAILABLE'});socket.close(1013,'Connection failed');});
    socket.on('pong',()=>{c.alive=true;});
    // Attach synchronously, then queue behind authentication/presence persistence.
    socket.on('message',raw=>{
      if(Date.now()-windowStart>10000){count=0;windowStart=Date.now();}
      if(++count>50){socket.close(4008,'Rate limit');return;}
      void serial(`user:${user.id}`,async()=>{
        await ready;
        if(closing||connections.get(user.id)!==c)return;
        let commandId='';
        try{
          await store.authenticate(c.token);
          const command=commandSchema.parse(JSON.parse(raw.toString()));commandId=command.commandId;
          const result=await store.execute(user.id,c.roomId,command,c.id);
          if(result.dealEndsAt)scheduleDeal(c.roomId,result.dealEndsAt);
          send(socket,result.result);
          if(result.left){connections.delete(user.id);send(socket,{type:'left'});socket.close(1000,'Left');}
          if(result.kickedUserId){
            const kicked=connections.get(result.kickedUserId);
            if(kicked&&kicked.roomId===c.roomId){connections.delete(result.kickedUserId);send(kicked.socket,{type:'left'});kicked.socket.close(1000,'Kicked');}
          }
          publish(c.roomId);
        }catch(err){
          const error=err instanceof DomainError?err.code:'INVALID_INPUT';
          send(socket,{type:'commandResult',commandId,ok:false,error});
          if(error==='UNAUTHENTICATED'){send(socket,{type:'error',error});socket.close(4003,'Session expired');}
          else if(error!=='SERVICE_UNAVAILABLE')publish(c.roomId);
        }
      }).catch(()=>{send(socket,{type:'error',error:'SERVICE_UNAVAILABLE'});});
    });
    socket.on('close',()=>{
      void serial(`user:${user.id}`,async()=>{
        await ready.catch(()=>{});
        if(connections.get(user.id)!==c)return;
        connections.delete(user.id);
        await store.disconnect(user.id,c.roomId,c.id);
        if(!closing)publish(c.roomId);
      }).catch(()=>{});
    });
    socket.on('error',()=>socket.close());
  });
  let ticking=false;
  const tick=async()=>{
    if(ticking||closing||!storageHealthy)return;
    ticking=true;
    try{
      const ids:string[]=[];
      for(const c of connections.values()) {
        if(!c.alive){c.socket.terminate();continue;}
        try{await store.authenticate(c.token);}catch(err){
          if(err instanceof DomainError && err.code==='UNAUTHENTICATED'){send(c.socket,{type:'error',error:err.code});c.socket.close(4003,'Session expired');continue;}throw err;
        }
        ids.push(c.id);c.alive=false;c.socket.ping();
      }
      await store.touch(ids);
      for(const roomId of await store.maintain())publish(roomId);
    }catch{
      for(const c of connections.values()){send(c.socket,{type:'error',error:'SERVICE_UNAVAILABLE'});c.socket.close(1013,'Service unavailable');}
    }finally{ticking=false;}
  };
  const timer=setInterval(()=>{track(tick());},options.maintenanceMs??options.heartbeatMs??15000);timer.unref();
  app.addHook('preClose',async()=>{
    closing=true;clearInterval(timer);
    for(const pending of dealTimers.values())clearTimeout(pending);dealTimers.clear();
    const current=[...connections.values()];
    for(const c of current)c.socket.terminate();
    // Close event callbacks and queued writes must finish before releasing the database owner.
    await new Promise(resolve=>setImmediate(resolve));
    while(tasks.size)await Promise.allSettled([...tasks]);
    connections.clear();
    await owner.query("SELECT pg_advisory_unlock(hashtext(current_schema() || ':server'))").catch(()=>{});
    owner.release();
  });
  return {app,store};
}
