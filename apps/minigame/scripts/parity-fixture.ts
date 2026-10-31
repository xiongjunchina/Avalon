import { defaultSettings, type Role } from '@avalon/contracts';
import { createGame, projectGame, MISSION_SIZES } from '@avalon/game-core';

// Deterministic, local-only fixture shared by both screenshot renderers.
export function parityFixture(scene = 'game',playerCount=6) {
  const publicReport=scene==='report-public';if(publicReport)scene='report';
  let user = { id: '11111111-1111-4111-8111-111111111111', nickname: '行者', playerCode: '123456', avatar: 'leaf' as const };
  const members = Array.from({ length: playerCount }, (_, index) => ({ id: index ? '00000000-0000-4000-8000-' + String(index).padStart(12, '0') : user.id, nickname: index ? '仙友' + index : user.nickname, seat: index + 1, ready: true, online: true, ...(index ? {} : { avatar: 'leaf' as const }) }));
  const settings={...defaultSettings,playerCount,...(scene==='preferences'?{rolePreferenceEnabled:true}:{}),...(scene.startsWith('treasures-')?{treasuresEnabled:true,guardianPerksEnabled:false}:{})};
  const game = createGame('11111111-2222-4333-8444-555555555555', members, settings, values => [...values], { randomBelow: () => 0n });
  game.phase = 'proposing'; game.confirmed = members.map(member => member.id);
  game.captainIndex = 0;
  if(scene.startsWith('treasures-')){const role=scene.split('-')[1] as Role,viewer=members.find(m=>game.roles[m.id]===role);if(!viewer)throw Error('Fixture role unavailable: '+role);user={id:viewer.id,nickname:viewer.nickname,playerCode:'123456',avatar:'leaf'};game.mission=3;}
  if(scene.startsWith('notice-')||scene.startsWith('mirror-window')){const role=scene==='mirror-window'?'guinevere':scene==='mirror-window-observer'?'loyal':scene==='notice-mirror'?'guinevere':scene==='notice-bell'?'minion':'percival',viewer=members.find(m=>game.roles[m.id]===role);if(!viewer)throw Error('Notice fixture requires role '+role);user={id:viewer.id,nickname:viewer.nickname,playerCode:'123456',avatar:'leaf'};}
  if (['vote','vote-submitted','mission','mission-submitted','report','result'].includes(scene)) {
    game.rounds = [{number:1,mission:1,captainId:user.id,team:members.slice(0,MISSION_SIZES[playerCount]![0]).map(p=>p.id),direction:'clockwise'}];
    if(scene.startsWith('vote')) {game.phase='team_vote';game.teamVoteStartedAt='2026-10-22T00:00:00Z';game.teamVotes={};if(scene==='vote-submitted')game.teamVotes[user.id]=true;}
    else {game.phase='mission';game.rounds[0]!.vote={approvals:playerCount-2,rejections:1,abstentions:1,passed:true};if(scene==='mission-submitted')game.missionVotes[user.id]=true;}
    if(scene==='report'||scene==='result') {game.rounds[0]!.result={successes:MISSION_SIZES[playerCount]![0],failures:0,passed:true};game.phase='proposing';game.mission=2;}
    if(scene==='result') {game.phase='finished';game.result={winner:'blue',reason:'merlin_survived'};}
  }
  if(scene.startsWith('treasures-')&&scene.endsWith('-available')){
    game.rounds=[1,2].map(mission=>({number:mission,mission,captainId:members[0]!.id,team:members.slice(0,MISSION_SIZES[playerCount]![mission-1]).map(p=>p.id),direction:'clockwise' as const,vote:{approvals:playerCount,rejections:0,abstentions:0,passed:true},result:{successes:MISSION_SIZES[playerCount]![mission-1]!-1,failures:1,passed:false}}));
  }
  const room = { id: '22222222-2222-4222-8222-222222222222', code: '123456', version: 1, hostId: user.id, settings, acceptingNewMembers: true, members, phase: 'playing' as const, serverTime: '2026-10-22T00:00:00Z', game: projectGame(game, user.id) };
  if(scene.endsWith('-used')&&room.game.self?.treasures){const t=room.game.self.treasures,targetId=members[1]!.id;
    if(t.tinStaff)t.tinStaff={used:true,available:false,result:{targetId,team:'blue'}};
    if(t.guanyinMirror)t.guanyinMirror={used:true,available:false,result:{targetId,alignment:'evil'}};
    if(t.humanBag)t.humanBag={used:true,available:false,targetId};
    if(t.jinguSeal)t.jinguSeal={used:true,available:false};
    if(t.bananaFan)t.bananaFan={used:true,available:false,armed:false};
  }
  if(scene.startsWith('notice-')){room.settings.treasuresEnabled=true;room.game.self!.treasures={enabled:true,...(scene==='notice-mirror'?{guanyinMirror:{used:true,available:false,result:{targetId:members[1]!.id,alignment:'pure' as const}}}:scene==='notice-bell'?{incomingHeartBell:{mission:1,roundNumber:1,advice:'protect' as const,active:true}}:{jinguAllyId:members.find(m=>game.roles[m.id]==='loyal')!.id})};}
  if(scene.startsWith('mirror-window')){room.settings.treasuresEnabled=true;room.game.phase='guanyin_window';room.serverTime=new Date(10000).toISOString();room.game.guanyinEndsAt=new Date(15000).toISOString();room.game.rounds=[{number:1,mission:1,captainId:members[0]!.id,team:members.slice(0,4).map(m=>m.id),direction:'clockwise'}];if(scene==='mirror-window')room.game.self!.treasures={enabled:true,guanyinMirror:{used:false,available:true}};}
  if(publicReport){room.settings.anonymousTeamVote=false;room.game.rounds[0]!.vote!.ballots=Object.fromEntries(members.map((m,i)=>[m.id,i<playerCount-2?true:i===playerCount-2?false:'abstain']));}
  return { user, room };
}

