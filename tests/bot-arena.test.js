const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine'),A=require('../bot-arena'),{validatePlan}=require('../multiplayer');
function play(options){
  const s=A.createDuel(options),events=[];let steps=0;
  while(s.phase!=='ended'){
    events.push(...A.advance(s));assert.ok(++steps<5000,'duel cannot stall');
    const alive=s.units.filter(u=>u.alive);assert.equal(new Set(alive.map(u=>G.key(u.x,u.y))).size,alive.length);
    for(const u of alive){assert.ok(G.passable(s,u.x,u.y));assert.ok(u.hp>0);}
    if(s.phase==='resolution'&&s.tick===0){const snapshot=structuredClone(s);snapshot.phase='planning';for(const u of alive)assert.doesNotThrow(()=>validatePlan(snapshot,u.id,s.plans[u.id]));}
  }
  return {s,events};
}
test('small spectator arena has exactly two selected bots, mirrored supplies and real P9 loadouts',()=>{
  const s=A.createDuel({left:'mire',right:'halo',seed:7});assert.equal(s.width,15);assert.equal(s.height,11);
  assert.deepEqual(s.units.filter(u=>u.alive).map(u=>u.class),['mire','halo']);assert.deepEqual(s.humanIds,[]);assert.notEqual(s.practice,true);
  for(const u of s.units.slice(0,2)){assert.equal(u.hp,100);assert.equal(u.weapon,'pistol');assert.equal(u.ammo,8);assert.deepEqual(u.weapons,['pistol']);}
  for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)assert.deepEqual(s.tiles[y][x],s.tiles[y][s.width-1-x]);
});
test('all operators and mirror matches finish through legal AI plans without overlapping or stuck human choices',()=>{
  const classes=Object.keys(G.CLASSES);for(let i=0;i<classes.length;i++)for(const right of [classes[(i+1)%classes.length],classes[i]]){
    const {s,events}=play({left:classes[i],right,seed:70+i});assert.equal(s.phase,'ended');assert.ok(events.some(e=>e.type==='shoot'||e.type==='damage'));
    for(const id of [0,1]){assert.equal(s.arena.stats[id].shots,events.filter(e=>e.type==='shoot'&&e.unitId===id).length);assert.equal(s.arena.stats[id].damage,events.filter(e=>e.type==='damage'&&e.owner===id&&e.unitId!==id).reduce((n,e)=>n+e.amount,0));}
    assert.ok(s.tiles.flat().every(t=>t.type!=='void'));assert.equal(s.projectiles.length,0);
  }
});
test('selected weapons, seeds and automatic Fate drafts remain reproducible',()=>{
  for(const weapon of ['pistol','rifle','shotgun']){
    const options={left:'deadeye',right:'rook',weapon,seed:123,fate:true},a=play(options),b=play(options);
    assert.deepEqual(a.events,b.events);assert.deepEqual(a.s.units,b.s.units);assert.deepEqual(a.s.arena.stats,b.s.arena.stats);
  }
  for(const fate of [false,true]){const s=A.createDuel({fate});s.turn=4;A.advance(s);assert.equal(s.fate.history.length,fate?1:0);assert.equal(s.phase,'resolution');}
});
test('Bot A has no practice immortality and either bot can win or trade kills',()=>{
  const s=A.createDuel();Object.assign(s.units[0],{hp:1,shield:0});Object.assign(s.units[1],{x:6,y:5});
  G.beginTurn(s,{0:[{type:'wait'}],1:[{type:'shoot',angle:Math.PI}]});while(s.phase!=='ended')A.advance(s);
  assert.equal(s.units[0].hp,0);assert.equal(s.units[0].alive,false);assert.equal(s.winner,1);
  const t=A.createDuel({left:'vanguard',right:'vanguard'});for(const u of t.units.slice(0,2))Object.assign(u,{hp:28,shield:0});t.units[1].x=5;
  G.beginTurn(t,{0:[{type:'shoot',angle:0}],1:[{type:'shoot',angle:Math.PI}]});while(t.phase!=='ended')A.advance(t);
  assert.equal(t.winner,-1);assert.equal(t.units.filter(u=>u.alive).length,0);
});
test('contact duels auto resolve, turn limit is a draw, and invalid setup is rejected',()=>{
  const s=A.createDuel();s.units[0].x=6;s.units[1].x=8;
  G.beginTurn(s,{0:[{type:'move',target:{x:7,y:5}}],1:[{type:'move',target:{x:7,y:5}}]});
  for(let n=0;n<120&&s.turn===1;n++)A.advance(s);assert.equal(s.turn,2);assert.notEqual(s.phase,'clash');
  s.turn=A.MAX_TURNS;G.beginTurn(s,{});for(let i=0;i<80;i++)A.advance(s);assert.equal(s.phase,'ended');assert.equal(s.arena.draw,true);
  assert.deepEqual(A.advance(s),[]);
  for(const options of [{left:'fake'},{right:'fake'},{weapon:'fake'},{seed:-1},{seed:NaN},{seed:1.5},{seed:0x100000000}])assert.throws(()=>A.createDuel(options));
});
