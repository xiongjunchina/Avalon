import { randomUUID } from 'node:crypto';
import type { Command, Settings } from '@avalon/contracts';
import { service } from './helpers.js';
import { DEAL_MS } from '../src/store.js';
export async function gameFixture(t:{after:(fn:()=>Promise<void>)=>void}, start=true, settings:Partial<Settings>={}) {
  const f=await service(t), people=await Promise.all(Array.from({length:settings.playerCount??5},(_,i)=>f.store.createGuest(`玩家${i+1}`)));
  let room=await f.store.createRoom(people[0].user);
  const state=async(userId?:string)=>(await f.store.snapshot(room.id,userId))!;
  const command=async(id:string,type:Command['type'],payload:Command['payload']={})=>{
    const action={commandId:randomUUID(),expectedVersion:(await state()).version,type,payload} as Command;
    await f.store.execute(id,room.id,action);return action;
  };
  await command(people[0].user.id,'updateSettings',{...room.settings,playerCount:5,...settings});
  for(const p of people.slice(1))await f.store.join(p.user,room.code);
  for(const p of people){await f.store.connect(p.user.id,room.id,randomUUID());await command(p.user.id,'setReady',{ready:true});}
  const finishDeal=async()=>{f.advance(DEAL_MS);await f.store.releaseDeal(room.id);};
  if(start){await command(people[0].user.id,'startGame');await finishDeal();}
  return {...f,get app(){return f.app;},people,room,command,state,finishDeal};
}
export async function confirm(f:Awaited<ReturnType<typeof gameFixture>>) {for(const p of f.people)await f.command(p.user.id,'confirmRole');}
export async function propose(f:Awaited<ReturnType<typeof gameFixture>>) {
  const g=(await f.state()).game!,team=g.players.slice(0,g.missionSizes[g.mission-1]).map(p=>p.id);
  await f.command(g.captainId,'proposeTeam',{playerIds:team,direction:'counterclockwise'});
  await f.command(g.captainId,'startTeamVote');return team;
}
export async function mission(f:Awaited<ReturnType<typeof gameFixture>>) {
  const team=await propose(f);
  for(const p of f.people)await f.command(p.user.id,'teamVote',{approve:true});
  for(const id of team)await f.command(id,'missionVote',{success:true});
}
