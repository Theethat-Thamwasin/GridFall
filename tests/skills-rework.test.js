const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine'),U=require('../tactics'),M=require('../movement'),{RoomHub,validatePlan}=require('../multiplayer'),R=require('../replay');
function arena(cls='pyro'){const s=G.createState(18,cls,'medium',{activeIds:[0,1,2]});for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',rank:0,hp:0,loot:null,roof:null});for(const u of s.units)if(u.alive)Object.assign(u,{x:u.id===0?5:u.id===1?8:18,y:u.id===2?18:5,shield:0,hp:100});s.safeLimit=s.nextLimit=999;return s;}
function resolve(s,plans={}){G.beginTurn(s,plans);while(s.phase==='resolution')G.step(s);assert.notEqual(s.phase,'clash');return s.events;}
function network(s){const hub=new RoomHub(),a=hub.create({name:'A'});hub.start(a.code,a.token);const room=hub.get(a.code,a.token).room;room.state=s;room.baseTerrain=structuredClone(s.tiles);room.knowledge.clear();return{hub,room,member:room.members[0]};}
test('new Stasis covers exactly 4x4, including the extra east/south edge, and expires after three turns',()=>{
 const s=arena('mire');resolve(s,{0:[{type:'stasis',target:{x:8,y:5}}]});const f=s.fields[0];assert.equal(f.width,4);assert.equal(f.height,4);assert.deepEqual(G.areaBounds(f),{left:7,top:4,right:10,bottom:7,width:4,height:4});
 let cells=0;for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(G.inField(s,{x,y},'stasis'))cells++;assert.equal(cells,16);
 assert.equal(G.inField(s,{x:10,y:7},'stasis'),true);assert.equal(G.inField(s,{x:11,y:7},'stasis'),false);
 resolve(s);assert.equal(s.fields.length,1);resolve(s);assert.equal(s.fields.length,0);
});
test('expanded Stasis agrees in forecasts, drag routes and server validation',()=>{
 const s=arena('mire'),cast={type:'stasis',target:{x:3,y:3}};assert.ok(G.inArea(s.units[0],G.skillArea('stasis',cast.target)));assert.equal(U.range(s,0,'move',[cast]),1);assert.throws(()=>validatePlan(s,0,[cast,{type:'move',target:{x:7,y:5}}]));assert.doesNotThrow(()=>validatePlan(s,0,[cast,{type:'move',target:{x:6,y:5}}]));
 s.fields=[{x:3,y:3,kind:'stasis',width:4,height:4,expires:4}];const route=new M.Route(s,{x:6,y:5},3);assert.equal(route.append({x:5,y:5}),true);assert.equal(route.remaining,0);assert.equal(route.append({x:4,y:5}),false);
 assert.match(U.target(U.context(s,0,'stasis'),{x:6,y:5}).reason,/4×4/);
});
test('Molly ignites exactly the 3x4 impact rectangle, including its south edge, with no ground fire',()=>{
 const s=arena();Object.assign(s.units[1],{x:9,y:7});Object.assign(s.units[2],{x:10,y:7});resolve(s,{0:[{type:'firebomb',target:{x:8,y:5}}]});assert.equal(s.units[1].hp,76);assert.equal(s.units[2].hp,100);assert.equal(s.fires.length,0);assert.equal(s.events.filter(e=>e.type==='firebomb').length,1);
 const event=s.events.find(e=>e.type==='firebomb');assert.deepEqual([event.width,event.height],[3,4]);assert.match(U.target(U.context(arena(),0,'firebomb'),{x:5,y:3}).reason,/3×4/);
 assert.equal(U.target(U.context(arena(),0,'firebomb'),{x:5,y:3}).code,'selfBlast');
});
test('Molly does not affect a later entrant and cannot refresh or stack a burning target',()=>{
 const s=arena();Object.assign(s.units[2],{x:10,y:5});s.units[1].class='pyro';const events=resolve(s,{0:[{type:'firebomb',target:{x:8,y:5}}],1:[{type:'firebomb',target:{x:8,y:5}}]});assert.equal(s.units[1].hp,76);assert.equal(events.filter(e=>e.type==='damage'&&e.unitId===1).length,2);assert.equal(s.units[1].burn.remainingTicks,2);
 resolve(s,{2:[{type:'move',target:{x:8,y:6},path:[{x:10,y:6},{x:9,y:6},{x:8,y:6}]}]});assert.equal(s.units[2].hp,100);assert.equal(s.units[2].burn,undefined);assert.equal(s.units[1].hp,52);
 resolve(s);assert.equal(s.units[1].hp,52);
});
test('a second-action Molly still deals exactly two ticks in its impact turn and two in the next',()=>{
 const s=arena();const first=resolve(s,{0:[{type:'wait'},{type:'firebomb',target:{x:8,y:5}}]});assert.equal(first.filter(e=>e.type==='damage'&&e.unitId===1).length,2);assert.equal(s.units[1].hp,76);Object.assign(s.units[1],{x:15,y:15});const second=resolve(s);assert.equal(second.filter(e=>e.type==='damage'&&e.unitId===1).length,2);assert.equal(s.units[1].hp,52);resolve(s);assert.equal(s.units[1].hp,52);
});
test('burn follows its victim and credits the caster after the caster dies',()=>{
 const s=arena();G.beginTurn(s,{0:[{type:'firebomb',target:{x:8,y:5}}]});while(s.tick<20)G.step(s);assert.equal(s.units[1].burn.remainingTicks,4);s.units[0].alive=false;Object.assign(s.units[1],{x:14,y:14,hp:20});while(s.phase==='resolution')G.step(s);assert.equal(s.units[1].alive,false);assert.equal(s.events.find(e=>e.type==='eliminated'&&e.unitId===1).owner,0);
});
test('network preserves expanded field edges and visible burns without leaking hidden victims or the caster identity',()=>{
 const s=arena();s.fields=[{kind:'stasis',x:16,y:5,width:4,height:4,expires:4,owner:2}];Object.assign(s.units[0],{x:7,y:5});s.units[1].burn={owner:2,remainingTicks:4,expires:3,appliedTurn:1,appliedTick:19,pulseTurn:1,pulses:0};s.units[2].burn={...s.units[1].burn};const{hub,room,member}=network(s),view=hub.view(room,member);
 assert.equal(view.fields[0].width,4);assert.equal(view.fields[0].height,4);assert.deepEqual(view.units[1].burn,{remainingTicks:4});assert.equal(view.units[2].hidden,true);assert.equal(view.units[2].burn,undefined);
 s.units[0].burn={...s.units[1].burn};assert.deepEqual(hub.view(room,member).units[0].burn,{remainingTicks:4});
 const archive=new R.MatchArchive();archive.begin(view);view.units[1].burn.remainingTicks=1;assert.equal(archive.current.frames[0].units[1].burn.remainingTicks,4);
});
