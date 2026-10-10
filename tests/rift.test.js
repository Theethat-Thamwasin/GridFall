const test=require('node:test'),assert=require('node:assert/strict'),G=require('../engine.js');
test('Large procedural map randomizes size, shape, supplies and routes while every initial platform and spawn stays safe',()=>{
 const dims=new Set(),shapes=new Set(),loot=new Set();for(let seed=0;seed<200;seed++){
  const s=G.createState(seed,'vanguard','rift');dims.add(s.width+'x'+s.height);shapes.add(s.layout.style);loot.add(s.tiles.flat().filter(t=>t.loot).length);
  assert.deepEqual(s,G.createState(seed,'vanguard','rift'));assert.ok(s.tiles.flat().every(t=>t.type==='void'||t.rank<=s.safeLimit));assert.equal(s.units.length,8);
  for(const u of s.units){assert.ok(G.passable(s,u.x,u.y));for(const v of s.units)if(v.id!==u.id)assert.ok(G.distance(u,v)>=8);}
  for(const limit of [s.maxZoneRank*.3,s.maxZoneRank*.7]){const pending=[s.zoneCenter],seen=new Set([G.key(s.zoneCenter.x,s.zoneCenter.y)]);for(let i=0;i<pending.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:pending[i].x+dx,y:pending[i].y+dy},t=G.tile(s,p.x,p.y),k=G.key(p.x,p.y);if(t&&G.passable(s,p.x,p.y)&&t.rank<=limit&&!seen.has(k)){seen.add(k);pending.push(p);}}let count=0;for(const row of s.tiles)for(const t of row)if(!['void','wall','barricade'].includes(t.type)&&t.rank<=limit)count++;assert.equal(seen.size,count);}
 }
 assert.ok(dims.size>=12);assert.equal(shapes.size,4);assert.ok(loot.size>=4);
});
test('Large procedural map still collapses platforms, removes supplies and eliminates through shields',()=>{
 const s=G.createState(7,'vanguard','rift'),u=s.units[0];s.safeLimit=G.tile(s,u.x,u.y).rank-.1;u.shield=40;G.finishTurn(s);assert.equal(u.alive,false);assert.equal(G.tile(s,u.x,u.y).type,'void');assert.equal(G.tile(s,u.x,u.y).loot,null);assert.ok(s.events.some(e=>e.type==='fall'&&e.unitId===u.id));
});
