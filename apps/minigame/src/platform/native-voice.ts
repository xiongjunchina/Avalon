type Callbacks<T = void> = { success(value: T): void; fail?(error: unknown): void };
export type VoiceTicket = { groupId: string; nonceStr: string; timeStamp: number; signature: string };
export interface NativeVoiceRuntime {
  requirePrivacyAuthorize?(options: Callbacks): void;
  authorize?(options: Callbacks & { scope: 'scope.record' }): void;
  joinVoIPChat?(options: Callbacks<{openIdList?:string[]}> & VoiceTicket & { roomType:'voice';muteConfig:{muteMicrophone:boolean;muteEarphone:boolean} }): void;
  exitVoIPChat?(options: Callbacks): void;
  updateVoIPChatMuteConfig?(options: Callbacks & {muteMicrophone:boolean;muteEarphone:boolean}): void;
  onVoIPChatMembersChanged?(callback:(event:{openIdList:string[]})=>void):void;
  onVoIPChatSpeakersChanged?(callback:(event:{openIdList:string[]})=>void):void;
  onVoIPChatInterrupted?(callback:()=>void):void;
}

function invoke<T>(call:(callbacks:Callbacks<T>)=>void):Promise<T> {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('语音操作超时，请重试')),15_000);
    try { call({success:value=>{clearTimeout(timer);resolve(value);},fail:()=>{clearTimeout(timer);reject(Error('微信语音调用失败：请确认已开通实时语音能力、允许麦克风，且未占用其他通话'));}}); }
    catch { clearTimeout(timer);reject(Error('微信语音接口不可用，请使用已开通权限的手机微信')); }
  });
}

