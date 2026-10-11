const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
async function setup(width=390,mode='free'){
  const h=harness(width,{preparePractice:s=>{for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',loot:null});}});await h.$(mode==='walkthrough'?'menu-walkthrough':'menu-free-practice').click();
  const status=()=>h.window.GRIDFALL_STATUS();
  function touch(type,p,id=1){const s=status(),r=h.$('arena').getBoundingClientRect();h.$('arena').dispatchEvent({type,pointerType:'touch',pointerId:id,button:0,buttons:type==='pointerup'?0:1,clientX:p.pixel?p.x:(p.x+.5-s.camera.x)/s.viewport.x*r.width,clientY:p.pixel?p.y:(p.y+.5-s.camera.y)/s.viewport.y*r.height});}
  return {...h,status,touch,choose:type=>h.$('actions').querySelector('[data-type="'+type+'"]').click()};
}
test('touch aiming stays a preview until release, including updated shoot direction',async()=>{
  const h=await setup();h.choose('shoot');let s=h.status(),p={x:s.player.x+2,y:s.player.y};h.touch('pointerdown',p);assert.equal(h.status().queued,0);assert.ok(h.window.GRIDFALL_PREVIEW().ray);h.touch('pointermove',{x:s.player.x,y:s.player.y-2});assert.equal(h.status().queued,0);h.touch('pointerup',{x:s.player.x,y:s.player.y-2});assert.equal(h.status().queued,1);assert.ok(Math.abs(h.status().plan[0].angle+Math.PI/2)<.001);assert.equal(h.status().phase,'planning');
});
test('touch Move previews automatic routes and manually drawn routes before release',async()=>{
  const h=await setup(),s=h.status(),p={x:s.player.x+1,y:s.player.y};h.touch('pointerdown',p);assert.equal(h.status().queued,0);assert.equal(h.window.GRIDFALL_PREVIEW().hover.ok,true);h.touch('pointerup',p);assert.equal(h.status().plan[0].type,'move');h.$('undo-button').click();
  h.touch('pointerdown',s.player);h.touch('pointermove',p);assert.equal(h.status().queued,0);assert.equal(h.status().movement.path.length,1);h.touch('pointerup',p);assert.equal(h.status().queued,1);assert.equal(h.status().plan[0].drawn,true);assert.equal(h.status().movement,null);
});
test('Smoke, grenade and targetable skills all commit only on touch release',async()=>{
  const h=await setup();for(const type of ['smoke','grenade','slash','skillMove','blink','firebomb','stasis','mend']){
    const character={skillMove:'vanguard',blink:'volt',firebomb:'pyro',stasis:'mire',mend:'halo'}[type];if(character){h.$('practice-character').onchange({target:{value:character}});h.$('skill-button').click();}else h.choose(type);
    const s=h.status(),p={x:s.player.x+1,y:s.player.y};h.touch('pointerdown',p);assert.equal(h.status().queued,0,type+' previews');h.touch('pointerup',p);assert.equal(h.status().plan[0]?.type,type,type+' release');h.$('undo-button').click();
  }
});
test('Cancel, outside release, pointer cancellation, lost capture and blur discard the aim',async()=>{
  const h=await setup();h.choose('shoot');const s=h.status(),p={x:s.player.x+2,y:s.player.y};
  for(const trigger of [()=>h.$('mobile-cancel').click(),()=>h.touch('pointercancel',p),()=>h.$('arena').dispatchEvent({type:'lostpointercapture',pointerId:1}),()=>h.window.dispatchEvent({type:'blur'})]){h.touch('pointerdown',p);trigger();h.touch('pointerup',p);assert.equal(h.status().queued,0);}
  h.touch('pointerdown',p);h.touch('pointerup',{pixel:true,x:-5,y:20});assert.equal(h.status().queued,0);
});
test('a second finger cancels shooting, pans and pinches, and never queues on the last finger release',async()=>{
  const h=await setup();h.choose('shoot');const a={pixel:true,x:550,y:320},b={pixel:true,x:650,y:320};h.touch('pointerdown',a,1);h.touch('pointerdown',b,2);const before=h.status().camera;
  h.touch('pointermove',{pixel:true,x:720,y:340},2);assert.ok(h.status().camera.zoom>before.zoom);assert.notEqual(h.status().camera.x,before.x);assert.equal(h.status().camera.follow,false);h.touch('pointerup',b,2);h.touch('pointermove',{pixel:true,x:500,y:320},1);h.touch('pointerup',a,1);assert.equal(h.status().queued,0);
});
test('Pan toggles one-finger camera controls; selecting an action returns to aiming',async()=>{
  const h=await setup(),p={pixel:true,x:550,y:320};h.$('mobile-pan').click();assert.equal(h.$('mobile-pan').getAttribute('aria-pressed'),'true');const x=h.status().camera.x;h.touch('pointerdown',p);h.touch('pointermove',{pixel:true,x:620,y:320});h.touch('pointerup',p);assert.notEqual(h.status().camera.x,x);assert.equal(h.status().queued,0);h.choose('shoot');assert.equal(h.$('mobile-pan').getAttribute('aria-pressed'),'false');
});
test('changing action, reset, visibility, or camera controls cancels an outstanding aim',async()=>{
  const h=await setup();
  for(const cancel of [()=>h.choose('slash'),()=>h.$('camera-in').click(),()=>{h.document.hidden=true;h.document.dispatchEvent({type:'visibilitychange'});h.document.hidden=false;h.document.dispatchEvent({type:'visibilitychange'});},()=>h.$('help-button').click()]){
    h.choose('shoot');const s=h.status(),p={x:s.player.x+2,y:s.player.y};h.touch('pointerdown',p);cancel();h.touch('pointerup',p);assert.equal(h.status().queued,0);if(!h.$('help').classList.contains('hidden'))h.$('close-help').click();
  }
  h.choose('shoot');let s=h.status(),p={x:s.player.x+2,y:s.player.y};h.touch('pointerdown',p);await h.$('practice-reset').click();h.touch('pointerup',p);assert.equal(h.status().queued,0);
});
test('mobile tabs preserve equipment controls and restore the desktop DOM on resize',async()=>{
  const h=await setup();assert.equal(h.$('skill-button').parentElement,h.$('mobile-action-grid'));assert.equal(h.$('loadout-dock').parentElement,h.$('mobile-pane-gear'));assert.equal(h.$('lock-button').parentElement,h.$('mobile-commit'));assert.equal(h.$('mobile-dock').hidden,false);
  h.$('mobile-tabs').children[1].click();assert.equal(h.$('mobile-pane-gear').hidden,false);h.$('weapon-tabs').querySelector('[data-weapon="shotgun"]').click();assert.equal(h.$('weapon-tabs').querySelector('[data-weapon="shotgun"]').getAttribute('aria-pressed'),'true');
  h.window.innerWidth=1280;h.window.dispatchEvent({type:'resize'});assert.equal(h.$('skill-button').parentElement,h.document.querySelector('.command-panel'));assert.equal(h.$('loadout-dock').parentElement,h.$('left-hud'));assert.equal(h.$('mobile-dock').hidden,true);
  h.window.innerWidth=390;h.window.dispatchEvent({type:'resize'});assert.equal(h.$('skill-button').parentElement,h.$('mobile-action-grid'));assert.equal(h.$('actions').children.length,8);
});
test('touch walkthrough teaches gestures and directs loadout lessons to the correct panel',async()=>{
  const h=await setup(390,'walkthrough');assert.match(h.$('walkthrough-task').textContent,/Pinch/);h.$('walkthrough-lesson').onchange({target:{value:'pickup'}});assert.match(h.$('walkthrough-task').textContent,/Hold/);h.$('walkthrough-lesson').onchange({target:{value:'zoom'}});assert.match(h.$('walkthrough-task').textContent,/Pinch/);assert.equal(h.$('mobile-pane-map').hidden,false);h.$('walkthrough-lesson').onchange({target:{value:'weapon'}});assert.equal(h.$('mobile-pane-gear').hidden,false);h.$('walkthrough-lesson').onchange({target:{value:'operator'}});assert.equal(h.$('mobile-pane-guide').hidden,false);assert.match(h.$('walkthrough-task').textContent,/operator/);
});
test('a new match opens Actions and clears the previous camera Pan mode',async()=>{
  const h=await setup();h.$('mobile-pan').click();h.$('mobile-tabs').children[3].click();h.$('restart-button').click();h.$('exit-confirm').click();await h.$('start-button').click();assert.equal(h.$('mobile-pane-actions').hidden,false);assert.equal(h.$('mobile-pan').getAttribute('aria-pressed'),'false');
});
test('desktop mouse still queues shooting on press',async()=>{
  const h=await setup(1280);h.choose('shoot');const s=h.status();h.point({x:s.player.x+2,y:s.player.y});assert.equal(h.status().queued,1);assert.equal(h.$('mobile-dock').hidden,true);
});
test('Confirm plan cancels a held aim and touch release cannot edit a resolving turn',async()=>{
  const h=await setup();h.choose('guard');assert.equal(h.status().queued,1);h.choose('shoot');const s=h.status(),p={x:s.player.x+2,y:s.player.y};h.touch('pointerdown',p);h.$('lock-button').click();assert.equal(h.status().phase,'resolution');h.touch('pointerup',p);assert.equal(h.status().plan[1].type,'wait');
});
test('a multiplayer resolution packet cancels an in-progress touch preview',()=>{
  let network;class Network{constructor(receive){this.receive=receive;this.active=this.connected=true;this.credentials={playerId:0,code:'TEST'};network=this;}}
  const h=harness(390,{Network}),state=h.window.GridfallPractice.createState(913);state.practice=false;
  const packet=(s,seq)=>network.receive({type:'state',state:s,seq,init:seq===1,matchId:1,stage:s.phase,locked:s.phase!=='planning',remainingMs:3000,planningMs:20000,spectating:null});packet(state,1);
  h.$('actions').querySelector('[data-type="shoot"]').click();const touch=type=>h.$('arena').dispatchEvent({type,pointerType:'touch',pointerId:1,button:0,clientX:500,clientY:320});touch('pointerdown');assert.equal(h.window.GRIDFALL_STATUS().queued,0);assert.ok(h.window.GRIDFALL_PREVIEW().ray);
  const next=structuredClone(state);next.phase='resolution';next.tick=1;next.events=[];next.plans={0:[{type:'wait'},{type:'wait'}]};packet(next,2);touch('pointerup');assert.equal(h.window.GRIDFALL_STATUS().phase,'resolution');assert.ok(h.window.GRIDFALL_STATUS().plan.every(a=>a.type==='wait'));assert.equal(h.window.GRIDFALL_PREVIEW().ray,null);
});
