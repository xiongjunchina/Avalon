/** Room-local public chat bubbles; same 3800ms lifetime as the web client. */
export class RoomBubbles {
 private roomId?:string;
 private values=new Map<string,{text:string;expiresAt:number}>();
 sync(roomId?:string){if(this.roomId!==roomId){this.roomId=roomId;this.values.clear();}}
 clear(){this.values.clear();}
 receive(userId:string,text:string,now=Date.now()){if(this.roomId)this.values.set(userId,{text,expiresAt:now+3800});}
 snapshot(now=Date.now()){const result:Record<string,string>={};for(const [id,value] of this.values){if(value.expiresAt<=now)this.values.delete(id);else result[id]=value.text;}return result;}
}
