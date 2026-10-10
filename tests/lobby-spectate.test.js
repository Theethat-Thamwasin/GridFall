const test = require('node:test'), assert = require('node:assert/strict');
const {RoomHub} = require('../multiplayer.js');
function fixture() { const hub=new RoomHub(),a=hub.create({name:'HOST',cinematic:false}),b=hub.join(a.code,{name:'GUEST',cinematic:false});return {hub,a,b,room:hub.get(a.code,a.token).room}; }
test('host chooses lobby map, members edit only their own profile, invalid updates are atomic',()=>{
  const {hub,a,b,room}=fixture(),packets=[];hub.connect(b.code,b.token,p=>packets.push(p));
  hub.updateLobby(a.code,a.token,{mapId:'large'});assert.equal(packets.at(-1).options.mapId,'large');
  assert.throws(()=>hub.updateLobby(b.code,b.token,{mapId:'small',name:'FORGED'}));assert.equal(room.members[1].name,'GUEST');assert.equal(room.options.mapId,'large');
  assert.throws(()=>hub.updateLobby(b.code,b.token,{name:'OTHER',character:'fake'}));assert.equal(room.members[1].name,'GUEST');
  assert.throws(()=>hub.updateLobby(b.code,b.token,{planningSeconds:99}));
  hub.updateLobby(b.code,b.token,{name:'  NEW NAME  ',character:'rook'});assert.equal(room.members[0].name,'HOST');
  hub.start(a.code,a.token);assert.equal(room.state.mapId,'large');assert.equal(room.state.units[1].name,'NEW NAME');assert.equal(room.state.units[1].class,'rook');
  assert.throws(()=>hub.updateLobby(a.code,a.token,{mapId:'small'}));
});
test('spectating is explicit, dead-only and follows target Fog without exposing plans or inventory',()=>{
  const {hub,a,b,room}=fixture();hub.start(a.code,a.token);const s=room.state;
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null});
  const watched={x:s.width-6,y:s.height-6};Object.assign(s.units[0],{x:2,y:2});Object.assign(s.units[1],watched);Object.assign(s.units[2],{x:watched.x+1,y:watched.y});
  assert.throws(()=>hub.command(a.code,a.token,{action:'spectate',targetId:1}));
  Object.assign(s.units[0],{alive:false,hp:0});s.phase='resolution';room.stage='resolution';s.plans={1:[{type:'shoot',angle:1}]};
  assert.equal(hub.view(room,room.members[0]).units[1].hidden,true);
  assert.throws(()=>hub.command(a.code,a.token,{action:'spectate',targetId:0}));
  hub.command(a.code,a.token,{action:'spectate',targetId:1});const view=hub.view(room,room.members[0]);
  assert.equal(view.units[1].alive,true);assert.equal(view.units[2].alive,true);assert.equal(view.units[1].ammo,undefined);assert.equal(view.units[1].weapons,undefined);
  assert.deepEqual(Object.keys(view.plans),['0']);assert.ok(view.visibleCells.length<s.width*s.height);assert.ok(view.visibleCells.includes(watched.x+','+watched.y));assert.equal(view.visibleCells.includes('2,2'),false);
  const packets=[];hub.connect(a.code,a.token,p=>packets.push(p));assert.equal(packets.at(-1).spectating,1);assert.ok(packets.at(-1).watchable.every(u=>!('x'in u)&&!('token'in u)));
  s.units[1].alive=false;hub.broadcastState(room);assert.notEqual(packets.at(-1).spectating,1);assert.ok(s.units[packets.at(-1).spectating].alive);
  assert.throws(()=>hub.command(b.code,b.token,{action:'lock',turn:s.turn,plan:[]}));
});
test('connection loss preserves identity but explicit exit forfeits and revokes rejoin',()=>{
  const {hub,a,b,room}=fixture();hub.start(a.code,a.token);const disconnect=hub.connect(a.code,a.token,()=>{});disconnect();assert.equal(hub.join(a.code,{token:a.token}).playerId,0);assert.equal(room.state.units[0].alive,true);
  hub.leave(a.code,a.token);assert.equal(room.state.units[0].alive,false);assert.throws(()=>hub.get(a.code,a.token),e=>e.status===401);assert.throws(()=>hub.join(a.code,{token:a.token}));
  assert.equal(hub.get(b.code,b.token).room.code,b.code);assert.equal(room.state.units[1].alive,true);
  const fresh=hub.create({name:'HOST'});assert.notEqual(fresh.code,a.code);assert.notEqual(fresh.token,a.token);
});
test('lobby owner transfer keeps map control exclusive to the new owner',()=>{const {hub,a,b,room}=fixture();hub.leave(a.code,a.token);assert.equal(room.host,b.playerId);hub.updateLobby(b.code,b.token,{mapId:'small'});assert.equal(room.options.mapId,'small');});
