const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine'),P=require('../practice'),R=require('../replay'),{RoomHub}=require('../multiplayer');
function arena(){
  const s=G.createState(123,'vanguard','small',{activeIds:[0,1]});
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',rank:0,hp:0,loot:null});
  Object.assign(s.units[0],{x:3,y:3});Object.assign(s.units[1],{x:20,y:20});
  s.beacon={x:15,y:15,cooldown:0};s.safeLimit=s.nextLimit=999;return s;
}
function resolve(s,plans={}){G.beginTurn(s,plans);while(s.phase==='resolution')G.step(s);}
const items=s=>s.tiles.flatMap((row,y)=>row.flatMap((t,x)=>t.loot&&!t.loot.taken?[{x,y,...t.loot}]:[]));
test('every real operator begins with only P9 across all maps, teams and character choices',()=>{
  for(const map of Object.keys(G.MAPS))for(const character of Object.keys(G.CLASSES))for(const mode of ['ffa','team']){
    const s=G.createState(23,character,map,{mode});
    for(const u of s.units){assert.equal(u.weapon,'pistol');assert.equal(u.ammo,8);assert.deepEqual(u.weapons,['pistol']);assert.deepEqual(u.weaponAmmo,{pistol:8});assert.equal(G.equipWeapon(s,u,'rifle'),false);}
    assert.ok(items(s).some(e=>e.type==='weapon'&&e.weapon==='rifle'));
  }
  const practice=P.createState(1);assert.deepEqual(practice.units[0].weapons,Object.keys(G.WEAPONS));
});
test('humans and bots receive P9 from the server and cannot equip a gun before collecting it',()=>{
  const hub=new RoomHub(),a=hub.create(),b=hub.join(a.code);hub.start(a.code,a.token);
  const room=hub.get(a.code,a.token).room;
  for(const u of room.state.units.filter(u=>u.alive))assert.deepEqual(u.weapons,['pistol']);
  for(const m of [a,b]){
    const self=hub.view(room,room.members.find(p=>p.id===m.playerId)).units[m.playerId];
    assert.equal(self.weapon,'pistol');assert.equal(self.ammo,8);assert.deepEqual(self.weapons,['pistol']);
    assert.throws(()=>hub.command(a.code,m.token,{action:'equip',turn:1,weapon:'rifle'}));
  }
});
test('full drops include two Medkits and scatter unique items only on surviving safe dry empty tiles',()=>{
  for(const map of Object.keys(G.MAPS))for(let seed=0;seed<16;seed++){
    const s=G.createState(seed,'vanguard',map),before=structuredClone(s.tiles);s.turn=5;
    const count=G.dropSupply(s),added=items(s).filter(p=>JSON.stringify(before[p.y][p.x].loot)!==JSON.stringify(s.tiles[p.y][p.x].loot));
    assert.equal(count,10);assert.equal(added.length,10);assert.equal(added.filter(p=>p.type==='medkit').length,2);
    assert.equal(added.filter(p=>p.weapon==='trident').length,1);
    assert.equal(new Set(added.map(p=>G.key(p.x,p.y))).size,count);
    for(const p of added){assert.ok(G.passable(s,p.x,p.y));assert.notEqual(s.tiles[p.y][p.x].type,'water');assert.ok(s.tiles[p.y][p.x].rank<=s.safeLimit);assert.ok(!s.units.some(u=>u.alive&&u.x===p.x&&u.y===p.y));assert.notDeepEqual({x:p.x,y:p.y},{x:s.beacon.x,y:s.beacon.y});}
    for(const p of items({tiles:before}))assert.deepEqual(s.tiles[p.y][p.x].loot,before[p.y][p.x].loot);
  }
});
test('sparse islands get every available drop slot, without using fallen or unsafe platforms',()=>{
  for(let seed=0;seed<20;seed++){
    const s=arena();s.seed=seed;s.turn=10;s.safeLimit=1;
    for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'void',rank:0,loot:null,fellTurn:2});
    for(const [x,y]of [[5,5],[6,5],[7,5],[8,5],[9,5],[10,5]])Object.assign(s.tiles[y][x],{type:'floor',fellTurn:undefined});
    s.tiles[5][7].type='water';s.tiles[5][8].rank=2;s.tiles[5][9].loot={type:'shield',taken:false};Object.assign(s.units[0],{x:10,y:5});
    assert.equal(G.dropSupply(s),2);assert.deepEqual(new Set([s.tiles[5][5].loot.type,s.tiles[5][6].loot.type]),new Set(['weapon','medkit']));
    assert.equal(s.tiles[5][8].loot,null);assert.deepEqual(s.tiles[5][9].loot,{type:'shield',taken:false});assert.equal(G.dropSupply(s),0);
  }
});
test('supply positions vary across seeds, reproduce exactly, and remain safe after actual collapse',()=>{
  const signatures=new Set();for(let seed=0;seed<12;seed++){
    const s=arena();s.seed=seed;s.turn=4;s.safeLimit=1;
    for(const row of s.tiles)for(const t of row)t.rank=2;
    for(let y=2;y<=22;y++)for(let x=2;x<=22;x++)s.tiles[y][x].rank=0;
    const copy=structuredClone(s);resolve(s);resolve(copy);assert.deepEqual(s.tiles,copy.tiles);assert.deepEqual(s.beacon,copy.beacon);
    const drops=items(s);assert.equal(drops.length,10);for(const p of drops)assert.notEqual(s.tiles[p.y][p.x].type,'void');
    signatures.add(JSON.stringify(drops.map(({x,y})=>[x,y])));
  }
  assert.ok(signatures.size>1);
});
test('dropped Medkits become usable next turn and restore actual HP with Heal',()=>{
  const s=arena(),u=s.units[0];u.medkits=0;u.hp=30;G.dropSupply(s);
  const medkit=items(s).find(p=>p.type==='medkit');Object.assign(u,{x:medkit.x-1,y:medkit.y});
  G.beginTurn(s,{0:[{type:'move',target:medkit,path:[{x:medkit.x,y:medkit.y}]},{type:'heal'}]});
  while(s.phase==='resolution')G.step(s);assert.equal(u.hp,30);assert.equal(u.medkits,1);
  resolve(s,{0:[{type:'heal'}]});assert.equal(u.hp,65);assert.equal(u.medkits,0);
});
test('Beacon starts at seeded random reachable locations away from actors and existing loot',()=>{
  for(const map of Object.keys(G.MAPS)){
    const positions=new Set();for(let seed=0;seed<18;seed++){
      const s=G.createState(seed,'vanguard',map),b=s.beacon,t=G.tile(s,b.x,b.y);
      assert.ok(t&&G.passable(s,b.x,b.y));assert.notEqual(t.type,'water');assert.equal(t.loot,null);
      for(const u of s.units){assert.ok(G.cheb(u,b)>=4);assert.ok(G.pathfind(s,u,b,1000));}
      assert.deepEqual(b,G.createState(seed,'volt',map).beacon);positions.add(G.key(b.x,b.y));
    }
    assert.ok(positions.size>1,map);
  }
});
test('Beacon grants a delayed capped Medkit and relocates when its recharge finishes',()=>{
  const s=arena(),u=s.units[0];s.beacon={x:4,y:3,cooldown:0};u.medkits=0;u.grenades=0;u.shield=0;
  G.beginTurn(s,{0:[{type:'move',target:{x:4,y:3},path:[{x:4,y:3}]}]});
  for(let i=0;i<30;i++)G.step(s);assert.equal(u.medkits,0);assert.ok(u.pendingPickups.some(p=>p.type==='supply'));
  while(s.phase==='resolution')G.step(s);assert.equal(u.medkits,1);assert.equal(u.reserve,90);assert.equal(u.shield,20);assert.equal(u.grenades,1);
  const old={x:s.beacon.x,y:s.beacon.y};for(let i=0;i<4;i++)resolve(s);
  assert.equal(s.beacon.cooldown,0);assert.notDeepEqual({x:s.beacon.x,y:s.beacon.y},old);assert.ok(s.events.some(e=>e.type==='beaconMove'));
  u.medkits=3;u.pendingPickups=[{type:'supply',availableTurn:s.turn+1}];resolve(s);assert.equal(u.medkits,3);
});
test('collapsed Beacon relocates to surviving ground and network/replay retain the same new location',()=>{
  const s=arena();s.safeLimit=1;s.beacon.cooldown=3;s.tiles[s.beacon.y][s.beacon.x].rank=2;
  const old={...s.beacon},copy=structuredClone(s),archive=new R.MatchArchive();G.beginTurn(s,{});archive.begin(s);
  while(s.phase==='resolution'){const events=G.step(s);archive.capture(s,events);}resolve(copy);
  assert.equal(s.tiles[old.y][old.x].type,'void');assert.ok(G.passable(s,s.beacon.x,s.beacon.y));assert.equal(s.beacon.cooldown,2);assert.deepEqual(s.beacon,copy.beacon);
  assert.deepEqual(archive.current.frames.at(-1).beacon,s.beacon);
  const hub=new RoomHub(),a=hub.create();hub.start(a.code,a.token);const room=hub.get(a.code,a.token).room;room.state=s;
  const view=hub.view(room,room.members[0],s.events.filter(e=>e.type==='beaconMove'));assert.deepEqual(view.beacon,s.beacon);assert.equal(view.events[0].type,'beaconMove');
});
test('Beacon stays unavailable with no eligible tile, then recovers when safe space opens',()=>{
  const s=arena();for(const row of s.tiles)for(const t of row)t.type='void';
  for(const u of s.units.filter(u=>u.alive))s.tiles[u.y][u.x].type='floor';
  resolve(s);assert.deepEqual({x:s.beacon.x,y:s.beacon.y},{x:-100,y:-100});
  s.tiles[8][8].type='floor';resolve(s);assert.deepEqual({x:s.beacon.x,y:s.beacon.y},{x:8,y:8});
  s.beacon.cooldown=1;resolve(s);assert.deepEqual({x:s.beacon.x,y:s.beacon.y},{x:8,y:8},'retain the only eligible tile on recharge');
});
