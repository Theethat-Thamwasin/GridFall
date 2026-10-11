const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine'),F=G.FATE,U=require('../tactics'),M=require('../movement'),{validatePlan}=require('../multiplayer');
function arena(cls='vanguard'){
  const s=G.createState(53,cls,'medium',{activeIds:[0,1,2]});
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,roof:null,rank:0});
  for(const u of s.units)if(u.alive)Object.assign(u,{weapon:'rifle',ammo:15,weapons:['rifle','pistol'],weaponAmmo:{rifle:15,pistol:8}});
  Object.assign(s.units[0],{x:5,y:5,hp:100,shield:0});Object.assign(s.units[1],{x:23,y:23,shield:0});Object.assign(s.units[2],{x:25,y:25,shield:0});s.safeLimit=s.nextLimit=999;return s;
}
function resolve(s,plan=[]){s.phase='planning';G.beginTurn(s,{0:plan});while(s.phase==='resolution')G.step(s);assert.notEqual(s.phase,'clash');return s.events;}
test('Strider travels five water tiles while rooted and carrying movement curses; drag, click, server and combat agree',()=>{
  const s=arena(),u=s.units[0];F.add(s,0,'fortress');F.add(s,0,'marksman');s.fields=[{kind:'stasis',x:5,y:5,width:4,height:4,expires:4}];
  const path=Array.from({length:5},(_,i)=>({x:6+i,y:5}));for(const p of path)s.tiles[p.y][p.x].type='water';
  assert.equal(U.range(s,0,'move'),0);const c=U.context(s,0,'skillMove');assert.equal(c.range,5);const verdict=U.target(c,{x:10,y:5});assert.equal(verdict.ok,true);assert.equal(verdict.cost,5);
  const route=new M.Route(s,u,5,true);for(const p of path)assert.ok(route.append(p));assert.equal(route.remaining,0);assert.ok(route.action('skillMove'));
  const action={type:'skillMove',target:{x:10,y:5},path};const accepted=validatePlan(s,0,[action,{type:'move',target:{x:10,y:4}}]);assert.equal(U.range(s,0,'move',[action]),2);
  resolve(s,accepted);assert.deepEqual([u.x,u.y],[10,4]);assert.equal(u.skillCooldown,2);
  const blocked=arena();blocked.tiles[5][7].type='wall';assert.equal(G.validateRoute(blocked,blocked.units[0],path,5,{x:10,y:5},true),null);
});
test('Wraith executes two sequential Blinks, consumes both actions and waits two complete turns before reuse',()=>{
  const s=arena('volt'),u=s.units[0],first={type:'blink',target:{x:10,y:5}},second={type:'blink',target:{x:15,y:5}};
  assert.equal(U.availability(s,0,'blink',[first]).ok,true);assert.equal(U.project(s,0,[first]).skillUses,1);assert.equal(U.target(U.context(s,0,'blink',[first]),second.target).ok,true);
  const accepted=validatePlan(s,0,[first,second]);assert.throws(()=>validatePlan(s,0,[first,second,{type:'blink',target:{x:16,y:5}}]));assert.equal(U.availability(s,0,'blink',[first,second]).code,'ap');
  const events=resolve(s,accepted);assert.equal(events.filter(e=>e.type==='blink'&&e.unitId===0).length,2);assert.deepEqual([u.x,u.y],[15,5]);assert.equal(u.skillCooldown,2);
  for(const cooldown of [1,0]){assert.equal(U.availability(s,0,'blink').code,'cooldown');assert.throws(()=>validatePlan(s,0,[{type:'blink',target:{x:16,y:5}}]));resolve(s);assert.equal(u.skillCooldown,cooldown);}
  assert.equal(U.availability(s,0,'blink').ok,true);assert.doesNotThrow(()=>validatePlan(s,0,[{type:'blink',target:{x:16,y:5}}]));
});
test('using only one Wraith Blink also starts cooldown and each resolution resets the per-turn counter',()=>{
  const s=arena('volt'),u=s.units[0];resolve(s,[{type:'blink',target:{x:6,y:5}}]);assert.equal(u.blinkUses,1);assert.equal(u.skillCooldown,2);resolve(s);resolve(s);
  const events=resolve(s,[{type:'blink',target:{x:7,y:5}},{type:'blink',target:{x:8,y:5}}]);assert.equal(events.filter(e=>e.type==='blink').length,2);assert.equal(u.blinkUses,2);
});
test('Oracle gains 25 percent range for every gun in actual projectiles and queued Scan previews, then loses it on expiry',()=>{
  for(const [weapon,w]of Object.entries(G.WEAPONS)){
    const s=arena('deadeye'),u=s.units[0];Object.assign(u,{weapon,ammo:w.mag});const actions=[{type:'scan'},{type:'shoot',angle:0}];
    assert.equal(G.weaponStats(u).range,w.range);assert.equal(U.range(s,0,'shoot',[actions[0]]),w.range*1.25);assert.doesNotThrow(()=>validatePlan(s,0,actions));
    G.beginTurn(s,{0:actions});while(!s.events.some(e=>e.type==='shoot'))G.step(s);for(const b of s.projectiles.filter(b=>b.owner===0))assert.ok(Math.abs(b.left+b.traveled-w.range*1.25)<1e-9,weapon);
    while(s.phase==='resolution')G.step(s);assert.equal(u.scan,1);assert.equal(G.weaponStats(u).range,w.range*1.25);resolve(s);assert.equal(u.scan,0);assert.equal(U.range(s,0,'shoot'),w.range);
  }
  const other=arena();other.units[0].scan=2;assert.equal(G.weaponStats(other.units[0]).range,G.WEAPONS.rifle.range);
});
test('a mid-action Stasis landing immediately stops walking but leaves the later Shoot action usable',()=>{
  const s=arena('mire');Object.assign(s.units[1],{class:'vanguard',x:8,y:5});const moving={type:'move',path:[{x:9,y:5},{x:10,y:5},{x:11,y:5},{x:12,y:5}],target:{x:12,y:5}};
  G.beginTurn(s,{0:[{type:'stasis',target:{x:10,y:5}}],1:[moving,{type:'shoot',angle:Math.PI}]});while(s.phase==='resolution')G.step(s);
  assert.equal(s.units[1].x,11);assert.ok(s.events.some(e=>e.type==='blocked'&&e.unitId===1));assert.equal(s.events.filter(e=>e.type==='shoot'&&e.unitId===1).length,3);
});
test('Final Volley applies to every bullet of the last Shoot and magazines gain or lose whole Shoot actions for all weapons',()=>{
  for(const [weapon,w]of Object.entries(G.WEAPONS)){
    const s=arena(),u=s.units[0];u.weapon=weapon;F.add(s,0,'last-bullet');assert.equal(G.weaponStats(u).mag,w.mag-w.shots);
    F.add(s,0,'extended-mag');assert.equal(G.weaponStats(u).mag,w.mag);
    u.ammo=w.shots;G.beginTurn(s,{0:[{type:'shoot',angle:0}]});const multipliers=[];while(s.phase==='resolution'){G.step(s);for(const b of s.projectiles.filter(b=>b.born===s.tick-1))multipliers.push(b.multiplier);}
    assert.ok(multipliers.length>=w.shots,weapon);assert.ok(multipliers.every(m=>Math.abs(m-1.35)<1e-9),weapon);assert.equal(u.ammo,0);
  }
});
test('all six Fate combinations activate once, retain curses and deactivate when a required blessing moves or is removed',()=>{
  assert.equal(F.COMBOS.length,6);for(const combo of F.COMBOS){const s=arena(),u=s.units[0],first=F.add(s,0,combo.requires[0]);assert.equal(F.combinations(u).length,0);const second=F.add(s,0,combo.requires[1]);assert.equal(F.combinations(u).filter(c=>c.id===combo.id).length,1);assert.ok(first.curse&&second.curse);
    const m=F.stats(u),without=F.stats({...u,fateBuild:u.fateBuild.map(e=>e===second?{...e,bless:false}:e)});for(const key of Object.keys(combo.plus))assert.ok(m[key]>without[key],combo.id+' '+key);
    F.add(s,0,combo.requires[0]);assert.equal(F.combinations(u).filter(c=>c.id===combo.id).length,1);for(const e of u.fateBuild.filter(e=>e.cardId===combo.requires[0]))e.bless=false;assert.equal(F.combinations(u).filter(c=>c.id===combo.id).length,0);
    s.units[1].fateBuild.push(...u.fateBuild.splice(0));assert.equal(F.combinations(u).length,0);
  }
});
test('combination reload, Smoke, grenade, Slash, final-volley and pickup bonuses affect real actions',()=>{
  const reload=arena();for(const id of ['fortress','quickloader'])F.add(reload,0,id);reload.units[0].shield=0;reload.units[0].ammo=0;resolve(reload,[{type:'reload'}]);assert.equal(reload.units[0].shield,16);assert.equal(F.stats(reload.units[0]).maxHp,90);
  const smoke=arena();for(const id of ['smoke-medic','field-surgeon'])F.add(smoke,0,id);Object.assign(smoke.units[0],{hp:40,shield:10});resolve(smoke,[{type:'smoke',target:{x:5,y:5}}]);assert.equal(smoke.units[0].hp,55);assert.equal(smoke.units[0].shield,5);
  const grenade=arena();for(const id of ['demolitionist','volatile'])F.add(grenade,0,id);Object.assign(grenade.units[1],{x:9,y:5});resolve(grenade,[{type:'grenade',target:{x:9,y:5}}]);assert.equal(grenade.units[1].hp,30);assert.equal(grenade.units[0].hp,92);
  const melee=arena();for(const id of ['berserker','duelist'])F.add(melee,0,id);Object.assign(melee.units[0],{hp:40});Object.assign(melee.units[1],{x:6,y:5});resolve(melee,[{type:'slash',angle:0}]);assert.equal(melee.units[1].hp,35);assert.equal(melee.units[0].shield,15);
  const gun=arena();for(const id of ['glass-cannon','last-bullet'])F.add(gun,0,id);Object.assign(gun.units[0],{ammo:3});Object.assign(gun.units[1],{x:8,y:5,hp:200});const damage=resolve(gun,[{type:'shoot',angle:0}]).filter(e=>e.type==='damage'&&e.unitId===1);assert.deepEqual(damage.map(e=>e.amount),[27,27,27]);
  const loot=arena();for(const id of ['scavenger','extended-mag'])F.add(loot,0,id);loot.tiles[5][6].loot={type:'ammo'};const before=loot.units[0].reserve;resolve(loot,[{type:'move',target:{x:6,y:5},path:[{x:6,y:5}]}]);assert.equal(loot.units[0].reserve,before+24+9);
});
test('scaled contracts scale combination bonuses and curse-only contracts cannot unlock combinations',()=>{
  const s=arena();for(const id of ['fortress','quickloader'])F.add(s,0,id,.75);assert.equal(F.combinations(s.units[0])[0].scale,.75);assert.equal(F.stats(s.units[0]).reloadShield,12);
  s.units[0].fateBuild[0].bless=false;assert.equal(F.combinations(s.units[0]).length,0);assert.equal(F.stats(s.units[0]).reloadShield,9);
});
test('new timing, ammo, armor and melee cards change real actions and paired drawbacks; grenade tax only charges grenades',()=>{
  const s=arena();F.add(s,0,'steady-hands');F.add(s,0,'extended-mag');const u=s.units[0];u.ammo=0;G.beginTurn(s,{0:[{type:'reload'},{type:'shoot',angle:0}]});assert.equal(s.schedule.find(e=>e.type==='reload').at,12);assert.equal(G.moveRange(s,u),3);assert.equal(s.schedule.find(e=>e.type==='shoot').at,54);assert.equal(F.stats(u).recoil,.75);while(s.phase==='resolution')G.step(s);assert.equal(u.ammo,15);
  const cache=arena(),cached=cache.units[0];F.add(cache,0,'ammo-cache');cached.ammo=0;const forecast=U.project(cache,0,[{type:'reload'}]);assert.equal(forecast.reserve,53);resolve(cache,[{type:'reload'}]);assert.equal(cached.reserve,53);assert.equal(F.stats(cached).recoil,1.2);cached.ammo=14;const reserve=cached.reserve;resolve(cache,[{type:'reload'}]);assert.equal(cached.reserve,reserve);resolve(cache,[{type:'reload'}]);assert.equal(cached.reserve,reserve);
  const skin=arena();F.add(skin,0,'thick-skin');assert.equal(skin.units[0].hp,100);skin.units[0].hp=100;resolve(skin,[{type:'heal'}]);assert.equal(skin.units[0].hp,120);assert.equal(F.stats(skin.units[0]).heal,25);
  const edge=arena();F.add(edge,0,'heavy-edge');Object.assign(edge.units[1],{x:6,y:5});resolve(edge,[{type:'slash',angle:0}]);assert.equal(edge.units[1].hp,45);assert.equal(F.stats(edge.units[0]).shield,25);
  const guard=arena();F.add(guard,0,'counterweight');G.beginTurn(guard,{0:[{type:'guard'},{type:'shoot',angle:0}]});assert.equal(guard.schedule.find(e=>e.type==='shoot').at,55);while(guard.phase==='resolution')G.step(guard);assert.equal(guard.units[0].shield,5);
  const panic=arena();F.add(panic,0,'panic-fire');Object.assign(panic.units[1],{x:8,y:5});const panicEvents=resolve(panic,[{type:'shoot',angle:0}]);assert.equal(panicEvents.find(e=>e.type==='shoot').tick,8);assert.equal(panic.units[1].hp,58);
  const battery=arena();F.add(battery,0,'smoke-battery');battery.units[0].hp=80;resolve(battery,[{type:'smoke',target:{x:5,y:5}}]);assert.equal(battery.units[0].hp,85);assert.equal(F.stats(battery.units[0]).maxHp,90);
  const pyro=arena('pyro');F.add(pyro,0,'volatile');resolve(pyro,[{type:'firebomb',target:{x:10,y:5}}]);assert.equal(pyro.units[0].hp,100);pyro.units[0].skillCooldown=0;resolve(pyro,[{type:'grenade',target:{x:10,y:5}}]);assert.equal(pyro.units[0].hp,92);
});