export class NativeVoice {
  joined=false;
  microphoneMuted=true;
  speakerMuted=false;
  members=0;
  speakers=0;
  message='未加入微信语音';
  private roomId?:string;
  private count=0;
  private epoch=0;
  private busy=false;
  private nativeOutstanding=false;
  private cleanupFailed=false;
  private exiting?:Promise<void>;
  constructor(private wx:NativeVoiceRuntime,private ticket:(roomId:string)=>Promise<VoiceTicket>,private changed:()=>void){
    wx.onVoIPChatMembersChanged?.(event=>{if(this.joined){this.members=event.openIdList.length;changed();}});
    wx.onVoIPChatSpeakersChanged?.(event=>{if(this.joined){this.speakers=event.openIdList.length;changed();}});
    wx.onVoIPChatInterrupted?.(()=>{this.epoch++;this.reset();this.message='语音已中断，请手动重新加入';changed();});
  }
  syncRoom(id:string|undefined,count:number){
    if(id!==this.roomId || count>10&&this.count<=10)void this.leave();
    this.roomId=id;this.count=count;
  }
  private reset(){this.joined=false;this.microphoneMuted=true;this.speakerMuted=false;this.members=0;this.speakers=0;}
  async join(){
    if(this.busy||this.joined)return;
    if(this.nativeOutstanding||this.cleanupFailed)throw Error('上次语音操作尚未确认结束，请关闭小游戏后重新进入');
    if(!this.roomId)throw Error('请先加入真实游戏房间');
    if(this.count>10)throw Error('微信原生语音每房最多10人，11～12人牌局不提供原生语音');
    if(!this.wx.joinVoIPChat||!this.wx.authorize)throw Error('当前环境不支持微信原生语音，请用手机微信测试');
    this.busy=true;const epoch=++this.epoch,roomId=this.roomId;
    this.message='正在加入微信语音';this.changed();
    try{
      await this.exiting;
      if(this.wx.requirePrivacyAuthorize)await invoke<void>(cb=>this.wx.requirePrivacyAuthorize!(cb));
      if(epoch!==this.epoch)return;
      await invoke<void>(cb=>this.wx.authorize!({...cb,scope:'scope.record'}));
      if(epoch!==this.epoch)return;
      const ticket=await this.ticket(roomId);
      if(epoch!==this.epoch)return;
      this.nativeOutstanding=true;
      const result=await invoke<{openIdList?:string[]}>(cb=>this.wx.joinVoIPChat!({...ticket,...cb,roomType:'voice',muteConfig:{muteMicrophone:true,muteEarphone:false},success:value=>{
        if(epoch!==this.epoch){
          this.exiting=invoke<void>(exit=>this.wx.exitVoIPChat?this.wx.exitVoIPChat(exit):exit.success())
            .catch(()=>{this.cleanupFailed=true;this.message='语音退出未确认，请关闭小游戏检查麦克风';})
            .finally(()=>{this.nativeOutstanding=false;this.exiting=undefined;this.changed();});
        }else this.nativeOutstanding=false;
        cb.success(value);
      },fail:error=>{this.nativeOutstanding=false;cb.fail?.(error);}}));
      if(epoch!==this.epoch)return;
      this.joined=true;this.members=result.openIdList?.length??1;this.microphoneMuted=true;this.message='已加入微信语音（默认闭麦）';
    }catch(error){if(epoch===this.epoch){await this.leave();this.message=error instanceof Error?error.message:'语音加入失败';throw error;}}
    finally{this.busy=false;this.changed();}
  }
  async toggleMicrophone(){await this.mute(!this.microphoneMuted,this.speakerMuted);}
  async toggleSpeaker(){await this.mute(this.microphoneMuted,!this.speakerMuted);}
  private async mute(microphone:boolean,speaker:boolean){
    if(!this.joined||!this.wx.updateVoIPChatMuteConfig)throw Error('请先加入微信语音');
    if(this.nativeOutstanding)throw Error('语音操作进行中，请稍候');
    const epoch=this.epoch;
    this.nativeOutstanding=true;
    try {
      await invoke<void>(cb=>this.wx.updateVoIPChatMuteConfig!({...cb,muteMicrophone:microphone,muteEarphone:speaker,
        success:()=>{
          if(epoch!==this.epoch)void this.leave().finally(()=>{this.nativeOutstanding=false;});
          else this.nativeOutstanding=false;
          cb.success();
        },
        fail:error=>{this.nativeOutstanding=false;cb.fail?.(error);},
      }));
    }catch(error){await this.leave();throw error;}
    if(epoch!==this.epoch)return;
    this.microphoneMuted=microphone;this.speakerMuted=speaker;this.changed();
  }
  async leave(){
    const active=this.joined||this.busy||this.nativeOutstanding||this.cleanupFailed;this.epoch++;this.reset();this.message='未加入微信语音';
    if(active&&!this.exiting){
      this.exiting=invoke<void>(cb=>this.wx.exitVoIPChat?this.wx.exitVoIPChat(cb):cb.success()).then(()=>{this.cleanupFailed=false;}).catch(()=>{this.cleanupFailed=true;this.message='语音退出未确认，请关闭小游戏检查麦克风';}).finally(()=>{this.exiting=undefined;this.changed();});
    }
    await this.exiting;
  }
  rows(){return [
    {id:'guide:voice',text:this.cleanupFailed?this.message:!this.roomId?'入房后可加入微信原生语音':this.count>10?'本房为'+this.count+'人局；微信原生语音最多10人，暂不可用':this.message},
    {id:'guide:voice-scope',text:'仅同房小游戏玩家互通；网页声网语音独立。'},
    ...(this.cleanupFailed?[{id:'voice:leave',text:'重试退出语音；仍失败请关闭小游戏'}]:this.roomId&&this.count<=10?(this.joined?[
      {id:'guide:voice-members',text:`语音成员 ${this.members} 人 · 正在说话 ${this.speakers} 人`},
      {id:'voice:microphone',text:this.microphoneMuted?'开启麦克风':'关闭麦克风'},
      {id:'voice:speaker',text:this.speakerMuted?'恢复收听':'暂停收听'},
      {id:'voice:leave',text:'退出微信语音'},
    ]:[{id:'voice:join',text:this.busy?'正在连接…':'加入微信语音（默认闭麦）'}]):[]),
  ];}
}
