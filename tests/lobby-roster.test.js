const test=require('node:test'),assert=require('node:assert/strict');
const {RoomHub}=require('../multiplayer.js'),G=require('../engine.js');
test('blank names cannot create or join rooms; personal names stay owned and survive reconnect',()=>{
 const hub=new RoomHub();assert.throws(()=>hub.create({name:'  '}));assert.equal(hub.rooms.size,0);
 const a=hub.create({name:'เจ้าห้อง'}),b=hub.join(a.code,{name:'เพื่อน'});
 assert.throws(()=>hub.join(a.code,{name:''}));hub.updateLobby(b.code,b.token,{name:'สายลับ'});
 const room=hub.get(a.code,a.token).room;assert.equal(room.members[0].name,'เจ้าห้อง');assert.equal(room.members[1].name,'สายลับ');
 assert.equal(hub.join(b.code,{token:b.token,name:''}).playerId,b.playerId);
});
test('only host can adjust bots; invalid changes are atomic and joining replaces a bot at capacity',()=>{
 const hub=new RoomHub(),a=hub.create({name:'A'}),b=hub.join(a.code,{name:'B'}),room=hub.get(a.code,a.token).room;
 assert.equal(room.options.botCount,6);assert.equal(hub.lobby(room).bots.length,6);
 for(const count of [-1,7,1.5,'2'])assert.throws(()=>hub.updateLobby(a.code,a.token,{botCount:count,name:'CHANGED'}));
 assert.equal(room.members[0].name,'A');assert.throws(()=>hub.updateLobby(b.code,b.token,{botCount:0}));
 hub.updateLobby(a.code,a.token,{botCount:0});assert.equal(hub.lobby(room).bots.length,0);
 hub.join(a.code,{name:'C'});assert.equal(room.options.botCount,0);
 hub.updateLobby(a.code,a.token,{botCount:5});hub.join(a.code,{name:'D'});assert.equal(room.options.botCount,4);
 hub.start(a.code,a.token);assert.throws(()=>hub.updateLobby(a.code,a.token,{botCount:0}));
});
test('empty slots never simulate bots, loot or replay operators and sparse human IDs remain stable',()=>{
 const hub=new RoomHub(),a=hub.create({name:'A'}),b=hub.join(a.code,{name:'B'}),c=hub.join(a.code,{name:'C'});
 hub.leave(b.code,b.token);hub.updateLobby(a.code,a.token,{botCount:0});hub.start(a.code,a.token);
 const room=hub.get(a.code,a.token).room,s=room.state;assert.deepEqual(s.units.filter(u=>u.alive).map(u=>u.id),[0,2]);
 assert.deepEqual(room.botPlans,{});assert.equal(s.units[1].removed,true);assert.equal(s.tiles.flat().filter(t=>t.loot?.type==='weapon').length,2);
 assert.equal(hub.view(room,room.members[0]).units[1].removed,true);
 for(const m of [a,c])hub.command(m.code,m.token,{action:'lock',turn:1,plan:[{type:'guard'}]});
 assert.deepEqual(Object.keys(s.plans),['0','2']);assert.equal(room.archive.current.frames[0].units[1].removed,true);
});
test('solo host needs a rival, including after ownership transfers',()=>{
 const hub=new RoomHub(),a=hub.create({name:'A'});hub.updateLobby(a.code,a.token,{botCount:0});assert.throws(()=>hub.start(a.code,a.token));
 const b=hub.join(a.code,{name:'B'});hub.leave(a.code,a.token);hub.updateLobby(b.code,b.token,{botCount:1});hub.start(b.code,b.token);
 const room=hub.get(b.code,b.token).room;assert.equal(room.state.units[1].name,'B');assert.equal(room.state.units.filter(u=>u.alive).length,2);assert.equal(Object.keys(room.botPlans).length,1);
});
test('all roster sizes use actual-count random safe spreads with open exits and equal starter supplies',()=>{
 for(const map of Object.keys(G.MAPS))for(const count of [2,3,5,8])for(let seed=0;seed<30;seed++){
  const ids=Array.from({length:count},(_,i)=>i),s=G.createState(seed,'vanguard',map,{activeIds:ids}),units=s.units.filter(u=>u.alive);
  assert.equal(units.length,count);assert.equal(s.tiles.flat().filter(t=>t.loot?.type==='weapon').length,count);
  for(const u of units){assert.ok(G.tile(s,u.x,u.y).rank<=s.safeLimit);for(const v of units)if(v.id!==u.id)assert.ok(G.distance(u,v)>=8);
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)assert.ok(G.passable(s,u.x+dx,u.y+dy));
   assert.equal(G.pathfind(s,u,{x:u.x+2,y:u.y},2).length,2);
  }
 }
});

// Bot slots disclose no operator; randomization covers the full roster at deployment.
test('bot operators stay hidden in the lobby and sample all seven classes at match start',()=>{
 const crypto=require('node:crypto'),operators=Object.keys(G.CLASSES),random=crypto.randomInt;let cursor=0;
 try{
  crypto.randomInt=max=>{assert.equal(max,operators.length);return cursor++%max;};
  const hub=new RoomHub(),host=hub.create({name:'HOST',character:'halo'}),room=hub.rooms.get(host.code);
  assert.equal(hub.lobby(room).bots.length,7);assert.ok(hub.lobby(room).bots.every(b=>!('character' in b)));
  hub.start(host.code,host.token);assert.equal(room.state.units[0].class,'halo');
  assert.deepEqual(room.state.units.slice(1).map(u=>u.class),operators);assert.equal(cursor,7);
 }finally{crypto.randomInt=random;}
});
test('MIRE and HALO can create, join, change profile and retain their skills in a multiplayer match',()=>{
 const hub=new RoomHub(),host=hub.create({name:'Mire',character:'mire'}),guest=hub.join(host.code,{name:'Halo',character:'halo'}),room=hub.rooms.get(host.code);
 hub.updateLobby(host.code,host.token,{character:'halo',botCount:0});hub.updateLobby(guest.code,guest.token,{character:'mire'});hub.start(host.code,host.token);
 assert.equal(room.state.units[0].class,'halo');assert.equal(room.state.units[1].class,'mire');
 for(const [m,type]of [[host,'mend'],[guest,'stasis']]){const u=room.state.units[m.playerId];hub.command(m.code,m.token,{action:'lock',turn:1,plan:[{type,target:{x:u.x,y:u.y}}]});}
 for(let i=0;i<21;i++)hub.advance(room);assert.deepEqual(new Set(room.state.fields.map(f=>f.kind)),new Set(['stasis','mend']));
});
