const test=require('node:test'),assert=require('node:assert/strict');
const {RoomHub}=require('../multiplayer.js'),G=require('../engine.js');
function fixture(){let time=0;const hub=new RoomHub({now:()=>time}),a=hub.create({name:'HOST'}),b=hub.join(a.code,{name:'GUEST'}),messages={a:[],b:[]};hub.connect(a.code,a.token,p=>messages.a.push(p));const disconnect=hub.connect(b.code,b.token,p=>messages.b.push(p));return{hub,a,b,room:hub.rooms.get(a.code),messages,disconnect,clock:t=>time=t};}
test('an eliminated player waits in the same room without stopping the match or respawning',()=>{
 const{hub,a,b,room,messages}=fixture();hub.start(a.code,a.token);room.state.units[b.playerId].alive=false;room.state.units[b.playerId].hp=0;
 hub.returnRoom(b.code,b.token);assert.equal(messages.b.at(-1).type,'lobby');assert.equal(messages.b.at(-1).matchRunning,true);assert.equal(messages.a.at(-1).type,'state');assert.equal(hub.get(b.code,b.token).member.waiting,true);
 assert.throws(()=>hub.command(b.code,b.token,{action:'lock',turn:1,plan:[]}));assert.throws(()=>hub.start(a.code,a.token));assert.throws(()=>hub.updateLobby(a.code,a.token,{mapId:'small'}));
 hub.updateLobby(b.code,b.token,{name:'NEXT MATCH',character:'halo'});assert.equal(room.state.units[b.playerId].alive,false);
});
test('match completion keeps room credentials and allows another match with clean state and current profiles',()=>{
 const{hub,a,b,room,messages}=fixture();hub.start(a.code,a.token);const seed=room.state.seed,id=room.matchId;
 Object.assign(room.state,{phase:'ended',winner:0});room.stage='ended';hub.returnRoom(a.code,a.token);hub.returnRoom(b.code,b.token);
 assert.equal(messages.b.at(-1).matchRunning,false);hub.updateLobby(a.code,a.token,{mapId:'small',botCount:0});hub.updateLobby(b.code,b.token,{character:'mire'});
 hub.start(a.code,a.token);assert.equal(room.code,a.code);assert.equal(hub.get(b.code,b.token).member.id,b.playerId);assert.equal(room.matchId,id+1);assert.notEqual(room.state.seed,seed);assert.equal(room.state.units[b.playerId].class,'mire');assert.equal(room.state.units[b.playerId].hp,100);assert.equal(room.state.mapId,'small');assert.equal(room.members.some(m=>m.waiting),false);assert.equal(messages.b.at(-1).matchId,room.matchId);
});
test('host kick revokes credentials and notifies the target; non-host and self-kick fail',()=>{
 const{hub,a,b,room,messages}=fixture();assert.throws(()=>hub.kick(b.code,b.token,a.playerId));assert.throws(()=>hub.kick(a.code,a.token,a.playerId));
 hub.kick(a.code,a.token,b.playerId);assert.equal(messages.b.at(-1).type,'removed');assert.equal(messages.b.at(-1).reason,'kicked');assert.equal(room.members.length,1);assert.throws(()=>hub.get(b.code,b.token));assert.throws(()=>hub.join(b.code,{token:b.token}));
});
test('disconnect removes the roster and live operator after grace, while reconnect retains identity',()=>{
 const{hub,a,b,room,disconnect,clock}=fixture();hub.start(a.code,a.token);disconnect();clock(9999);hub.tick();assert.ok(room.members.some(m=>m.id===b.playerId));
 const again=hub.connect(b.code,b.token,()=>{});clock(10001);hub.tick();assert.equal(room.state.units[b.playerId].alive,true);again();clock(20002);hub.tick();assert.equal(room.members.some(m=>m.id===b.playerId),false);assert.equal(room.state.units[b.playerId].alive,false);assert.throws(()=>hub.get(b.code,b.token));
});
test('unconnected reservations expire and ownership transfers when a host disappears',()=>{
 let time=0;const hub=new RoomHub({now:()=>time}),a=hub.create({name:'HOST'}),b=hub.join(a.code,{name:'GUEST'});hub.connect(b.code,b.token,()=>{});time=10001;hub.tick();const room=hub.get(b.code,b.token).room;assert.equal(room.host,b.playerId);assert.equal(room.members.length,1);
 hub.leave(b.code,b.token);assert.equal(hub.rooms.size,0);
});
test('a mid-match join waits and never takes over a living bot or participates in commands',()=>{
 const{hub,a,room}=fixture();hub.start(a.code,a.token);const c=hub.join(a.code,{name:'LATE'}),bot=room.state.units[c.playerId];assert.equal(bot.alive,true);
 const packets=[];hub.connect(c.code,c.token,p=>packets.push(p));assert.equal(packets.at(-1).type,'lobby');assert.equal(packets.at(-1).matchRunning,true);assert.throws(()=>hub.command(c.code,c.token,{action:'lock',turn:1,plan:[]}));hub.leave(c.code,c.token);assert.equal(bot.alive,true);
});
test('platform warning stays yellow for two rounds then red for one before it collapses',()=>{
 const s=G.createState(99);s.turn=5;s.safeLimit=G.zoneLimit(s,3);s.nextLimit=G.zoneLimit(s,5);const t={type:'floor',rank:s.maxZoneRank+.1};assert.equal(G.platformRounds(s,t),2);
 s.turn=6;s.safeLimit=G.zoneLimit(s,4);s.nextLimit=G.zoneLimit(s,6);assert.equal(G.platformRounds(s,t),1);
 s.turn=7;s.safeLimit=G.zoneLimit(s,5);assert.equal(G.platformRounds(s,t),0);
 assert.equal(G.platformRounds(s,{type:'floor',rank:0}),null);assert.equal(G.platformRounds(s,{type:'void',rank:0}),0);
});

test('waiting-room profile changes and late joins cannot send active players out of the match',()=>{
 const{hub,a,b,room,messages}=fixture();hub.start(a.code,a.token);hub.returnRoom(b.code,b.token);messages.a.length=0;
 hub.updateLobby(b.code,b.token,{character:'halo'});assert.equal(messages.a.at(-1).type,'state');assert.equal(messages.b.at(-1).type,'lobby');
 hub.join(a.code,{name:'LATE'});assert.equal(messages.a.at(-1).type,'state');assert.equal(room.state.phase,'planning');
});
