const test=require('node:test'),assert=require('node:assert/strict'),G=require('../engine');
function arena(){const s=G.createState(22,'vanguard','small',{activeIds:[0,1]});for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});Object.assign(s.units[0],{x:6,y:6,hp:100,shield:0,weapon:'rifle',ammo:15,weapons:['rifle','pistol'],weaponAmmo:{rifle:15,pistol:8}});Object.assign(s.units[1],{x:9,y:6,hp:100,shield:0});return s;}
function resolve(s,actions){G.beginTurn(s,{0:actions});while(s.phase==='resolution')G.step(s);}
test('Tactical Reload restores shield on a real reload and reduces maximum HP, with no free full-magazine shield',()=>{
  const s=arena(),u=s.units[0];G.FATE.add(s,0,'quickloader');assert.equal(u.hp,90);u.ammo=0;resolve(s,[{type:'reload'}]);assert.equal(u.ammo,15);assert.equal(u.shield,12);s.phase='planning';resolve(s,[{type:'reload'}]);assert.equal(u.shield,12);
});
test('Opening Shot adds damage to the first bullet only, and every Shoot action pays its HP cost',()=>{
  const s=arena(),u=s.units[0];G.FATE.add(s,0,'overclock');resolve(s,[{type:'shoot',angle:0}]);assert.equal(s.units[1].hp,44);assert.equal(u.hp,96);assert.deepEqual(s.events.filter(e=>e.type==='damage'&&e.unitId===1).map(e=>e.amount),[24,16,16]);
});
test('Sentinel trades weaker Medkits for actual Guard shield; Marksman trades movement for damage',()=>{
  const s=arena(),u=s.units[0];G.FATE.add(s,0,'sentinel');u.hp=40;resolve(s,[{type:'guard'},{type:'heal'}]);assert.equal(u.shield,8);assert.equal(u.hp,65);G.FATE.add(s,0,'marksman');assert.equal(G.moveRange(s,u),3);s.phase='planning';resolve(s,[{type:'shoot',angle:0}]);assert.equal(s.units[1].hp,46);
});
test('Gift provides an immediate benefit and Curse Transfer now charges a permanent HP cost',()=>{
  for(const id of ['gift','curse-transfer']){const s=arena(),u=s.units[0];s.turn=16;if(id==='curse-transfer')G.FATE.add(s,0,'blood-runner');G.FATE.open(s);s.fate.draft.offers[0]=[{id,rewards:['fortress']}];G.FATE.pick(s,0,{turn:16,cardId:id,targetId:1,entryId:u.fateBuild[0]?.uid});G.FATE.settle(s);if(id==='gift'){assert.equal(u.shield,20);assert.ok(s.units[1].fateBuild.some(e=>e.cardId==='fortress'&&e.bless&&e.curse));}else{assert.equal(G.FATE.stats(u).maxHp,90);assert.equal(u.hp,90);}}
});
test('Normal offers skip cards whose benefit or cost has already reached its cap',()=>{
  for(const cardId of ['fortress','field-surgeon','quickloader','marksman'])for(let seed=0;seed<35;seed++){
    const s=arena(),u=s.units[0];s.seed=seed;s.turn=8;for(let n=0;n<15;n++)G.FATE.add(s,0,cardId);u.shield=G.FATE.stats(u).shield;G.FATE.open(s);assert.ok(s.fate.draft.offers[0].every(o=>o.id!==cardId),cardId);
  }
});
