const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
async function practice(){let state,path=[],tracers=[];const h=harness(1280,{preparePractice:s=>{state=s;Object.assign(s.units[1],{x:24,y:16});},paint:{beginPath(){path=[];},moveTo(x,y){path.push({x,y});},stroke(){if(this.lineWidth===1.6&&this.strokeStyle==='#c8f4e5')tracers.push(path[0]);}}});h.window.GridfallPractice.botPlan=()=>[{type:'wait'},{type:'wait'}];await h.$('menu-free-practice').click();return{h,state,tracers,clear(){tracers.length=0;}};}
test('real game draws intermediate bullet positions on frames where the simulation has not ticked',async()=>{
  const {h,state,tracers,clear}=await practice();h.$('actions').querySelector('[data-type="shoot"]').click();h.point({x:15,y:10});h.$('lock-button').click();
  let found=false;for(let i=0;i<100&&!found;i++){h.frames(1,8);const shown=h.window.GRIDFALL_MOTION().projectiles[0],actual=state.projectiles[0];if(!shown||!actual||shown.x===actual.x)continue;
    const tick=state.tick,old=shown.x;clear();h.frames(1,2);if(state.tick!==tick)continue;const current=h.window.GRIDFALL_MOTION().projectiles[0];assert.ok(current.x>old);assert.ok(current.x<=actual.x);assert.ok(Math.abs(tracers[0].x-current.x*32)<1e-8);found=true;}
  assert.equal(found,true);h.frames(90);assert.equal(state.phase,'planning');assert.equal(h.window.GRIDFALL_MOTION().projectiles.length,0);
});
test('batched low-FPS simulation steps animate the same route as small frames',async()=>{
  const a=await practice(),b=await practice();for(const p of [a,b]){p.h.point({x:13,y:10});p.h.$('lock-button').click();}
  for(let i=0;i<6;i++){a.h.frames(1,135);b.h.frames(9,15);assert.equal(a.state.tick,b.state.tick);assert.equal(a.state.units[0].x,b.state.units[0].x);const x=a.h.window.GRIDFALL_MOTION().player.x,y=b.h.window.GRIDFALL_MOTION().player.x;assert.ok(Math.abs(x-y)<1e-8,`${x} / ${y}`);}
});
test('network bullets and throws interpolate across snapshots and disappear immediately when hidden',()=>{
  let network;class Network{constructor(receive){this.receive=receive;this.active=this.connected=true;this.credentials={playerId:0,code:'TEST'};network=this;}}
  const h=harness(1280,{Network}),w=h.window,G=w.Gridfall,s=w.GridfallPractice.createState(913);s.practice=false;s.phase='resolution';s.tick=0;s.events=[];s.plans={};
  for(const row of s.tiles)for(const tile of row){tile.type='floor';tile.hp=0;tile.loot=null;delete tile.roof;}
  s.projectiles=[{x:11.5,y:10.5,dx:1,dy:0,owner:null}];s.flights=[{x:10,y:10,lift:.5,progress:.2,item:'smoke',owner:null}];
  const send=(state,seq,init=false)=>{state.visibility=G.VISION.field(state,state.units[0],G.sightRange(state.units[0]));state.visibleCells=[];network.receive({type:'state',state,seq,init,matchId:1,stage:'resolution',locked:true,remainingMs:3000,planningMs:20000,spectating:null});};
  send(s,1,true);h.frames(1,16);const next=structuredClone(s);next.tick=2;next.projectiles[0].x=13.5;next.flights[0].x=11;next.flights[0].lift=.9;next.flights[0].progress=.4;send(next,2);
  h.frames(1,30);let p=w.GRIDFALL_MOTION();assert.ok(Math.abs(p.projectiles[0].x-(11.5+2/3))<1e-8);assert.ok(p.flights[0].x>10&&p.flights[0].x<11);assert.equal(next.projectiles[0].x,13.5);
  const jump=structuredClone(next);jump.tick=4;jump.projectiles[0].x=15.5;const before=p.projectiles[0].x;send(jump,3);assert.equal(w.GRIDFALL_MOTION().projectiles[0].x,before);h.frames(1,16);assert.ok(w.GRIDFALL_MOTION().projectiles[0].x>before);
  const hidden=structuredClone(jump);hidden.tick=6;hidden.projectiles=[];hidden.flights=[];send(hidden,4);assert.equal(w.GRIDFALL_MOTION().projectiles.length,0);assert.equal(w.GRIDFALL_MOTION().flights.length,0);
});
test('terrain sight is reused without Smoke and recomputed separately when Smoke appears',async()=>{
  const {h,state}=await practice(),V=h.window.Gridfall.VISION,field=V.field;let withSmoke=0,withoutSmoke=0;V.field=(...args)=>{args[3]===false?withoutSmoke++:withSmoke++;return field(...args);};h.frames(1,16);assert.ok(withSmoke>0);assert.equal(withoutSmoke,0);
  withSmoke=withoutSmoke=0;state.smokes.push({x:9,y:10,expires:999});h.frames(1,16);assert.ok(withSmoke>0);assert.ok(withoutSmoke>0);
});
test('large maps draw every visible tile at full detail while omitting tiles outside the camera',()=>{
  let network;const tiles=[];class Network{constructor(receive){this.receive=receive;this.active=this.connected=true;this.credentials={playerId:0,code:'TEST'};network=this;}}
  const h=harness(1280,{Network,paint:{fillRect(x,y,width,height){if(width===32&&height===32)tiles.push([x/32,y/32]);}}}),G=h.window.Gridfall,s=h.window.GridfallPractice.createState(913);
  Object.assign(s,{practice:false,width:60,height:60,size:60,phase:'resolution',tick:0,events:[],plans:{},visibleCells:[]});s.tiles=Array.from({length:60},()=>Array.from({length:60},()=>({type:'floor',rank:0,hp:0,loot:null})));Object.assign(s.units[0],{x:30,y:30});s.visibility=G.VISION.field(s,s.units[0],G.sightRange(s.units[0]));
  network.receive({type:'state',state:s,seq:1,init:true,matchId:1,stage:'resolution',locked:true,remainingMs:3000,planningMs:20000,spectating:null});tiles.length=0;h.frames(1,16);
  const view=h.window.GRIDFALL_STATUS(),left=Math.max(0,Math.floor(view.camera.x)),top=Math.max(0,Math.floor(view.camera.y)),right=Math.min(60,Math.ceil(view.camera.x+view.viewport.x)),bottom=Math.min(60,Math.ceil(view.camera.y+view.viewport.y)),drawn=new Set(tiles.map(p=>p.join(',')));
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)assert.ok(drawn.has(x+','+y),`missing ${x},${y}`);
  assert.ok(tiles.length<900,`${tiles.length} tiles drawn out of 3600`);assert.equal(drawn.has('0,0'),false);
});
