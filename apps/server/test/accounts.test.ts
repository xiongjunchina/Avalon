import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defaultSettings, type Replay, type Statistics } from '@avalon/contracts';
import { headers, service } from './helpers.js';
import { gameFixture, confirm, mission } from './game-helpers.js';
import { ROOM_TTL_MS } from '../src/store.js';
import { migrate } from '../src/db.js';
const cookie=(token:string)=>({cookie:`avalon_session=${token}`});
async function abort(f:Awaited<ReturnType<typeof gameFixture>>) {
  await f.command(f.people[0].user.id,'requestAbort');
  for(const p of f.people.slice(1))await f.command(p.user.id,'voteAbort',{approve:true});
  return (await f.state()).game!.id;
}

test('account endpoints authenticate, enforce CSRF/origin and strict profile input; zero games have no win rate',async t=>{
  const f=await service(t),p=await f.store.createGuest('新访客'),auth=cookie(p.token);
  for(const url of ['/api/me/stats','/api/me/games','/api/me/presets',`/api/games/${randomUUID()}/replay`])assert.equal((await f.app.inject({url})).statusCode,401);
  const stats=(await f.app.inject({url:'/api/me/stats',headers:auth})).json<Statistics>();
  assert.equal(stats.completed,0);assert.equal(stats.winRate,null);assert.equal(stats.byRole.merlin.winRate,null);
  for(const [method,url,payload] of [
    ['PATCH','/api/me',{nickname:'恶意',avatar:'star'}],['POST','/api/me/presets',{name:'预设',settings:defaultSettings}],
    ['PUT',`/api/me/favorites/${randomUUID()}`,undefined],['DELETE',`/api/me/presets/${randomUUID()}`,undefined],
  ] as const) {
    const cross=await f.app.inject({method,url,payload,headers:{...headers,...auth,origin:'https://other.example'}});
    assert.equal(cross.statusCode,403);assert.equal(cross.json().error,'ORIGIN_REJECTED');
    const csrf=await f.app.inject({method,url,payload,headers:{origin:headers.origin,...auth}});
    assert.equal(csrf.json().error,'CSRF_REJECTED');
  }
  for(const payload of [{nickname:'x',avatar:'https://example.com/a.png'},{nickname:' ',avatar:'leaf'},{nickname:'x',avatar:'star',userId:randomUUID()}]) {
    assert.equal((await f.app.inject({method:'PATCH',url:'/api/me',payload,headers:{...headers,...auth}})).statusCode,400);
  }
  assert.equal((await f.app.inject({url:'/api/me',headers:auth})).json().user.nickname,'新访客');
});

