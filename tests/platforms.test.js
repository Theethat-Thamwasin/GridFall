
const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine.js'),U=require('../tactics.js'),R=require('../replay.js'),{RoomHub,validatePlan}=require('../multiplayer.js');
function flood(s,limit=s.safeLimit){const root=s.zoneCenter,seen=new Set([G.key(root.x,root.y)]),queue=[root];for(let i=0;i<queue.length;i++){const p=queue[i];for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=G.key(x,y),t=G.tile(s,x,y);if(!t||t.rank>limit||!G.passable(s,x,y)||seen.has(k))continue;seen.add(k);queue.push({x,y});}}return seen;}
function open(character='vanguard'){const s=G.createState(99,character);for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});s.units.forEach((u,i)=>Object.assign(u,{x:2+i*3,y:3,shield:20,alive:true}));return s;}
function resolve(s,plans={}){G.beginTurn(s,plans);while(s.phase==='resolution')G.step(s);return s;}
test('procedural arenas are sparse connected platforms with loops and varied layouts',()=>{
 for(const map of Object.keys(G.MAPS).filter(id=>id!=='meadow')){const layouts=new Set();for(let seed=0;seed<40;seed++){const s=G.createState(seed,'vanguard',map),connected=flood(s),floors=s.tiles.flat().filter(t=>!['wall','barricade','void'].includes(t.type));
 assert.ok(floors.length<s.width*s.height*.7);assert.equal(connected.size,floors.length);assert.ok(s.layout.bridges>=s.layout.chambers);layouts.add(JSON.stringify(s.tiles.map(row=>row.map(t=>t.type))));
 for(const limit of [s.maxZoneRank*.75,s.maxZoneRank*.5,s.maxZoneRank*.25]){const safe=flood(s,limit);assert.equal(safe.size,floors.filter(t=>t.rank<=limit).length,'surviving platforms remain connected');}
 }assert.ok(layouts.size>=35);}
});
test('collapse destroys floor, loot and fire; falls ignore shields and resolve the winner',()=>{
 const s=open(),u=s.units[0];u.shield=40;s.safeLimit=1;s.tiles[u.y][u.x].rank=3;s.tiles[u.y][u.x].loot={type:'ammo'};s.tiles[u.y][u.x+1].rank=3;s.fires=[{x:u.x+1,y:u.y,expires:20}];
 resolve(s);assert.equal(u.alive,false);assert.equal(u.hp,0);assert.equal(u.shield,40);assert.equal(G.tile(s,u.x,u.y).type,'void');assert.equal(G.tile(s,u.x,u.y).loot,null);assert.equal(s.fires.length,0);assert.ok(s.events.some(e=>e.type==='fall'&&e.unitId===0));
 assert.equal(U.target(U.context(s,1,'move'),{x:u.x,y:u.y}).code,'void');
 const winner=open();winner.safeLimit=0;winner.units.forEach((u,i)=>{if(i)winner.tiles[u.y][u.x].rank=2;});resolve(winner);assert.equal(winner.phase,'ended');assert.equal(winner.winner,0);
});
test('normal movement cannot cross Void while phase shift can land beyond a visible gap',()=>{
 const s=open('volt'),u=s.units[0];Object.assign(u,{x:6,y:6});s.tiles[6][7].type='void';s.tiles[5][7].type='wall';s.tiles[7][7].type='wall';
 assert.equal(G.pathfind(s,u,{x:8,y:6},3),null);assert.throws(()=>validatePlan(s,0,[{type:'move',target:{x:7,y:6}}]));
 const blink={type:'blink',target:{x:8,y:6}};assert.equal(U.target(U.context(s,0,'blink'),blink.target).ok,true);assert.doesNotThrow(()=>validatePlan(s,0,[blink]));resolve(s,{0:[blink]});assert.equal(u.x,8);assert.equal(u.skillCooldown,G.SKILLS.mobilityCooldown);
});
test('oracle focus reduces actual shot recoil by 65 percent and consumes an action',()=>{
 const shoot=focused=>{const s=open('deadeye');s.units[0].scan=focused?2:0;G.beginTurn(s,{0:[{type:'shoot',angle:.071}]});let shot;for(let i=0;i<20;i++){const events=G.step(s);shot=shot||events.find(e=>e.type==='shoot'&&e.unitId===0);}return shot;};
 assert.ok(Math.abs(shoot(true).recoil-shoot(false).recoil*.35)<1e-12);
 const s=open('deadeye');resolve(s,{0:[{type:'scan'}]});assert.equal(s.units[0].scan,1);assert.equal(s.units[0].skillCooldown,3);assert.equal(U.availability(s,0,'scan').code,'cooldown');
 const names=Object.values(G.CLASSES).map(c=>c.name);assert.deepEqual(names,['STRIDER','WRAITH','ORACLE','CINDER','AEGIS','MIRE','HALO']);assert.equal(G.CLASSES.vanguard.move,4);assert.ok(Object.entries(G.CLASSES).filter(([id])=>id!=='vanguard').every(([,c])=>c.move===3));
});
test('public platform losses preserve hidden enemy and inventory filtering and replay history',()=>{
 const hub=new RoomHub(),a=hub.create();hub.start(a.code,a.token);const room=hub.get(a.code,a.token).room,s=room.state,u=s.units[0];
 const target=s.units[1];Object.assign(target,{x:25,y:25});s.safeLimit=0;G.finishTurn(s);const view=hub.view(room,room.members[0]);
 for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(s.tiles[y][x].rank>s.safeLimit){assert.equal(view.tiles[y][x].type,'void');assert.equal(view.tiles[y][x].loot,null);}
 assert.equal(view.units[1].hidden,true);assert.equal(view.units[1].weapons,undefined);assert.equal(view.seed,0);
 const state=open(),history=new R.MatchArchive();state.safeLimit=1;state.tiles[3][2].rank=3;G.beginTurn(state,{});history.begin(state);while(state.phase==='resolution'){const events=G.step(state);history.capture(state,events);}history.finish();const frames=history.frames();assert.equal(frames[0].tiles[3][2].type,'floor');assert.equal(frames.at(-1).tiles[3][2].type,'void');assert.ok(frames.at(-1).events.some(e=>e.type==='fall'));
});


test('precision bonus affects only the first round of a burst and preserves shotgun hit caps',()=>{
 const rifle=open('deadeye'),before=rifle.units[1].hp+rifle.units[1].shield;rifle.units[0].scan=2;resolve(rifle,{0:[{type:'shoot',angle:0}]});assert.equal(rifle.units[1].hp+rifle.units[1].shield,before-G.WEAPONS.rifle.damage*G.WEAPONS.rifle.shots-15);
 const shotgun=open('deadeye');const u=shotgun.units[0];Object.assign(u,{scan:2,weapon:'shotgun',ammo:4});Object.assign(shotgun.units[1],{x:3,y:3});resolve(shotgun,{0:[{type:'shoot',angle:0}]});assert.equal(shotgun.units[1].hp,57);
});
