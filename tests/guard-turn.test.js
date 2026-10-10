const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine'),P=require('../practice'),R=require('../replay'),{validatePlan}=require('../multiplayer');
function arena(){const s=P.createState(73);Object.assign(s.units[1],{weapon:'pistol',ammo:8,weaponAmmo:{pistol:8},x:12,y:10});return s;}
function resolve(s,plan){G.beginTurn(s,plan);while(s.phase==='resolution')G.step(s);}
test('Guard protects Heal in the second action, remains active across tick 40, and expires before the next turn',()=>{
  const s=arena(),u=s.units[0],plan=[{type:'guard'},{type:'heal'}];assert.deepEqual(validatePlan(s,0,plan),plan);
  G.beginTurn(s,{0:plan,1:[{type:'wait'},{type:'shoot',angle:Math.PI}]});
  const archive=new R.MatchArchive();archive.begin(s);
  for(let i=0;i<79;i++){G.step(s);if(i>=1)assert.equal(u.guard,true,'tick '+s.tick);if(s.tick===40)assert.equal(archive.capture(s).units[0].guard,true);}
  assert.ok(s.events.some(e=>e.type==='heal'&&e.unitId===0));assert.equal(u.hp,68,'50 HP + 35 Heal − 17 guarded pistol damage');
  G.step(s);assert.equal(s.phase,'planning');assert.equal(u.guard,false);assert.equal(archive.capture(s).units[0].guard,false);archive.finish();
  resolve(s,{0:[{type:'wait'},{type:'wait'}],1:[{type:'shoot',angle:Math.PI},{type:'shoot',angle:Math.PI}]});assert.equal(u.hp,12,'next turn takes two full 28-damage hits');
});
test('Guard in the second slot starts then, while repeated Guard never stacks its reduction',()=>{
  for(const [plan,damage]of [[[{type:'wait'},{type:'guard'}],45],[[{type:'guard'},{type:'guard'}],34]]){
    const s=arena();s.units[0].hp=100;resolve(s,{0:plan,1:[{type:'shoot',angle:Math.PI},{type:'shoot',angle:Math.PI}]});assert.equal(s.units[0].hp,100-damage);assert.equal(s.units[0].guard,false);
  }
});