test('final command replay does not double count; rename keeps game snapshots; history and favorites survive restart and room closure',async t=>{
  const f=await gameFixture(t),p=f.people[0],auth=cookie(p.token);
  await confirm(f);for(let i=0;i<3;i++)await mission(f);
  const views=await Promise.all(f.people.map(p=>f.state(p.user.id))),assassin=f.people[views.findIndex(v=>v.game!.self!.role==='assassin')],merlin=f.people[views.findIndex(v=>v.game!.self!.role==='merlin')];
  const end=await f.command(assassin.user.id,'assassinate',{targetId:merlin.user.id}),id=(await f.state()).game!.id;
  const stats=async()=>(await f.app.inject({url:'/api/me/stats',headers:auth})).json<Statistics>();
  const before=await stats();assert.equal(before.completed,1);assert.equal(before.wins+before.losses,1);assert.equal(before.byTeam.red.completed+before.byTeam.blue.completed,1);
  const mine=views[0].game!.self!;assert.equal(before.wins,mine.team==='red'?1:0);assert.equal(before.byRole[mine.role].completed,1);
  await f.restart();await f.store.execute(assassin.user.id,f.room.id,end);assert.deepEqual(await stats(),before);
  const profile=await f.app.inject({method:'PATCH',url:'/api/me',headers:{...headers,...auth},payload:{nickname:'新名字',avatar:'moon'}});assert.equal(profile.statusCode,200);
  assert.equal((await f.state()).members.find(m=>m.id===p.user.id)!.nickname,'新名字');
  const replay=await f.app.inject({url:`/api/games/${id}/replay`,headers:auth});assert.equal(replay.statusCode,200);assert.equal(replay.json().self.nickname,p.user.nickname);assert.equal(replay.json().players.find((x:{id:string})=>x.id===p.user.id).nickname,p.user.nickname);
  assert.equal(replay.headers['cache-control'],'no-store');assert.ok(replay.headers['set-cookie']);
  for(let i=0;i<2;i++)assert.equal((await f.app.inject({method:'PUT',url:`/api/me/favorites/${id}`,headers:{...headers,...auth}})).statusCode,200);
  assert.equal((await f.pool.query('SELECT * FROM favorites')).rowCount,1);
  const outsider=await f.store.createGuest('路过的人');
  for(const method of ['GET','PUT','DELETE'] as const)assert.equal((await f.app.inject({method,url:method==='GET'?`/api/games/${id}/replay`:`/api/me/favorites/${id}`,headers:{...headers,...cookie(outsider.token)}})).statusCode,404);
  await f.command(p.user.id,'returnToLobby');
  await f.command(f.people[1].user.id,'leaveRoom');await f.store.join(outsider.user,f.room.code);
  assert.equal((await f.app.inject({url:`/api/games/${id}/replay`,headers:cookie(outsider.token)})).statusCode,404);
  for(const person of [p,...f.people.slice(2),outsider])await f.command(person.user.id,'leaveRoom');
  assert.equal(await f.store.snapshot(f.room.id),null);
  await f.restart();const list=(await f.app.inject({url:'/api/me/games?favorites=true',headers:auth})).json();assert.equal(list.games.length,1);assert.equal(list.games[0].id,id);
  for(let i=0;i<2;i++)await f.app.inject({method:'DELETE',url:`/api/me/favorites/${id}`,headers:{...headers,...auth}});
  assert.equal((await f.app.inject({url:'/api/me/games?favorites=true',headers:auth})).json().games.length,0);
  assert.equal((await f.app.inject({url:'/api/me/games',headers:auth})).json().games.length,1);
  assert.equal((await f.app.inject({url:`/api/games/${id}/replay`,headers:auth})).statusCode,200);
  assert.deepEqual(await stats(),before);
});

test('replay allowlist honors anonymous and named ballots and never exposes task mapping, private vision or raw inspection result',async t=>{
  for(const anonymousTeamVote of [true,false]) {
    const f=await gameFixture(t,true,{anonymousTeamVote}),auth=cookie(f.people[0].token);
    const activeId=(await f.state()).game!.id;
    assert.equal((await f.app.inject({url:`/api/games/${activeId}/replay`,headers:auth})).statusCode,404);
    assert.equal((await f.app.inject({method:'PUT',url:`/api/me/favorites/${activeId}`,headers:{...headers,...auth}})).statusCode,404);
    assert.equal((await f.app.inject({url:'/api/me/games',headers:auth})).json().games.length,0);
    await confirm(f);await mission(f);const id=await abort(f);
    const g=(await f.pool.query('SELECT state FROM games WHERE id=$1',[id])).rows[0].state;
    const raw=Object.fromEntries(f.people.map(p=>[p.user.id,true]));
    g.rounds[0].vote.ballots=raw;g.rounds[0].result.cards=raw;g.rounds[0].missionVotes=raw;g.missionVotes=raw;g.teamVotes=raw;
    g.lady={holderId:f.people[1].user.id,holderIds:f.people.map(p=>p.user.id),inspections:[{afterMission:1,inspectorId:f.people[0].user.id,targetId:f.people[1].user.id,team:'red',secret:'private'}]};
    await f.pool.query('UPDATE games SET state=$2 WHERE id=$1',[id,g]);
    const r=(await f.app.inject({url:`/api/games/${id}/replay`,headers:auth})).json<Replay>();
    assert.equal(r.rounds[0].vote!.ballots===undefined,anonymousTeamVote);
    if(!anonymousTeamVote)assert.deepEqual(r.rounds[0].vote!.ballots,raw);
    assert.deepEqual(Object.keys(r.rounds[0].result!).sort(),['failures','passed','successes']);
    assert.deepEqual(Object.keys(r.inspections[0]).sort(),['afterMission','inspectorId','targetId']);
    for(const field of ['missionVotes','teamVotes','cards','self.evilIds','token','invite','roomId','connectionId'])assert.ok(!JSON.stringify(r).includes(field),field);
    assert.deepEqual(Object.keys(r).sort(),['id','startedAt','endedAt','rulesetVersion','playerCount','self','result','favorite','settings','players','roles','rounds','inspections','earlyWindows'].sort());
  }
});

