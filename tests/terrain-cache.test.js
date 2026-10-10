const test=require('node:test'),assert=require('node:assert/strict'),G=require('../engine'),{RoomHub}=require('../multiplayer'),{TerrainWire}=require('../wire');
const clone=value=>structuredClone(value);
function legacyTerrain(room,member,visible,lit,knowledge){const s=room.state;return s.tiles.map((row,y)=>row.map((tile,x)=>{if(lit.has(G.key(x,y)))knowledge[y][x]={...clone(tile),loot:null};return{...knowledge[y][x],rank:tile.rank,...(tile.rank>s.safeLimit?{type:'void',hp:0,fellTurn:tile.fellTurn}:{}),loot:tile.rank<=s.safeLimit&&visible.has(G.key(x,y))?clone(tile.loot):null};}));}
test('cached player terrain matches the previous filtering rules through visibility, loot, destruction, roofs, Smoke and collapse',()=>{
  for(const map of ['medium','large','meadow']){
    const hub=new RoomHub(),host=hub.create({mapId:map}),guest=hub.join(host.code,{});hub.start(host.code,host.token);const room=hub.rooms.get(host.code),member=room.members[0],s=room.state,knowledge=clone(room.knowledge.get(member.id));
    const origin={x:s.units[0].x,y:s.units[0].y},tile=s.tiles[origin.y][origin.x],oldFrames=[];
    const operations=[()=>{},()=>tile.loot={type:'weapon',weapon:'rifle',taken:false},()=>tile.loot.taken=true,()=>tile.hp=17,()=>tile.type='rubble',()=>tile.roof=1,()=>s.smokes.push({x:origin.x,y:origin.y,expires:20}),()=>s.units[0].scan=2,()=>s.units[0].x=Math.min(s.width-2,origin.x+4),()=>tile.loot={type:'shield',taken:false},()=>tile.rank=s.safeLimit+1,()=>tile.fellTurn=s.turn,()=>s.units[0].alive=false,()=>member.spectating=guest.playerId,()=>s.smokes=[],()=>s.units[1].scan=2,()=>tile.fellTurn=s.turn+1];
    for(const change of operations){change();const before=oldFrames.map(frame=>JSON.stringify(frame)),view=hub.view(room,member),expected=legacyTerrain(room,member,new Set(view.visibleCells),new Set(view.litCells),knowledge);assert.deepEqual(view.tiles,expected,map);for(let i=0;i<oldFrames.length;i++)assert.equal(JSON.stringify(oldFrames[i]),before[i],'old frames stay unchanged');oldFrames.push(view.tiles);}
    const first=hub.view(room,member),same=hub.view(room,member);assert.equal(first.tiles[0][0],same.tiles[0][0],'unchanged cells reuse immutable values');assert.ok(Object.isFrozen(same.tiles));assert.ok(Object.isFrozen(same.tiles[0]));
  }
});
test('delta fingerprints detect changes in mutable and shallow-frozen tiles and preserve reconnect snapshots',()=>{
  const wire=new TerrainWire(),loot={type:'ammo',taken:false},tile=Object.freeze({type:'floor',loot}),packet={type:'state',state:{tiles:[[tile]]}};
  wire.encode(packet);loot.taken=true;assert.deepEqual(wire.encode(packet).tileChanges,[[0,0,tile]],'shallow freeze cannot hide a mutable nested change');
  const safe=Object.freeze({type:'floor',loot:Object.freeze({type:'ammo',taken:true})}),next={type:'state',state:{tiles:[[safe]]}};wire.encode(next);assert.deepEqual(wire.encode(next).tileChanges,[]);assert.ok(wire.encode({...next,init:true}).state.tiles);
});
