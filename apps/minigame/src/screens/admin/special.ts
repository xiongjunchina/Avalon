import {defaultAnonymousTeamVote,defaultSettings,type DedicatedRoom,type PlayerCodeReservation,type PlayerCodeHistoryPage,type AdminUserSummary,type Settings} from '@avalon/contracts';
import type {AdminApi} from './auth.js';
import type {ScreenModel} from '../../ui/widgets.js';
import {settingsScreen,toggleSetting} from '../settings.js';
type Input=(label:string,maxLength?:number)=>Promise<string|undefined>;
export class SpecialPanel {
 private epoch=0; private rooms:DedicatedRoom[]=[];private codes:PlayerCodeReservation[]=[];private history:PlayerCodeHistoryPage={history:[],nextCursor:null};
 private draft?:{id?:string;code:string;name:string;managerCode:string;settings:Settings;password?:string|null};
 private editingSettings=false;private notice='';
 constructor(private api:AdminApi,private confirm:(label:string,action:()=>Promise<unknown>)=>void){}
 clear(){this.epoch++;this.rooms=[];this.codes=[];this.history={history:[],nextCursor:null};this.draft=undefined;this.editingSettings=false;this.notice='';}
 async load(){const e=++this.epoch;const [r,c,h]=await Promise.all([this.api.special<{rooms:DedicatedRoom[]}>('/dedicated-rooms'),this.api.special<{codes:PlayerCodeReservation[]}>('/player-codes'),this.api.special<PlayerCodeHistoryPage>('/player-codes/history')]);if(e!==this.epoch)return;this.rooms=r.rooms;this.codes=c.codes;this.history=h;}
 model():ScreenModel{
  if(this.draft&&this.editingSettings)return { ...settingsScreen(this.draft.settings),web:{page:'sheet',background:'library',backId:'special:settingsDone',document:{kind:'settings',settings:this.draft.settings}}};
  if(this.draft)return {title:'专属房配置',rows:[{id:'special:code',text:'房号：'+this.draft.code},{id:'special:name',text:'名称：'+this.draft.name},{id:'special:managerCode',text:'房主仙友码：'+this.draft.managerCode},{id:'special:settings',text:'玩法配置：'+this.draft.settings.playerCount+'人'},{id:'special:password',text:'密码：'+(this.draft.password===undefined?'保持原设置':this.draft.password===null?'不设置':'已设置')},{id:'special:save',text:'保存配置'},{id:'special:cancel',text:'取消'}]};
  return {title:'专属房与靓号',rows:[{id:'page:overview',text:'返回管理总览'},...(this.notice?[{id:'notice',text:this.notice}]:[]),{id:'special:new',text:'新建专属房'},...this.rooms.flatMap(r=>[{id:'stats:dedicated:'+r.id,text:`${r.code} · ${r.name} · ${r.managerName} #${r.managerCode} · ${r.settings.playerCount}人 · ${r.hasPassword?'有密码':'无密码'}`},{id:(r.activeRoomId?'special:end:':'special:edit:')+r.id,text:r.activeRoomId?'结束本次房间':'修改配置与密码'}]),{id:'special:reserve',text:'预留仙友靓号'},...this.codes.flatMap(c=>[{id:'stats:code:'+c.code,text:`${c.code} · ${c.state} · ${c.nickname??''} · ${c.note??''}`},...(c.state==='reserved'?[{id:'special:release:'+c.code,text:'解除预留 '+c.code}]:[])]),...this.history.history.map(h=>({id:'stats:allocation:'+h.id,text:`${h.oldCode} → ${h.newCode} · ${h.nickname??'账号已删除'} · ${h.retained?'保留旧号':'释放旧号'} · ${h.createdAt}`})),...(this.history.nextCursor?[{id:'special:more',text:'加载更多分配记录'}]:[])]};
 }
 async handle(id:string,input:Input){
  const e=this.epoch,valid=()=>e===this.epoch&&this.api.authorized;
  if(id==='special:new'||id.startsWith('special:edit:')){const r=this.rooms.find(r=>r.id===id.slice(13));if(r?.activeRoomId)return;this.draft={id:r?.id,code:r?.code??'',name:r?.name??'',managerCode:r?.managerCode??'',settings:{...(r?.settings??defaultSettings)}};return;}
  if(id==='special:cancel'){this.draft=undefined;return;}
  if(id==='special:settings'){this.editingSettings=true;return;}
  if(id==='special:settingsDone'||id==='apply'){this.editingSettings=false;return;}
  if(this.draft&&this.editingSettings){if(/^count:(?:[5-9]|1[0-2])$/.test(id)){const playerCount=Number(id.slice(6));this.draft.settings={...this.draft.settings,playerCount,anonymousTeamVote:defaultAnonymousTeamVote(playerCount)};return;}this.draft.settings=toggleSetting(this.draft.settings,id as keyof Settings);return;}
  if(this.draft&&['special:code','special:name','special:managerCode','special:password'].includes(id)){const k=id.slice(8) as 'code'|'name'|'managerCode'|'password';const v=await input(k==='password'?'输入4–8位密码；留空关闭':k==='name'?'专属房名称':k==='code'?'六位房号':'房主管理者仙友码',k==='name'?40:k==='password'?8:6);if(!valid()||v===undefined)return;if(k==='password')this.draft.password=v||null;else this.draft[k]=v;return;}
  if(id==='special:save'&&this.draft){const d=this.draft;const {users}=await this.api.users(d.managerCode);if(!valid())return;const manager=users.find(u=>u.playerCode===d.managerCode);if(!manager)throw Error('请填写已注册房主的仙友码');await this.api.special('/dedicated-rooms'+(d.id?'/'+d.id:''),{code:d.code,name:d.name,managerId:manager.id,settings:d.settings,...(d.password!==undefined?{password:d.password}:{})},d.id?'PUT':'POST');if(!valid())return;this.draft=undefined;await this.load();return;}
  if(id.startsWith('special:end:')){const r=this.rooms.find(r=>r.id===id.slice(12));if(r?.activeRoomId)this.confirm('结束房间 '+r.code+'？真实牌局将被中止，专属配置保留。',async()=>{await this.api.killRoom(r.activeRoomId!,true);await this.load();});return;}
  if(id==='special:reserve'){const code=await input('六位仙友码',6);if(!valid()||code===undefined)return;const note=await input('备注（可留空）',80);if(!valid()||note===undefined)return;await this.api.special('/player-codes',{code,note});if(valid())await this.load();return;}
  if(id.startsWith('special:release:')){const code=id.slice(16);this.confirm('解除号码 '+code+' 的预留？',async()=>{await this.api.special('/player-codes/'+encodeURIComponent(code),undefined,'DELETE');await this.load();});return;}
  if(id==='special:more'&&this.history.nextCursor){const h=await this.api.special<PlayerCodeHistoryPage>('/player-codes/history?cursor='+encodeURIComponent(this.history.nextCursor));if(valid())this.history={history:[...this.history.history,...h.history],nextCursor:h.nextCursor};}
 }
 async editPlayerCode(user:AdminUserSummary,input:Input){const e=this.epoch;const code=await input('新六位仙友码；当前 '+user.playerCode,6);if(e!==this.epoch||code===undefined)return;const check=await this.api.special<{status:string}>('/player-codes/check?code='+encodeURIComponent(code)+'&userId='+encodeURIComponent(user.id));if(e!==this.epoch)return;if(!['available','reserved'].includes(check.status))throw Error('号码不可分配：'+check.status);this.confirm(`将 ${user.nickname} 的仙友码从 ${user.playerCode} 改为 ${code}？`,()=>this.api.special('/users/'+encodeURIComponent(user.id)+'/player-code',{playerCode:code,expectedCode:user.playerCode}));}
}