test('offline timeout is an accessible interrupted record, excluded from all win denominators',async t=>{
  const f=await gameFixture(t),auth=cookie(f.people[0].token),id=(await f.state()).game!.id;
  await f.restart();f.advance(ROOM_TTL_MS+1);await f.store.maintain();
  const stats=(await f.app.inject({url:'/api/me/stats',headers:auth})).json<Statistics>();
  assert.equal(stats.completed,0);assert.equal(stats.aborted,1);assert.equal(stats.winRate,null);assert.equal(stats.wins+stats.losses,0);
  assert.equal(Object.values(stats.byRole).reduce((n,s)=>n+s.aborted,0),1);
  const replay=(await f.app.inject({url:`/api/games/${id}/replay`,headers:auth})).json();assert.equal(replay.result.reason,'offline_timeout');
});

test('history cursor has stable timestamp/UUID ordering, isolated favorites and strict pagination input',async t=>{
  const f=await gameFixture(t),original=await abort(f),auth=cookie(f.people[0].token);
  const g=(await f.pool.query('SELECT state FROM games WHERE id=$1',[original])).rows[0].state;
  for(let i=0;i<4;i++) {
    const id=randomUUID();await f.pool.query(`INSERT INTO games(id,room_id,ruleset_version,state,created_at,ended_at)
      VALUES($1,$2,$3,$4,$5,$5)`,[id,f.room.id,g.rulesetVersion,{...g,id},new Date(f.now())]);
    await f.pool.query('INSERT INTO game_participants(game_id,user_id) SELECT $1,unnest($2::uuid[])',[id,g.players.map((p:{id:string})=>p.id)]);
  }
  const ordered=(await f.pool.query('SELECT id FROM games ORDER BY ended_at DESC,id DESC')).rows.map(r=>r.id),seen:string[]=[];
  let cursor='';do{const r=(await f.app.inject({url:`/api/me/games?limit=2${cursor?`&cursor=${cursor}`:''}`,headers:auth})).json();assert.ok(r.games.length<=2);seen.push(...r.games.map((g:{id:string})=>g.id));cursor=r.nextCursor;}while(cursor);
  assert.deepEqual(seen,ordered);
  await f.app.inject({method:'PUT',url:`/api/me/favorites/${ordered[0]}`,headers:{...headers,...auth}});
  assert.equal((await f.app.inject({url:'/api/me/games?favorites=true',headers:cookie(f.people[1].token)})).json().games.length,0);
  for(const query of ['limit=0','limit=51','favorites=yes','cursor=garbage','userId='+f.people[1].user.id])assert.equal((await f.app.inject({url:`/api/me/games?${query}`,headers:auth})).statusCode,400);
});

