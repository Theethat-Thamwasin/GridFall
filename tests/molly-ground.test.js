const test=require('node:test'),assert=require('node:assert/strict'),G=require('../engine'),{RoomHub}=require('../multiplayer'),R=require('../replay');
function arena(mode='ffa'){
  const s=G.createState(123,'pyro','small',{activeIds:[0,1,2],mode,teams:{0:'A',1:'A',2:'B'}});
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',rank:0,hp:0,loot:null,roof:null});
  for(const u of s.units)if(u.alive)Object.assign(u,{x:u.id===0?5:u.id===1?8:18,y:u.id===2?18:5,shield:0,hp:100});s.safeLimit=s.nextLimit=999;return s;
}
function resolve(s,plans={}){G.beginTurn(s,plans);while(s.phase==='resolution')G.step(s);assert.notEqual(s.phase,'clash');return s.events;}
const cast={type:'firebomb',target:{x:8,y:5}};
test('standing on the same Molly for both rounds gives four 18 damage ticks, without re-igniting after the final tick',()=>{
  const s=arena();resolve(s,{0:[cast]});assert.equal(s.fires.length,16);assert.equal(s.units[1].hp,64);
  const second=resolve(s);assert.equal(s.units[1].hp,28);assert.equal(second.filter(e=>e.type==='damage'&&e.unitId===1).length,2);assert.ok(second.filter(e=>e.type==='damage').every(e=>e.amount===18));assert.equal(s.fires.length,0);
  resolve(s);assert.equal(s.units[1].hp,28);assert.equal(s.units[1].burn,undefined);
});
test('leaving one cell and re-entering another cell of the same Molly cannot refresh its burn',()=>{
  const s=arena();resolve(s,{0:[cast],1:[{type:'wait'},{type:'move',target:{x:11,y:5},path:[{x:9,y:5},{x:10,y:5},{x:11,y:5}]}]});assert.equal(s.units[1].hp,64);assert.equal(s.units[1].x,11);
  resolve(s,{1:[{type:'move',target:{x:9,y:5},path:[{x:10,y:5},{x:9,y:5}]}]});assert.equal(s.units[1].hp,28);resolve(s);assert.equal(s.units[1].hp,28);
});
test('a new entrant ignites in round two and keeps burning after ground fire expires',()=>{
  const s=arena();Object.assign(s.units[1],{x:11,y:6});resolve(s,{0:[cast]});assert.equal(s.units[1].burn,undefined);
  resolve(s,{1:[{type:'move',target:{x:9,y:6},path:[{x:10,y:6},{x:9,y:6}]}]});assert.equal(s.units[1].hp,64);assert.equal(s.units[1].burn.remainingTicks,2);assert.equal(s.fires.length,0);Object.assign(s.units[1],{x:15,y:15});resolve(s);assert.equal(s.units[1].hp,28);
});
test('overlapping Molly casts never stack or refresh an existing burn, but a later fresh cast can ignite again',()=>{
  const s=arena();s.units[1].class='pyro';resolve(s,{0:[cast],1:[cast]});assert.equal(s.units[1].hp,64);assert.equal(s.units[1].burn.owner,0);assert.equal(s.fires.length,32);resolve(s);assert.equal(s.units[1].hp,28);resolve(s);s.units[1].hp=100;s.units[0].skillCooldown=0;resolve(s,{0:[cast]});assert.equal(s.units[1].hp,64);assert.equal(s.units[1].burn.remainingTicks,2);
});
test('ground fire excludes water, walls and fallen cells, preserves self damage and protects allies on entry',()=>{
  const dry=arena();dry.tiles[4][7].type='water';dry.tiles[4][8].type='wall';dry.tiles[4][9].type='void';resolve(dry,{0:[cast]});assert.equal(dry.fires.length,13);assert.ok(dry.fires.every(f=>G.passable(dry,f.x,f.y)&&G.tile(dry,f.x,f.y).type!=='water'));
  const s=arena('team');Object.assign(s.units[1],{x:11,y:6});resolve(s,{0:[cast]});resolve(s,{1:[{type:'move',target:{x:9,y:6},path:[{x:10,y:6},{x:9,y:6}]}]});assert.equal(s.units[1].hp,100);assert.equal(s.units[1].burn,undefined);
});
test('online fire cells never expose the shared hit history and replay preserves each ground-fire frame',()=>{
  const s=arena(),hub=new RoomHub(),host=hub.create();hub.start(host.code,host.token);const room=hub.get(host.code,host.token).room;room.state=s;room.baseTerrain=structuredClone(s.tiles);room.knowledge.clear();resolve(s,{0:[cast]});
  const view=hub.view(room,room.members[0]);assert.ok(view.fires.length>0);for(const f of view.fires){assert.equal(f.ignited,undefined);assert.equal(f.castId,undefined);}
  const archive=new R.MatchArchive();archive.begin(view);view.fires.length=0;assert.ok(archive.current.frames[0].fires.length>0);
});
test('Halo restores 16 shield each round for two rounds, capped normally and only to allies in Team Mode',()=>{
  const s=arena('team');s.units[0].class='halo';Object.assign(s.units[0],{hp:50});Object.assign(s.units[1],{x:6,y:5,hp:50});Object.assign(s.units[2],{x:6,y:6,hp:50});
  resolve(s,{0:[{type:'mend',target:{x:5,y:5}}]});assert.equal(s.units[1].hp,66);assert.equal(s.units[1].shield,16);assert.equal(s.units[2].hp,50);assert.equal(s.units[2].shield,0);
  resolve(s);assert.equal(s.units[1].hp,82);assert.equal(s.units[1].shield,32);resolve(s);assert.equal(s.units[1].shield,32);
});
