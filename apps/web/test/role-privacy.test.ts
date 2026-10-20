import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type RoomView, type Role } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { GamePanel } from '../src/GamePanel.js';
import { IdentityCard } from '../src/RolePortrait.js';
import { roleNames } from '../src/roles.js';

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
      assert.match(card,new RegExp(`${game.roles[player.id]}(-[a-z]+)?-640.webp`));
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
  for(const role of Object.values(game.roles))assert.ok(html.includes(`${role}-160.webp`));
});