test('presets are private, same-name updates do not duplicate, quota is atomic; applying retains room authorization and seat checks',async t=>{
  const f=await gameFixture(t,false,{playerCount:7}),host=f.people[0],auth={...headers,...cookie(host.token)};
  const save=async(name:string,playerCount=7)=>f.app.inject({method:'POST',url:'/api/me/presets',headers:auth,payload:{name,settings:{...defaultSettings,playerCount}}});
  const first=(await save('同名')).json().preset;
  const updated=(await save('同名',8)).json().preset;assert.equal(updated.id,first.id);assert.equal(updated.settings.playerCount,8);
  assert.equal((await f.app.inject({url:'/api/me/presets',headers:cookie(f.people[1].token)})).json().presets.length,0);
  await f.app.inject({method:'DELETE',url:`/api/me/presets/${first.id}`,headers:{...headers,...cookie(f.people[1].token)}});
  const created=await Promise.all(Array.from({length:12},(_,i)=>save(`预设${i}`)));assert.equal(created.filter(r=>r.statusCode===200).length,9);assert.ok(created.filter(r=>r.statusCode!==200).every(r=>r.json().error==='PRESET_LIMIT'));
  assert.equal((await save('同名')).statusCode,200);
  const shrink={...defaultSettings,playerCount:5};
  await assert.rejects(f.command(f.people[1].user.id,'updateSettings',updated.settings),/FORBIDDEN/);
  await assert.rejects(f.command(host.user.id,'updateSettings',shrink),/SEATS_OCCUPIED/);
  assert.ok((await f.state()).members.every(m=>m.ready));
  await f.command(host.user.id,'updateSettings',updated.settings);
  assert.equal((await f.state()).settings.playerCount,8);assert.ok((await f.state()).members.every(m=>!m.ready));
  assert.equal((await f.app.inject({method:'POST',url:'/api/me/presets',headers:auth,payload:{name:'非法',settings:{...defaultSettings,invite:'leak'}}})).statusCode,400);
  await f.restart();assert.equal((await f.app.inject({url:'/api/me/presets',headers:auth})).json().presets.length,10);
  await f.app.inject({method:'DELETE',url:`/api/me/presets/${first.id}`,headers:auth});assert.equal((await f.state()).settings.playerCount,8);
});

test('failed favorite writes return service unavailable without claiming success or changing history',async t=>{
  const f=await gameFixture(t),id=await abort(f),auth={...headers,...cookie(f.people[0].token)};
  await f.pool.query(`CREATE FUNCTION reject_favorite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;
    CREATE TRIGGER reject_favorite BEFORE INSERT ON favorites FOR EACH ROW EXECUTE FUNCTION reject_favorite()`);
  const r=await f.app.inject({method:'PUT',url:`/api/me/favorites/${id}`,headers:auth});assert.equal(r.statusCode,503);assert.equal(r.json().error,'SERVICE_UNAVAILABLE');
  assert.equal((await f.pool.query('SELECT * FROM favorites')).rowCount,0);assert.equal((await f.app.inject({url:'/api/me/games',headers:auth})).json().games.length,1);
});

test('003 migration backfills existing v1/v2 roster and is safe to re-run',async t=>{
  const f=await gameFixture(t),id=await abort(f);
  // Simulate an existing 002 schema only inside this fixture's disposable database schema.
  await f.pool.query("DROP TABLE favorites,setting_presets,game_participants; DROP INDEX games_ended_order; ALTER TABLE users DROP COLUMN avatar; DELETE FROM schema_migrations WHERE version='003_accounts.sql'");
  await migrate(f.pool);await migrate(f.pool);
  assert.equal((await f.pool.query('SELECT * FROM game_participants WHERE game_id=$1',[id])).rowCount,5);
  const response=await f.app.inject({url:`/api/games/${id}/replay`,headers:cookie(f.people[0].token)});assert.equal(response.statusCode,200);
  assert.equal((await f.pool.query("SELECT * FROM schema_migrations WHERE version='003_accounts.sql'")).rowCount,1);
});
