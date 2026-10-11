const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
async function setup(width=1280){
  let state;const h=harness(width,{devicePixelRatio:2,preparePractice:s=>{state=s;for(const row of s.tiles)for(const tile of row)Object.assign(tile,{type:'floor',loot:null});Object.assign(s.units[1],{x:24,y:16});}});
  h.window.GridfallPractice.botPlan=()=>[{type:'wait'},{type:'wait'}];await h.$('menu-free-practice').click();
  const status=()=>h.window.GRIDFALL_STATUS();
  const pointer=(type,p)=>{const s=status(),r=h.$('arena').getBoundingClientRect();h.$('arena').dispatchEvent({type,pointerType:width===390?'touch':'mouse',pointerId:1,button:0,buttons:type==='pointerup'?0:1,clientX:(p.x+.5-s.camera.x)/s.viewport.x*r.width,clientY:(p.y+.5-s.camera.y)/s.viewport.y*r.height});};
  const target=p=>{pointer('pointerdown',p);pointer('pointerup',p);};
  return {...h,state,status,pointer,target,choose:type=>h.$('actions').querySelector('[data-type="'+type+'"]').click()};
}
function atDestination(h,p){const s=h.status();assert.ok(Math.abs(s.camera.x+s.viewport.x/2-(p.x+.5-s.viewport.x*.07))<.001,'camera centers the planned destination');assert.ok(Math.abs(s.camera.y+s.viewport.y/2-(p.y+.5-s.viewport.y*.15))<.001);assert.equal(s.camera.follow,true);}
for(const width of [1280,390])test('Follow tracks a drawn route after release and stays there for the second action at width '+width,async()=>{
  const h=await setup(width);h.$('camera-center').click();h.frames(8);const s=h.status(),destination={x:s.player.x+3,y:s.player.y},before={...s.camera};
  h.pointer('pointerdown',s.player);h.pointer('pointermove',destination);h.frames(2);assert.deepEqual({...h.status().camera},before,'holding a route does not drift its pointer coordinates');assert.equal(h.status().queued,0);
  h.pointer('pointerup',destination);h.frames(2);assert.ok(h.status().camera.x>before.x&&h.status().camera.x<before.x+3,'camera travels smoothly');h.frames(6);atDestination(h,destination);assert.equal(h.status().plan[0].drawn,true);assert.equal(h.status().player.x,s.player.x,'planning does not move the real operator');
  h.choose('shoot');h.target({x:destination.x+2,y:destination.y});assert.equal(h.status().queued,2);assert.ok(Math.abs(h.status().plan[1].angle)<.001,'second shot aims from the planned destination');h.frames(2);atDestination(h,destination);
  h.$('undo-button').click();h.$('undo-button').click();h.frames(8);atDestination(h,s.player);
});
test('Follow tracks both Strider dash and Wraith teleport, and only movement changes its destination',async()=>{
  const h=await setup();
  for(const character of ['vanguard','volt']){
    h.$('practice-character').onchange({target:{value:character}});h.$('camera-center').click();h.frames(8);const s=h.status(),p={x:s.player.x+3,y:s.player.y};
    h.$('skill-button').click();h.target(p);assert.equal(h.status().plan[0].type,character==='vanguard'?'skillMove':'blink');h.frames(8);atDestination(h,p);
    h.choose('grenade');h.target({x:p.x+2,y:p.y});h.frames(2);atDestination(h,p);h.$('undo-button').click();h.$('undo-button').click();h.frames(8);atDestination(h,s.player);
  }
});
test('free camera stays still after movement; enabling Follow centers the already queued destination',async()=>{
  const h=await setup(),s=h.status();h.document.dispatchEvent({type:'keydown',code:'KeyD',key:'D'});h.frames(1);h.document.dispatchEvent({type:'keyup',code:'KeyD',key:'D'});const free={...h.status().camera};
  const destination={x:s.player.x+2,y:s.player.y};h.target(destination);h.frames(8);assert.equal(h.status().queued,1);assert.deepEqual({...h.status().camera},free);
  h.$('camera-center').click();h.frames(8);atDestination(h,destination);
});
test('confirming a plan restores Follow to the displayed actor and turns complete without a combat report',async()=>{
  const h=await setup(),s=h.status();h.target({x:s.player.x+3,y:s.player.y});h.frames(8);const plannedCamera=h.status().camera.x;h.choose('guard');h.$('lock-button').click();h.frames(1,16);
  assert.equal(h.status().phase,'resolution');assert.ok(h.status().camera.x<plannedCamera,'resolving follows actual movement rather than a queued destination');assert.equal(h.$('turn-report'),null);
  h.frames(86);assert.equal(h.status().phase,'planning');assert.equal(h.status().queued,0);assert.equal(h.$('turn-report'),null);assert.equal(h.status().camera.follow,true);
});
test('online resolution finishes without a report and returns Follow to the new turn position',()=>{
  let network;class Network{constructor(receive){this.receive=receive;this.active=this.connected=true;this.credentials={playerId:0,code:'TEST'};network=this;}}
  const h=harness(390,{Network}),G=h.window.Gridfall,s=h.window.GridfallPractice.createState(913);s.practice=false;
  const send=(state,seq)=>network.receive({type:'state',state,seq,init:seq===1,matchId:1,stage:state.phase,locked:state.phase!=='planning',remainingMs:20000,planningMs:20000,spectating:null});
  send(s,1);G.beginTurn(s,Object.fromEntries(s.units.map(u=>[u.id,[{type:'wait'},{type:'wait'}]])));send(structuredClone(s),2);while(s.phase==='resolution')G.step(s);send(structuredClone(s),3);
  assert.equal(h.window.GRIDFALL_STATUS().phase,'planning');assert.equal(h.window.GRIDFALL_STATUS().queued,0);assert.equal(h.$('turn-report'),null);
});
