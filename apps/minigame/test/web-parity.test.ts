import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings } from '@avalon/contracts';
import { entryScreen } from '../src/screens/entry.js';
import { lobbyScreen } from '../src/screens/lobby.js';
import { layoutWebScreen } from '../src/ui/web-layout.js';

test('home preserves latest web duel artwork, paired room actions and compact account tools', () => {
  const model = entryScreen({ id: 'u', nickname: '行者', playerCode: '123456' });
  assert.equal(model.web?.page, 'home');
  const nodes = layoutWebScreen(model, { width: 390, height: 844, top: 44, bottom: 34 }).nodes;
  assert.ok(nodes.some(node => node.id === 'home-duel' && node.image === 'home/duel-mobile.jpg'));
  assert.equal(nodes.find(node => node.id === 'create')?.y, nodes.find(node => node.id === 'join')?.y);
  assert.ok(nodes.some(node => node.id === 'account' && node.y < 120));
});

test('waiting table folds mission details after readiness and preserves vacant seats', () => {
  const room = { id: 'r', code: '123456', hostId: 'u', settings: defaultSettings, acceptingNewMembers: true, members: [{ id: 'u', nickname: '行者', seat: 1, online: true, ready: false }] } as any;
  const model = lobbyScreen(room, room.members[0]);
  const result = layoutWebScreen(model, { width: 390, height: 844, top: 44, bottom: 34 });
  assert.equal(result.nodes.filter(node => node.kind === 'quest').length, 0);
  const expanded=layoutWebScreen({...model,web:{...model.web!,waitingMissionsExpanded:true}},{width:390,height:844,top:44,bottom:34});
  assert.equal(expanded.nodes.filter(node=>node.kind==='quest').length,5);
  assert.equal(result.nodes.filter(node => node.kind === 'seat').length, defaultSettings.playerCount);
  assert.equal(result.nodes.some(node => node.id === 'altar'), false);
  assert.ok(result.nodes.some(node => node.id === 'ready' && node.y > result.nodes.find(n => n.skin === 'waiting-seat')!.y));
});


test('390px home geometry follows the web CSS instead of a separate mini game composition', () => {
  const model = entryScreen({ id: 'u', nickname: '行者', playerCode: '123456' });
  const { nodes } = layoutWebScreen(model, { width: 390, height: 844, top: 0, bottom: 0 });
  const role = nodes.find(n => n.id === 'home-duel')!;
  assert.ok(Math.abs(role.width - 390) < 1);
  assert.ok(Math.abs(role.y - 0) < 1);
  assert.ok(Math.abs(nodes.find(n => n.id === 'brand')!.y - 60) < 1);
  assert.ok(Math.abs(nodes.find(n => n.id === 'create')!.y - 662) < 1);
});

test('active round, alternating seats and actions precede the full mission history', async () => {
  const { parityFixture } = await import('../scripts/parity-fixture.js');
  const { gameScreen } = await import('../src/screens/game.js');
  const { user, room } = parityFixture();
  assert.equal(room.game.phase, 'proposing');
  const model = gameScreen(room, user, { privateRoleVisible: false, ballotVisible: false, selectedIds: [] });
  const { nodes, maxScroll } = layoutWebScreen(model, { width: 390, height: 844, top: 0, bottom: 0 });
  const arena = nodes.find(n => n.id === 'arena-frame')!;
  const current=nodes.find(n=>n.id==='current-round')!;
  const dock=nodes.find(n=>n.id==='action-dock')!;
  const quests=nodes.filter(n=>n.kind==='quest');
  assert.ok(current.y<arena.y && arena.y+arena.height<=dock.y);
  assert.ok(dock.y+dock.height<quests[0]!.y);
  assert.ok(dock.y+dock.height<=844, 'main actions fit in the first screen');
  assert.equal(quests.length,5);
  assert.ok(arena.height<210, 'six players do not leave a large empty arena');
  assert.deepEqual(nodes.filter(n => n.kind === 'seat' && n.x < 100).map(n => n.count), [1, 3, 5]);
  assert.equal(nodes.filter(n => n.kind === 'seat').length, 6);
  assert.ok(nodes.some(n => n.id === 'endGame'));
  assert.equal(nodes.find(n => n.id === 'propose')!.disabled, true);
  assert.ok(maxScroll >= 0);
});


test('small and safe-area screens can scroll the live dock into view without offscreen targets', async () => {
  const { PracticeSession }=await import('../src/screens/practice.js');
  const { gameScreen }=await import('../src/screens/game.js');
  for(const width of [320,390,430]) for(const count of [5,6,7,8,9,10,11,12]) {
    const practice=new PracticeSession({...defaultSettings,playerCount:count},'行者');
    const model=gameScreen(practice.view(),practice.user,{privateRoleVisible:false,ballotVisible:false});
    const viewport={width,height:width===320?568:844,top:44,bottom:34};
    const first=layoutWebScreen(model,viewport);
    const last=layoutWebScreen({...model,scroll:first.maxScroll},viewport);
    assert.equal(last.nodes.filter(n=>n.kind==='seat').length,count);
    for(const node of last.nodes.filter(n=>n.kind==='button'||n.kind==='seat')) {
      assert.ok(node.x>=0 && node.x+node.width<=width+.1,`${width}/${count}: ${node.id} offscreen horizontally`);
    }
    const action=last.nodes.find(n=>n.id==='confirmRole');
    assert.ok(action && action.y>=viewport.top && action.y+action.height<=viewport.height-viewport.bottom);
  }
});

test('selected captains keep both public badges and mission teammates show departure status', async () => {
  const { parityFixture }=await import('../scripts/parity-fixture.js');
  const { gameScreen }=await import('../src/screens/game.js');
  const { user,room }=parityFixture();
  const selected=room.members.slice(0,2).map(p=>p.id);
  const ui={privateRoleVisible:false,ballotVisible:false,selectedIds:selected};
  let nodes=layoutWebScreen(gameScreen(room,user,ui),{width:390,height:844,top:0,bottom:0}).nodes;
  const captain=nodes.find(n=>n.id==='player:'+user.id)!;
  assert.equal(captain.badge,'👑 队长');
  assert.equal(captain.teamStatus,'已选');
  room.game.phase='mission';
  room.game.rounds=[{number:1,mission:1,captainId:user.id,team:selected,direction:'clockwise'}];
  nodes=layoutWebScreen(gameScreen(room,user,ui),{width:390,height:844,top:0,bottom:0}).nodes;
  assert.equal(nodes.filter(n=>n.teamStatus==='出征').length,2);
});

test('home invitation is part of the footer and preserves the invitation action',()=>{
 const m=entryScreen();m.rows.push({id:'invitation',text:'朋友邀请你加入'});
 const {nodes}=layoutWebScreen(m,{width:390,height:844,top:44,bottom:34});
 assert.equal(nodes.filter(n=>n.id==='invitation').length,1);
 assert.equal(nodes.find(n=>n.id==='invitation')!.text,'加入邀请房间');
 assert.ok(nodes.find(n=>n.id==='home-invite-hint')!.y<nodes.find(n=>n.id==='invitation')!.y);
});

test('home background remains unclipped behind the safe area while controls stay inside it',()=>{
 const {nodes}=layoutWebScreen(entryScreen({id:'u',nickname:'行者',playerCode:'123456'}),{width:390,height:844,top:44,bottom:34});
 const bg=nodes.find(n=>n.id==='home-duel')!;assert.equal(bg.clipTop,0);assert.equal(bg.clipBottom,844);
 assert.ok(nodes.find(n=>n.id==='create')!.y>=44);
});
