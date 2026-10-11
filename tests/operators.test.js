const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine.js'),U=require('../tactics.js'),R=require('../replay.js'),{RoomHub,validatePlan}=require('../multiplayer.js');
function arena(character='pyro'){
  const s=G.createState(18,character,'district');
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});
  for(const u of s.units)Object.assign(u,{x:22,y:22,alive:u.id<2,hp:100,shield:0,weapon:'pistol',ammo:8});
  Object.assign(s.units[0],{x:5,y:5});Object.assign(s.units[1],{x:8,y:5});return s;
}
function resolve(s,plans){G.beginTurn(s,plans);while(s.phase==='resolution')G.step(s);return s.events;}

test('seven selectable operators have unique skills and bots use the same new classes',()=>{
  assert.equal(Object.keys(G.CLASSES).length,7);assert.equal(new Set(Object.values(G.CLASSES).map(c=>c.skillType)).size,7);
  const s=G.createState(42,'rook');assert.equal(s.units[0].class,'rook');assert.ok(s.units.some(u=>u.class==='pyro'));
  for(const character of Object.keys(G.CLASSES))assert.equal(G.createState(42,character).units[0].class,character);
});

test('Molly burns targets twice per resolution for two turns after leaving the impact area, without consuming grenades',()=>{
  const s=arena(),u=s.units[0],v=s.units[1],inventory=[u.ammo,u.grenades,u.smoke];
  const first=resolve(s,{0:[{type:'firebomb',target:{x:8,y:5}}],1:[{type:'guard'},{type:'guard'}]});
  assert.equal(v.hp,76);assert.equal(s.fires.length,0);assert.equal(v.burn.remainingTicks,2);assert.equal(u.skillCooldown,3);assert.deepEqual([u.ammo,u.grenades,u.smoke],inventory);
  assert.equal(first.filter(e=>e.type==='damage'&&e.unitId===1).length,2);
  Object.assign(v,{x:15,y:15});resolve(s,{});assert.equal(v.hp,52);assert.equal(s.fires.length,0);
  resolve(s,{});assert.equal(v.hp,52,'expired flames cannot damage a third turn');
});

test('Molly can burn its caster, leaves no floor hazard, and water prevents ignition at impact',()=>{
  const s=arena();s.units[1].x=22;s.units[1].y=22;s.tiles[4][4].type='water';s.tiles[4][5].type='wall';
  resolve(s,{0:[{type:'firebomb',target:{x:5,y:5}}]});assert.equal(s.units[0].hp,76);
  assert.equal(s.fires.length,0);resolve(s,{});assert.equal(s.units[0].hp,52);
  const wet=arena();wet.tiles[5][8].type='water';resolve(wet,{0:[{type:'firebomb',target:{x:8,y:5}}]});assert.equal(wet.units[1].hp,100);assert.equal(wet.units[1].burn,undefined);
});

test('escaping the planned fire area before its pulse avoids damage',()=>{
  const s=arena();const target={x:11,y:5};
  resolve(s,{0:[{type:'firebomb',target:{x:8,y:5}}],1:[{type:'move',path:G.pathfind(s,s.units[1],target,3),target}]});
  assert.equal(s.units[1].hp,100);assert.equal(s.units[1].x,11);
});

test('new skill previews and LAN validation agree on class, range, reservation and cooldown',()=>{
  const s=arena(),valid={type:'firebomb',target:{x:10,y:5}},c=U.context(s,0,'firebomb');
  assert.equal(U.target(c,valid.target).ok,true);assert.equal(U.target(c,{x:11,y:5}).code,'range');assert.equal(U.target(c,{x:5,y:5}).kind,'risky');
  assert.doesNotThrow(()=>validatePlan(s,0,[valid]));assert.throws(()=>validatePlan(s,0,[{...valid,target:{x:11,y:5}}]));
  assert.equal(U.availability(s,0,'firebomb',[valid]).code,'skillUsed');assert.throws(()=>validatePlan(s,0,[valid,valid]));
  s.units[0].skillCooldown=1;assert.equal(U.availability(s,0,'firebomb').code,'cooldown');assert.throws(()=>validatePlan(s,0,[valid]));
  s.units[0].class='rook';s.units[0].skillCooldown=0;assert.equal(U.availability(s,0,'firebomb').code,'class');assert.throws(()=>validatePlan(s,0,[valid]));
  assert.doesNotThrow(()=>validatePlan(s,0,[{type:'reflect'}]));assert.throws(()=>validatePlan(s,0,[{type:'reflect'},{type:'reflect'}]));
  const move={type:'move',target:{x:6,y:5}};s.units[0].class='pyro';assert.equal(U.target(U.context(s,0,'firebomb',[move]),{x:11,y:5}).ok,true);
});

