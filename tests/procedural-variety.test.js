const test=require('node:test'),assert=require('node:assert/strict'),G=require('../engine');
function loot(s){return s.tiles.flatMap((row,y)=>row.flatMap((t,x)=>t.loot?[{x,y,...t.loot}]:[]));}
test('every map randomizes structures, cover and items across seeds, while each fixed seed reproduces them exactly',()=>{
  for(const id of Object.keys(G.MAPS)){
    const structures=new Set(),items=new Set(),spawnWeapons=new Set(),roofs=new Set();
    for(let seed=0;seed<40;seed++){
      const s=G.createState(seed,'vanguard',id);structures.add(JSON.stringify(s.tiles.map(row=>row.map(t=>[t.type,t.hp,t.roof]))));items.add(JSON.stringify(loot(s)));spawnWeapons.add(JSON.stringify(s.units.map(u=>s.tiles[u.y][u.x+2].loot.weapon)));roofs.add(JSON.stringify(s.roofs));
      assert.deepEqual(s,G.createState(seed,'vanguard',id));assert.ok(s.tiles.flat().some(t=>t.type==='cover'));assert.ok(s.tiles.flat().some(t=>t.type==='barricade'));for(const u of s.units){assert.equal(u.weapon,'pistol');assert.deepEqual(u.weapons,['pistol']);}
    }
    assert.equal(structures.size,40,id+' structures');assert.equal(items.size,40,id+' items');if(id!=='skybridge')assert.ok(spawnWeapons.size>20,id+' weapon assignments');if(id==='meadow')assert.ok(roofs.size>30,'roofs vary across the map rather than staying at fixed positions');
  }
});
