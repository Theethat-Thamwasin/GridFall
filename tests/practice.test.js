const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine'),P=require('../practice'),U=require('../tactics');
function resolve(s,actions=[],bot=[]){G.beginTurn(s,{0:actions,1:bot});let steps=0;while(s.phase==='resolution'){G.step(s);assert.ok(++steps<200);}return s;}
test('Practice provides all weapons, seven instant operator choices and one nearby target',()=>{
  const s=P.createState(73),u=s.units[0];assert.equal(s.practice,true);assert.equal(u.hp,50);assert.equal(s.units.filter(u=>u.alive).length,2);assert.deepEqual(u.weapons,Object.keys(G.WEAPONS));
  assert.ok(s.tiles.flat().filter(t=>t.type==='floor').length>s.width*s.height*.7);
  for(const id of Object.keys(G.CLASSES)){assert.equal(P.changeCharacter(s,id),true);assert.equal(u.class,id);assert.equal(u.skillCooldown,0);assert.equal(U.availability(s,0,G.CLASSES[id].skillType,[]).ok,true);}
  s.phase='resolution';assert.equal(P.changeCharacter(s,'vanguard'),false);assert.equal(P.changeCharacter(G.createState(1),'volt'),false);
});
test('Every practice gun can shoot and reload with actual magazine and projectile rules',()=>{
  for(const id of Object.keys(G.WEAPONS)){const s=P.createState(8),u=s.units[0];G.equipWeapon(s,u,id);u.ammo=0;resolve(s,[{type:'reload'},{type:'shoot',angle:Math.PI}]);assert.equal(s.events.filter(e=>e.type==='shoot'&&e.unitId===0).length,G.WEAPONS[id].shots,id);assert.equal(u.ammo,G.WEAPONS[id].mag-G.WEAPONS[id].shots,id);}
});
test('Healing raises HP during resolution, then the next practice turn restores the half-health baseline',()=>{
  const s=P.createState(3),u=s.units[0];G.beginTurn(s,{0:[{type:'heal'}]});while(s.tick<=20)G.step(s);assert.equal(u.hp,85);while(s.phase==='resolution')G.step(s);assert.equal(u.hp,85);const report=P.afterTurn(s);assert.equal(report.before,85);assert.equal(u.hp,50);assert.equal(u.medkits,3);assert.equal(U.availability(s,0,'heal',[]).ok,true);
  G.FATE.add(s,0,'quickloader');u.hp=1;P.afterTurn(s);assert.equal(u.hp,45);
});
test('Practice damage is visible and cannot eliminate the learner; real-match damage remains lethal',()=>{
  const s=P.createState(7),u=s.units[0];u.hp=1;resolve(s,[{type:'grenade',target:{x:u.x,y:u.y}}]);assert.ok(s.events.some(e=>e.type==='damage'&&e.unitId===0));assert.equal(u.alive,true);assert.equal(u.hp,1);assert.equal(s.phase,'planning');
  const real=G.createState(7,'vanguard','small',{activeIds:[0,1]});for(const row of real.tiles)for(const t of row)Object.assign(t,{type:'floor',rank:0,hp:0,loot:null});Object.assign(real.units[0],{x:8,y:8,hp:1,shield:0});Object.assign(real.units[1],{x:20,y:20});resolve(real,[{type:'grenade',target:{x:8,y:8}}]);assert.equal(real.units[0].alive,false);
});
test('Eliminating the practice bot credits damage and kills, then respawns a fresh target without ending the arena',()=>{
  const s=P.createState(16),u=s.units[0];G.equipWeapon(s,u,'longshot');resolve(s,[{type:'shoot',angle:0},{type:'shoot',angle:0}]);assert.equal(s.units[1].alive,false);assert.equal(s.kills,1);assert.equal(s.phase,'planning');const report=P.afterTurn(s);assert.ok(report.respawned);assert.equal(s.units[1].alive,true);assert.equal(s.units[1].hp,100);assert.equal(s.units[1].burn,undefined);assert.equal(s.winner,null);assert.ok(G.distance(u,s.units[1])>=3);
});
test('Practice continues beyond collapse time, refills supplies and still offers live Fate drafts',()=>{
  const s=P.createState(22);s.tiles[3][3].rank=1000;
  for(let n=0;n<35;n++){resolve(s);P.afterTurn(s);if(G.FATE.open(s)){G.FATE.settle(s);s.phase='planning';}}
  assert.equal(s.turn,36);assert.equal(s.phase,'planning');assert.equal(s.tiles[3][3].type,'floor');assert.equal(s.safeLimit,100);assert.ok(s.fate.history.some(d=>d.turn===4));assert.ok(s.units[0].fateBuild.length);assert.equal(s.tiles[6][5].loot.type,'ammo');assert.equal(s.tiles[6][5].loot.taken,false);
});
test('The training bot wanders and shoots different seeded directions with legal plans',()=>{
  const angles=new Set(),moves=new Set();for(let n=0;n<25;n++){const s=P.createState(n),plan=P.botPlan(s);assert.equal(plan[1].type,'shoot');angles.add(plan[1].angle);if(plan[0].type==='move'){assert.equal(U.target(U.context(s,1,'move'),plan[0].target).ok,true);moves.add(JSON.stringify(plan[0].target));}assert.deepEqual(plan,P.botPlan(s));}assert.ok(angles.size>20);assert.ok(moves.size>=3);
});
test('Resetting practice HP preserves the real two-turn Molly burn',()=>{
  const s=P.createState(19,'pyro'),u=s.units[0];resolve(s,[{type:'firebomb',target:{x:u.x,y:u.y}}]);assert.equal(u.hp,14);P.afterTurn(s);assert.equal(u.hp,50);assert.equal(u.burn.remainingTicks,2);resolve(s);assert.equal(s.events.filter(e=>e.type==='damage'&&e.unitId===0&&e.reason==='burn').length,2);assert.equal(u.burn,undefined);P.afterTurn(s);assert.equal(u.hp,50);
});
