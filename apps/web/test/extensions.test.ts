import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type RoomView } from '@avalon/contracts';
import { createGame, projectGame } from '@avalon/game-core';
import { GamePanel } from '../src/GamePanel.js';
import { PrivateExtensions } from '../src/Extensions.js';
function fixture() {
  const players=Array.from({length:7},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`页面测试${i+1}`}));
  return createGame(randomUUID(),players,{...defaultSettings,playerCount:7,ladyEnabled:true,earlyAssassinationEnabled:true},a=>a);
}
const name=(id:string)=>id;
const send=()=>{};
function renderPanel(g:ReturnType<typeof fixture>,userId:string){
  const room:RoomView={id:randomUUID(),code:'UI',hostId:g.players[0].id,version:1,phase:g.result?'finished':'playing',settings:g.settings,acceptingNewMembers:true,
    members:g.players.map(p=>({...p,ready:true,online:true})),game:projectGame(g,userId)};
  return renderToStaticMarkup(createElement(GamePanel,{room,userId,disabled:false,connected:true,send}));
}
test('early decision buttons appear only inside the opened assassin private panel without blocking proposing',()=>{
  const g=fixture();g.phase='proposing';g.mission=3;
  g.rounds=[
    {number:1,mission:1,captainId:g.players[0].id,team:g.players.slice(0,2).map(p=>p.id),direction:'clockwise',result:{successes:2,failures:0,passed:true}},
    {number:2,mission:2,captainId:g.players[1].id,team:g.players.slice(0,3).map(p=>p.id),direction:'clockwise',result:{successes:3,failures:0,passed:true}},
  ];
  const assassin=g.players.find(p=>g.roles[p.id]==='assassin')!.id;
  const closed=renderPanel(g,assassin);
  assert.match(closed,/队长组队/);
  assert.doesNotMatch(closed,/启用提前刺杀|有操作待处理|class="early-choice"/);
  const renderPrivate=(userId:string)=>renderToStaticMarkup(createElement(PrivateExtensions,{game:projectGame(g,userId),disabled:false,name,send}));
  assert.match(renderPrivate(assassin),/启用提前刺杀/);
  assert.doesNotMatch(renderPrivate(g.players[0].id),/启用提前刺杀/);
});
test('inspection details and acknowledgement stay private and are hidden until the inspector opens identity',()=>{
  const g=fixture(),inspector=g.lady!.holderId,target=g.players[0].id;
  g.phase='lady_reveal';g.lady!.inspections=[{afterMission:2,inspectorId:inspector,targetId:target,team:'blue'}];g.lady!.holderId=target;g.lady!.holderIds.push(target);
  assert.doesNotMatch(renderPanel(g,inspector),/我的宝镜查验|我已记住查验结果，继续/);
  const inspectorPanel=renderToStaticMarkup(createElement(PrivateExtensions,{game:projectGame(g,inspector),disabled:false,name,send}));
  assert.match(inspectorPanel,/我的宝镜查验/);assert.match(inspectorPanel,/<strong>蓝方<\/strong>/);assert.match(inspectorPanel,/我已记住查验结果，继续/);assert.doesNotMatch(inspectorPanel,/孙悟空|梅林/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(PrivateExtensions,{game:projectGame(g,target),disabled:false,name,send})),/我的宝镜查验|我已记住查验结果/);
});
test('single-screen game table renders all 5-10 seats with captain crown, lady holder badge, and interactive seat prompts',()=>{
  const g7=fixture();g7.phase='proposing';
  const html7=renderPanel(g7,g7.captainOrder[g7.captainIndex]);
  assert.match(html7,/table-seats-grid grid-8/);
  assert.equal((html7.match(/table-seat-card/g)??[]).length,7);
  assert.match(html7,/👑 队长/);
  assert.match(html7,/☯️ 宝镜/);
  assert.match(html7,/点击上车/);

  const players10=Array.from({length:10},(_,i)=>({id:randomUUID(),seat:i+1,nickname:`十人局${i+1}`}));
  const g10=createGame(randomUUID(),players10,{...defaultSettings,playerCount:10,ladyEnabled:true,earlyAssassinationEnabled:true},a=>a);
  g10.phase='proposing';
  const html10=renderPanel(g10,g10.captainOrder[g10.captainIndex]);
  assert.match(html10,/table-seats-grid grid-10/);
  assert.equal((html10.match(/table-seat-card/g)??[]).length,10);
});

