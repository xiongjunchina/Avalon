import type {Role,RoomView} from '@avalon/contracts';
import {ROLE_CONFIG} from '@avalon/game-core';
import {formatRoleName} from '../../../web/src/roles.js';
import type {ScreenModel} from '../ui/widgets.js';
export class RolePreferenceDraft {
  selected:Role[]=[];
  open(room:RoomView){this.selected=[...(room.selfRolePreferences??[])];this.sync(room);}
  sync(room:RoomView){this.selected=this.selected.filter(r=>(ROLE_CONFIG[room.settings.playerCount]??[]).includes(r)).slice(0,3);}
  toggle(role:Role,room:RoomView){
    if(room.phase!=='waiting'||!room.settings.rolePreferenceEnabled)throw Error('本局已开始或房主已关闭心仪选角');
    this.sync(room);if(!(ROLE_CONFIG[room.settings.playerCount]??[]).includes(role))return;
    if(this.selected.includes(role))this.selected=this.selected.filter(r=>r!==role);
    else {if(this.selected.length===3)throw Error('最多只可选择3个心仪角色，请先移除一个志愿');this.selected.push(role);}
  }
  model(room:RoomView):ScreenModel{
    this.sync(room);
    return {title:'心仪选角 · 偏好匹配',rows:[{id:'guide:preferences',text:'志愿提高机会 · 不保证命中'},...this.selected.map((r,i)=>({id:'pref:'+r,text:`第${i+1}志愿 · ${formatRoleName(r)}`})),{id:'prefClear',text:'清空志愿'},{id:'prefSave',text:'保存心仪志愿'}],web:{page:'sheet',background:'library',backId:'auxiliaryClose',document:{kind:'preferences',modal:true,settings:room.settings,preferences:[...this.selected],preferencesDisabled:room.phase!=='waiting'||!room.settings.rolePreferenceEnabled}}};
  }
}
