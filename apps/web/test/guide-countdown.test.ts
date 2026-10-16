import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type RoomView } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { GuideRules, GuideRoles, roleDescriptions } from '../src/GuidePanel.js';
import { remainingSeconds, DealCountdown } from '../src/DealCountdown.js';
import { GamePanel } from '../src/GamePanel.js';

test('guide covers all retained roles, asymmetric vision and standard/extension rules without removed roles',()=>{
  const roles=renderToStaticMarkup(createElement(GuideRoles)),rules=renderToStaticMarkup(createElement(GuideRules));
  assert.equal(Object.keys(roleDescriptions).length,9);assert.equal((roles.match(/角色图案/g)??[]).length,9);
  assert.doesNotMatch(roles+rules,/兰斯洛特|兰斯特洛|Lancelot|连续两局|保底/i);
  assert.match(roleDescriptions.merlin.ability,/除莫德雷德/);assert.match(roleDescriptions.oberon.ability,/红方队友也看不见你/);
  assert.match(roleDescriptions.percival.ability,/不知道谁对应哪个身份/);
  assert.match(roleDescriptions.guinevere.ability,/莫德雷德/);
  for(const text of ['倒计时5秒','严格超过半数','平票不通过','两张失败牌','湖中女神','提前刺杀','匿名','全局累计'])assert.ok(rules.includes(text),text);
  for(let n=5;n<=12;n++)assert.ok(rules.includes(`${n}人局各任务人数`));
});

test('countdown uses server time and elapsed monotonic duration, and never shows a role or early confirmation',()=>{
  assert.deepEqual([0,999,1000,4999,5000,9000].map(ms=>remainingSeconds(5000,ms)),[5,5,4,1,0,0]);
  assert.equal(remainingSeconds(2200,1200),1);assert.equal(remainingSeconds(-60000,0),0);
  const players=Array.from({length:5},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`倒计时${i+1}`}));
  const game=createGame(randomUUID(),players,{...defaultSettings,playerCount:5},a=>a);game.phase='dealing';game.dealEndsAt='2026-09-30T08:00:05Z';
  const room:RoomView={id:randomUUID(),code:'DEAL',hostId:players[0].id,version:1,serverTime:'2026-09-30T08:00:00Z',phase:'playing',settings:game.settings,acceptingNewMembers:true,members:players.map(p=>({...p,online:true,ready:true})),game:projectGame(game,players[0].id)};
  const html=renderToStaticMarkup(createElement(GamePanel,{room,userId:players[0].id,disabled:false,connected:true,send:()=>{}}));
  assert.match(html,/5 秒后揭晓身份/);assert.doesNotMatch(html,/私下查看我的身份|我已记住身份|\/art\/roles\//);
  const offline=renderToStaticMarkup(createElement(DealCountdown,{deadline:game.dealEndsAt,serverTime:room.serverTime,connected:false}));
  assert.match(offline,/连接恢复后继续同步发牌/);assert.doesNotMatch(offline,/5 秒后/);
});
