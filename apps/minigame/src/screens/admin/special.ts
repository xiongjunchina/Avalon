import type {WebDocument} from '../../ui/web-document.js';
import {defaultAnonymousTeamVote,defaultSettings,type DedicatedRoom,type PlayerCodeReservation,type PlayerCodeHistoryPage,type AdminUserSummary,type Settings} from '@avalon/contracts';
import type {AdminApi} from './auth.js';
import type {ScreenModel} from '../../ui/widgets.js';
import {settingsScreen,toggleSetting} from '../settings.js';
type Input=(label:string,maxLength?:number)=>Promise<string|undefined>;
export class SpecialPanel {
 private epoch=0; private rooms:DedicatedRoom[]=[];private codes:PlayerCodeReservation[]=[];private history:PlayerCodeHistoryPage={history:[],nextCursor:null};
 private draft?:{id?:string;code:string;name:string;managerCode:string;settings:Settings;password?:string|null};
 private codeEditor?:NonNullable<WebDocument['playerCodeEditor']>;private codeUnderlay?:ScreenModel;
 private editingSettings=false;private notice='';private reserveDraft={code:'',note:''};
 constructor(private api:AdminApi,private confirm:(label:string,action:()=>Promise<unknown>)=>void){}
 clear(){this.epoch++;this.codeEditor=undefined;this.codeUnderlay=undefined;this.rooms=[];this.codes=[];this.history={history:[],nextCursor:null};this.draft=undefined;this.editingSettings=false;this.notice='';this.reserveDraft={code:'',note:''};}
 async load(){const e=++this.epoch;const [r,c,h]=await Promise.all([this.api.special<{rooms:DedicatedRoom[]}>('/dedicated-rooms'),this.api.special<{codes:PlayerCodeReservation[]}>('/player-codes'),this.api.special<PlayerCodeHistoryPage>('/player-codes/history')]);if(e!==this.epoch)return;this.rooms=r.rooms;this.codes=c.codes;this.history=h;}
 data(){return {rooms:this.rooms,codes:this.codes,history:this.history,editing:!!this.draft,reserveDraft:this.reserveDraft};}
 codeEditorModel():ScreenModel|undefined {if(!this.codeEditor)return;return {title:'管理仙友码',rows:[],web:{page:'sheet',background:'gate',backId:'codeEditor:close',document:{kind:'code-editor',modal:true,playerCodeEditor:this.codeEditor},underlay:this.codeUnderlay}};}
 inputValue(id:string){if(id==='codeEditor:input')return this.codeEditor?.code??'';if(id==='special:reserveCode')return this.reserveDraft.code;if(id==='special:reserveNote')return this.reserveDraft.note;if(this.draft&&id.startsWith('special:'))return String(this.draft[id.slice(8) as 'code'|'name'|'managerCode'|'password']??'');return '';}
 model():ScreenModel{
  if(this.draft&&this.editingSettings)return { ...settingsScreen(this.draft.settings),web:{page:'sheet',background:'library',backId:'special:settingsDone',document:{kind:'settings',settings:this.draft.settings}}};
  if(this.draft)return {title:this.draft.id?'编辑专属房':'创建专属房',rows:[],web:{page:'sheet',background:'gate',backId:'special:cancel',document:{kind:'special-editor',modal:true,specialDraft:this.draft,settings:this.draft.settings},underlay:{title:'专属房与靓号',rows:[],web:{page:'sheet',activeTab:'page:special',document:{kind:'admin',adminSpecial:{...this.data(),editing:false}}}}}};
  return {title:'专属房与靓号',rows:[{id:'page:overview',text:'返回管理总览'},...(this.notice?[{id:'notice',text:this.notice}]:[]),{id:'special:new',text:'新建专属房'},...this.rooms.flatMap(r=>[{id:'stats:dedicated:'+r.id,text:`${r.code} · ${r.name} · ${r.managerName} #${r.managerCode} · ${r.settings.playerCount}人 · ${r.hasPassword?'有密码':'无密码'}`},{id:(r.activeRoomId?'special:end:':'special:edit:')+r.id,text:r.activeRoomId?'结束本次房间':'修改配置与密码'}]),{id:'special:reserve',text:'预留仙友靓号'},...this.codes.flatMap(c=>[{id:'stats:code:'+c.code,text:`${c.code} · ${c.state} · ${c.nickname??''} · ${c.note??''}`},...(c.state==='reserved'?[{id:'special:release:'+c.code,text:'解除预留 '+c.code}]:[])]),...this.history.history.map(h=>({id:'stats:allocation:'+h.id,text:`${h.oldCode} → ${h.newCode} · ${h.nickname??'账号已删除'} · ${h.retained?'保留旧号':'释放旧号'} · ${h.createdAt}`})),...(this.history.nextCursor?[{id:'special:more',text:'加载更多分配记录'}]:[])]};
 }
 async handle(id:string,input:Input){
  const e=this.epoch,valid=()=>e===this.epoch&&this.api.authorized;
  if(id==='special:new'||id.startsWith('special:edit:')){const r=this.rooms.find(r=>r.id===id.slice(13));if(r?.activeRoomId)return;this.draft={id:r?.id,code:r?.code??'',name:r?.name??'',managerCode:r?.managerCode??'',settings:{...(r?.settings??defaultSettings)}};return;}
  if(this.draft&&id.startsWith('special:setting:')){const key=id.slice(16);if(/^count:(?:[5-9]|1[0-2])$/.test(key)){const playerCount=Number(key.slice(6));this.draft.settings={...this.draft.settings,playerCount,anonymousTeamVote:defaultAnonymousTeamVote(playerCount)};}else this.draft.settings=toggleSetting(this.draft.settings,key as keyof Settings);return;}
  if(id==='special:cancel'){this.draft=undefined;return;}
  if(id==='special:settings'){this.editingSettings=true;return;}
  if(id==='special:settingsDone'||id==='apply'){this.editingSettings=false;return;}
  if(this.draft&&this.editingSettings){if(/^count:(?:[5-9]|1[0-2])$/.test(id)){const playerCount=Number(id.slice(6));this.draft.settings={...this.draft.settings,playerCount,anonymousTeamVote:defaultAnonymousTeamVote(playerCount)};return;}this.draft.settings=toggleSetting(this.draft.settings,id as keyof Settings);return;}
  if(this.draft&&['special:code','special:name','special:managerCode','special:password'].includes(id)){if(id==='special:code'&&this.draft.id)return;const k=id.slice(8) as 'code'|'name'|'managerCode'|'password';const v=await input(k==='password'?'输入4–8位密码；留空关闭':k==='name'?'专属房名称':k==='code'?'六位房号':'房主管理者仙友码',k==='name'?30:k==='password'?8:6);if(!valid()||v===undefined)return;if(k==='password')this.draft.password=v||null;else this.draft[k]=v;return;}
  if(id==='special:save'&&this.draft){const d=this.draft;const {users}=await this.api.users(d.managerCode);if(!valid())return;const manager=users.find(u=>u.playerCode===d.managerCode);if(!manager)throw Error('请填写已注册房主的仙友码');await this.api.special('/dedicated-rooms'+(d.id?'/'+d.id:''),{code:d.code,name:d.name,managerId:manager.id,settings:d.settings,...(d.password!==undefined?{password:d.password}:{})},d.id?'PUT':'POST');if(!valid())return;this.draft=undefined;await this.load();return;}
  if(id.startsWith('special:end:')){const r=this.rooms.find(r=>r.id===id.slice(12));if(r?.activeRoomId)this.confirm('结束房间 '+r.code+'？真实牌局将被中止，专属配置保留。',async()=>{await this.api.killRoom(r.activeRoomId!,true);await this.load();});return;}
  if(id==='special:reserveCode'||id==='special:reserveNote'){const key=id==='special:reserveCode'?'code':'note',value=await input(key==='code'?'六位仙友码':'备注（可留空）',key==='code'?6:80);if(valid()&&value!==undefined)this.reserveDraft[key]=value;return;}
  if(id==='special:reserve'){const {code,note}=this.reserveDraft;if(!/^[1-9]\d{5}$/.test(code))throw Error('请填写六位数字仙友码');await this.api.special('/player-codes',{code,note});if(valid()){this.reserveDraft={code:'',note:''};this.notice='号码已预留。';await this.load();}return;}
  if(id.startsWith('special:release:')){const code=id.slice(16);this.confirm('解除号码 '+code+' 的预留？',async()=>{await this.api.special('/player-codes/'+encodeURIComponent(code),undefined,'DELETE');await this.load();});return;}
  if(id==='special:more'&&this.history.nextCursor){const h=await this.api.special<PlayerCodeHistoryPage>('/player-codes/history?cursor='+encodeURIComponent(this.history.nextCursor));if(valid())this.history={history:[...this.history.history,...h.history],nextCursor:h.nextCursor};}
 }
 async editPlayerCode(user:AdminUserSummary,_input:Input,underlay?:ScreenModel){
  const epoch=this.epoch,draft:NonNullable<WebDocument['playerCodeEditor']>={user:{...user},code:user.playerCode,currentCode:user.playerCode,check:{code:user.playerCode,status:'current'},history:[],expanded:false,notice:''};this.codeEditor=draft;this.codeUnderlay=underlay;
  const result=await this.api.special<{history:typeof draft.history}>('/users/'+encodeURIComponent(user.id)+'/player-code-history');if(epoch===this.epoch&&this.codeEditor===draft)draft.history=result.history;
 }
 async handleCodeEditor(id:string,input:Input){
  const draft=this.codeEditor,epoch=this.epoch;if(!draft)return;const valid=()=>this.epoch===epoch&&this.codeEditor===draft&&this.api.authorized;
  if(id==='codeEditor:close'){this.codeEditor=undefined;this.codeUnderlay=undefined;return;}
  if(id==='codeEditor:history'){draft.expanded=!draft.expanded;return;}
  if(id==='codeEditor:input'){const value=await input('新六位仙友码',6);if(!valid()||value===undefined)return;draft.code=value.replace(/\D/g,'').slice(0,6);draft.check=undefined;draft.notice='';if(!/^[1-9]\d{5}$/.test(draft.code))return;const code=draft.code,check=await this.api.special<NonNullable<typeof draft.check>>('/player-codes/check?code='+code+'&userId='+encodeURIComponent(draft.user.id));if(valid()&&draft.code===code)draft.check=check;return;}
  if(id==='codeEditor:save'&&draft.check&&['available','reserved'].includes(draft.check.status)){
   const code=draft.code,expectedCode=draft.currentCode;
   this.confirm(`将 ${draft.user.nickname} 的仙友码从 ${expectedCode} 改为 ${code}？`,async()=>{
    if(!valid())return;const result=await this.api.special<{retained:boolean}>('/users/'+encodeURIComponent(draft.user.id)+'/player-code',{playerCode:code,expectedCode});if(!valid())return;draft.currentCode=code;draft.user.playerCode=code;draft.check={code,status:'current'};draft.notice=`已改为 ${code}，旧号${result.retained?'保留':'已释放'}。`;
    const history=await this.api.special<{history:typeof draft.history}>('/users/'+encodeURIComponent(draft.user.id)+'/player-code-history');if(valid())draft.history=history.history;
   });
  }
 }
}