export function parityPlayerData() {
  const {user,room}=parityFixture('result');
  const empty={completed:0,wins:0,losses:0,aborted:0,winRate:null};
  const stats={completed:12,wins:8,losses:4,aborted:1,winRate:2/3,byRole:Object.fromEntries(['merlin','percival','guinevere','loyal','morgana','assassin','mordred','oberon','minion'].map(role=>[role,{...empty}])),byTeam:{blue:{completed:8,wins:6,losses:2,aborted:1,winRate:.75},red:{completed:4,wins:2,losses:2,aborted:0,winRate:.5}}};
  const summary={id:room.game.id,startedAt:'2026-10-22T00:00:00Z',endedAt:'2026-10-22T00:25:00Z',rulesetVersion:'v1',playerCount:6,self:{nickname:user.nickname,seat:1,role:room.game.self!.role,team:room.game.self!.team},result:room.game.result!,favorite:true};
  const replay={...summary,settings:room.settings,players:room.game.players,roles:room.game.revealedRoles!,rounds:room.game.rounds,inspections:[],earlyWindows:[]};
  const friends=[{id:room.members[1]!.id,nickname:'仙友1',playerCode:'654321',avatar:'moon',online:true,status:'accepted',isSender:false},{id:room.members[2]!.id,nickname:'仙友2',playerCode:'654322',avatar:'sun',online:false,status:'pending',isSender:false}];
  const presets=[{id:'preset-1',name:'六人常规局',settings:room.settings,updatedAt:'2026-10-22T00:00:00Z'}];
  return {stats,summary,replay,friends,presets};
}

export function parityAdminData(){
 const {user,room}=parityFixture('result'),createdAt='2026-10-22T00:00:00Z';
 return {users:[{...user,isBanned:false,isVip:false,gamesCount:12,friendsCount:3,createdAt},{...user,id:'fixture-user-2',nickname:'很长的测试仙友尊号',playerCode:'654321',isBanned:true,isVip:true,gamesCount:0,friendsCount:1,createdAt}],rooms:[{id:room.id,code:room.code,hostId:user.id,hostNickname:user.nickname,phase:'playing',memberCount:6,playerCount:6,voiceChatEnabled:false,createdAt}],games:[{id:room.game.id,roomId:room.id,roomCode:room.code,playerCount:6,winner:'blue',reason:'merlin_survived',createdAt,endedAt:'2026-10-22T00:25:00Z'}],dedicated:[{id:'dedicated-1',code:'888888',name:'取经朋友局',managerId:user.id,managerName:user.nickname,managerCode:user.playerCode,settings:room.settings,hasPassword:true,activeRoomId:room.id,activePhase:'finished' as const}],reservations:[{code:'666666',state:'reserved' as const,note:'朋友专属号'},{code:'888888',state:'assigned' as const,nickname:user.nickname,note:'测试分配',oldCode:'123456',assignedAt:createdAt}],allocations:[{id:'allocation-1',userId:user.id,nickname:user.nickname,oldCode:'123456',newCode:'888888',retained:true,note:'测试分配',createdAt}],codes:[{code:'TESTONLY',days:30,note:'仅本地渲染测试，不可兑换',createdAt}]};
}