test('Reflect Shield restores capped armor and returns bullets at full damage while absorbing 80 percent along their original rays',()=>{
  const s=arena('rook'),u=s.units[0],v=s.units[1];
  const events=resolve(s,{0:[{type:'reflect'}],1:[{type:'shoot',angle:Math.PI},{type:'shoot',angle:Math.PI}]});
  assert.equal(events.filter(e=>e.type==='reflected').length,2);assert.equal(v.hp,44);assert.equal(u.hp,100);assert.equal(u.shield,0);
  assert.equal(u.ammo,8,'countershot does not consume defender ammunition');assert.equal(u.skillCooldown,4);assert.equal(u.reflectCharges,0);
  const capped=arena('rook');capped.units[0].shield=35;resolve(capped,{0:[{type:'reflect'}]});assert.equal(capped.units[0].shield,40);
});

test('reflection expires at the next turn, and a sub-grid miss never consumes the shield charge',()=>{
  const s=arena('rook');resolve(s,{0:[{type:'reflect'}],1:[{type:'shoot',angle:Math.atan2(.7,-3)}]});assert.equal(s.events.some(e=>e.type==='reflected'),false);
  const events=resolve(s,{1:[{type:'shoot',angle:Math.PI}]});assert.equal(events.some(e=>e.type==='reflected'),false);assert.equal(s.units[0].hp,84);
});

test('reflectors cannot bounce one bullet indefinitely, and Firebomb bypasses reflection',()=>{
  const s=arena('rook');s.units[1].class='rook';resolve(s,{0:[{type:'reflect'},{type:'shoot',angle:0}],1:[{type:'reflect'},{type:'shoot',angle:Math.PI}]});
  assert.equal(s.events.filter(e=>e.type==='reflected').length,4);assert.equal(s.projectiles.length,0);
  const fire=arena('rook');fire.units[1].class='pyro';resolve(fire,{0:[{type:'reflect'}],1:[{type:'firebomb',target:{x:5,y:5}}]});
  assert.equal(fire.events.some(e=>e.type==='reflected'),false);assert.equal(fire.units[0].hp,88);
});

test('Pyro and Rook bots use their new skills through ordinary validated plans',()=>{
  for(const [character,type]of[['pyro','firebomb'],['rook','reflect']]){
    let used=false;for(let seed=0;seed<40;seed++){const s=arena(character);s.seed=seed;const plan=G.planBot(s,0);used ||= plan.some(a=>a.type===type);assert.doesNotThrow(()=>validatePlan(s,0,plan));}assert.ok(used,'Skill remains part of the weighted bot choices');
  }
});

test('movement warns about existing visible fire, but a planned Molly leaves no persistent hazard',()=>{
  const s=arena(),destination={x:6,y:5};s.fires=[{x:6,y:5,expires:3,owner:1}];
  assert.equal(U.target(U.context(s,0,'move'),destination).kind,'risky');
  const sight=new Set([G.key(5,5)]),hidden=U.target(U.context(s,0,'move',[],sight),destination);s.fires=[];
  assert.deepEqual(U.target(U.context(s,0,'move',[],sight),destination),hidden);
  assert.equal(U.target(U.context(s,0,'move',[{type:'firebomb',target:{x:7,y:5}}]),destination).kind,'valid');
});

