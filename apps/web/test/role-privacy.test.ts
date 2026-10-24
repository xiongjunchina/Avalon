import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type RoomView, type Role } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { GamePanel } from '../src/GamePanel.js';
import { IdentityCard } from '../src/RolePortrait.js';
import { defaultRoleArtPrefix, getRoleGalleryItem, roleNames } from '../src/roles.js';

test('closed identities never mount or preload character images, for every supported role',()=>{
  const seen=new Set<Role>();
  for(let count=5;count<=12;count++) {
    const players=Array.from({length:count},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`朋友${i+1}`}));
    const game=createGame(randomUUID(),players,{...defaultSettings,playerCount:count},a=>a);
    for(const player of players) {
      seen.add(game.roles[player.id]);
      const room:RoomView={id:randomUUID(),code:'PRIVATE',hostId:players[0].id,version:1,phase:'playing',settings:game.settings,acceptingNewMembers:true,
        members:players.map(p=>({...p,ready:true,online:true})),game:projectGame(game,player.id)};
      const html=renderToStaticMarkup(createElement(GamePanel,{room,userId:player.id,disabled:false,connected:true,send:()=>{}}));
      assert.doesNotMatch(html,/\/art\/roles\/|角色图案|identity-card|portrait-card/);
      assert.match(html,/私下查看我的身份/);
      const card=renderToStaticMarkup(createElement(IdentityCard,{role:game.roles[player.id]}));
      assert.match(card,new RegExp(`${defaultRoleArtPrefix(game.roles[player.id])}(-[a-z]+)?-640.webp`));
      assert.ok(card.includes(roleNames[game.roles[player.id]]));
    }
  }
  assert.equal(seen.size,9);
});

test('ended game portraits match the server-revealed roles, including after an interruption',()=>{
  const players=Array.from({length:5},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`朋友${i+1}`}));
  const game=createGame(randomUUID(),players,{...defaultSettings,playerCount:5},a=>a);
  game.phase='aborted';game.result={winner:null,reason:'unanimous_abort'};
  const room:RoomView={id:randomUUID(),code:'ENDED',hostId:players[0].id,version:1,phase:'finished',settings:game.settings,acceptingNewMembers:true,
    members:players.map(p=>({...p,ready:true,online:false})),game:projectGame(game,players[0].id)};
  const html=renderToStaticMarkup(createElement(GamePanel,{room,userId:players[0].id,disabled:true,connected:false,send:()=>{}}));
  assert.equal((html.match(/portrait-mini/g)??[]).length,players.length);
  assert.doesNotMatch(html,/portrait-card/);
  for(const player of players) {
    const self=projectGame(game,player.id).self!;
    assert.ok(html.includes(`${getRoleGalleryItem(self.role,self.loyalGuardian,self.femaleDemon).artPrefix}-160.webp`));
  }
});

test('legacy settlement and replay keep their original guardian portrait',async()=>{
  const {ReplayView}=await import('../src/AccountPanel.js');
  const players=Array.from({length:5},(_,i)=>({id:`p${i}`,seat:i+1,nickname:`仙友${i}`}));
  const game=createGame('legacy-guardian',players,{...defaultSettings,playerCount:5},a=>a);
  game.rulesetVersion='standard-no-lancelot-v3';game.phase='aborted';game.result={winner:null,reason:'unanimous_abort'};
  const room:RoomView={id:'legacy-room',code:'OLD',hostId:'p0',version:1,phase:'finished',settings:game.settings,acceptingNewMembers:true,
    members:players.map(p=>({...p,ready:true,online:false})),game:projectGame(game,'p0')};
  const settlement=renderToStaticMarkup(createElement(GamePanel,{room,userId:'p0',disabled:true,connected:false,send:()=>{}}));
  const replay=renderToStaticMarkup(createElement(ReplayView,{replay:{...game,startedAt:'2026-10-23T10:00:00Z',endedAt:'2026-10-23T11:00:00Z',playerCount:5,
    self:{nickname:'仙友0',seat:1,role:'merlin',team:'blue'},favorite:false,inspections:[],earlyWindows:[],result:game.result}}));
  for(const html of [settlement,replay]){
    assert.match(html,/zhubajie-loyal-160.webp/);
    assert.doesNotMatch(html,/bailong-loyal-160.webp/);
  }
});
