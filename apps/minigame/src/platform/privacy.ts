import { CONTENT_SAFETY_PRIVACY_NOTICE } from '../../../web/src/content-safety-copy.js';

export interface PrivacyRuntime {
 onNeedPrivacyAuthorization?(callback:(resolve:(result:{event:'agree'|'disagree'|'exposureAuthorization'})=>void)=>void):void;
 openPrivacyContract?(options:{success():void;fail():void}):void;
 showModal?(options:{title:string;content:string;confirmText:string;cancelText:string;success(result:{confirm:boolean}):void;fail():void}):void;
}

export function installPrivacyAuthorization(wx:PrivacyRuntime){
 if(!wx.onNeedPrivacyAuthorization||!wx.showModal)return;
 wx.onNeedPrivacyAuthorization(resolve=>{
  let finished=false;
  const finish=(event:'agree'|'disagree')=>{if(!finished){finished=true;resolve({event});}};
  const consent=()=>wx.showModal!({title:'隐私保护指引',content:'请阅读隐私保护指引。麦克风用于同房实时语音，所选照片用于头像。'+CONTENT_SAFETY_PRIVACY_NOTICE+'是否同意指引并继续本次操作？',confirmText:'同意继续',cancelText:'拒绝',success:r=>finish(r.confirm?'agree':'disagree'),fail:()=>finish('disagree')});
  resolve({event:'exposureAuthorization'});
  wx.showModal!({title:'隐私保护指引',content:'使用麦克风或选择头像前，请阅读本游戏的隐私保护指引。拒绝不影响其他游戏功能。',confirmText:'查看指引',cancelText:'拒绝',success:r=>{
   if(!r.confirm){finish('disagree');return;}
   if(!wx.openPrivacyContract){finish('disagree');return;}
   wx.openPrivacyContract({success:consent,fail:()=>finish('disagree')});
  },fail:()=>finish('disagree')});
 });
}
