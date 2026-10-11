const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine.js'),U=require('../tactics.js'),R=require('../replay.js');
const {RoomHub}=require('../multiplayer.js');
function arena(){
  const s=G.createState(123,'vanguard','medium');
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',rank:0,hp:0,loot:null});
  for(const u of s.units)Object.assign(u,{alive:u.id<2,removed:u.id>1,x:u.id?7:4,y:u.id?5:4,shield:0,hp:100});
  s.safeLimit=s.nextLimit=999;return s;
}
function bullet(s,weapon,angle,left=G.WEAPONS[weapon].range){
  const u=s.units[0];return {owner:0,x:u.x+.5,y:u.y+.5,dx:Math.cos(angle),dy:Math.sin(angle),damage:1,left,traveled:0,speed:G.WEAPONS[weapon].speed,born:-1,weapon};
}
test('aimed body and wall intersections match actual flight for all weapons and grazing angles',()=>{
  for(const weapon of Object.keys(G.WEAPONS))for(const wall of [null,[8,5],[6,4],[6,5]])for(const angle of [.05,.19,.23,.28,.34,.39,.45,.6]){
    const s=arena();s.units[0].weapon=weapon;
    if(wall)Object.assign(s.tiles[wall[1]][wall[0]],{type:'wall',hp:999});
    const visible=new Set(s.tiles.flatMap((row,y)=>row.map((t,x)=>G.key(x,y))));
    const predicted=U.ray(U.context(s,0,'shoot',[],visible),angle);
    G.beginTurn(s,{});s.projectiles=[bullet(s,weapon,angle)];
    for(let i=0;i<30&&s.projectiles.length;i++)G.step(s);
    const hit=s.events.find(e=>e.type==='damage'),impact=s.events.find(e=>e.type==='impact');
    const label=JSON.stringify({weapon,wall,angle,predicted});
    assert.equal(!!hit,predicted.kind==='unit',label);
    assert.equal(!!impact,predicted.kind==='wall',label);
    if(hit)assert.equal(hit.unitId,predicted.unitId,label);
    if(impact)assert.deepEqual({x:impact.x,y:impact.y},predicted.cell,label);
    assert.equal(s.projectiles.length,0,label);
  }
});
test('the closest body is hit even if units are stored in another order',()=>{
  const s=arena();Object.assign(s.units[1],{x:7,y:4});Object.assign(s.units[2],{alive:true,x:5,y:4});
  const hit=G.projectileCollision(s,4.5,4.5,10.5,4.5,0);
  assert.equal(hit.unitId,2);assert.ok(Math.abs(hit.point.x-(5.5-G.VISION.BODY_RADIUS))<1e-9);
});
test('grazing aim warns about recoil while center aim stays on a stationary target',()=>{
  const s=arena();Object.assign(s.units[0],{weapon:'rifle'});Object.assign(s.units[1],{x:9,y:4});
  const c=U.context(s,0,'shoot'),angle=Math.asin(G.VISION.BODY_RADIUS/5)-G.recoilSpread(s.units[0],2)/2;
  assert.equal(U.aimRay(c,angle).kind,'unit');assert.equal(U.aimRay(c,angle).confidence,'edge');
  assert.match(U.aimRay(c,angle).reason,/Recoil may miss/);
  assert.equal(U.aimRay(c,0).confidence,'steady');assert.match(U.aimRay(c,0).reason,/move or dodge/);
  assert.notEqual(U.ray(c,angle+G.recoilSpread(s.units[0],2)).kind,'unit');
});
test('two shotgun shells have separate damage totals and never stack eleven pellets on one target',()=>{
  const s=arena();Object.assign(s.units[0],{weapon:'shotgun',ammo:6});Object.assign(s.units[1],{x:5,y:4});
  G.beginTurn(s,{0:[{type:'shoot',angle:0},{type:'shoot',angle:0}]});
  while(s.phase==='resolution')G.step(s);
  const totals=new Map();for(const e of s.events.filter(e=>e.type==='damage'))totals.set(e.shotId,(totals.get(e.shotId)||0)+e.amount);
  assert.deepEqual([...totals.values()],[48,48]);assert.equal(s.units[0].ammo,4);assert.equal(s.units[1].hp,4);
});
test('reflected shotgun shells retain their cap and grouping on the original shooter',()=>{
  const s=arena();Object.assign(s.units[0],{weapon:'shotgun',ammo:6});Object.assign(s.units[1],{class:'rook',x:5,y:4});
  G.beginTurn(s,{0:[{type:'shoot',angle:0}],1:[{type:'reflect'}]});
  for(let i=0;i<35;i++)G.step(s);
  const hits=s.events.filter(e=>e.type==='damage'&&e.unitId===0);
  assert.equal(hits.reduce((n,e)=>n+e.amount,0),48);assert.equal(new Set(hits.map(e=>e.shotId)).size,1);
  assert.ok(hits.every(e=>e.weapon==='shotgun'&&e.owner===1));assert.equal(s.projectiles.length,0);
});
test('fractional remaining range cannot leave a stationary bullet in live, network or replay frames',()=>{
  const s=arena(),hub=new RoomHub(),a=hub.create(),room=hub.get(a.code,a.token).room,archive=new R.MatchArchive();
  hub.start(a.code,a.token);
  room.state=s;G.beginTurn(s,{});archive.begin(s);
  s.projectiles=[bullet(s,'rifle',0,Number.EPSILON),bullet(s,'shotgun',.3,1e-12)];
  assert.equal(hub.view(room,room.members[0]).projectiles.length,2);
  const events=G.step(s);archive.capture(s,events);
  assert.equal(s.projectiles.length,0);assert.equal(hub.view(room,room.members[0]).projectiles.length,0);
  assert.equal(archive.current.frames.at(-1).projectiles.length,0);
});
test('all guns finish two-action flight with ordinary and Oracle extended ranges',()=>{
  for(const weapon of Object.keys(G.WEAPONS))for(const focused of [false,true])for(const angle of [0,.071,Math.PI/4,2.19]){
    const s=arena();s.units[1].alive=false;Object.assign(s.units[0],{x:18,y:18,weapon,ammo:99,class:focused?'deadeye':'vanguard',scan:focused?2:0});
    G.beginTurn(s,{0:[{type:'shoot',angle},{type:'shoot',angle}]});
    let fired=false;for(let i=0;i<80;i++){G.step(s);fired||=s.projectiles.length>0;for(const b of s.projectiles)assert.ok(b.left>1e-9,weapon+' expired bullet');}
    assert.ok(fired,weapon);assert.equal(s.projectiles.length,0,weapon+' '+focused+' '+angle);
  }
});
test('finishing resolution clears leftover flight before planning or match-end snapshots',()=>{
  for(const practice of [false,true]){
    const s=arena();s.practice=practice;G.beginTurn(s,{});s.tick=79;s.projectiles=[bullet(s,'shotgun',.3,100)];
    G.step(s);assert.notEqual(s.phase,'resolution');assert.equal(s.projectiles.length,0);
  }
});
test('network shell metadata groups identified hits without identifying an unseen attacker',()=>{
  const hub=new RoomHub(),a=hub.create();hub.join(a.code);hub.start(a.code,a.token);
  const room=hub.get(a.code,a.token).room,s=arena();room.state=s;
  const event={type:'damage',unitId:0,owner:1,x:4,y:4,amount:16,turn:1,shotId:1,weapon:'shotgun'};
  const identified=hub.view(room,room.members[0],[event]).events[0];assert.equal(identified.shotId,1);assert.equal(identified.weapon,'shotgun');
  Object.assign(s.units[1],{x:30,y:30});const hidden=hub.view(room,room.members[0],[event]).events[0];
  assert.equal(hidden.owner,null);assert.equal(hidden.shotId,undefined);assert.equal(hidden.weapon,undefined);
});
