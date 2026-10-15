import type { Command, RoomView, ServerMessage } from '@avalon/contracts';

export interface ConnectionHandlers {
  snapshot(room:RoomView):void;
  invite(value:string):void;
  status(value:string):void;
  error(code:string):void;
  busy(value:boolean):void;
  ended(reason:'left'|'closed'|'expired'):void;
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
  private attempt=0;
  private pending:Command|null=null;
  private lastVersion=0;
  constructor(private options:{
    fetchRoom:()=>Promise<{room:RoomView;invite:string}>;
    socket:()=>WebSocket;
    handlers:ConnectionHandlers;
    retryDelay?:number;
  }){}
  start(){void this.connect();}
  resume(){if(!this.stopped&&!this.takenOver&&(!this.socket||this.socket.readyState===3))void this.connect();}
  reconnect(){this.takenOver=false;this.stopped=false;this.invalidate();void this.connect();}
  stop(){this.stopped=true;this.invalidate();this.pending=null;this.options.handlers.busy(false);}
  private invalidate(){
    this.generation++;this.connecting=false;clearTimeout(this.retryTimer);clearTimeout(this.ackTimer);
    const old=this.socket;this.socket=null;old?.close();
  }
  private terminal(reason:'left'|'closed'|'expired') {this.stop();this.options.handlers.ended(reason);}
  private schedule(){
    clearTimeout(this.retryTimer);
    if(this.stopped||this.takenOver)return;
    this.retryTimer=setTimeout(()=>void this.connect(),this.options.retryDelay??Math.min(1000*2**this.attempt++,10000));
  }
  private async connect(){
    if(this.stopped||this.takenOver||this.connecting||this.socket?.readyState===1||this.socket?.readyState===0)return;
    clearTimeout(this.retryTimer);this.connecting=true;
    const generation=++this.generation;
    const current=()=>generation===this.generation&&!this.stopped;
    this.options.handlers.status('连接中');
    try{
      const data=await this.options.fetchRoom();if(!current())return;
      this.acceptSnapshot(data.room);this.options.handlers.invite(data.invite);
      const ws=this.options.socket();this.socket=ws;
      ws.onopen=()=>{if(!current())return;this.connecting=false;this.attempt=0;this.options.handlers.status('已连接');};
      ws.onmessage=event=>{
        if(!current())return;
        let data:ServerMessage;try{data=JSON.parse(event.data);}catch{return;}
        if(data.type==='snapshot') {this.acceptSnapshot(data.room);if(this.pending&&!this.ackTimer)this.transmit();}
        else if(data.type==='takenOver'){
          this.takenOver=true;clearTimeout(this.ackTimer);this.ackTimer=undefined;
          this.options.handlers.busy(false);this.options.handlers.status('其他页面已接管');
        }else if(data.type==='left')this.terminal('left');
        else if(data.type==='roomClosed')this.terminal('closed');
        else if(data.type==='error'){
          if(data.error==='UNAUTHENTICATED')this.terminal('expired');
          else if(data.error==='ROOM_CLOSED')this.terminal('closed');
          else this.options.handlers.error(data.error);
        }else if(data.type==='commandResult'&&this.pending?.commandId===data.commandId){
          const leaving=this.pending.type==='leaveRoom';
          clearTimeout(this.ackTimer);this.ackTimer=undefined;this.pending=null;this.options.handlers.busy(false);
          if(!data.ok)this.options.handlers.error(data.error??'NETWORK');
          if(data.ok&&leaving)this.terminal('left');
        }
      };
      ws.onclose=event=>{
        if(!current())return;
        this.socket=null;this.connecting=false;clearTimeout(this.ackTimer);this.ackTimer=undefined;
        if(event.code===4001||this.takenOver){this.takenOver=true;this.options.handlers.busy(false);this.options.handlers.status('其他页面已接管');return;}
        if(event.code===4003){this.terminal('expired');return;}
        this.options.handlers.status('已断线，正在重连');this.schedule();
      };
      ws.onerror=()=>{if(current())ws.close();};
    }catch(err){
      if(!current())return;this.connecting=false;
      const code=err instanceof Error?err.message:'NETWORK';
      if(code==='UNAUTHENTICATED'){this.terminal('expired');return;}
      if(['ROOM_CLOSED','FORBIDDEN','ROOM_NOT_FOUND'].includes(code)){this.terminal('closed');return;}
      this.options.handlers.error(code);this.options.handlers.status('服务暂不可用，正在重连');this.schedule();
    }
  }
  private acceptSnapshot(room:RoomView){if(room.version<this.lastVersion)return;this.lastVersion=room.version;this.options.handlers.snapshot(room);}
  send(command:Command){
    if(this.pending||this.stopped||this.takenOver||this.socket?.readyState!==1)return false;
    this.pending=command;this.options.handlers.busy(true);this.transmit();return true;
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
