import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Player, RoundView } from '@avalon/contracts';
import { BattleRound } from '../src/BattleRound.js';
import { PartyBanner } from '../src/PlayerToken.js';

const players: Player[] = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, seat: i + 1, nickname: `同伴${i + 1}`, avatarUrl: `/art/avatars/wx-${i + 1}.webp` }));
const round: RoundView = { number: 3, mission: 3, captainId: 'p5', team: ['p1', 'p2', 'p3', 'p4'], direction: 'clockwise', vote: { approvals: 4, rejections: 2, passed: true, ballots: {p1:true,p2:true,p3:false,p4:true,p5:false,p6:true} }, result: {successes:2,failures:2,passed:false} };
const render = (r: RoundView, anonymous: boolean) => renderToStaticMarkup(createElement(BattleRound, { round:r, players:players.slice(0,6), anonymous }));

test('public votes cover the whole room; party has neutral portraits and task cards remain aggregate', () => {
  const html=render(round,false);
  assert.equal((html.match(/class="token-vote /g)??[]).length,6);
  const party=html.slice(html.indexOf('aria-label="组队方案"'), html.indexOf('aria-label="组队表决"'));
  assert.doesNotMatch(party,/token-vote /);
  assert.match(html,/5 号 同伴5：反对/); // Non-party captain also votes.
  assert.match(html,/任务失败/);
  const result=html.slice(html.indexOf('aria-label="任务结算"'));
  assert.match(result,/成功牌 × 2/);assert.match(result,/失败牌 × 2/);
  assert.doesNotMatch(result,/同伴|avatars\/|token-vote/);
  assert.doesNotMatch(html,/\/roles\//);
});

test('anonymous mode suppresses individual ballots even when supplied, but keeps party identities and totals', () => {
  const html=render(round,true);
  assert.doesNotMatch(html,/token-vote|全员公开票型|同伴5：反对|battle-voters/);
  assert.match(html,/同伴1/);assert.match(html,/同伴4/);
  assert.match(html,/4 赞成/);assert.match(html,/2 反对/);
  assert.match(html,/匿名组队投票/);
});

test('unfinished votes reveal no choices; missing public ballot is not displayed as rejection', () => {
  const pending=render({...round,vote:undefined,result:undefined},false);
  assert.match(pending,/本次表决未完成/);assert.doesNotMatch(pending,/token-vote|任务结算/);
  const incomplete=render({...round,vote:{...round.vote!,ballots:{p1:true}}},false);
  assert.equal((incomplete.match(/class="token-vote /g)??[]).length,1);
  assert.match(incomplete,/同伴2：无票型记录/);
});

test('captain portrait never auto-selects captain; two to six slots remain separate and obey read-only state', () => {
  for(let size=2;size<=6;size++) {
    const html=renderToStaticMarkup(createElement(PartyBanner,{players,captainId:'p12',team:['p3','p6'],size,canRemove:false,onRemove:()=>{}}));
    assert.equal((html.match(/class="party-slot /g)??[]).length,size);
    const formation=html.slice(html.indexOf('class="party-formation"'));
    assert.doesNotMatch(formation,/同伴12/);
    assert.match(formation,/3号 同伴3，已入选/);assert.equal((formation.match(/disabled=""/g)??[]).length,2);
    assert.doesNotMatch(html,/\/roles\//);
  }
});
