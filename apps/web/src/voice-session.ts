import type {VoiceState} from './agora-voice';
import type {VoiceTokenResponse} from '@avalon/contracts';

interface VoiceManager {
  join(config:VoiceTokenResponse):Promise<void>;
  leave():Promise<void>;
  recover(userGesture?:boolean):Promise<'ready'|'interaction'|'reconnect'>;
  getState():VoiceState;
}

/** Only an explicit join grants permission to recover voice after returning to the page. */
export class VoiceSession {
  private wanted=false;
  private roomId?:string;
  private generation=0;
  private joining:Promise<void>|null=null;
  private recovering:Promise<void>|null=null;
  constructor(private manager:VoiceManager,private token:(roomId:string)=>Promise<VoiceTokenResponse>,private error:(error:unknown)=>void){}

  start(roomId:string):Promise<void>{
    if(this.wanted&&this.roomId===roomId&&this.joining)return this.joining;
    this.wanted=true;this.roomId=roomId;
    const generation=++this.generation;
    const current=()=>this.wanted&&this.generation===generation&&this.roomId===roomId;
    const task=(async()=>{
      try{
        const config=await this.token(roomId);
        if(!current())return;
        await this.manager.join(config);
      }catch(error){if(current())this.error(error);}
    })().finally(()=>{if(this.joining===task)this.joining=null;});
    this.joining=task;
    return task;
  }

  resume(userGesture=false):Promise<void>{
    if(!this.wanted||!this.roomId)return Promise.resolve();
    if(this.joining)return this.joining;
    if(this.recovering)return this.recovering;
    const generation=this.generation,roomId=this.roomId;
    const task=(async()=>{
      try{
        const result=await this.manager.recover(userGesture);
        if(!this.wanted||generation!==this.generation||roomId!==this.roomId)return;
        if(result==='reconnect')await this.start(roomId);
      }catch(error){if(this.wanted&&generation===this.generation)this.error(error);}
    })().finally(()=>{if(this.recovering===task)this.recovering=null;});
    this.recovering=task;
    return task;
  }

  leave():Promise<void>{
    this.wanted=false;this.roomId=undefined;this.generation++;
    this.joining=null;this.recovering=null;
    return this.manager.leave();
  }
}
