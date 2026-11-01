export type WechatProfile={nickname:string;avatarUrl:string};
export interface ProfileRuntime {
 getSystemInfoSync():{screenWidth:number;screenHeight:number};
 requirePrivacyAuthorize?(o:{success(value:void):void;fail?(error:unknown):void}):void;
 createUserInfoButton?(options:{type:'text';text:string;style:Record<string,string|number>;withCredentials:false;lang:'zh_CN'}):{onTap(cb:(r:{userInfo?:{nickName?:string;avatarUrl?:string}})=>void):void;destroy():void};
}
export async function chooseWechatProfile(wx:ProfileRuntime):Promise<WechatProfile>{
 if(!wx.createUserInfoButton)throw Error('当前微信版本不支持微信头像授权，请使用照片上传');
 if(wx.requirePrivacyAuthorize)await new Promise<void>((resolve,reject)=>wx.requirePrivacyAuthorize!({success:resolve,fail:()=>reject(Error('已取消微信资料授权'))}));
 const screen=wx.getSystemInfoSync();
 return new Promise((resolve,reject)=>{
  const button=wx.createUserInfoButton!({type:'text',text:'点击授权微信头像与昵称',withCredentials:false,lang:'zh_CN',style:{left:20,top:screen.screenHeight/2-25,width:screen.screenWidth-40,height:50,lineHeight:50,backgroundColor:'#175e70',color:'#ffffff',fontSize:16,borderRadius:12}});
  const timer=setTimeout(()=>{button.destroy();reject(Error('微信资料授权超时，可重新选择'));},60000);
  button.onTap(r=>{clearTimeout(timer);button.destroy();const nickname=r.userInfo?.nickName?.trim(),avatarUrl=r.userInfo?.avatarUrl;
   if(!nickname||!avatarUrl||nickname==='微信用户'){reject(Error('微信未提供个人头像昵称，请使用照片上传并填写昵称'));return;}
   if(!/^https:\/\//.test(avatarUrl)){reject(Error('微信返回的头像地址无效'));return;}
   resolve({nickname,avatarUrl});
  });
 });
}