test('LAN masks individual fire cells and hidden reflectors without leaking their owner or coordinates',()=>{
  const hub=new RoomHub(),a=hub.create({mapId:'district',character:'pyro',cinematic:false});hub.start(a.code,a.token);const room=hub.get(a.code,a.token).room;
  for(const row of room.state.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null});
  Object.assign(room.state.units[0],{x:5,y:5});Object.assign(room.state.units[1],{x:25,y:25,reflectTurn:1,reflectCharges:1});
  room.state.fires=[{x:14,y:5,expires:3,owner:1},{x:15,y:5,expires:3,owner:1}];
  const view=hub.view(room,room.members[0]);assert.deepEqual(view.fires,[{x:14,y:5,expires:3,owner:null}]);
  assert.equal(view.units[1].hidden,true);assert.equal(view.units[1].reflectCharges,undefined);assert.equal(view.units[1].reflectTurn,undefined);
});

test('replay snapshots preserve attached burns, shield activation and the reflected projectile owner',()=>{
  const s=arena('rook'),archive=new R.MatchArchive();G.beginTurn(s,{0:[{type:'reflect'}],1:[{type:'shoot',angle:Math.PI}]});archive.begin(s);
  while(s.phase==='resolution'){const events=G.step(s);archive.capture(s,events);}archive.finish();
  const frame=archive.frames().find(f=>f.events.some(e=>e.type==='reflected'));assert.ok(frame.projectiles.some(b=>b.owner===0));assert.equal(frame.units[0].reflectCharges,1);
  const fire=arena(),history=new R.MatchArchive();G.beginTurn(fire,{0:[{type:'firebomb',target:{x:8,y:5}}]});history.begin(fire);
  while(fire.tick<20){const events=G.step(fire);history.capture(fire,events);}
  const before=structuredClone(history.current.frames.at(-1).units[1].burn);assert.equal(before.remainingTicks,4);fire.units[1].burn.remainingTicks=1;assert.deepEqual(history.current.frames.at(-1).units[1].burn,before);assert.equal(history.current.frames.at(-1).fires.length,0);
});

test('STRIDER five-tile dash shares preview/server range and restores mobility after two turns',()=>{
 const s=arena('vanguard'),u=s.units[0];s.units[1].x=22;s.units[1].y=22;const a={type:'skillMove',target:{x:10,y:5}};
 assert.equal(G.moveRange(s,u),4);assert.equal(U.target(U.context(s,0,'skillMove'),a.target).ok,true);assert.throws(()=>validatePlan(s,0,[{...a,target:{x:11,y:5}}]));
 resolve(s,{0:validatePlan(s,0,[a])});assert.equal(u.x,10);assert.equal(u.skillCooldown,2);assert.ok(u.dodgeUntil>=34);assert.equal(U.availability(s,0,'skillMove').code,'cooldown');
 resolve(s,{});assert.equal(u.skillCooldown,1);resolve(s,{});assert.equal(U.availability(s,0,'skillMove').ok,true);
});
test('WRAITH phase shift crosses a four-tile Void gap with a circular five-tile limit',()=>{
 const s=arena('volt'),u=s.units[0];s.units[1].x=22;s.units[1].y=22;for(let x=6;x<10;x++)s.tiles[5][x].type='void';const a={type:'blink',target:{x:10,y:5}};
 assert.equal(U.target(U.context(s,0,'blink'),a.target).ok,true);assert.equal(U.target(U.context(s,0,'blink'),{x:10,y:6}).code,'range');assert.throws(()=>validatePlan(s,0,[{type:'blink',target:{x:10,y:6}}]));
 resolve(s,{0:validatePlan(s,0,[a])});assert.equal(u.x,10);assert.equal(u.skillCooldown,2);
});
test('AEGIS reflects all three burst bullets and takes only 20 percent damage',()=>{
 const s=arena('rook');Object.assign(s.units[1],{weapon:'rifle',ammo:15});const events=resolve(s,{0:[{type:'reflect'}],1:[{type:'shoot',angle:Math.PI}]});
 assert.equal(events.filter(e=>e.type==='reflected').length,3);assert.ok(events.some(e=>e.type==='damage'&&e.unitId===0));assert.equal(s.units[0].reflectCharges,0);
});
