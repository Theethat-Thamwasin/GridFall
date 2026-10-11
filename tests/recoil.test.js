const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../engine.js');
function fire(weapon,seed=123,id=0,turn=1){
  const s=G.createState(seed);
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});
  s.units.forEach((u,i)=>Object.assign(u,{x:2+i*2,y:2,shield:0}));
  Object.assign(s.units[id],{x:10,y:12,weapon,ammo:G.WEAPONS[weapon].mag});s.turn=turn;
  G.beginTurn(s,{[id]:[{type:'shoot',angle:.071}]});
  const shots=[];
  for(let n=0;n<40;n++){
    const events=G.step(s);
    for(const e of events.filter(e=>e.type==='shoot'&&e.unitId===id))shots.push({event:e,bullets:structuredClone(s.projectiles.filter(b=>b.owner===id&&b.born===s.tick-1))});
  }
  return shots;
}
test('all weapons have reproducible bounded shot recoil and distinct shot variation',()=>{
  for(const [name,w]of Object.entries(G.WEAPONS)){
    const samples=[];
    for(let seed=1;seed<=24;seed++){
      const shots=fire(name,seed);assert.equal(shots.length,w.shots);
      for(const {event}of shots){assert.ok(Math.abs(event.angle-.071)<=w.recoilDeg*(1+(w.shots-1)*.18)*Math.PI/180+1e-12);samples.push(event.recoil);}
      assert.deepEqual(shots,fire(name,seed));
    }
    assert.ok(new Set(samples).size>=24);
    assert.ok(samples.some(n=>n<0)&&samples.some(n=>n>0));
  }
  const spread=name=>Math.max(...Array.from({length:24},(_,i)=>Math.abs(fire(name,i+1)[0].event.recoil)));
  assert.ok(spread('lmg')<spread('dmr'));assert.ok(spread('smg')<spread('dmr'));assert.ok(spread('dmr')>spread('sniper'));
});
test('automatic burst aim envelope stays below one degree, remains nonzero and includes focus reduction',()=>{
  const s=G.createState(123),u=s.units[0];
  for(const weapon of ['rifle','smg','lmg']){u.weapon=weapon;const w=G.WEAPONS[weapon],first=G.recoilSpread(u),last=G.recoilSpread(u,w.shots-1);
    assert.ok(first>0);assert.ok(last>first);assert.ok(last<Math.PI/180);
    assert.ok(Math.abs(G.recoilSpread(u,w.shots-1,true)-last*.35)<1e-12);
    for(const{event}of fire(weapon))assert.ok(Math.abs(event.recoil)<=last);
    u.class='deadeye';u.scan=2;assert.ok(Math.abs(G.recoilSpread(u,w.shots-1)-last*.35)<1e-12);u.class='vanguard';u.scan=0;
  }
});
test('VANDAL deals 16 damage per round and 48 for a full three-round burst',()=>{
  const s=G.createState(123);for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});
  for(const u of s.units)Object.assign(u,{alive:u.id<2,shield:0});Object.assign(s.units[0],{x:10,y:12,weapon:'rifle',ammo:15});Object.assign(s.units[1],{x:14,y:12});
  G.beginTurn(s,{0:[{type:'shoot',angle:0}]});while(s.phase==='resolution')G.step(s);
  const hits=s.events.filter(e=>e.type==='damage'&&e.unitId===1);assert.deepEqual(hits.map(e=>e.amount),[16,16,16]);assert.equal(s.units[1].hp,52);
});
test('recoil varies by shooter and turn and rotates all shotgun pellets together',()=>{
  assert.notEqual(fire('rifle')[0].event.recoil,fire('rifle',123,1)[0].event.recoil);
  assert.notEqual(fire('rifle')[0].event.recoil,fire('rifle',123,0,2)[0].event.recoil);
  const shot=fire('shotgun')[0];assert.equal(shot.bullets.length,11);
  shot.bullets.forEach((b,i)=>{assert.ok(Math.abs(Math.atan2(b.dy,b.dx)-shot.event.angle-G.WEAPONS.shotgun.spread[i])<1e-12);assert.equal(b.left,G.WEAPONS.shotgun.range);});
});
