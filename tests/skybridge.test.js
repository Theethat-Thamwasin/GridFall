const test=require('node:test'),assert=require('node:assert/strict'),G=require('../engine'),SKY=require('../skybridge'),{RoomHub,validatePlan}=require('../multiplayer'),R=require('../replay'),{harness}=require('./helpers/game-harness');
function flood(s,root=s.zoneCenter,limit=Infinity){const d=new Map(),queue=[];if(!G.passable(s,root.x,root.y)||G.tile(s,root.x,root.y).rank>limit)return d;d.set(G.key(root.x,root.y),0);queue.push(root);for(let i=0;i<queue.length;i++){const p=queue[i];for(const[dx,dy]of G.CARDINAL){const x=p.x+dx,y=p.y+dy,k=G.key(x,y);if(!G.passable(s,x,y)||G.tile(s,x,y).rank>limit||d.has(k))continue;d.set(k,d.get(G.key(p.x,p.y))+1);queue.push({x,y});}}return d;}
function escape(s,limit,safe){const queue=[],d=new Map();for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(G.passable(s,x,y)&&G.tile(s,x,y).rank<=limit){queue.push({x,y});d.set(G.key(x,y),0);}for(let i=0;i<queue.length;i++){const p=queue[i];for(const[dx,dy]of G.CARDINAL){const x=p.x+dx,y=p.y+dy,k=G.key(x,y);if(!G.passable(s,x,y)||G.tile(s,x,y).rank>safe||d.has(k))continue;d.set(k,d.get(G.key(p.x,p.y))+1);queue.push({x,y});}}return d;}
test('160 seeded SKY BRIDGE layouts have 4–7 distinct irregular islands, real alternate routes and balanced safe starts',()=>{
  const layouts=new Set(),counts=new Set();let retries=0;
  for(let seed=0;seed<160;seed++){
    const s=G.createState(seed,'vanguard','skybridge'),meta=s.skyBridge,paths=flood(s),walkable=s.tiles.flat().filter(t=>!['wall','barricade','void'].includes(t.type)),claimed=new Set();
    assert.equal(SKY.validate(s).ok,true,'seed '+seed);assert.equal(paths.size,walkable.length);counts.add(meta.islands.length);retries+=meta.attempts>1;layouts.add(JSON.stringify(s.tiles.map(row=>row.map(t=>[t.type,t.rank]))));assert.ok(walkable.length<s.width*s.height*.7);
    for(const island of meta.islands){assert.ok(paths.has(G.key(island.x,island.y)));const xs=island.cells.map(p=>p.x),ys=island.cells.map(p=>p.y);assert.ok(island.cells.length<(Math.max(...xs)-Math.min(...xs)+1)*(Math.max(...ys)-Math.min(...ys)+1));for(const p of island.cells){const k=G.key(p.x,p.y);assert.equal(claimed.has(k),false);claimed.add(k);}}
    for(const b of meta.bridges){assert.ok(b.cells.length>0);assert.ok([2,3].includes(b.width));for(const [i,p]of b.path.entries()){assert.ok(G.passable(s,p.x,p.y));if(i)assert.equal(Math.abs(p.x-b.path[i-1].x)+Math.abs(p.y-b.path[i-1].y),1);for(let dy=b.width===3?-1:0;dy<=1;dy++)for(let dx=b.width===3?-1:0;dx<=1;dx++)assert.ok(G.passable(s,p.x+dx,p.y+dy),'full bridge width');}}
    const toCore=s.units.map(u=>paths.get(G.key(u.x,u.y))),nearest=s.units.map(u=>{const d=flood(s,u);return Math.min(...s.units.filter(v=>v!==u).map(v=>d.get(G.key(v.x,v.y))));});assert.ok(Math.max(...toCore)<=Math.min(...toCore)*1.65);assert.ok(Math.max(...nearest)<=Math.min(...nearest)*2.25);assert.ok(Math.max(...nearest)-Math.min(...nearest)<=16);
    for(const u of s.units){assert.equal(u.weapon,'pistol');assert.equal(G.tile(s,u.x+2,u.y).loot.weapon,'rifle');for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)assert.ok(G.passable(s,u.x+dx,u.y+dy));for(const v of s.units)if(v.id>u.id)assert.ok(G.distance(u,v)>=8);}
  }
  assert.equal(layouts.size,160);assert.deepEqual([...counts].sort(),[4,5,6,7]);assert.ok(retries>0,'failed candidate layouts automatically regenerate');
});
test('SKY BRIDGE preserves all live paths at every actual collapse stage and warns within normal walking escape distance',()=>{
  for(let seed=0;seed<40;seed++){
    const s=G.createState(seed,'vanguard','skybridge');let earlier=Infinity;
    for(let turn=1;turn<100;turn++){
      s.turn=turn;s.safeLimit=G.zoneLimit(s,turn-2);s.nextLimit=G.zoneLimit(s,turn);const connected=flood(s,s.zoneCenter,s.safeLimit),floors=s.tiles.flat().filter(t=>!['wall','barricade','void'].includes(t.type)&&t.rank<=s.safeLimit),exits=escape(s,s.nextLimit,s.safeLimit);
      assert.equal(connected.size,floors.length,'seed '+seed+' / turn '+turn);assert.ok(floors.length<=earlier);earlier=floors.length;
      for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const t=G.tile(s,x,y);if(!G.passable(s,x,y)||t.rank>s.safeLimit)continue;const rounds=G.platformRounds(s,t);if(t.rank>s.nextLimit){assert.ok(rounds===1||rounds===2);assert.ok(exits.get(G.key(x,y))<=rounds*3,'ordinary 3-tile walking can escape before the warning expires');}else assert.equal(rounds,null);}
      if(s.safeLimit===.2){assert.equal(floors.length,1,'one final platform prevents an idle deadlock');break;}
    }
  }
});
test('a bridge can fall while the surviving island network still reaches safety; actual Void clears loot and never leaves an idle match stuck',()=>{
  for(const seed of [0,8,42]){const s=G.createState(seed,'vanguard','skybridge'),before=s.skyBridge.bridges.flatMap(b=>b.cells),bridgeRanks=before.map(p=>G.tile(s,p.x,p.y).rank);assert.ok(Math.max(...bridgeRanks)>Math.min(...bridgeRanks)+5);let ended=false;for(let n=0;n<100;n++){G.finishTurn(s);if(s.phase==='ended'){ended=true;break;}const paths=flood(s),live=s.tiles.flat().filter(t=>!['wall','barricade','void'].includes(t.type));assert.equal(paths.size,live.length);for(const row of s.tiles)for(const t of row)if(t.type==='void')assert.equal(t.loot,null);}assert.ok(ended);assert.ok(before.some(p=>G.tile(s,p.x,p.y).type==='void'));}
});
test('seed replay is exact, changes island outlines and collapse order, and supports all rosters and team sizes',()=>{
  for(const seed of [0,1,42,0xffffffff]){const a=G.createState(seed,'vanguard','skybridge');assert.deepEqual(a,G.createState(seed,'vanguard','skybridge'));const b=G.createState(seed,'volt','skybridge');assert.deepEqual(a.tiles,b.tiles);assert.deepEqual(a.skyBridge,b.skyBridge);}
  for(let count=1;count<=8;count++){const ids=Array.from({length:count},(_,i)=>i),s=G.createState(33,'vanguard','skybridge',{activeIds:ids});assert.equal(s.units.filter(u=>u.alive).length,count);assert.equal(SKY.validate(s).ok,true);}
  for(const teams of [{0:'A',1:'B'},{0:'B',1:'A',2:'A',3:'A',4:'B',5:'B',6:'B',7:'A'}]){const s=G.createState(61,'halo','skybridge',{mode:'team',activeIds:Object.keys(teams).map(Number),teams});assert.equal(SKY.validate(s).ok,true);assert.ok(s.units.filter(u=>u.alive).every(u=>u.team===teams[u.id]));}
});
test('valuable weapons are reachable on risky sites; destructible cover, 2 AP walking, Fog and server validation use existing rules',()=>{
  const s=G.createState(8,'vanguard','skybridge'),paths=flood(s);assert.equal(s.skyBridge.highValueLoot.length,4);for(const p of s.skyBridge.highValueLoot){assert.ok(paths.has(G.key(p.x,p.y)));assert.ok(G.tile(s,p.x,p.y).bridge||G.CARDINAL.some(([dx,dy])=>G.tile(s,p.x+dx,p.y+dy).type==='void'));assert.ok(p.rank>s.maxZoneRank*.5);assert.equal(G.tile(s,p.x,p.y).loot.weapon,p.weapon);}
  assert.ok(s.tiles.flat().some(t=>t.type==='wall'&&t.hp===45));assert.ok(s.tiles.flat().some(t=>t.type==='cover'));const u=s.units[0],target={x:u.x+1,y:u.y},plan=[{type:'move',target},{type:'guard'}];assert.doesNotThrow(()=>validatePlan(s,0,plan));assert.ok(G.pathfind(s,u,target,3));assert.ok(G.observation(s,u).loot.length>0);assert.ok(G.observation(s,u).enemies.length<s.units.length-1);
});
test('invalid spawn, isolated floor, blocked bridge and lost escape paths fail automatic validation',()=>{
  const original=G.createState(42,'vanguard','skybridge');
  const bad=structuredClone(original);bad.skyBridge.spawns[0]={x:0,y:0};assert.equal(SKY.validate(bad).ok,false);
  const island=structuredClone(original);Object.assign(island.tiles[0][0],{type:'floor',rank:1});assert.equal(SKY.validate(island).ok,false);
  const blocked=structuredClone(original),bridge=blocked.skyBridge.bridges[0],p=bridge.path[Math.floor(bridge.path.length/2)];blocked.tiles[p.y][p.x].type='wall';assert.equal(SKY.validate(blocked).ok,false);
  const ranked=structuredClone(original);ranked.tiles[ranked.zoneCenter.y][ranked.zoneCenter.x].rank=999;assert.equal(SKY.validate(ranked).ok,false);
});
test('rare weapon locations leave enough time to arrive, collect and escape before their platforms fall',()=>{
  for(let seed=0;seed<60;seed++){const s=G.createState(seed,'vanguard','skybridge'),paths=s.units.map(u=>flood(s,u));for(const p of s.skyBridge.highValueLoot){let falls=1;while(G.zoneLimit(s,falls-2)>=p.rank)falls++;const arrival=Math.min(...paths.map(d=>d.get(G.key(p.x,p.y))));assert.ok(arrival<=(falls-2)*3,'seed '+seed+' / '+p.weapon+' is reachable before collapse');}}
});
test('multiplayer chooses and filters SKY BRIDGE normally and replays retain its terrain and warnings',()=>{
  const hub=new RoomHub(),host=hub.create({mapId:'skybridge'}),guest=hub.join(host.code);hub.start(host.code,host.token);const room=hub.get(host.code,host.token).room,s=room.state;assert.equal(s.mapId,'skybridge');assert.equal(SKY.validate(s).ok,true);const view=hub.view(room,room.members[0]);assert.equal(view.mapId,'skybridge');assert.equal(view.skyBridge,undefined);assert.equal(view.seed,0);assert.ok(view.units[1].hidden);const archive=new R.MatchArchive();archive.begin(view);assert.equal(archive.current.frames[0].mapId,'skybridge');assert.equal(archive.current.frames[0].tiles[s.units[0].y][s.units[0].x].rank,G.tile(s,s.units[0].x,s.units[0].y).rank);assert.equal(hub.join(host.code,{token:guest.token}).playerId,guest.playerId);
});
test('Singleplayer selector deploys SKY BRIDGE and an explicit debug seed repeats the same layout',async()=>{
  const h=harness();h.window.location.search='?seed=42';h.$('map-select').value='skybridge';h.$('map-select').dispatchEvent({type:'change',target:h.$('map-select')});await h.$('start-button').click();let s=h.window.GRIDFALL_STATUS();assert.equal(s.map.id,'skybridge');assert.equal(s.map.seed,42);const point={...s.player};h.$('restart-button').click();h.$('exit-confirm').click();await h.$('start-button').click();s=h.window.GRIDFALL_STATUS();assert.deepEqual({...s.player},point);assert.equal(s.map.seed,42);assert.ok(h.$('lobby-map-select').children.some(o=>o.value==='skybridge'));
});
