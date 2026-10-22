import { defaultSettings } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';

// Deterministic, local-only fixture shared by both screenshot renderers.
export function parityFixture(scene = 'game') {
  const user = { id: '11111111-1111-4111-8111-111111111111', nickname: '行者', playerCode: '123456', avatar: 'leaf' as const };
  const members = Array.from({ length: 6 }, (_, index) => ({ id: index ? '00000000-0000-4000-8000-' + String(index).padStart(12, '0') : user.id, nickname: index ? '仙友' + index : user.nickname, seat: index + 1, ready: true, online: true, ...(index ? {} : { avatar: 'leaf' as const }) }));
  const game = createGame('11111111-2222-4333-8444-555555555555', members, defaultSettings, values => [...values]);
  game.phase = 'proposing'; game.confirmed = members.map(member => member.id);
  game.captainIndex = 0;
  if (['vote','vote-submitted','mission','mission-submitted','report','result'].includes(scene)) {
    game.rounds = [{number:1,mission:1,captainId:user.id,team:members.slice(0,2).map(p=>p.id),direction:'clockwise'}];
    if(scene.startsWith('vote')) {game.phase='team_vote';game.teamVoteStartedAt='2026-10-22T00:00:00Z';game.teamVotes={};if(scene==='vote-submitted')game.teamVotes[user.id]=true;}
    else {game.phase='mission';game.rounds[0]!.vote={approvals:4,rejections:1,abstentions:1,passed:true};if(scene==='mission-submitted')game.missionVotes[user.id]=true;}
    if(scene==='report'||scene==='result') {game.rounds[0]!.result={successes:2,failures:0,passed:true};game.phase='proposing';game.mission=2;}
    if(scene==='result') {game.phase='finished';game.result={winner:'blue',reason:'merlin_survived'};}
  }
  const room = { id: '22222222-2222-4222-8222-222222222222', code: '123456', version: 1, hostId: user.id, settings: defaultSettings, acceptingNewMembers: true, members, phase: 'playing' as const, serverTime: '2026-10-22T00:00:00Z', game: projectGame(game, user.id) };
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
