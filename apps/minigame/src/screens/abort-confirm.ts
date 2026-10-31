import type {RoomView,User} from '@avalon/contracts';
import type {ScreenModel} from '../ui/widgets.js';

export function abortConfirmation(room:RoomView,user:User,underlay?:ScreenModel):ScreenModel {
  const host=room.hostId===user.id,poll=room.game?.abortPoll;
  const requester=room.game?.players.find(p=>p.id===poll?.requestedBy);
  return {title:host?'结束游戏':'申请中止游戏',rows:[
    {id:'abort-explanation',text:'结束后关闭本房间，所有玩家返回大厅；本局不计胜负。'},
    ...(poll?[{id:'abort-status',text:host?`${requester?.seat??''} 号 ${requester?.nickname??'仙友'} 申请中止，请房主处理。`:'已提出中止申请，等待房主决定。'}]:[]),
    ...(host?[{id:'confirm:no',text:'继续游戏'},{id:'confirm:yes',text:poll?'同意结束':'结束游戏并关闭房间'}]:poll?[]:[{id:'confirm:yes',text:'向房主申请中止'}]),
  ],web:{page:'sheet',background:'sword',backId:'confirm:back',underlay,document:{kind:'abort-confirm',modal:true}}};
}
