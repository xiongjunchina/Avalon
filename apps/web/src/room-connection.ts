import type { Command, RoomView, ServerMessage } from '@avalon/contracts';

export interface ConnectionHandlers {
  snapshot(room:RoomView):void;
  invite(value:string):void;
  playerCode?(value:string):void;
  status(value:string):void;
  error(code:string):void;
  busy(value:boolean):void;
  ended(reason:'left'|'closed'|'expired'):void;
  invitation?(msg:{fromUser:import('@avalon/contracts').User;roomId:string;roomCode:string}):void;
  announcement?(msg:{text:string;enabled:boolean}):void;
  roomChat?(msg:import('@avalon/contracts').RoomChatMessage):void;
  directChat?(msg:{messageId:string;fromUser:import('@avalon/contracts').User;text:string;timestamp:string}):void;
}
// Transport owns one connection attempt and one unacknowledged command at a time.
// Reconnect retries the same commandId, never creates a new vote/action implicitly.
export class RoomConnection {
  private generation=0;
  private stopped=false;
  private takenOver=false;
  private connecting=false;
  private socket:WebSocket|null=null;
  private retryTimer:ReturnType<typeof setTimeout>|undefined;
  private ackTimer:ReturnType<typeof setTimeout>|undefined;
  private syncTimer:ReturnType<typeof setTimeout>|undefined;
  private responseTimer:ReturnType<typeof setTimeout>|undefined;
  private attempt=0;
  private pending:Command|null=null;
  private confirmation:{commandId:string;resolve:()=>void;reject:(error:Error)=>void}|null=null;
  private lastVersion=0;
  constructor(private options:{
    fetchRoom:()=>Promise<{room:RoomView;invite:string}>;
    socket:()=>WebSocket;
    handlers:ConnectionHandlers;
    retryDelay?:number;
    syncIntervalMs?:number;
    responseTimeoutMs?:number;
    userId?:string;
  }){}
  start(){void this.connect();}
  resume(){
    if(this.stopped||this.takenOver)return;
    if(this.socket?.readyState===1)this.sync();
    else if(!this.socket||this.socket.readyState===3)void this.connect();
  }
  reconnect(){this.takenOver=false;this.stopped=false;this.invalidate();void this.connect();}
  stop(){this.rejectConfirmation('CONNECTION_STOPPED');this.stopped=true;this.invalidate();this.pending=null;this.options.handlers.busy(false);}
  private rejectConfirmation(code:string){
    const confirmation=this.confirmation;this.confirmation=null;
    if(!confirmation)return;
    if(this.pending?.commandId===confirmation.commandId)this.pending=null;
    confirmation.reject(new Error(code));
  }
  private invalidate(){
    this.generation++;this.connecting=false;clearTimeout(this.retryTimer);clearTimeout(this.ackTimer);this.ackTimer=undefined;
    clearTimeout(this.syncTimer);clearTimeout(this.responseTimer);this.responseTimer=undefined;
    const old=this.socket;this.socket=null;old?.close();
  }
  private terminal(reason:'left'|'closed'|'expired') {
    this.rejectConfirmation(reason==='expired'?'UNAUTHENTICATED':reason==='closed'?'ROOM_CLOSED':'FORBIDDEN');
    this.stop();this.options.handlers.ended(reason);
  }
  private schedule(){
    clearTimeout(this.retryTimer);
    if(this.stopped||this.takenOver)return;
    this.retryTimer=setTimeout(()=>void this.connect(),this.options.retryDelay??Math.min(1000*2**this.attempt++,10000));
  }
  private expectResponse(){
    if(this.responseTimer)return;
    const generation=this.generation;
    this.responseTimer=setTimeout(()=>{
      if(generation!==this.generation||this.stopped||this.takenOver)return;
      // Mobile browsers can retain OPEN/CONNECTING on a dead network indefinitely.
      this.invalidate();this.options.handlers.status('已断线，正在重连');this.schedule();
    },this.options.responseTimeoutMs??10000);
  }
  private sync(){
    if(this.socket?.readyState!==1||this.responseTimer)return;
    clearTimeout(this.syncTimer);this.expectResponse();
    try{this.socket.send(JSON.stringify({type:'sync'}));}
    catch{this.invalidate();this.options.handlers.status('已断线，正在重连');this.schedule();}
  }
  private receivedSnapshot(){
    clearTimeout(this.responseTimer);this.responseTimer=undefined;clearTimeout(this.syncTimer);
    this.connecting=false;this.attempt=0;this.options.handlers.status('已连接');
    this.syncTimer=setTimeout(()=>this.sync(),this.options.syncIntervalMs??15000);
  }
  private async connect(){
    if(this.stopped||this.takenOver||this.connecting||this.socket?.readyState===1||this.socket?.readyState===0)return;
    clearTimeout(this.retryTimer);this.connecting=true;
    const generation=++this.generation;
    const current=()=>generation===this.generation&&!this.stopped;
    this.options.handlers.status('连接中');this.expectResponse();
    try{
      const data=await this.options.fetchRoom();if(!current())return;
      if(!this.acceptSnapshot(data.room))return;this.options.handlers.invite(data.invite);
      const ws=this.options.socket();this.socket=ws;
      ws.onopen=()=>{if(!current())return;this.connecting=false;};
      ws.onmessage=event=>{
        if(!current()||this.takenOver)return;
        let data:ServerMessage;try{data=JSON.parse(event.data);}catch{return;}
        if(data.type==='snapshot') {if(!this.acceptSnapshot(data.room))return;this.receivedSnapshot();if(this.pending&&!this.ackTimer)this.transmit();}
        else if(data.type==='takenOver'){
          this.rejectConfirmation('CONNECTION_REPLACED');
          this.takenOver=true;clearTimeout(this.ackTimer);this.ackTimer=undefined;
          clearTimeout(this.syncTimer);clearTimeout(this.responseTimer);this.responseTimer=undefined;
          this.options.handlers.busy(false);this.options.handlers.status('其他页面已接管');
        }else if(data.type==='left')this.terminal('left');
        else if(data.type==='roomClosed')this.terminal('closed');
        else if(data.type==='error'){
          if(data.error==='UNAUTHENTICATED')this.terminal('expired');
          else if(data.error==='ROOM_CLOSED')this.terminal('closed');
          else this.options.handlers.error(data.error);
        }else if(data.type==='commandResult'&&this.pending?.commandId===data.commandId){
          const leaving=this.pending.type==='leaveRoom';
          const confirmation=this.confirmation;this.confirmation=null;
          clearTimeout(this.ackTimer);this.ackTimer=undefined;this.pending=null;this.options.handlers.busy(false);
          if(data.ok)confirmation?.resolve();else confirmation?.reject(new Error(data.error??'NETWORK'));
          if(!data.ok)this.options.handlers.error(data.error??'NETWORK');
          if(data.ok&&leaving)this.terminal('left');
        }else if(data.type==='playerCodeChanged'){
          this.options.handlers.playerCode?.(data.playerCode);
        }else if(data.type==='roomInvitation'){
          this.options.handlers.invitation?.(data);
        }else if(data.type==='systemAnnouncement'){
          this.options.handlers.announcement?.(data);
        }else if(data.type==='roomChat'){
          this.options.handlers.roomChat?.(data);
        }else if(data.type==='directChat'){
          this.options.handlers.directChat?.(data);
        }
      };
      ws.onclose=event=>{
        if(!current())return;
        this.socket=null;this.connecting=false;clearTimeout(this.ackTimer);this.ackTimer=undefined;
        clearTimeout(this.syncTimer);clearTimeout(this.responseTimer);this.responseTimer=undefined;
        if(event.code===4001||this.takenOver){this.rejectConfirmation('CONNECTION_REPLACED');this.takenOver=true;this.options.handlers.busy(false);this.options.handlers.status('其他页面已接管');return;}
        if(event.code===4003){this.terminal('expired');return;}
        this.options.handlers.status('已断线，正在重连');this.schedule();
      };
      ws.onerror=()=>{if(current())ws.close();};
    }catch(err){
      if(!current())return;this.connecting=false;clearTimeout(this.responseTimer);this.responseTimer=undefined;
      const code=err instanceof Error?err.message:'NETWORK';
      if(code==='UNAUTHENTICATED'){this.terminal('expired');return;}
      if(['ROOM_CLOSED','FORBIDDEN','ROOM_NOT_FOUND'].includes(code)){this.terminal('closed');return;}
      this.options.handlers.error(code);this.options.handlers.status('服务暂不可用，正在重连');this.schedule();
    }
  }
  private acceptSnapshot(room:RoomView){
    if(this.options.userId&&!room.members.some(member=>member.id===this.options.userId)){this.terminal('left');return false;}
    if(room.version>=this.lastVersion){this.lastVersion=room.version;this.options.handlers.snapshot(room);}
    return true;
  }
  send(command:Command){
    if(this.pending||this.stopped||this.takenOver||this.socket?.readyState!==1)return false;
    this.pending=command;this.options.handlers.busy(true);this.transmit();return true;
  }
  sendConfirmed(command:Command):Promise<void>{
    if(this.pending)return Promise.reject(new Error('COMMAND_PENDING'));
    if(this.stopped)return Promise.reject(new Error('CONNECTION_STOPPED'));
    if(this.takenOver)return Promise.reject(new Error('CONNECTION_REPLACED'));
    if(this.socket?.readyState!==1)return Promise.reject(new Error('NETWORK'));
    return new Promise((resolve,reject)=>{
      this.confirmation={commandId:command.commandId,resolve,reject};
      try{this.send(command);}
      catch{this.rejectConfirmation('NETWORK');this.options.handlers.busy(false);}
    });
  }
  private transmit(){
    if(!this.pending||this.socket?.readyState!==1)return;
    this.options.handlers.busy(true);this.socket.send(JSON.stringify(this.pending));
    this.ackTimer=setTimeout(()=>{
      this.ackTimer=undefined;this.options.handlers.error('ACK_PENDING');
      // A missing receipt is uncertain, not a failed action. Reconnect and replay its id.
      this.socket?.close(4000,'Receipt timeout');
    },8000);
  }
}
