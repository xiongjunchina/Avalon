import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultSettings, type Replay, type Score, type Statistics } from '@avalon/contracts';
import { ReplayView, StatisticsView } from '../src/AccountPanel.js';
import { roleNames } from '../src/GamePanel.js';

test('replay UI distinguishes named/anonymous votes and unfinished rounds without rendering private task choices',()=>{
  const g:Replay={id:'game',startedAt:'2026-09-30T10:00:00Z',endedAt:'2026-09-30T11:00:00Z',rulesetVersion:'v2',playerCount:5,self:{nickname:'旧名字',seat:1,role:'merlin',team:'blue'},result:{winner:null,reason:'unanimous_abort'},favorite:false,
    settings:{...defaultSettings,anonymousTeamVote:true},players:[{id:'p1',nickname:'旧名字',seat:1}],roles:{p1:'merlin'},
    rounds:[{number:1,mission:1,captainId:'p1',team:['p1'],direction:'clockwise',vote:{approvals:3,rejections:2,passed:true,ballots:{p1:false}},result:{successes:1,failures:1,passed:false}},
      {number:2,mission:2,captainId:'p1',team:['p1'],direction:'clockwise'}],inspections:[],earlyWindows:[]};
  let html=renderToStaticMarkup(createElement(ReplayView,{replay:g}));
  assert.ok(html.includes('组队投票仅展示总数'));assert.ok(!html.includes('旧名字：反对'));
  assert.ok(html.includes('本次表决未完成'));assert.ok(html.includes('任务出牌始终不对应个人'));assert.ok(html.includes('最终身份'));
  g.settings.anonymousTeamVote=false;html=renderToStaticMarkup(createElement(ReplayView,{replay:g}));assert.ok(html.includes('旧名字：反对'));
});

test('empty statistics and interrupted-only role render an em dash rather than 0% or NaN',()=>{
  const empty=():Score=>({completed:0,wins:0,losses:0,aborted:0,winRate:null});
  const stats:Statistics={...empty(),aborted:1,byRole:Object.fromEntries(Object.keys(roleNames).map(r=>[r,empty()])) as Statistics['byRole'],byTeam:{blue:empty(),red:empty()}};
  stats.byRole.merlin.aborted=1;stats.byTeam.blue.aborted=1;
  const html=renderToStaticMarkup(createElement(StatisticsView,{stats}));
  assert.ok(html.includes('—'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('0%'));assert.ok(html.includes('不计入胜负与胜率'));
});
