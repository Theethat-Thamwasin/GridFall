(function () {
  'use strict';
  const G = window.Gridfall, R = window.GridfallReplay, U = window.GridfallTactics, $ = id => document.getElementById(id), canvas = $('arena'), ctx = canvas.getContext('2d'), sound = new SoundEngine();
  const ACTIONS = [
    { type: 'move', name: 'MOVE', icon: '↗', key: '1', hint: "Click a destination for an automatic route, or drag from your operator in 4 directions." },
    { type: 'shoot', name: 'SHOOT', icon: '⌖', key: '2', hint: "Aim freely and click. Bullets travel the weapon's full range." },
    { type: 'slash', name: 'SLASH', icon: '╱', key: '3', hint: "Aim and click · 120° arc · 1.5 tiles · 45 damage" },
    { type: 'smoke', name: 'SMOKE', icon: '≋', key: '4', hint: "Click where to throw Smoke. Covers 3×3 tiles and blocks vision for 2 turns; bullets pass through." },
    { type: 'guard', name: 'GUARD', icon: '◇', key: 'G', hint: "Guard · Reduces damage by 40% from activation until this turn ends." },
    { type: 'reload', name: 'RELOAD', icon: '↻', key: 'R', hint: "Reload · Costs 1 AP" },
    { type: 'heal', name: 'HEAL', icon: '+', key: 'H', hint: "Use a Medkit · Restore 35 HP · Costs 1 AP" },
    { type: 'grenade', name: 'GRENADE', icon: '◉', key: 'B', hint: "Throw a grenade · Range 6 · Destroys walls." }
  ];
  const actionFlights=new Set();
  let routeDrag=null,soloClashUntil=0,soloClashOutcome=null,clashUIStamp="";
  let exitAt=0,exitFocus=null,returnTimer=null,returningRoom=false;
  let lastShield=20;
  const V=G.VISION,fogSurface=document.createElement('canvas'),fogInk=fogSurface.getContext('2d');let sightCache={};
  const P=window.GridfallPresentation, TUTORIAL=window.GridfallPractice, particles=new window.GridfallEffects.ParticlePool(240);
  let collapseAt=-10,collapseTurn=-1,frameDt=1/60;const unitFacing=new Map();
  let explored=new Set(),report={dealt:0,received:0,shots:0,items:0},reportTurn=0,lastMatch=null,menuReplay=false,shakeUntil=0,resultTicket=0,actionHover=null;
  let playerId = 0, netPacket = null, fetchingArchive = false, spectateId = null, lobbyPacket = null, lobbyDirty = false, lobbySaving = false, lobbyStarting = false;
  const network = new window.GridfallNetwork(receivePacket, () => { updateConnection(); if (G.WEAPONS[player()?.weapon]) updateUI(); });
  let selectedMap = 'medium', state = G.createState(Date.now() & 0xffffff, 'vanguard', selectedMap), selectedClass = 'vanguard', plan = [], selected = 'move', hover = null, aimMouse = null, started = false, spectating = false, deathShown = false;
  let planningDuration = 20, deadline = 0, botPlans = {}, lastTime = performance.now(), accumulator = 0, effects = [], signals = [], logs = [];
  let replay = null, replayFrames = [], archive = new R.MatchArchive(), frozenBefore = null, toastUntil = 0, pausedAt = 0, warnedSecond = -1, fogCache = { stamp: '', cells: new Set() };
  let playerDeathTurn = null, practiceTurns=0, practiceUsed=new Set();
  let previewCache = { stamp: '', context: null, cells: [] };
  const CELL = 32;
  const M = window.GridfallMotion, TICK = G.TIMING.tickMs / 1000;
  const unitMotion = new M.UnitMotion(TICK), trails = new window.GridfallEffects.MotionTrails(384);
  let motionTime = 0, cameraFlight = null,fateFxTurn=0;
  const fateUI=window.GridfallFateUI.create({leaveLesson:()=>{jumpLesson(Math.max(0,state.walkthrough.index-1));$('walkthrough-lesson').focus();},anchor:()=>{const r=$('fate-hud').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};},sound:name=>sound.play(name),choose:async message=>{
    if(network.active)return network.command({action:'draft',...message});
    G.FATE.pick(state,playerId,message);
    walkEvent('fate');
    if(state.fate.draft.picks[playerId])settleSoloDraft();updateUI();
  },skip:()=>{if(!network.active&&state.phase==='draftReveal'){state.phase='planning';startPlanning();} }});
  const W=window.GridfallWalkthrough;
  function walkEvent(event){if(W.notify(state,event))updatePracticeUI();}
  function refreshLesson(){cancelRoute();clearActionFlights();plan=[];selected='move';unitMotion.clear();trails.clear();fogCache.stamp='';previewCache.stamp='';centerCamera();startPlanning();updateUI();}
  function jumpLesson(lesson){if(W.jump(state,lesson)){fateUI.close();refreshLesson();canvas.focus({preventScroll:true});}}
  function nextLesson(retry=false){if(!state.walkthrough)return;if(state.walkthrough.finished)return start('free');if(retry)return jumpLesson(state.walkthrough.index);if(!state.walkthrough.ready)return jumpLesson((state.walkthrough.index+1)%W.steps.length);if(W.advance(state)){if(state.walkthrough.finished)state.phase='planning';refreshLesson();}}
  const practiceUI=window.GridfallPracticeUI.create({reset:()=>start(state.walkthrough?'walkthrough':'free'),mode:mode=>start(mode),next:()=>nextLesson(),retry:()=>nextLesson(true),jump:jumpLesson,previous:()=>jumpLesson(state.walkthrough.index-1),character:id=>{if(!canPlan()||!state.practice||state.walkthrough&&!state.walkthrough.finished&&W.current(state)?.id!=='operator')return;const changed=id!==player().class;cancelRoute();clearActionFlights();plan=[];if(TUTORIAL.changeCharacter(state,id)){selectedClass=id;selected='move';previewCache.stamp='';fogCache.stamp='';unitMotion.clear();for(const button of $('class-picker').children)button.classList.toggle('selected',button.dataset.class===id);$('class-description').textContent=G.CLASSES[id].description;P.setOperator(id);if(changed)walkEvent('character');sound.play('click');updateUI();}},weapon:id=>{if(!canPlan()||!state.practice)return;cancelRoute();clearActionFlights();plan=[];G.equipWeapon(state,player(),id);previewCache.stamp='';sound.play('reload');updateUI();}});
  function updatePracticeUI(){practiceUI.update({active:started&&!!state.practice,phase:state.phase,queued:plan.length,turns:practiceTurns,healed:practiceUsed.has('heal'),unit:player(),paused:isPaused()||!!replay,walkthrough:state.walkthrough||null});}
  const loadoutDock=document.createElement('section');loadoutDock.id='loadout-dock';loadoutDock.setAttribute('aria-label','Loadout');document.body.append(loadoutDock);loadoutDock.append(document.querySelector('.operator-card'),document.querySelector('.loot-panel'),$('fate-hud'));
  const leftHud=document.createElement('aside');leftHud.id='left-hud';leftHud.setAttribute('aria-label','Battlefield information');
  const fieldTools=document.createElement('section');fieldTools.id='field-tools';fieldTools.setAttribute('aria-label','Map information and camera');
  fieldTools.append($('drop-countdown'),$('platform-legend'),document.querySelector('.camera-controls'),$('camera-mode'));
  leftHud.append(fieldTools,$('practice-panel'),loadoutDock);document.body.append(leftHud);
  for(const [id,label,icon]of [['camera-out','Zoom out','zoomOut'],['camera-in','Zoom in','zoomIn'],['camera-fit','Fit whole map','fit'],['camera-center','Follow operator [C]','follow']]){
    const button=$(id);button.setAttribute('aria-label',label);button.title=label;button.innerHTML=P.icon(icon);
  }
  function settleSoloDraft(){G.FATE.settle(state);G.normalizeEquipment(state);if(state.practice)TUTORIAL.afterTurn(state);archive.draftHistory=structuredClone(state.fate.history);deadline=performance.now()+2000;plan=[];updateUI();}

  const viewSpan = () => ({ x: canvas.width / CELL / camera.zoom, y: canvas.height / CELL / camera.zoom });
  let camera = { x: 0, y: 0, zoom: window.innerWidth <= 790 ? .9 : 1.2, follow: true }, drag = null;
  function player() { return state.units[playerId]; }
  function viewerId() { return !replay && spectating && spectateId != null ? spectateId : playerId; }
  function watchable() { return network.active ? netPacket?.watchable || [] : state.units.filter(u => u.alive); }
  function setSpectator(id) {
    const changed = spectateId !== id || !spectating;
    spectateId = id; spectating = true; deathShown = true; plan = []; hover = aimMouse = null;
    $('result').classList.add('hidden'); fogCache.stamp = '';
    const u = state.units[id];
    if (changed && u?.alive && u.x >= 0) { unitMotion.clear(); trails.clear();unitFacing.clear(); flyCamera({cx:u.x+.5,cy:u.y+.5,zoom:camera.zoom},1.1,true); }
    updateUI();
  }
  async function chooseSpectator(step = 0) {
    if (player().alive || state.phase === 'ended' || replay) return;
    const choices = watchable(); if (!choices.length) return;
    const at = choices.findIndex(u => u.id === spectateId), id = choices[(at < 0 ? 0 : (at + step + choices.length) % choices.length)].id;
    try { if (network.active) await network.command({action:'spectate',targetId:id}); else { setSpectator(id); if (state.phase === 'planning') startPlanning(); } }
    catch { toast("Reconnecting · Try spectating again."); }
  }
  function updateSpectatorUI() {
    if (!network.active && spectating && !state.units[spectateId]?.alive && state.phase !== 'ended') { const next = watchable()[0]; if (next) setSpectator(next.id); }
    const watching = spectating && !replay && state.phase !== 'ended';
    document.body.classList.toggle('spectating-live',watching); $('spectator-bar').classList.toggle('hidden',!watching);
    if (!watching) return;
    const u = state.units[spectateId]; if (!u) return;
    $('spectator-name').textContent = u.name;
    $('spectator-detail').textContent = G.CLASSES[u.class].name + ' · HP ' + u.hp + ' · ◇ ' + u.shield;
    for (const id of ['spectator-prev','spectator-next']) $(id).disabled = watchable().length < 2 || network.active && (!network.connected || network.busy);
    $('field-note').textContent = "Watch a survivor's view · ‹ › switch player · EXIT to menu";
  }
  function coord(p) { if (!p) return ''; let n = p.x + 1, label = ''; while (n > 0) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); } return label + (p.y + 1); }
  function angleLabel(angle) { return ((angle * 180 / Math.PI + 360) % 360).toFixed(1) + '°'; }
  function replayPadding() { return replay ? Math.min(canvas.height * .35, $('replay-controls').getBoundingClientRect().height + 20) : 0; }
  // Follow may look beyond the map edge so random edge spawns stay in the
  // usable center of the screen instead of disappearing beneath floating HUD.
  function cameraPose(c = camera) { return { cx: c.x + canvas.width / CELL / c.zoom / 2, cy: c.y + canvas.height / CELL / c.zoom / 2, zoom: c.zoom }; }
  function applyPose(pose) { camera.zoom = pose.zoom; const span = viewSpan(); camera.x = pose.cx - span.x / 2; camera.y = pose.cy - span.y / 2; }
  function resetMotion() { stopKeyboardPan(); unitMotion.clear(); trails.clear();unitFacing.clear(); motionTime = 0; cameraFlight = null; }
  function centerCamera(s = state) { resetMotion(); const u = s.units[viewerId()]; applyPose({ cx: u.x + .5-(s.practice?viewSpan().x*.07:0), cy: u.y + .5-(s.practice?viewSpan().y*.15:0), zoom: camera.zoom }); }
  function flyCamera(target, duration = .85, follow = false) { camera.follow = follow; cameraFlight = { from: cameraPose(), target, duration, elapsed: 0 }; }
  function overviewPose(s) { const zoom = Math.min(canvas.width / CELL / s.width, (canvas.height - replayPadding()) / CELL / s.height); return { cx: s.width / 2, cy: s.height / 2 + replayPadding() / (2 * CELL * zoom), zoom }; }
  function fitCamera(s = state) { flyCamera(overviewPose(s), 1.15); }
  const panKeys = new Set(), PAN_KEYS = {KeyW:[0,-1],KeyA:[-1,0],KeyS:[0,1],KeyD:[1,0],ArrowUp:[0,-1],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowRight:[1,0]};
  function stopKeyboardPan() { panKeys.clear(); }
  function keyboardPan(dt) {
    if (!panKeys.size || !started || replay || isPaused() || ['draft','draftReveal','ended','clash'].includes(state.phase)) { stopKeyboardPan(); return false; }
    let dx=0,dy=0; for (const key of panKeys) { dx+=PAN_KEYS[key][0];dy+=PAN_KEYS[key][1]; }
    const length=Math.hypot(dx,dy);
    if (length) { const speed=360/CELL/camera.zoom;panCamera(dx/length*speed*dt,dy/length*speed*dt,true); }
    return true;
  }
  function advanceCamera(dt, s) {
    if (keyboardPan(dt) || routeDrag) return;
    if (cameraFlight) {
      cameraFlight.elapsed += dt; applyPose(M.poseBetween(cameraFlight.from, cameraFlight.target, cameraFlight.elapsed / cameraFlight.duration));
      if (cameraFlight.elapsed >= cameraFlight.duration) cameraFlight = null;
      return;
    }
    let target;
    if (replay) {
      if (replay.view === 'overview') target = overviewPose(s);
      else { const u = s.units[Number(replay.view)]; if (u.hidden || u.x < 0) return; const p = unitMotion.sample(u.id, motionTime) || u; target = { cx: p.x + .5, cy: p.y + .5, zoom: window.innerWidth <= 790 ? 1.05 : 1.45 }; }
    } else if (camera.follow) { const p = unitMotion.sample(viewerId(), motionTime) || s.units[viewerId()]; target = { cx: p.x + .5-(state.practice?viewSpan().x*.07:0), cy: p.y + .5-(state.practice?viewSpan().y*.15:0), zoom: camera.zoom }; }
    if (target) { const current = cameraPose(), ease = 1 - Math.exp(-dt * (replay ? 3 : 7)); applyPose({ cx: current.cx + (target.cx - current.cx) * ease, cy: current.cy + (target.cy - current.cy) * ease, zoom: Math.exp(Math.log(current.zoom) + Math.log(target.zoom / current.zoom) * ease) }); }
  }
  function allVisible() { return !!replay && replay.kind === 'match' && state.phase === 'ended'; }
  function panCamera(dx, dy, direct = false) { if(dx||dy)walkEvent('pan');cancelRoute(); const target = !direct && cameraFlight ? { ...cameraFlight.target } : cameraPose(); target.cx = Math.max(0, Math.min(state.width, target.cx + dx)); target.cy = Math.max(0, Math.min(state.height, target.cy + dy)); if (direct) { cameraFlight = null; camera.follow = false; applyPose(target); } else flyCamera(target, .55); hover = aimMouse = null; }
  function zoomCamera(factor) { walkEvent('zoom');cancelRoute(); const target = cameraFlight ? { ...cameraFlight.target } : cameraPose(); target.zoom = Math.max(.35, Math.min(2.5, target.zoom * factor)); flyCamera(target, .6, camera.follow); hover = aimMouse = null; }
  function resizeArena() { cancelRoute(); const rect = $('canvas-wrap').getBoundingClientRect(); if (rect.width > 0 && rect.height > 0) { const pose = cameraPose(); canvas.width = Math.round(rect.width); canvas.height = Math.round(rect.height); hover = aimMouse = null; applyPose(pose); } }
  new ResizeObserver(resizeArena).observe($('canvas-wrap'));
  function lootNearPlan() { return G.nearbyLoot(state, { ...player(), ...virtualPosition() }); }
  function virtualPosition() { let p = { x: player().x, y: player().y }; for (const a of plan) if (a.target && ['move', 'skillMove', 'blink'].includes(a.type)) p = { ...a.target }; return p; }
  function toast(message) { $('arena-toast').textContent = message; $('arena-toast').classList.add('show'); toastUntil = performance.now() + 2800; }
  function log(message, kind = '') { logs.unshift({ message, kind, turn: state.turn }); logs = logs.slice(0, 35); updateLogs(); }
  function updateLogs() { $('intel').replaceChildren(...logs.map(item => { const row = document.createElement('div'); row.className = 'intel-entry ' + item.kind; const time = document.createElement('span'); time.className = 'time'; time.textContent = 'T' + String(item.turn).padStart(2, '0'); const text = document.createElement('span'); text.textContent = item.message; row.append(time, text); return row; })); }
  function isPaused() { return document.hidden || !$('help').classList.contains('hidden') || !$('exit-dialog').classList.contains('hidden'); }
  function canPlan() { return (!network.active || network.connected && !network.locked && !network.busy) && started && state.phase === 'planning' && player().alive && !replay && !isPaused() && !spectating; }
  function previewContext() {
    const u = player(), stamp = [state.turn,state.phase,state.terrainVersion,selected,u.x,u.y,u.class,u.weapon,u.ammo,u.reserve,u.medkits,u.grenades,u.smoke,u.hp,u.skillCooldown,u.scan,state.safeLimit,state.nextLimit,JSON.stringify(plan),JSON.stringify(routeDrag?.route.path),JSON.stringify(state.fields),u.stasisTurn,u.stasisSteps,JSON.stringify(state.smokes),JSON.stringify(state.units.map(a=>[a.id,a.x,a.y,a.alive]))].join('|');
    if (previewCache.state !== state || previewCache.stamp !== stamp) { let c = U.context(state,playerId,selected,plan,visibleCells(state),true); if(routeDrag){c={...c,origin:{...routeDrag.route.head},range:routeDrag.route.remaining,reachable:U.reachable(routeDrag.route.state,routeDrag.route.head,routeDrag.route.remaining)};} const queuedScan=selected==='scan'&&plan.at(-1)?.type==='scan'; previewCache = { state,stamp,context:c,cells:U.area(queuedScan?{...c,availability:{ok:true}}:c),rays:new Map() }; }
    return previewCache.context;
  }
  function shotPrediction(c,angle,range=c.range) { const key=[c.origin.x,c.origin.y,angle,range].join(':'); if(!previewCache.rays.has(key)){if(previewCache.rays.size>64)previewCache.rays.clear();previewCache.rays.set(key,U.ray(c,angle,range));}return previewCache.rays.get(key); }
  function selectAction(type) {
    if (!canPlan()) return;
    if (plan.length >= 2) return;
    const lesson=W.current(state);if(lesson&&!state.walkthrough.finished&&(state.walkthrough.ready||type!==(lesson.actions?.[plan.length]||lesson.action))){toast('Follow this lesson: '+lesson.title);return;}
    cancelRoute(); selected = type; sound.play('click');
    const definition = ACTIONS.find(a => a.type === type);
    $('field-note').textContent = definition ? definition.hint : G.CLASSES[player().class].description;
    if (['guard', 'reload', 'heal', 'scan', 'reflect'].includes(type)) queue({ type });
    updateUI();
  }
  function pulseSlots(color='#b9eaa0') { if(P.reduced())return;for(const slot of $('plan-slots').children)slot.animate([{boxShadow:'inset 0 0 0 1px '+color+'70',background:color+'18'},{boxShadow:'inset 0 0 0 1px '+color+'00',background:'#15212de8'}],{duration:520,easing:'ease-out'}); }
  function clearActionFlights(){for(const node of actionFlights){for(const animation of node.getAnimations())animation.cancel();node.remove();}actionFlights.clear();for(const slot of $('plan-slots').children){slot.classList.remove('action-arrived');for(const animation of slot.getAnimations())animation.cancel();}}
  function flyAction(type,index){
    const slot=$('plan-slots').children[index],button=$('actions').querySelector('[data-type="'+type+'"]')||$('skill-button'),accepted=plan[index],turn=state.turn;
    const valid=()=>slot.isConnected&&plan[index]===accepted&&state.turn===turn&&canPlan();
    function land(){
      if(!valid())return;const box=slot.getBoundingClientRect();sound.play('slotLand');slot.classList.add('action-arrived');setTimeout(()=>{if(plan[index]===accepted)slot.classList.remove('action-arrived');},460);
      if(P.reduced())return;
      slot.animate([{background:'#29443ce8',borderColor:'#afdfce',boxShadow:'inset 0 0 20px #9fe3b32a'},{background:'#15212de8',borderColor:'#536779',boxShadow:'inset 0 0 20px #9fe3b300'}],{duration:460,easing:'ease-out'});
      const ring=document.createElement('div');ring.className='action-arrival';ring.setAttribute('aria-hidden','true');Object.assign(ring.style,{left:box.x-3+'px',top:box.y-3+'px',width:box.width+6+'px',height:box.height+6+'px'});document.body.append(ring);actionFlights.add(ring);
      const remove=()=>{ring.remove();actionFlights.delete(ring);};ring.animate([{transform:'scale(.95)',opacity:.55},{transform:'scale(1.12)',opacity:0}],{duration:420,easing:'ease-out'}).finished.then(remove,remove);
    }
    if(P.reduced()){land();return;}
    const from=button.getBoundingClientRect(),to=slot.getBoundingClientRect(),x=from.x+from.width/2-20,y=from.y+from.height/2-20,dx=to.x+to.width/2-20-x,dy=to.y+to.height/2-20-y;
    sound.play('actionFly');
    for(const echo of [true,false]){
      const token=document.createElement('div');token.className='action-flight'+(echo?' echo':'');token.setAttribute('aria-hidden','true');token.innerHTML=P.icon(type);token.style.left=x+'px';token.style.top=y+'px';document.body.append(token);actionFlights.add(token);
      const frames=[{transform:'translate(0,0) scale(1)',opacity:echo?.15:.9},{transform:'translate('+dx*.48+'px,'+(dy*.48-20)+'px) scale(1.08)',opacity:echo?.12:1,offset:.48},{transform:'translate('+dx+'px,'+dy+'px) scale(.72)',opacity:0}];
      const remove=()=>{token.remove();actionFlights.delete(token);};token.animate(frames,{duration:echo?570:620,delay:echo?45:0,easing:'cubic-bezier(.25,.55,.25,1)'}).finished.then(()=>{remove();if(!echo)land();},remove);
    }
  }
  function queue(action) {
    if (!canPlan() || plan.length >= 2) return false;
    if(state.walkthrough&&!state.walkthrough.finished&&!W.accepts(state,action,plan)){toast('Follow this lesson: '+W.current(state)?.title);return false;}
    const allowed = U.availability(state,playerId,action.type,plan);
    if (!allowed.ok) return false;
    if (['shoot','slash'].includes(action.type) && !Number.isFinite(action.angle)) return false;
    plan.push(action); sound.play('queue');
    if (plan.length === 2) $('field-note').textContent = "Plan ready · Press SPACE to confirm.";
    updateUI(); flyAction(action.type,plan.length-1); return true;
  }
  function handleTile(p) {
    if (!canPlan() || plan.length >= 2) return;
    if (!['move','skillMove','blink','grenade','smoke','firebomb','stasis','mend'].includes(selected)) return;
    const verdict = U.target(previewContext(),p);
    if (!verdict.ok) return;
    queue({type:selected,target:p,...(verdict.path ? {path:verdict.path} : {})});
  }
  function updateUI() {
    updateSpectatorUI();
    const shown = replay ? replay.frames[replay.index] : state, u = shown.units[playerId], w = G.weaponStats(u), cls = G.CLASSES[u.class], shownPlan = replay ? shown.plans[playerId] || [] : plan;
    $('turn-number').textContent = String(shown.turn).padStart(2, '0');
    fateUI.update(shown,playerId,started,replay);
    $('map-dimensions').textContent = state.width + ' × ' + state.height; $('map-name').textContent = state.practice?'PRACTICE / OPEN RANGE':G.MAPS[state.mapId].name;
    $('alive').innerHTML = String(shown.aliveCount ?? shown.units.filter(a => a.alive).length).padStart(2, '0') + '<span> / '+String(shown.units.filter(u=>!u.removed).length).padStart(2,'0')+'</span>';
    $('operator-name').textContent = cls.name;
    const avatar=$('operator-avatar');if(avatar.dataset.character!==u.class){avatar.dataset.character=u.class;avatar.replaceChildren();const portrait=document.createElement('canvas');portrait.width=112;portrait.height=128;portrait.setAttribute('aria-hidden','true');P.drawOperator(portrait.getContext('2d'),56,88,.5,u.class,0);avatar.append(portrait);}
    $('operator-move').textContent=('Move ')+G.moveRange(shown,u);$('hp-label').textContent=('HP');$('shield-label').textContent=('Shield');$('shield-max').textContent='/ '+G.FATE.stats(u).shield;
    $('operator-role').textContent = (shown.mode==='team'?'TEAM '+u.team+' · ':'')+cls.role;
    $('hp-value').textContent = u.hp;document.querySelector('.health-row small').textContent='/ '+G.FATE.stats(u).maxHp; $('shield-value').textContent = u.shield; $('hp-bar').style.width = u.hp / G.FATE.stats(u).maxHp * 100 + '%'; $('hp-bar').style.background = u.hp <= 30 ? '#ff7666' : '#9fe3b3'; $('shield-bar').style.width = Math.min(100, u.shield / G.FATE.stats(u).shield * 100) + '%';
    $('weapon-type').textContent=w.short;$('weapon-name').textContent=w.name.split(' / ').at(-1);
    $('weapon-description').textContent=('Range ')+w.range+' · '+Math.round(w.damage*G.FATE.stats(u).damage)+' × '+(w.spread?1:w.shots)+' '+('DMG')+(G.FATE.stats(u).firstHit?' · First bullet +'+G.FATE.stats(u).firstHit:'');
    const glyph=document.querySelector('.weapon-glyph');if(glyph.dataset.weapon!==u.weapon){glyph.dataset.weapon=u.weapon;glyph.innerHTML=P.weaponIcon(u.weapon);}
    $('ammo-value').innerHTML=u.ammo+'<small><span>'+('Reserve')+'</span>'+u.reserve+'</small>';document.querySelector('.weapon-line').classList.toggle('empty-mag',u.ammo===0);
    const tabs=$('weapon-tabs'),tabStamp=JSON.stringify([u.weapons,u.weapon,u.ammo,u.weaponAmmo,u.weapons.map(type=>G.FATE.magazine(u,G.WEAPONS[type])),canPlan(),plan.length>0]);
    if(tabs.dataset.stamp!==tabStamp){tabs.dataset.stamp=tabStamp;const scroll=tabs.scrollTop;tabs.replaceChildren(...u.weapons.map(type=>{
      const gun={...G.WEAPONS[type],mag:G.FATE.magazine(u,G.WEAPONS[type])},b=document.createElement('button'),equipped=type===u.weapon,ammo=equipped?u.ammo:u.weaponAmmo[type];
      b.dataset.weapon=type;b.innerHTML='<i class="gun-icon" aria-hidden="true">'+P.weaponIcon(type)+'</i><b>'+gun.short+'</b><span class="gun-ammo">'+ammo+'<small>/'+gun.mag+'</small></span><i class="gun-selected" aria-hidden="true">✓</i>';
      b.title=gun.name+' · '+gun.damage+' DMG · '+(gun.spread?gun.spread.length+' RAYS / 1 ROUND':gun.shots+' ROUNDS')+' · RANGE '+gun.range;b.className=equipped?'selected':'';b.disabled=!canPlan()||plan.length>0;b.setAttribute('aria-pressed',String(equipped));b.setAttribute('aria-label',gun.name+(equipped?' · EQUIPPED':' · EQUIP'));
      b.onclick=()=>{if(!canPlan()||plan.length||state.walkthrough&&W.current(state)?.id==='weapon'&&type===u.weapon)return;if(network.active){network.command({action:'equip',turn:state.turn,weapon:type}).catch(()=>log("Command failed · Try again."));return;}if(!G.equipWeapon(state,u,type))return;walkEvent('weapon');makeEffect('equip',u.x,u.y,{duration:.65});sound.play('reload');updateUI();};return b;
    }));tabs.scrollTop=scroll;}
    for(const i of [0,1]) {
      const a = shownPlan[i], div = $('plan-slots').children[i]; div.classList.toggle('filled',!!a);
      const name = a ? (Object.values(G.CLASSES).find(c=>c.skillType===a.type)?.skill || a.type.toUpperCase()) : ('Choose action');
const detail = a ? (Number.isFinite(a.angle) ? angleLabel(a.angle) + ' · ' + (a.type === 'slash' ? Math.min(70,G.FATE.stats(u).melee+(u.hp<45?(G.FATE.stats(u).lowMelee||0):0))+' DMG / 1.5 RANGE' : w.range + ' FIXED RANGE') : a.target ? '→ ' + coord(a.target) + (a.path ? ' · ' + a.path.length + ' STEPS' : '') : { guard: ('Damage reduction ')+Math.round((.4+(G.FATE.stats(u).guardReduction||0))*100)+'%', reload: "Refill magazine", heal: '+'+G.FATE.stats(u).heal+' HP', scan: 'SCAN 14 / THROUGH COVER / 2 TURNS', reflect: 'ALL BULLETS / ABSORB 80% / TAKE 20%' }[a.type] || 'WAIT') : '';
      const markup = '<span class="slot-number">' + ((!replay&&(network.locked||['resolution','clash'].includes(state.phase)))?'✓':'0'+(i+1)) + '</span><div><b>' + name + '</b><small>' + detail + '</small></div><span>' + (i ? (40 * TICK).toFixed(2) + 's' : '0.0s') + '</span>'; if(div.dataset.markup!==markup){div.dataset.markup=markup;div.innerHTML=markup;}
    }
    document.body.classList.toggle('plan-committed',!replay&&(network.locked||['resolution','clash'].includes(state.phase)));
    $('ap-count').textContent = replay ? 'RECORDED ACTIONS' : ((2-plan.length)+' actions left'); $('undo-button').disabled = !canPlan() || !plan.length;
    const forecast = U.project(state,playerId,plan);
    for (const button of $('actions').children) {
      const type = button.dataset.type, allowed = U.availability(state,playerId,type,plan), definition = ACTIONS.find(a=>a.type===type);
      button.classList.toggle('selected',type===selected); button.disabled=!canPlan()||plan.length>=2;
      button.classList.toggle('blocked',canPlan()&&plan.length<2&&!allowed.ok); button.setAttribute('aria-disabled',String(button.disabled||!allowed.ok));
      const hint=type==='move'?"Click a reachable tile · Move range "+U.range(shown,playerId,'move',shownPlan)+" · Water costs 2 per tile":definition.hint;
      button.dataset.reason=allowed.ok?'':allowed.reason; button.title=definition.name+' ['+definition.key+'] · '+(allowed.ok?hint:allowed.reason); button.setAttribute('aria-label',button.title);
      const badge=button.querySelector('small');if(badge){const count={shoot:forecast.ammo,grenade:forecast.grenades,heal:forecast.medkits,smoke:forecast.smoke}[type];badge.textContent=count;badge.setAttribute('aria-label',count+(type==='shoot'?' rounds in magazine':' available'));}
    }
    $('skill-name').textContent = cls.skill; $('skill-info').textContent = cls.description.split(' • ')[0]; $('skill-cooldown').textContent = u.skillCooldown ? u.skillCooldown + ' T' : 'E'; $('skill-button').firstElementChild.innerHTML=P.icon(cls.skillType); $('skill-button').classList.toggle('selected',selected===cls.skillType);
    const skill = cls.skillType, skillAllowed=U.availability(state,playerId,skill,plan);
    $('skill-button').disabled=!canPlan()||plan.length>=2; $('skill-button').classList.toggle('blocked',canPlan()&&plan.length<2&&!skillAllowed.ok);
    $('skill-button').setAttribute('aria-disabled',String($('skill-button').disabled||!skillAllowed.ok)); $('skill-button').title=cls.skill+' [E] · '+cls.description;
    $('skill-button').dataset.reason=skillAllowed.ok?'':skillAllowed.reason;if(!u.skillCooldown)$('skill-cooldown').textContent='READY';if(forecast.skillUsed)$('skill-cooldown').textContent='QUEUED';
    $('skill-button').classList.toggle('skill-ready',canPlan()&&plan.length<2&&skillAllowed.ok&&!forecast.skillUsed);
    $('skill-button').style.setProperty('--skill-accent',P.accents[u.class]||'#cbb0ff');
    $('skill-button').setAttribute('aria-label',cls.skill+' [E] · '+$('skill-cooldown').textContent+' · '+(skillAllowed.ok?cls.description:skillAllowed.reason));
    $('lock-button').disabled = !canPlan();
    for (const id of ['camera-in', 'camera-out', 'camera-center', 'camera-fit']) $(id).disabled = !!replay;
    $('match-replay-button').disabled = state.phase !== 'ended' || !archive.turns.length || (network.active && !network.fullReady) || !!replay;
    $('match-replay-button').classList.toggle('hidden', state.phase !== 'ended');
    const resolution = ['resolution','clash'].includes(state.phase) || !!replay;
    $('lock-label').textContent=network.locked?('Plan locked'):state.phase==='resolution'?('Resolving'):('Confirm plan');
    $('phase-label').textContent = replay ? replay.kind === 'match' ? 'FULL MATCH REPLAY' : 'OVERVIEW REPLAY' : state.phase === 'draft'?('Choose a card'):state.phase==='draftReveal'?('Card selected'):(state.phase === 'clash'||netPacket?.stage==='clashResult'||soloClashOutcome) ? ('ROCK PAPER SCISSORS') : state.phase === 'ended' ? ('Match over') : spectating ? ('Spectating') : resolution ? ('Resolving') : ('Planning');
    if(!replay&&state.phase==='clash')$('field-note').textContent=('A contact duel is in progress. Combat resumes after the result.');
    $('phase-dot').style.background = resolution ? '#ffb564' : '#9fe3b3'; $('phase-label').style.color = resolution ? '#ffb564' : '#9fe3b3';
    $('phase-detail').textContent = !replay&&(state.phase==='clash'||netPacket?.stage==='clashResult'||soloClashOutcome)?('Combat paused · Waiting for the duel'):!replay&&state.phase==='draft'?(state.walkthrough?'Practice draft · Take your time.':'Card selection: 16 seconds · Results revealed together.'):!replay&&state.phase==='draftReveal'?"Card received · Returning to planning.":replay ? replay.kind === 'match' ? "Match ended · All player cameras available · ESC to return" : "Your view only · Change speed or seek · ESC return" : resolution ? "All actions resolve together." : "Plan together · Enemy plans stay hidden.";
    $('kill-count').textContent = shown.kills + ' KILLS';
    $('zone-status').textContent = shown.nextLimit < shown.initialLimit ? 'YELLOW 2 ROUNDS / RED 1 ROUND' : 'PLATFORMS STABLE'; $('zone-status').style.color = shown.nextLimit < shown.initialLimit ? '#f3d561' : '#9fe3b3';
    const waiting = u.pendingPickups || [];
    $('nearby-loot').replaceChildren(...waiting.map(item => { const definition = G.LOOT[item.type], row = document.createElement('span'); row.className = 'pending-item'; row.style.color = definition?.color || '#9fe3b3'; row.textContent = (item.type === 'weapon' ? G.WEAPONS[item.weapon].short : (item.type==='fateAmmo'?'FATE AMMO +'+item.amount:definition?.name || 'SUPPLY')) + ' → T' + String(item.availableTurn).padStart(2, '0'); return row; }));
    if (!waiting.length) $('nearby-loot').textContent = '';else $('nearby-loot').prepend(document.createTextNode(('Available next turn · ')));
    document.body.classList.toggle('has-pending', waiting.length > 0); $('drop-countdown').textContent = shown.practice?'PRACTICE · SUPPLIES REFILL EACH TURN':'Supply Drop in '+(5-shown.turn%5)+' '+(5-shown.turn%5===1?'turn':'turns');
    if (network.active) { $('phase-label').textContent = !network.connected ? ('Reconnecting') : network.locked && shown.phase === 'planning' ? ('Waiting · ') + Math.max(0,(netPacket?.required||0)-(netPacket?.ready||0)) : $('phase-label').textContent; }
    updatePracticeUI();
    lastShield=u.shield;
    $('inventory-counts').innerHTML=[['heal',('Medkit'),u.medkits],['grenade',('Grenade'),u.grenades],['smoke',('Smoke'),u.smoke]].map(([icon,label,n])=>'<span class="supply-chip"><i aria-hidden="true">'+P.icon(icon)+'</i><span>'+label+'</span><b>'+n+'</b></span>').join('');
    for(const [id,value]of [['hp-value',u.hp],['shield-value',u.shield],['ammo-value',u.ammo],['skill-cooldown',u.skillCooldown]]){const node=$(id);if(node.dataset.raw!==undefined&&node.dataset.raw!==String(value)&&started&&!replay&&!P.reduced())node.animate([{color:'#d6e5c6'},{color:'#eff6ff'}],{duration:220});node.dataset.raw=String(value);}

  }
  function turnFeedback() { const stamp='T'+state.turn;if($('turn-transition').dataset.turn===stamp)return;$('turn-transition').dataset.turn=stamp;pulseSlots('#98cadb');$('turn-transition').textContent='TURN '+String(state.turn).padStart(2,'0')+' / PLANNING';$('turn-transition').classList.remove('hidden');setTimeout(()=>$('turn-transition').classList.add('hidden'),650);sound.play('turn'); }
  function turnReport() { if(!reportTurn)return;const r=$('turn-report');r.replaceChildren();const title=document.createElement('b');title.textContent='TURN '+String(reportTurn).padStart(2,'0')+' / REPORT';r.append(title);for(const [label,value]of[['DAMAGE DEALT',report.dealt],['DAMAGE RECEIVED',report.received],['SHOTS',report.shots],['ITEMS PICKED UP',report.items]]){const row=document.createElement('div');row.textContent=label+'  '+value;r.append(row);}r.classList.remove('hidden');setTimeout(()=>r.classList.add('hidden'),2800); }
  function startPlanning() {
    if(state.walkthrough&&W.current(state)?.id==='fate'&&state.phase==='draft'){for(const u of state.units)if(u.alive&&u.id!==playerId&&!state.fate.draft.picks[u.id])G.FATE.pick(state,u.id,G.FATE.botPick(state,u.id));deadline=performance.now()+G.FATE.DRAFT_MS;updateUI();return;}
    if(!network.active&&!state.walkthrough&&G.FATE.open(state)){
      plan=[];for(const u of state.units)if(u.alive&&u.id!==playerId){try{G.FATE.pick(state,u.id,G.FATE.botPick(state,u.id));}catch{}}
      deadline=performance.now()+(player().alive?G.FATE.DRAFT_MS:2000);updateUI();return;
    }
    if(state.fate?.history?.at(-1)?.turn===state.turn&&fateFxTurn!==state.turn){fateFxTurn=state.turn;if(player().alive)makeEffect('fate',player().x,player().y,{duration:.9,color:'#cbb5f3'});}
    turnFeedback();
    if (network.active) { updateUI(); return; }
    cancelRoute(); plan = []; selected = 'move'; botPlans = {};
    for (const u of state.units) if (u.id && u.alive) botPlans[u.id] = state.walkthrough&&!state.walkthrough.finished?W.botPlan(state):state.practice?TUTORIAL.botPlan(state):G.planBot(state, u.id);
    deadline = performance.now() + (spectating ? 2000 : planningDuration * 1000); warnedSecond = -1;
    G.observation(state, player()); updateUI();
    $('field-note').textContent = spectating ? "Watch survivors · ‹ › switch player · EXIT to menu" : "1 Move · 2 Shoot · 3 Slash · Q Undo · SPACE Confirm";
  }
  function lock() {
    clearActionFlights();cancelRoute(); if (state.phase !== 'planning' || replay || !started || isPaused()) return;
    if (!player().alive && !spectating) return;
    if(state.walkthrough&&!state.walkthrough.finished&&!W.canConfirm(state,plan)){toast('Try the lesson before confirming your plan.');return;}
    while (plan.length < 2) plan.push({ type: 'wait' });
    if (network.active) { if (!canPlan()) return; sound.play('lock'); toast('PLAN COMMITTED'); network.command({action:'lock',turn:state.turn,plan:structuredClone(plan)}).then(()=>{network.locked = state.phase === 'planning';updateUI();}).catch(()=>log("Command failed · Try again.")); return; }
    reportTurn=state.turn;report={dealt:0,received:0,shots:0,items:0};
    frozenBefore = { turn: state.turn };
    state.humanIds=player().alive?[playerId]:[]; G.beginTurn(state, { ...botPlans, 0: structuredClone(plan) }); accumulator = 0; effects = []; sound.play('lock');
    archive.begin(state);
    resolutionBanner(); updateUI();
  }
  async function start(mode=false) {
    const practiceMode=mode===true||mode==='free'||mode==='walkthrough';practiceTurns=0;practiceUsed=new Set();
    clearActionFlights();closeAudioSettings(false);cancelRoute(); soloClashOutcome=null;soloClashUntil=0; ++resultTicket;fateFxTurn=0;fateUI.close();particles.clear();explored.clear();actionHover=null;menuReplay=false;
    await network.leave(); playerId = 0; netPacket = null; fetchingArchive = false; await sound.unlock(); selectedMap = $('map-select').value; state = practiceMode?TUTORIAL.createState(Date.now()&0xffffff,selectedClass):G.createState(Date.now() & 0xffffff, selectedClass, selectedMap,soloOptions());if(mode==='walkthrough')W.begin(state); camera = { x: 0, y: 0, zoom: window.innerWidth <= 790 ? .9 : 1.2, follow: true }; centerCamera(); hover = aimMouse = null; planningDuration = practiceMode?0:Number($('planning-time').value); started = true; spectating = false; deathShown = false;
    document.body.classList.toggle('practice-mode',practiceMode);$('practice-panel').classList.toggle('hidden',!practiceMode);
    archive = new R.MatchArchive(); frozenBefore = null; playerDeathTurn = null;
    logs = []; effects = []; signals = []; replay = null; replayFrames = []; fogCache.stamp = '';
    $('replay-controls').classList.add('hidden');
    $('intro').classList.add('hidden'); $('result').classList.add('hidden'); $('help').classList.add('hidden'); $('resolve-banner').classList.add('hidden');
    sound.restartMusic();sound.play('deploy'); log("Deployed · " + G.MAPS[state.mapId].name + " · Random spawn", 'good'); log("Walk over loot to collect it. Use it next turn."); startPlanning(); toast("Deployed · 2 Shoot / 3 Slash / Q Undo");
  }
  function resolutionBanner() { $('resolve-banner').classList.remove('hidden'); setTimeout(() => $('resolve-banner').classList.add('hidden'), 700); }
  function makeEffect(type,x,y,extra={}) { if(type==='eliminated'||type==='fall')particles.burst(x+.5,y+.5,P.accents[extra.character]||'#a2c9eb',18,'death',P.reduced());if(type==='thermite')particles.burst(x+.5,y+.5,'#ffb57f',16,'ember',P.reduced()); if(effects.length>=80)effects.shift(); effects.push({type,x,y,life:0,duration:type==='explosion'?.8:type==='damage'?.75:type==='eliminated'?1.1:.45,...extra});if(['spark','destroy','explosion','shield','reflect','pickup'].includes(type))particles.burst(x+.5,y+.5,type==='shield'||type==='reflect'?'#91cbe5':type==='pickup'?'#a4d875':'#ddb478',type==='explosion'?12:6,type==='destroy'?'debris':type==='shield'?'shield':'spark',P.reduced());if(P.shake()&&['explosion','shieldBreak'].includes(type))shakeUntil=motionTime+.12; }
  function handleEvents(events, replaying = false) {
    for (const e of events) {
      if(!replaying){if(e.type==='damage'&&e.owner===playerId&&e.unitId!==playerId)report.dealt+=e.amount;if((e.type==='damage'||e.type==='zoneDamage')&&e.unitId===playerId)report.received+=e.amount;if(e.type==='hitConfirmed')report.dealt+=e.amount||0;if(e.type==='shoot'&&e.unitId===playerId)report.shots++;if(e.type==='pickup'&&e.unitId===playerId)report.items++;}
      if(e.type==='fateAccepted'){if(!replaying){for(const p of e.summary||[])log(p.name+' / '+(G.FATE.cards[p.cardId]?.name||p.cardId),'good');}continue;}
      if (e.type === 'hitConfirmed') { sound.play('hit'); if (!replaying) log(e.eliminated ? 'ELIMINATION CONFIRMED' : 'HIT CONFIRMED −' + e.amount, 'good'); continue; }
      if (e.type === 'distantShot') { sound.play('gun', Math.max(-.8,Math.min(.8,(e.x-player().x)/12)),e.weapon); if (!replaying) {signals.push({x:e.x,y:e.y,expires:state.turn+1});log("Gunfire near " + coord(e));} continue; }
      if (e.type === 'supplyDrop') { if (!replaying) {sound.play('loot');log('SUPPLY DROP · ' + e.count + " items · T" + e.turn, 'good');toast("SUPPLY DROP · New loot is available.");} continue; }
      const view = replaying && replay ? replay.frames[replay.index] : state, observer = view.units[viewerId()];
      const u = e.unitId === undefined ? null : view.units[e.unitId], position = { x: e.x === undefined ? (u ? u.x : 0) : e.x, y: e.y === undefined ? (u ? u.y : 0) : e.y };
      const anchored=['shoot','slash','heal','reload','guard','scan','reflect','equip','damage','eliminated','move','knockback','blink','dodge','fieldPulse','reflectReady','reflected'].includes(e.type);
      const seen = allVisible() || e.unitId === playerId || anchored&&(G.sameTeam(view,observer,u)||V.scanned(observer,position,G.sightRange(observer))) || (!anchored||!V.concealed(view,observer,position))&&G.visible(view, observer, position, G.sightRange(observer));
      if(e.type==='knockback'&&seen){const contact=e.contact||e.from||position;unitMotion.bump(e.unitId,unitMotion.sample(e.unitId,motionTime)||e.from||position,motionTime,contact);makeEffect('bump',contact.x,contact.y,{duration:.7,angle:Math.atan2(e.y-contact.y,e.x-contact.x)});particles.burst(contact.x+.5,contact.y+.5,'#cde9ff',12,'debris',P.reduced());}
      if (e.type === 'blink' && seen) unitMotion.blink(e.unitId);
      const heard = G.distance(observer, position) < 16; const pan = Math.max(-.8, Math.min(.8, (position.x - observer.x) / 12));
      if(e.type==='clashStart'&&(seen||e.ids?.includes(viewerId())))sound.play('collision',pan);
      // The result is the impact cue, even when the loser lands outside our view.
      if(e.type==='clashResult'&&(seen||e.ids?.includes(viewerId())))sound.play('bump',pan);
      if(e.type==='platformCollapse'){collapseAt=motionTime;collapseTurn=view.turn;if(!replaying){sound.play('collapse');toast("PLATFORMS LOST · Black tiles are Void.");}}
      if (e.type === 'shoot') {
        if (seen || heard) sound.play('gun', pan, e.weapon);
        if (seen) makeEffect('muzzle',position.x,position.y,{angle:e.angle,unitId:e.unitId,weapon:e.weapon,recoil:e.recoil||0,own:e.unitId===playerId});
        else if (heard && e.first && !replaying) { signals.push({ x: Math.floor(position.x / 5) * 5 + 2, y: Math.floor(position.y / 5) * 5 + 2, expires: state.turn + 1 }); log("Gunfire heard near " + coord(signals[signals.length - 1])); }
      } else if (e.type === 'damage' && seen) {
        makeEffect('damage',position.x,position.y,{amount:e.amount,own:e.unitId===playerId,clash:e.reason==='clash'});makeEffect('hit',position.x,position.y,{unitId:e.unitId,duration:.32,shielded:!e.bypassShield&&(u?.shield>0||e.unitId===playerId&&lastShield>0)});if(!e.bypassShield&&(u?.shield>0||e.unitId===playerId&&player().shield===0&&lastShield>0)){makeEffect(u?.shield===0?'shieldBreak':'shield',position.x,position.y);} if(e.reason!=='clash')sound.play(e.unitId === playerId && player().shield > 0 ? 'shield' : 'hit', pan);
        if (e.unitId === playerId && !replaying) log("Hit for " + e.amount + ' damage' + (e.cover ? " · Cover reduces damage" : ''), 'damage');
        else if (e.owner === playerId && !replaying) log((e.reason==='clash'?('Collision: '):"Hit ") + u.name + ' −' + e.amount, 'good');
      } else if (e.type === 'explosion') { if (seen || heard) sound.play('explosion', pan); if (seen) makeEffect('explosion', e.x, e.y); }
      else if (e.type === 'eliminated') { if (seen) { makeEffect(e.reason==='void'?'fall':'eliminated',e.x,e.y,{character:u?.class||'vanguard',duration:e.reason==='void'?1.15:1.1}); sound.play('eliminate', pan); } if (!replaying && (e.owner === playerId || e.unitId === playerId)) log(e.unitId === playerId ? "Eliminated · Spectate or return to menu." : 'ELIMINATED ' + u.name, e.unitId === playerId ? 'damage' : 'good'); }
      else if (e.type === 'throw' && (seen || e.from && G.visible(view,observer,e.from,G.sightRange(observer)))) { sound.play('throw', pan); }
      else if (e.type === 'destroy' && seen) makeEffect('destroy', e.x, e.y);
      else if (e.type === 'blink' && seen) { makeEffect('blink', e.x, e.y, { from: e.from,duration:.75 }); sound.play('blink', pan); }
      else if(e.type==='move'){if(e.unitId===playerId)sound.play('step');if(seen&&u?.dodgeUntil>=view.tick)makeEffect('roll',position.x,position.y,{from:e.from});}
      else if(e.type==='dodge'&&seen)makeEffect('dodge',position.x,position.y,{duration:.65});
      else if (e.type === 'impact' && seen) makeEffect('spark', e.x, e.y);
      else if (e.type === 'guard' && seen) { makeEffect('guard', position.x, position.y,{unitId:e.unitId,duration:.8}); if (e.unitId === playerId) sound.play('guard'); }
      else if (e.type === 'scan' && seen) { makeEffect('scan', position.x, position.y, { duration: 1.2 }); sound.play('scan'); if (!replaying && e.unitId === playerId) log('PULSE ARRAY · SCAN 14 / THROUGH WALLS, SMOKE & ROOFS / 2 TURNS', 'good'); }
      else if (e.type === 'firebomb' && seen) { makeEffect('thermite', e.x, e.y, { duration: 1.1,width:e.width,height:e.height }); sound.play('fire', pan); }
      else if(e.type==='fieldDeploy'&&seen){makeEffect(e.kind,e.x,e.y,{duration:.85,width:e.width,height:e.height});sound.play(e.kind,pan);}
      else if(e.type==='fieldPulse'&&seen){if(e.amount>0)makeEffect('heal',e.x,e.y,{amount:e.amount,unitId:e.unitId,duration:.85});if(e.shield>0)makeEffect('shield',e.x,e.y,{duration:.7});if(e.unitId===playerId)sound.play('mend',pan);}
      else if (['reflectReady','reflected'].includes(e.type) && seen) { makeEffect('reflect',position.x,position.y,{duration:.85});sound.play('reflect',pan); }
      else if (e.type === 'smoke' && (seen||G.terrainVisible(view,observer,position,G.sightRange(observer)))) {sound.play('smoke',pan);}
      else if (e.type === 'reload' && seen) {makeEffect('reload',position.x,position.y,{unitId:e.unitId,duration:.85});if(e.unitId===playerId){sound.play('reload');if(!replaying)log('Reload +'+e.amount+" rounds");}}
      else if (e.type === 'heal' && seen) { makeEffect('heal', position.x, position.y, { amount: e.amount,unitId:e.unitId,duration:1.05 }); if (e.unitId === playerId) { sound.play('heal'); if (!replaying) log("Medkit restored +" + e.amount + ' HP', 'good'); } }
      else if (['pickup', 'beacon'].includes(e.type) && e.unitId === playerId) { sound.play('loot'); const definition = e.lootType ? G.LOOT[e.lootType] : null; const description = e.type === 'pickup' ? e.lootType === 'weapon' ? "Picked up " + G.WEAPONS[e.weapon].name : definition.description : 'Beacon: Ammo +30 · Shield +20 · Grenade +1'; makeEffect('pickup', position.x, position.y, { text:(definition?definition.name:'SUPPLY')+' + / NEXT TURN', color: definition ? definition.color : '#9fe3b3', duration: .9 }); if (!replaying) { log(description + " · Ready T" + String(e.availableTurn).padStart(2, '0'), 'good'); } }
      else if (e.type === 'slash' && seen) { makeEffect('slash', position.x, position.y, { angle: e.angle, duration: .5 }); sound.play('slash', pan); }
      else if (e.type === 'blocked' && e.unitId === playerId && !replaying) log("Path blocked at " + coord(position));
      else if (e.type === 'zoneDamage' && e.unitId === playerId) { sound.play('warning'); if (!replaying) log('Corruption −' + e.amount + " HP · Leave the zone", 'damage'); }
      else if (e.type === 'zoneWarning' && !replaying) { sound.play('warning'); log(('PLATFORM WARNING · YELLOW 2 ROUNDS · RED 1 ROUND'), 'damage'); toast(('⚠ LEAVE THE FALL ZONE · YELLOW 2 ROUNDS / RED 1 ROUND')); }
    }
  }
  function afterResolution() {
    if(state.walkthrough&&!state.walkthrough.finished)W.resolved(state,state.plans[playerId]||[],state.events);
    if(state.practice){practiceTurns++;for(const a of state.plans[playerId]||[])practiceUsed.add(a.type);const reset=TUTORIAL.afterTurn(state);if(reset.before>reset.hp)makeEffect('damage',player().x,player().y,{amount:reset.before-reset.hp,duration:.7});if(reset.respawned){makeEffect('blink',reset.respawned.x,reset.respawned.y,{duration:.8});log('Training bot respawned.','good');}if(archive.turns.length>3)archive.turns.shift();}
    turnReport();
    replayFrames = archive.finish(); signals = signals.filter(s => s.expires >= state.turn); fogCache.stamp = '';
    if (!player().alive && !deathShown) { deathShown = true; playerDeathTurn = frozenBefore.turn; showResult(false); }
    else if (state.phase === 'ended') showResult(state.mode==='team'?state.winnerTeam===player().team:state.winner === playerId);
    else startPlanning(); updateUI();
  }
  function showResult(victory) {
    const alive = state.aliveCount ?? state.units.filter(u => u.alive).length, rank = victory ? 1 : alive ? alive + 1 : 1;
    const canvas=$('result-showcase'),c=canvas.getContext('2d'),winner=state.phase==='ended'&&state.winner>=0?state.units[state.winner]:player();c.clearRect(0,0,canvas.width,canvas.height);P.drawOperator(c,210,240,1.12,winner.class,0);
    $('result').dataset.outcome=victory?'victory':state.phase==='ended'?'complete':'eliminated';
    const ticket=++resultTicket;setTimeout(()=>{if(ticket===resultTicket&&started&&(state.phase==='ended'||!spectating)&&!replay)$('result').classList.remove('hidden');},P.reduced()?0:700);
    $('result-title').textContent = victory ? 'LAST ONE STANDING' : state.winner === -1 ? 'MUTUAL DESTRUCTION' : 'OPERATOR DOWN';
    $('result-title').style.color = victory ? '#9fe3b3' : '#ff9276'; $('result-icon').textContent = victory ? '♜' : '⌖'; $('result-icon').style.color = victory ? '#9fe3b3' : '#ff9276';
    $('result-eyebrow').textContent = victory ? 'VICTORY / MISSION COMPLETE' : 'PLACEMENT #' + rank + ' / '+state.units.filter(u=>!u.removed).length;
    $('main-menu').textContent=network.active?('RETURN TO ROOM'):('MAIN MENU');
    $('result-detail').textContent = victory ? "You survived the match." : state.winner === -1 ? "All operators eliminated · No winner." : "Eliminated · Spectate survivors or return to the main menu.";
    if (state.phase === 'ended' && state.winner >= 0) { $('result-title').textContent = state.units[state.winner].name + ' WINS'; $('result-eyebrow').textContent = 'MATCH COMPLETE / WINNER CONFIRMED'; $('result-detail').textContent = "Winner: " + state.units[state.winner].name + " · Full match replay is available."; }
    if(state.mode==='team'&&state.phase==='ended'){$('result-title').textContent=state.winnerTeam?'TEAM '+state.winnerTeam+' WINS':'BOTH TEAMS ELIMINATED';$('result-eyebrow').textContent=state.winnerTeam===player().team?'TEAM VICTORY':'MATCH COMPLETE';$('result-detail').textContent='A vs B · Friendly fire off · Full match replay available.';}
    $('result-kills').textContent = state.kills; $('result-damage').textContent = state.damage; $('result-turns').textContent = playerDeathTurn ?? (frozenBefore ? frozenBefore.turn : state.turn);
    if(network.active){$('result-detail').textContent=(state.phase==='ended'?'Match complete · Return to your room for the next match.':'Spectate or wait in your room.');if(state.phase==='ended'){clearTimeout(returnTimer);const id=netPacket?.matchId;returnTimer=setTimeout(()=>{if(network.active&&netPacket?.matchId===id&&state.phase==='ended'&&!replay&&$('help').classList.contains('hidden')&&$('exit-dialog').classList.contains('hidden'))returnToRoom();},6500);}}
    $('spectate').classList.toggle('hidden', state.phase === 'ended');  sound.play(victory ? 'victory' : 'defeat');
  }
  function startReplay(kind = 'turn') {
    if ((kind === 'turn' && !replayFrames.length) || state.phase === 'resolution' || replay || (kind === 'match' && (state.phase !== 'ended' || network.active && !network.fullReady))) return;
    const frames = kind === 'match' ? R.continuousFrames(archive.frames()) : replayFrames;
    if (!frames.length) return;
    replay = { kind, frames, index: 0, elapsed: 0, step: TICK * (network.active && kind === 'turn' ? 2 : 1), speed: kind === 'match' ? 1 : .75, playing: true, view: String(playerId), began: performance.now(), savedCamera: { ...camera }, savedPose: cameraPose(), savedDeadline: deadline, savedSignals: [...signals], savedFieldNote: $('field-note').textContent, resultVisible: !$('result').classList.contains('hidden') };
    unitMotion.clear(); trails.clear();unitFacing.clear();
    particles.clear();unitMotion.sync(frames[0].units,u=>knownUnit(frames[0],u),motionTime);
    $('result').classList.add('hidden'); $('replay-controls').classList.remove('hidden'); $('replay-seek').max = frames.length - 1; $('replay-speed').value = String(replay.speed); $('replay-view').value = String(playerId);
    $('replay-view').replaceChildren(...(kind === 'match' ? state.units.filter(u => !u.removed).map(u => String(u.id)) : [String(playerId)]).map(value => { const option = document.createElement('option'); option.value = value; option.textContent = value === 'overview' ? "Entire map" : state.units[Number(value)].name; return option; }));
    effects = []; signals = []; fogCache.stamp = ''; updateReplayCamera(); $('field-note').textContent = "SPACE play/pause · ← / → seek · ESC return"; sound.play('click'); updateReplayControls(); updateUI();
  }
  function seekReplay(index) { if (!replay) return; replay.index = Math.max(0, Math.min(replay.frames.length - 1, index)); replay.elapsed = 0; unitMotion.clear(); trails.clear();unitFacing.clear(); particles.clear();effects = []; const shown=replay.frames[replay.index];unitMotion.sync(shown.units,u=>knownUnit(shown,u),motionTime);fogCache.stamp = ''; updateReplayControls(); updateUI(); }
  function updateReplayControls() {
    if (!replay) return; const s = replay.frames[replay.index];
    $('replay-play').textContent = replay.playing ? 'Ⅱ PAUSE' : '▷ PLAY'; $('replay-seek').value = replay.index;
    $('replay-position').textContent = (replay.kind === 'match' ? '' : 'T' + String(s.turn).padStart(2, '0') + ' · ') + (replay.index * replay.step).toFixed(1) + ' / ' + ((replay.frames.length - 1) * replay.step).toFixed(1) + 's';
    $('replay-heading').textContent = replay.kind === 'match' ? 'FULL MATCH · CONTINUOUS' : 'TURN ' + String(s.turn).padStart(2, '0') + ' · OVERVIEW';
  }
  function updateReplayCamera() {
    if (!replay) return; const s = replay.frames[replay.index];
    if (replay.view === 'overview') fitCamera(s);
    else { const unit = s.units[Number(replay.view)]; if (unit.hidden || unit.x < 0) return; const p = unitMotion.sample(unit.id, motionTime) || unit; flyCamera({ cx: p.x + .5, cy: p.y + .5, zoom: window.innerWidth <= 790 ? 1.05 : 1.45 }, 1.15); }
  }
  function endReplay() { if (!replay) return; if(menuReplay){menuReplay=false;mainMenu();return;} if (!network.active) deadline = replay.savedDeadline + performance.now() - replay.began; const show = replay.resultVisible; flyCamera(replay.savedPose, 1.15, replay.savedCamera.follow); signals = replay.savedSignals; $('field-note').textContent = replay.savedFieldNote; replay = null; unitMotion.clear(); trails.clear();unitFacing.clear(); effects = []; fogCache.stamp = ''; $('replay-controls').classList.add('hidden'); if (show) $('result').classList.remove('hidden'); updateUI(); }
  function openHelp() { if (!$('help').classList.contains('hidden')) return; pausedAt = performance.now(); $('help').classList.remove('hidden');stopKeyboardPan();updateUI();sound.play('click'); }
  function closeHelp() { if ($('help').classList.contains('hidden')) return; if (!network.active) deadline += performance.now() - pausedAt; else unitMotion.clear(); trails.clear();unitFacing.clear(); $('help').classList.add('hidden'); updateUI(); }
  function visibleCells(s) {
    if (s.visibleCells && !allVisible()) return new Set(s.visibleCells);
    const u = s.units[viewerId()], stamp = [viewerId(),s.turn, Math.floor(s.tick / 4), u.x, u.y, u.scan,s.terrainVersion,JSON.stringify(s.smokes),spectating, started, allVisible()].join(':');
    if (fogCache.stamp === stamp) return fogCache.cells;
    const cells = new Set();
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (!started || allVisible() || G.visible(s, u, { x, y }, G.sightRange(u))) cells.add(G.key(x, y));
    fogCache = { stamp, cells }; return cells;
  }
  function sight(s,terrain=false){
    if(!started||allVisible())return null;
    const u=s.units[viewerId()],pose=unitMotion.sample(viewerId(),motionTime)||u,range=s.visibility?.range||(G.sightRange(u));
    const stamp=[viewerId(),s.turn,s.terrainVersion,u.x,u.y,pose.x.toFixed(2),pose.y.toFixed(2),range,JSON.stringify(s.smokes)].join('|');
    if(sightCache.state!==s||sightCache.stamp!==stamp)sightCache={state:s,stamp,field:V.field(s,pose,range),terrain:null};
    if(terrain)return sightCache.terrain||(sightCache.terrain=V.field(s,pose,range,false));
    return sightCache.field;
  }
  function traceSight(ink,f){ink.beginPath();if(!f?.points?.length)return;ink.moveTo(f.points[0].x*CELL,f.points[0].y*CELL);for(const p of f.points.slice(1))ink.lineTo(p.x*CELL,p.y*CELL);ink.closePath();}
  function clipSight(s,terrain=false,ink=ctx){const f=sight(s,terrain);if(!f)return;traceSight(ink,f);ink.clip();if(!terrain&&s.visibility){traceSight(ink,s.visibility);ink.clip();}}
  function visiblePoint(s,x,y){if(!started||allVisible())return true;const p={x,y};return V.contains(sight(s),p)&&(!s.visibility||V.contains(s.visibility,p));}
  function knownUnit(s,u){if(!u?.alive||u.hidden)return false;if(u.id===viewerId()||allVisible())return true;const observer=s.units[viewerId()];if(G.sameTeam(s,observer,u)||V.scanned(observer,u,G.sightRange(observer)))return true;if(V.concealed(s,observer,u))return false;return s.visibility?V.bodyInField(s.visibility,u):G.visible(s,observer,u,G.sightRange(observer));}
  function drawFog(s){
    const f=sight(s);if(!f)return;
    if(fogSurface.width!==canvas.width||fogSurface.height!==canvas.height){fogSurface.width=canvas.width;fogSurface.height=canvas.height;}
    fogInk.setTransform(1,0,0,1,0,0);fogInk.clearRect(0,0,fogSurface.width,fogSurface.height);fogInk.setTransform(ctx.getTransform());fogInk.fillStyle='#0d19288f';fogInk.fillRect(0,0,s.width*CELL,s.height*CELL);
    fogInk.save();clipSight(s,false,fogInk);fogInk.clearRect(0,0,s.width*CELL,s.height*CELL);fogInk.restore();ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(fogSurface,0,0);ctx.restore();
  }
  function roundedRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
  function render(s, time) {
    if(P.reduced())time=0;
    const cells = visibleCells(s), u = s.units[viewerId()];for(const cell of cells)explored.add(cell); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save();
    ctx.fillStyle = '#0e1925'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shake=P.shake()&&motionTime<shakeUntil?Math.sin(motionTime*110)*.8:0;ctx.translate(-camera.x*CELL*camera.zoom+shake,-camera.y*CELL*camera.zoom);  ctx.scale(camera.zoom, camera.zoom);
    ctx.fillStyle = '#17212a'; ctx.fillRect(0, 0, s.width * CELL, s.height * CELL);
    const terrain = { floor:'#435565',road:'#536877',wall:'#8da3b3',barricade:'#9b7956',forest:'#355a53',water:'#356a84',cover:'#6b807c',rubble:'#7c7770',void:'#080b16',...(G.BIOMES[s.biome]||G.BIOMES.verdant) };
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const t = s.tiles[y][x], px = x * CELL, py = y * CELL, seen = cells.has(G.key(x, y)), variant = ((x * 13 + y * 7 + s.seed) % 4);
      ctx.fillStyle = terrain[t.type]; ctx.fillRect(px, py, CELL, CELL);
      if(t.type==='void'){
        ctx.fillStyle='#080b16';ctx.fillRect(px,py,CELL,CELL);
        if((x*11+y*17)%19===0){ctx.fillStyle='#4b476630';ctx.fillRect(px+11,py+18,1,1);}
        const age=motionTime-collapseAt;
        if(!P.reduced()&&t.fellTurn===s.turn&&collapseTurn===s.turn&&age>=0&&age<1){ctx.save();ctx.globalAlpha=(1-age)*.75;ctx.translate(px+CELL/2,py+CELL/2+age*25);ctx.scale(1-age*.6,1-age*.8);ctx.fillStyle='#425569';ctx.fillRect(-CELL/2+1,-CELL/2+1,CELL-2,CELL-2);ctx.strokeStyle='#a4b9cf';ctx.strokeRect(-CELL/2+1,-CELL/2+1,CELL-2,CELL-2);ctx.restore();}
        continue;
      }
      for(const [dx,dy,ax,ay,bx,by]of [[0,-1,0,0,CELL,0],[0,1,0,CELL,CELL,CELL],[-1,0,0,0,0,CELL],[1,0,CELL,0,CELL,CELL]])if(G.tile(s,x+dx,y+dy)?.type==='void'){ctx.strokeStyle=seen?'#adcce399':'#56667c55';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(px+ax,py+ay);ctx.lineTo(px+bx,py+by);ctx.stroke();}
      if (variant === 1 && t.type === 'floor') { ctx.fillStyle = '#53687a'; ctx.fillRect(px + 7, py + 11, 3, 1); ctx.fillRect(px + 20, py + 6, 2, 2); }
      if(t.type==='grass'){ctx.strokeStyle=(s.biome==='tundra'?'#b6d3c1':'#a4be7c')+'55';ctx.lineWidth=1;for(let i=0;i<3;i++){const gx=px+5+(x*7+y*11+i*9)%23,gy=py+8+(x*13+y*3+i*7)%20;ctx.beginPath();ctx.moveTo(gx-2,gy-3);ctx.lineTo(gx,gy);ctx.lineTo(gx+2,gy-4);ctx.stroke();}}
      if (t.type === 'road') { ctx.fillStyle = '#7b8c98'; ctx.fillRect(px + 13, py + 4, 2, 8); }
      if (t.type === 'wall') { ctx.fillStyle = '#23303f'; ctx.fillRect(px + 4, py + 6, CELL - 3, CELL - 4); ctx.fillStyle = '#72889b'; ctx.fillRect(px + 2, py + 2, CELL - 5, CELL - 6); ctx.fillStyle = '#aec2d1'; ctx.fillRect(px + 2, py + 2, CELL - 5, 3); ctx.strokeStyle = '#4b657a'; ctx.lineWidth = 1; ctx.strokeRect(px + 7, py + 7, CELL - 15, CELL - 16); }
      if (t.type === 'barricade') { ctx.fillStyle = '#211b14'; roundedRect(px + 3, py + 5, CELL - 6, CELL - 8, 3); ctx.fill(); ctx.fillStyle = '#a47b4c'; ctx.fillRect(px + 4, py + 7, CELL - 8, 6); ctx.fillRect(px + 4, py + 18, CELL - 8, 6); ctx.strokeStyle = t.hp<15?'#947153':'#d6af79'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 6, py + 6); ctx.lineTo(px + CELL - 6, py + CELL - 6); ctx.stroke(); if(t.hp<30){ctx.strokeStyle='#2c251e';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px+11,py+8);ctx.lineTo(px+16,py+14);ctx.lineTo(px+12,py+20);ctx.lineTo(px+20,py+24);ctx.stroke();} if (seen) { ctx.fillStyle = '#281d12'; ctx.fillRect(px + 3, py + 1, CELL - 6, 3); ctx.fillStyle = '#ffca79'; ctx.fillRect(px + 3, py + 1, (CELL - 6) * t.hp / 45, 3); } }
      if (t.type === 'cover') { ctx.fillStyle = '#233540'; ctx.fillRect(px + 7, py + 9, 19, 18); ctx.fillStyle = '#607c76'; ctx.fillRect(px + 5, py + 5, 18, 18); ctx.strokeStyle = '#8da99c'; ctx.strokeRect(px + 7, py + 7, 14, 14); ctx.beginPath(); ctx.moveTo(px + 7, py + 7); ctx.lineTo(px + 21, py + 21); ctx.moveTo(px + 21, py + 7); ctx.lineTo(px + 7, py + 21); ctx.stroke(); ctx.strokeStyle = '#b5d5bd'; ctx.lineWidth = 2; ctx.beginPath(); if (t.side === 'north') { ctx.moveTo(px + 4, py + 3); ctx.lineTo(px + 24, py + 3); } else { ctx.moveTo(px + 3, py + 4); ctx.lineTo(px + 3, py + 24); } ctx.stroke(); }
      if (t.type === 'forest') { ctx.fillStyle = '#1b3735'; ctx.beginPath(); ctx.arc(px + 17, py + 17, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3f685d'; ctx.beginPath(); ctx.arc(px + 12, py + 12, 8, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#527e6c'; ctx.beginPath(); ctx.arc(px + 14, py + 9, 4, 0, Math.PI * 2); ctx.fill(); }
      if (t.type === 'water') { ctx.strokeStyle = '#71a7bd'; ctx.lineWidth = 1; const offset = Math.sin(time / 800 + x) * 2; ctx.beginPath(); ctx.moveTo(px + 5, py + 9 + offset); ctx.lineTo(px + 16, py + 9 + offset); ctx.moveTo(px + 15, py + 22 - offset); ctx.lineTo(px + 24, py + 22 - offset); ctx.stroke(); }
      if (t.type === 'rubble') { ctx.fillStyle = '#67614a'; ctx.fillRect(px + 5, py + 9, 7, 6); ctx.fillRect(px + 17, py + 16, 8, 5); }
      ctx.strokeStyle = canPlan()&&['move','skillMove','blink'].includes(selected)?'#b8c5d330':'#b8c5d313'; ctx.lineWidth = .65; ctx.strokeRect(px, py, CELL, CELL);
      
      const fallIn=G.platformRounds(s,t);
      if(fallIn===1||fallIn===2){const red=fallIn===1,color=red?'#ff616d':'#f1d45c';ctx.fillStyle=red?'#ff516733':'#f1d45c24';ctx.fillRect(px,py,CELL,CELL);ctx.save();ctx.beginPath();ctx.rect(px,py,CELL,CELL);ctx.clip();ctx.strokeStyle=color+'8c';ctx.lineWidth=3;for(let i=-CELL;i<CELL*2;i+=12){ctx.beginPath();ctx.moveTo(px+i,py+CELL);ctx.lineTo(px+i+CELL,py);ctx.stroke();}ctx.restore();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(px+2,py+2);ctx.lineTo(px+9,py+2);ctx.lineTo(px+2,py+9);ctx.fill();}
      if (t.loot && !t.loot.taken && seen) { const loot = t.loot.weapon==='trident'?{...G.LOOT.weapon,color:'#f0d49a'}:G.LOOT[t.loot.type], gun = t.loot.type === 'weapon'; ctx.shadowColor = loot.color; ctx.shadowBlur = 7; ctx.strokeStyle = loot.color; ctx.fillStyle = '#172634'; ctx.lineWidth = 1.5; roundedRect(px + 4, py + 4, CELL - 8, CELL - 8, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = loot.color; ctx.font = gun ? 'bold 10px Consolas' : 'bold 19px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(gun ? G.WEAPONS[t.loot.weapon].short : loot.icon, px + CELL / 2, py + CELL / 2 + (gun ? 4 : 7)); ctx.shadowBlur = 0; if (hover && hover.x === x && hover.y === y) { ctx.font = 'bold 11px Consolas'; ctx.fillText(gun ? G.WEAPONS[t.loot.weapon].name : loot.name, px + CELL / 2, py - 4); } }

    }
    const beacon = s.beacon, bx = (beacon.x + .5) * CELL, by = (beacon.y + .5) * CELL;
    ctx.strokeStyle = beacon.cooldown ? '#607156' : '#9fe3b3'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, 11 + Math.sin(time / 500) * 2, 0, Math.PI * 2); ctx.stroke(); ctx.font = '16px Segoe UI'; ctx.textAlign = 'center'; ctx.fillStyle = beacon.cooldown ? '#607156' : '#9fe3b3'; ctx.fillText('◈', bx, by + 6); ctx.font = '7px Consolas'; ctx.fillText(('SUPPLY'), bx, by + 22);
    drawFog(s);renderSmoke(s);renderFields(s);
    for (const f of s.fires || []) if(cells.has(G.key(f.x,f.y))) {
      ctx.fillStyle='#e8945426';ctx.fillRect(f.x*CELL+2,f.y*CELL+2,CELL-4,CELL-4);
      ctx.strokeStyle='#ffbd7560';ctx.lineWidth=1.5;
      for(let i=0;i<3;i++){const x=(f.x+.25+i*.25)*CELL,y=(f.y+.7)*CELL;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+Math.sin(time/230+i)*4,y-7,x+2,y-12-Math.sin(time/300+i)*3);ctx.stroke();}
    }
    for (const signal of signals) { ctx.strokeStyle = '#edba5c70'; ctx.setLineDash([5, 6]); ctx.lineWidth = 1; ctx.strokeRect((signal.x - 2) * CELL, (signal.y - 2) * CELL, 5 * CELL, 5 * CELL); ctx.setLineDash([]); ctx.fillStyle = '#e0b75c'; ctx.font = '14px Segoe UI'; ctx.fillText('♫', (signal.x + .5) * CELL, (signal.y + .5) * CELL); }
    const revealed=s.revealedUnits||s.units.filter(unit=>unit.alive&&unit.fateRevealTurn===s.turn&&!V.sheltered(s,unit));
    for(const enemy of Object.values(u.memory||{}))if(s.turn-enemy.turn<=3&&!knownUnit(s,s.units[enemy.id])&&!visiblePoint(s,enemy.x+.5,enemy.y+.5)&&!revealed.some(r=>r.id===enemy.id)){
      const x=(enemy.x+.5)*CELL,y=(enemy.y+.5)*CELL;ctx.save();ctx.globalAlpha=Math.max(.25,.65-(s.turn-enemy.turn)*.1);ctx.strokeStyle='#ddb68b';ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.strokeRect(x-8,y-8,16,16);ctx.setLineDash([]);ctx.fillStyle='#ddb68b';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText('?',x,y+4);ctx.font='9px system-ui';ctx.fillText(('LAST SEEN')+' · T'+enemy.turn,x,y+23);ctx.restore();
    }
    ctx.save();clipSight(s);trails.draw(ctx,CELL,motionTime,(x,y)=>visiblePoint(s,x,y));ctx.restore();
    for (const unit of s.units) {
      if(!knownUnit(s,unit))continue;
      const pose = unitMotion.sample(unit.id, motionTime) || unit, own = unit.id === viewerId(),ally=G.sameTeam(s,s.units[viewerId()],unit),detected=V.scanned(s.units[viewerId()],unit,G.sightRange(s.units[viewerId()]));
      if(!own&&!ally&&!detected&&!allVisible()&&!V.bodyInField(sight(s),pose))continue;
      const x = (pose.x + .5) * CELL, y = (pose.y + .5) * CELL, color = s.mode==='team'?(unit.team==='A'?'#79d8ff':'#ffb17b'):own ? '#9fe3b3' : '#ff8870';
      ctx.save();if(!own&&!ally&&!detected)clipSight(s);if(pose.moving&&!P.reduced()&&(pose.alpha??1)===1)ctx.translate(0,Math.sin(motionTime*22)*.7); ctx.globalAlpha=(pose.alpha??1)*(own&&canPlan()&&U.project(state,playerId,plan).moved?.65:1);
      if (pose.moving) { const stride = Math.sin(motionTime * 22) * 2.5; ctx.fillStyle = own ? '#627b40' : '#824b3d'; roundedRect(x - 7, y + 4 + stride, 5, 5, 2); ctx.fill(); roundedRect(x + 2, y + 4 - stride, 5, 5, 2); ctx.fill(); }
      ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(x + 2, y + 6, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
      if (own||s.mode==='team'||detected) { ctx.strokeStyle = detected&&!own&&!ally?'#b1dfff99':color+'99'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 13 + Math.sin(time / 300) * .5, 0, Math.PI * 2); ctx.stroke(); }
      const firing=effects.findLast(e=>e.type==='muzzle'&&e.unitId===unit.id),track=unitMotion.tracks.get(unit.id),movingAngle=pose.moving&&track&&!track.blink?Math.atan2(track.to.y-track.from.y,track.to.x-track.from.x):unit.facing??0;
      const desired=firing?.angle??(own&&canPlan()&&aimMouse?Math.atan2(aimMouse.y-unit.y,aimMouse.x-unit.x):movingAngle),facing=M.turnAngle(unitFacing.get(unit.id)??desired,desired,frameDt);unitFacing.set(unit.id,facing);
      const recovery=firing?Math.max(0,1-firing.life/.2):0,impact=effects.findLast(e=>e.type==='hit'&&e.unitId===unit.id),age=impact?Math.min(1,impact.life/impact.duration):1;
      // The reaction affects the sprite only: tile, movement, labels and camera stay steady.
      const settle=(1-age)*(1-age),wobble=P.reduced()?0:Math.sin(age*Math.PI*4)*settle,flash=impact?(P.reduced()?.28*(1-age):.62*Math.exp(-age*9)+.2*Math.exp(-Math.pow((age-.46)/.16,2))):0;
      ctx.save();ctx.translate(x+wobble*1.8,y);ctx.rotate(wobble*.055);P.drawFieldOperator(ctx,0,0,facing,unit.class,recovery*(G.WEAPONS[firing?.weapon]?.kick||2),flash,impact?.shielded?'#c4efff':'#ffe1d5',unit.weapon||'rifle');ctx.restore();
      if(unit.burn?.remainingTicks>0){ctx.save();ctx.strokeStyle='#ffad69';ctx.lineWidth=1.3;for(let i=0;i<3;i++){const fx=x-8+i*8,fy=y+7,drift=P.reduced()?0:Math.sin(motionTime*7+i)*2;ctx.beginPath();ctx.moveTo(fx-3,fy+4);ctx.quadraticCurveTo(fx-5,fy-2,fx+drift,fy-9);ctx.quadraticCurveTo(fx+5,fy-1,fx+3,fy+4);ctx.stroke();}ctx.fillStyle='#ffd3a1';ctx.font='9px system-ui';ctx.textAlign='center';ctx.fillText(('BURN ')+Math.ceil(unit.burn.remainingTicks/2)+'T',x,y+35);ctx.restore();}
      if (unit.guard) { ctx.strokeStyle = '#8bcaec'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 12, Math.PI, Math.PI * 2); ctx.stroke(); }
      if(unit.reflectTurn===s.turn&&unit.reflectCharges>0){ctx.strokeStyle='#94cfff';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      if(own||ally||detected||allVisible()||visiblePoint(s,unit.x+.5,unit.y+.5)){ctx.fillStyle = '#192014'; ctx.fillRect(x - 11, y - 18, 22, 3); ctx.fillStyle = color; ctx.fillRect(x - 11, y - 18, 22 * unit.hp / 100, 3); if (unit.shield) { ctx.fillStyle = '#8bcaec'; ctx.fillRect(x - 11, y - 22, 22 * unit.shield / 40, 2); }
      if (own || ally || detected || allVisible() || (hover && hover.x === unit.x && hover.y === unit.y)) { ctx.font = 'bold 11px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText((unit.team?'['+unit.team+'] ':'')+unit.name, x, y + 24); }}
      ctx.restore();
    }
    for(const r of revealed){if(r.id===viewerId()||knownUnit(s,s.units[r.id]))continue;const x=(r.x+.5)*CELL,y=(r.y+.5)*CELL;ctx.save();ctx.strokeStyle='#d2b5f2';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y-12);ctx.lineTo(x+12,y);ctx.lineTo(x,y+12);ctx.lineTo(x-12,y);ctx.closePath();ctx.stroke();ctx.fillStyle='#ddc9fa';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText('!',x,y+4);ctx.font='10px system-ui';ctx.fillText(r.name+' / '+('REVEALED · 1 TURN'),x,y+27);ctx.restore();}
    renderRoofs(s);renderWalkTarget(s,time);
    ctx.save();clipSight(s,true);
    for (const b of s.projectiles) if (allVisible() || b.owner === playerId || G.effectVisible(s,u,{x:b.x-.5,y:b.y-.5})) { ctx.strokeStyle = b.owner === playerId ? '#c8f4e5' : '#f4c18c'; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 0;ctx.save();ctx.globalAlpha=.12;ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(b.x*CELL,b.y*CELL);ctx.lineTo((b.x-b.dx*.5)*CELL,(b.y-b.dy*.5)*CELL);ctx.stroke();ctx.restore(); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(b.x * CELL, b.y * CELL); ctx.lineTo((b.x - b.dx * .5) * CELL, (b.y - b.dy * .5) * CELL); ctx.stroke(); ctx.shadowBlur = 0; }
    for (const g of s.grenades) if (s.tick >= (g.born||0)+G.THROW.grenadeTicks && (g.owner === playerId || cells.has(G.key(g.x, g.y)))) { ctx.fillStyle = '#efb878'; ctx.beginPath(); ctx.arc((g.x + .5) * CELL, (g.y + .5) * CELL, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffa65e88'; ctx.lineWidth = 1; const radius=g.radius||1;ctx.strokeRect((g.x-radius)*CELL,(g.y-radius)*CELL,(radius*2+1)*CELL,(radius*2+1)*CELL); }
    const flights=s.flights||[...(s.canisters||[]),...s.grenades].map(c=>{const p=G.flightPose(c,s.tick);return p?{...p,owner:c.owner}:null;}).filter(Boolean);
    for(const p of flights)if(allVisible()||G.effectVisible(s,u,p))window.GridfallEffects.drawFlying(ctx,p,CELL,P.reduced());
    particles.draw(ctx,CELL,(x,y)=>visiblePoint(s,x,y));ctx.restore();
    renderEffects(cells);
    // Own planning outlines stay above fog, Smoke, roofs and combat effects.
    if (canPlan() && !replay) renderPlan(s);
    ctx.restore();
    
  }
  function previewTile(p, kind, label = '', opacity = 1, action = selected) {
    const color={valid:action==='move'?'#8de8a9':'#86d2f1',risky:'#e7bd88',blocked:'#dc948e',unknown:'#b2c5c7',breach:'#e7bd88'}[kind]|| (action==='move'?'#8de8a9':'#86d2f1');
    const x=p.x*CELL,y=p.y*CELL;ctx.save();ctx.globalAlpha=opacity;
    ctx.save();if(kind!=='unknown')clipSight(state);ctx.fillStyle=color+({valid:'3b',risky:'2a',breach:'2a',blocked:'16',unknown:'08'}[kind]||'16');ctx.fillRect(x+2,y+2,CELL-4,CELL-4);ctx.restore();
    // Outlines describe the player's plan, not visibility or hidden actors.
    ctx.strokeStyle=color+({valid:'bf',risky:'ad',breach:'ad',blocked:'78',unknown:'30'}[kind]||'78');ctx.lineWidth=kind==='valid'?1.5:1.1;
    ctx.beginPath();for(const [cx,cy,dx,dy]of [[x+2,y+2,1,1],[x+CELL-2,y+2,-1,1],[x+2,y+CELL-2,1,-1],[x+CELL-2,y+CELL-2,-1,-1]]){ctx.moveTo(cx+dx*5,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+dy*5);}ctx.stroke();
    ctx.restore();
  }
  function renderActionArea(c) {
    if(plan.length>=2) return;
    if(['move','skillMove','blink','grenade','smoke','scan','firebomb','stasis','mend'].includes(selected)) {
      for(const p of previewCache.cells){
        if(p.x===c.origin.x&&p.y===c.origin.y)continue;
        const known=c.visible.has(G.key(p.x,p.y)),kind=known?p.kind:'unknown';
        previewTile(p,kind,'',c.availability.ok?1:.5);
      }
    }
    if(c.range>0&&!['move','skillMove'].includes(selected)){
      ctx.save();ctx.strokeStyle=c.availability.ok||selected==='scan'&&plan.at(-1)?.type==='scan'?'#86d2f199':'#dc948e66';ctx.lineWidth=1.8;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc((c.origin.x+.5)*CELL,(c.origin.y+.5)*CELL,c.range*CELL,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    ctx.save();ctx.strokeStyle='#bce7ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc((c.origin.x+.5)*CELL,(c.origin.y+.5)*CELL,12,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }
  function renderBlast(c,p,type,preview) {
    const radius=type==='grenade'?G.FATE.stats(c.s.units[c.id]).radius:1,b=type==='grenade'?G.areaBounds(p,radius*2+1,radius*2+1):G.skillArea(type,p),self=['grenade','firebomb','stasis'].includes(type)&&G.inArea(c.origin,b);
    for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++){
      const t=G.tile(c.s,x,y);if(!t)continue;
      const known=c.visible.has(G.key(x,y)),own=['grenade','firebomb','stasis'].includes(type)&&x===c.origin.x&&y===c.origin.y;
            const solid=known&&!G.passable(c.s,x,y),inactive=solid&&['firebomb','stasis','mend'].includes(type)||known&&type==='firebomb'&&t.type==='water';
      const kind=!known?'unknown':inactive?'blocked':own?'risky':type==='grenade'&&['wall','barricade'].includes(t.type)?'breach':'valid';
      previewTile({x,y},kind,'',preview?.9:1,type);
    }
    ctx.save();ctx.strokeStyle=self?'#e7bd88bb':'#86d2f1cc';ctx.lineWidth=1.5;ctx.strokeRect(b.left*CELL+2,b.top*CELL+2,b.width*CELL-4,b.height*CELL-4);ctx.restore();
  }
  function renderShotBlock(c,angle,range,preview) {
    const hit=shotPrediction(c,angle,range);if(hit.kind==='clear')return;
    const end={x:c.origin.x+.5+Math.cos(angle)*range,y:c.origin.y+.5+Math.sin(angle)*range};
    ctx.save();ctx.strokeStyle=hit.kind==='unknown'?'#adc0d180':hit.kind==='unit'?'#ffbd68':'#ff8279';ctx.lineWidth=preview?1.5:2;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(hit.point.x*CELL,hit.point.y*CELL);ctx.lineTo(end.x*CELL,end.y*CELL);ctx.stroke();ctx.setLineDash([]);
    if(hit.kind==='wall')previewTile(hit.cell,'blocked','STOP');
    ctx.beginPath();ctx.arc(hit.point.x*CELL,hit.point.y*CELL,hit.kind==='unit'?7:4,0,Math.PI*2);ctx.stroke();
    ctx.restore();
  }
  function renderPlan(s) {
    const c=previewContext();renderActionArea(c);
    if(c.projected.moved){const ghost=c.projected.origin,gx=(ghost.x+.5)*CELL,gy=(ghost.y+.5)*CELL;ctx.save();ctx.strokeStyle='#b2d9df';ctx.lineWidth=1.4;ctx.globalAlpha=.65;ctx.setLineDash([3,3]);ctx.strokeRect(gx-8,gy-7,16,16);ctx.beginPath();ctx.arc(gx,gy-5,5,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b2d9df';ctx.font='8px Consolas';ctx.textAlign='center';ctx.fillText(('NEXT ORIGIN'),gx,gy+22);ctx.restore();}
    let focused=s.units[playerId].class==='deadeye'&&s.units[playerId].scan>0;
    let origin = { x: s.units[playerId].x, y: s.units[playerId].y };
    const list = [...plan];
    if (aimMouse && plan.length < 2 && ['shoot', 'slash'].includes(selected)) { const v = virtualPosition(); if (G.distance(v, aimMouse) > .05) list.push({ type: selected, angle: Math.atan2(aimMouse.y - v.y, aimMouse.x - v.x), preview: true }); }
    else if(routeDrag&&routeDrag.route.path.length)list.push({...routeDrag.route.action(selected),preview:true});
    else if (hover && plan.length < 2 && !routeDrag) {
      const verdict=U.target(c,hover);
      if(verdict.ok&&['move','skillMove','grenade','smoke','blink','firebomb','stasis','mend'].includes(selected))list.push({type:selected,target:hover,path:verdict.path,preview:true});
    }
    for (const [index, a] of list.entries()) {
      if (Number.isFinite(a.angle)) {
        const range = a.type === 'slash' ? 1.5 : G.WEAPONS[player().weapon].range, ox = (origin.x + .5) * CELL, oy = (origin.y + .5) * CELL, tx = ox + Math.cos(a.angle) * range * CELL, ty = oy + Math.sin(a.angle) * range * CELL;
        ctx.save(); ctx.strokeStyle = a.preview&&!c.availability.ok ? '#ff8279' : a.type === 'slash' ? '#b7e9ff' : '#ffc27b'; ctx.fillStyle = a.type === 'slash' ? '#b7e9ff19' : '#ffc27b10'; ctx.lineWidth = a.preview ? 1.2 : 2; ctx.globalAlpha = a.preview ? .75 : 1;
        if (a.type === 'slash' || G.WEAPONS[player().weapon].spread) { const spread = a.type === 'slash' ? Math.PI / 3 : Math.max(...G.WEAPONS[player().weapon].spread.map(Math.abs)); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, range * CELL, a.angle - spread, a.angle + spread); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        const impact=a.type==='shoot'?shotPrediction({...c,origin},a.angle,range):null;
        ctx.setLineDash(a.preview ? [6, 5] : []); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(impact?impact.point.x*CELL:tx,impact?impact.point.y*CELL:ty); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        const local={...c,origin};
        if(a.type==='shoot'){const spread=G.recoilSpread(player(),G.WEAPONS[player().weapon].shots-1,focused);ctx.save();ctx.strokeStyle='#91d7eb66';ctx.lineWidth=.8;ctx.fillStyle='#91d7eb12';ctx.beginPath();ctx.moveTo(ox,oy);ctx.arc(ox,oy,range*CELL,a.angle-spread,a.angle+spread);ctx.closePath();ctx.fill();ctx.setLineDash([2,5]);for(const offset of [-spread,spread]){ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(ox+Math.cos(a.angle+offset)*range*CELL,oy+Math.sin(a.angle+offset)*range*CELL);ctx.stroke();}if(a.preview){ctx.fillStyle='#b3dce8';ctx.font='9px Consolas';ctx.textAlign='center';ctx.fillText(('RECOIL ±')+(spread*180/Math.PI).toFixed(2)+'°',tx,ty+17);}ctx.restore();for(const offset of G.WEAPONS[player().weapon].spread||[0]){if(G.WEAPONS[player().weapon].spread){ctx.save();ctx.strokeStyle='#c9e4ee8c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(ox+Math.cos(a.angle+offset)*range*CELL,oy+Math.sin(a.angle+offset)*range*CELL);ctx.stroke();ctx.restore();}renderShotBlock(local,a.angle+offset,range,a.preview);}}
        else for(const cell of U.slashCells(local,a.angle))previewTile(cell,cell.kind,cell.kind==='breach'?'↯':'');
        continue;
      }
      if(a.type==='scan'){focused=true;ctx.save();ctx.strokeStyle='#bce7ff70';ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc((origin.x+.5)*CELL,(origin.y+.5)*CELL,G.SKILLS.scanRange*CELL,0,Math.PI*2);ctx.stroke();ctx.restore();}
      if (!a.target) continue;
      const walking=['move','skillMove'].includes(a.type),color=a.type==='move'?(index===0?'#b5f1c4':'#97e5ad'):'#86d2f1';
      const target=a.target,tx=(target.x+.5)*CELL,ty=(target.y+.5)*CELL;
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=a.preview?.96:1;ctx.setLineDash(a.preview&&!walking?[5,5]:[]);
      const drawPath=()=>{ctx.beginPath();ctx.moveTo((origin.x+.5)*CELL,(origin.y+.5)*CELL);if(a.path)for(const p of a.path)ctx.lineTo((p.x+.5)*CELL,(p.y+.5)*CELL);else ctx.lineTo(tx,ty);ctx.stroke();};
      if(walking){ctx.strokeStyle='#0a211bd9';ctx.lineWidth=6;drawPath();ctx.strokeStyle=color;ctx.lineWidth=3.1;ctx.shadowColor=color+'55';ctx.shadowBlur=P.reduced()?0:5;drawPath();ctx.shadowBlur=0;ctx.fillStyle=color;for(const p of a.path||[]){ctx.beginPath();ctx.arc((p.x+.5)*CELL,(p.y+.5)*CELL,2.5,0,Math.PI*2);ctx.fill();}ctx.lineWidth=2;ctx.beginPath();ctx.arc(tx,ty,6,0,Math.PI*2);ctx.stroke();}
      else{ctx.strokeStyle=color;ctx.lineWidth=a.preview?1.8:2.3;drawPath();}
      ctx.setLineDash([]);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(target.x*CELL+2,target.y*CELL+2,CELL-4,CELL-4);ctx.restore();
      if (['grenade','smoke','firebomb','stasis','mend'].includes(a.type)) renderBlast({...c,origin},target,a.type,a.preview);
      if (!a.preview&&!walking) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill(); }
      if (['move', 'skillMove', 'blink'].includes(a.type)) origin = target;
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    if (aimMouse && ['shoot', 'slash'].includes(selected)) { const x = (aimMouse.x + .5) * CELL, y = (aimMouse.y + .5) * CELL; ctx.strokeStyle = '#fff3be'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { ctx.moveTo(x + dx * 8, y + dy * 8); ctx.lineTo(x + dx * 13, y + dy * 13); } ctx.stroke(); }
    else if (hover&&plan.length<2&&!['move','skillMove'].includes(selected)) {const verdict=U.target(c,hover);previewTile(hover,!verdict.ok?'blocked':verdict.kind,verdict.ok?'✓':'×');}

    if(['move','skillMove'].includes(selected)&&plan.length<2&&c.availability.ok){
      const head=routeDrag?routeDrag.route.origin:c.projected.origin,n=routeDrag?routeDrag.route.remaining:c.range,x=(head.x+.5)*CELL,y=(head.y+.5)*CELL;
      const bob=P.reduced()?0:Math.sin(motionTime*1.6)*1.1,top=y-43+bob;
      ctx.save();ctx.font='600 14px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=.8;ctx.fillStyle=selected==='move'?'#193b2b88':'#173449aa';ctx.strokeStyle=selected==='move'?'#b3dfb84d':'#86d2f16b';
      ctx.beginPath();ctx.roundRect(x-14,top,28,25,10);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-3,top+24);ctx.lineTo(x,top+28);ctx.lineTo(x+3,top+24);ctx.fill();
      ctx.fillStyle=selected==='move'?'#d5efdbc9':'#d5effbc9';ctx.fillText(String(n),x,top+12.5);ctx.restore();
    }
  }
  function updateActionFeedback() {
    if (!canPlan()) { canvas.style.cursor='default';$('action-feedback').classList.add('hidden'); return; }
    const c=previewContext(); if(['move','skillMove'].includes(selected)&&c.availability.ok&&plan.length<2){canvas.style.cursor=routeDrag?'grabbing':hover&&hover.x===c.origin.x&&hover.y===c.origin.y?'grab':'default';$('action-feedback').classList.add('hidden');$('field-note').textContent=(routeDrag?'Drag back to erase · Release to queue · Q cancels route':'Click a destination to route · Or drag from your operator');return;} let valid=c.availability.ok;
    if(valid&&hover&&['move','skillMove','blink','grenade','smoke','firebomb','stasis','mend'].includes(selected))valid=U.target(c,hover).ok;
    canvas.style.cursor=!valid?'not-allowed':['shoot','slash'].includes(selected)?'crosshair':'pointer';
    const type=actionHover||selected,allowed=U.availability(state,playerId,type,plan),verdict=!actionHover&&hover&&['move','skillMove','blink','grenade','smoke','firebomb','stasis','mend'].includes(type)?U.target(c,hover):allowed;
    const show=!!actionHover||!!hover&&(!verdict.ok||verdict.kind==='risky');$('action-feedback').classList.toggle('hidden',!show);
    if(show){$('feedback-title').textContent=ACTIONS.find(a=>a.type===type)?.name||G.CLASSES[player().class].skill;$('feedback-detail').textContent=verdict.reason||"Ready · 1 AP";$('action-feedback').dataset.state=!verdict.ok?'blocked':verdict.kind==='risky'?'risky':'valid';}
  }
  function renderWalkTarget(s,time){const step=W.current(s);if(!s.walkthrough||s.walkthrough.finished||s.walkthrough.ready||!step?.target)return;const p=step.target,x=(p.x+.5)*CELL,y=(p.y+.5)*CELL;ctx.save();ctx.strokeStyle='#bcf8dc';ctx.fillStyle='#8ef0c02b';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(p.x*CELL+2,p.y*CELL+2,CELL-4,CELL-4);ctx.fillRect(p.x*CELL+3,p.y*CELL+3,CELL-6,CELL-6);ctx.setLineDash([]);ctx.beginPath();ctx.arc(x,y,18+(P.reduced()?0:Math.sin(time/200)*2),0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d4ffea';ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillText(step.id==='pickup'?'PICK UP':'TRY HERE',x,y-25);ctx.restore();}
  function renderFields(s){
    for(const f of s.fields||[]){if(f.expires<=s.turn)continue;ctx.save();clipSight(s,true);const color=f.kind==='stasis'?'#8fdbbd':'#f0d49a';
      const b=G.areaBounds(f);for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++){if(!G.passable(s,x,y))continue;ctx.fillStyle=color+'19';ctx.fillRect(x*CELL+1,y*CELL+1,CELL-2,CELL-2);ctx.strokeStyle=color+'69';ctx.lineWidth=1;ctx.strokeRect(x*CELL+3,y*CELL+3,CELL-6,CELL-6);}
      const x=(f.x+.5)*CELL,y=(f.y+.5)*CELL,r=7+(P.reduced()?0:Math.sin(motionTime*2)*.6);ctx.strokeStyle=color+'aa';ctx.fillStyle=color+'38';ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<=6;i++){const a=i*Math.PI/3;i?ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r):ctx.moveTo(x+r,y);}ctx.fill();ctx.stroke();if(f.kind==='mend'){ctx.fillStyle=color;ctx.fillRect(x-3,y-1,6,2);ctx.fillRect(x-1,y-3,2,6);}else{ctx.strokeRect(x-2,y-3,4,6);}ctx.restore();
    }
  }
  function renderRoofs(s){
    const observer=s.units[viewerId()];ctx.save();
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const t=s.tiles[y][x];if(!t.roof||t.type==='void')continue;
      const own=G.tile(s,observer.x,observer.y)?.roof===t.roof,px=x*CELL,py=y*CELL;
      ctx.globalAlpha=own?.28:.60;ctx.fillStyle='#44545d';ctx.fillRect(px,py,CELL,CELL);ctx.strokeStyle='#819498';ctx.lineWidth=.7;
      for(let i=5;i<CELL;i+=8){ctx.beginPath();ctx.moveTo(px+i,py);ctx.lineTo(px+i,py+CELL);ctx.stroke();}
      ctx.lineWidth=2;ctx.strokeStyle='#bfd0c3';for(const [dx,dy,ax,ay,bx,by]of [[0,-1,0,0,CELL,0],[0,1,0,CELL,CELL,CELL],[-1,0,0,0,0,CELL],[1,0,CELL,0,CELL,CELL]])if(G.tile(s,x+dx,y+dy)?.roof!==t.roof){ctx.beginPath();ctx.moveTo(px+ax,py+ay);ctx.lineTo(px+bx,py+by);ctx.stroke();}
    }ctx.restore();
  }
  function renderSmoke(s){
    const radius=G.THROW.smokeRadius,observer=s.units[viewerId()];
    for(const sm of s.smokes){ctx.save();clipSight(s,true);const cx=(sm.x+.5)*CELL,cy=(sm.y+.5)*CELL,time=P.reduced()?0:motionTime,inside=V.sameSmoke(s,observer,{x:sm.x,y:sm.y});
      // Soft overlapping lobes replace the hard square outline; coverage stays 3×3.
      for(let i=0;i<18;i++){const angle=i*2.399963,timeDrift=time*.18,ring=i<6?.35:i<12?.82:1.22;
        const x=cx+Math.cos(angle+timeDrift*.12)*CELL*ring+Math.sin(time*.5+i)*3,y=cy+Math.sin(angle+timeDrift*.12)*CELL*ring+Math.cos(time*.43+i)*3,r=CELL*(i<6?.92:.67);
        const g=ctx.createRadialGradient(x-r*.16,y-r*.2,1,x,y,r);g.addColorStop(0,inside?'#dce8e82e':i%3?'#dce8e8a0':'#f0f4efaa');g.addColorStop(.45,inside?'#bacbd728':'#bacbd786');g.addColorStop(.78,inside?'#9ab0c018':'#9ab0c03a');g.addColorStop(1,'#9ab0c000');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
      }ctx.restore();
    }
  }
  function renderEffects(cells) {
    const shown=replay?replay.frames[replay.index]:state;ctx.save();
    for (const e of effects) {
      if(!allVisible()&&e.type!=='pickup'&&e.type!=='throw'&&!(['explosion','thermite','stasis','mend'].includes(e.type)&&G.effectVisible(shown,shown.units[viewerId()],e))&&!cells.has(G.key(Math.floor(e.x),Math.floor(e.y))))continue;
      const t = Math.max(0,Math.min(1, e.life / e.duration)),anchor=['heal','reload','guard'].includes(e.type)&&e.unitId!==undefined?unitMotion.sample(e.unitId,motionTime):null,x=((anchor?.x??e.x)+.5)*CELL,y=((anchor?.y??e.y)+.5)*CELL;ctx.save();clipSight(shown,['explosion','thermite','stasis','mend'].includes(e.type));ctx.globalAlpha=e.type==='throw'?1:Math.pow(1-t,1.3);window.GridfallEffects.drawAction(ctx,e,x,y,CELL,P.reduced());
      if (e.type === 'damage' || e.type === 'heal') { ctx.font = 'bold 12px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = e.type === 'heal' ? '#9fe3b3' : e.own||e.clash ? '#ff8970' : '#ffe8ba'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText((e.type === 'heal' ? '+' : '−') + e.amount, x + 10, y - 20 - t * 14); }
      else if (e.type === 'pickup') { ctx.font = 'bold 11px Consolas'; ctx.textAlign = 'center'; ctx.fillStyle = e.color; ctx.fillText('+ ' + e.text, x, y - 22 - t * 24); }
      else if (e.type === 'slash') { ctx.strokeStyle = '#d4f0ff'; ctx.shadowColor = '#8bcaec'; ctx.shadowBlur = 8; ctx.lineWidth = 5 * (1 - t); ctx.beginPath(); ctx.arc(x, y, CELL * (1 + t * .5), e.angle - Math.PI / 3 + t * .4, e.angle + Math.PI / 3); ctx.stroke(); }
      else if (e.type === 'explosion') {
        const r = 10 + t * 75; const grad = ctx.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, '#fff3ba'); grad.addColorStop(.25, '#ffc165'); grad.addColorStop(.55, '#e56531aa'); grad.addColorStop(1, '#e5653100'); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffcf8c'; ctx.lineWidth = 2 * (1 - t); ctx.beginPath(); ctx.arc(x, y, r * .8, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 15; i++) { const a = i * 2.399; ctx.fillStyle = i % 2 ? '#ffaf60' : '#faf1b5'; ctx.fillRect(x + Math.cos(a) * t * (45 + i * 2), y + Math.sin(a) * t * (45 + i * 2), 3 * (1 - t), 3 * (1 - t)); }
      } else if (e.type === 'muzzle') { ctx.save();ctx.translate(x,y);ctx.rotate(e.angle||0);ctx.fillStyle='#e5d4a2';ctx.beginPath();ctx.moveTo(6,-2);ctx.lineTo(16*(1-t)+6,0);ctx.lineTo(6,2);ctx.fill();ctx.restore(); }
      else if (e.type === 'throw') window.GridfallEffects.drawThrow(ctx,e,CELL,P.reduced());
      else if(e.type==='bump'){ctx.strokeStyle='#cde9ff';ctx.lineWidth=3*(1-t);ctx.beginPath();ctx.arc(x,y,8+t*28,0,Math.PI*2);ctx.stroke();for(let i=0;i<5;i++){const a=e.angle+(i-2)*.23;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*(10+t*10),y+Math.sin(a)*(10+t*10));ctx.lineTo(x+Math.cos(a)*(20+t*28),y+Math.sin(a)*(20+t*28));ctx.stroke();}}
      else if(e.type==='fall'){ctx.save();ctx.translate(x,y+t*CELL*.8);ctx.scale(1-t*.85,1-t*.85);ctx.rotate(t*1.4);ctx.fillStyle=P.accents[e.character]||'#a2c9eb';ctx.fillRect(-7,-9,14,18);ctx.restore();}
      else if(e.type==='eliminated'){ctx.save();ctx.translate(x,y+t*6);ctx.rotate(t*.7);ctx.scale(1-t*.35,1-t*.4);P.drawFieldOperator(ctx,0,0,.3,e.character);ctx.restore();ctx.strokeStyle=P.accents[e.character];ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,10+t*23,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const a=i*2.399;ctx.fillStyle=P.accents[e.character];ctx.fillRect(x+Math.cos(a)*t*30,y+Math.sin(a)*t*24-t*8,3*(1-t)+1,3*(1-t)+1);}}
      else if(e.type==='thermite'){ctx.strokeStyle='#f5b079';ctx.lineWidth=1.5;const b=G.areaBounds(e);ctx.strokeRect(b.left*CELL+2,b.top*CELL+2,b.width*CELL-4,b.height*CELL-4);ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.moveTo(x+Math.cos(a)*8,y+Math.sin(a)*8);ctx.lineTo(x+Math.cos(a)*(16+t*30),y+Math.sin(a)*(16+t*30));}ctx.stroke();}
      else if(['shield','shieldBreak','reflect'].includes(e.type)){ctx.strokeStyle=e.type==='shieldBreak'?'#d2e6ee':'#91bfd5';ctx.lineWidth=e.type==='reflect'?2:1;ctx.beginPath();const radius=13+t*10;for(let i=0;i<=6;i++){const a=i*Math.PI/3+Math.PI/6;i?ctx.lineTo(x+Math.cos(a)*radius,y+Math.sin(a)*radius):ctx.moveTo(x+Math.cos(a)*radius,y+Math.sin(a)*radius);}ctx.stroke();if(e.type==='shieldBreak'){ctx.beginPath();ctx.moveTo(x-8,y-10);ctx.lineTo(x+1,y-2);ctx.lineTo(x-2,y+7);ctx.lineTo(x+9,y+13);ctx.stroke();}}
      else if(e.type==='hit'){ctx.strokeStyle='#db8676';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,11+t*4,-.6,.6);ctx.stroke();}
      else if(e.type==='roll'){if(e.from&&cells.has(G.key(e.from.x,e.from.y))){ctx.strokeStyle=P.accents.vanguard+'88';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo((e.from.x+.5)*CELL,(e.from.y+.5)*CELL);ctx.lineTo(x,y);ctx.stroke();}ctx.strokeStyle=P.accents.vanguard;ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<3;i++){ctx.moveTo(x-12-i*4,y-5+i*5);ctx.lineTo(x-3,y-5+i*5);}ctx.stroke();}
      else if(e.type==='blink'){ctx.save();ctx.strokeStyle='#9ae3f5';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,y,7+12*(1-t),18+8*t,0,0,Math.PI*2);ctx.stroke();for(let i=0;i<4;i++){ctx.fillStyle='#8bdde9';ctx.fillRect(x-13+i*8,y-20+Math.sin(t*8+i)*8,2,7);}if(e.from&&cells.has(G.key(e.from.x,e.from.y))){ctx.beginPath();ctx.ellipse((e.from.x+.5)*CELL,(e.from.y+.5)*CELL,9*(1-t),19,0,0,Math.PI*2);ctx.stroke();}ctx.restore();ctx.strokeStyle='#79d1e3';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x-8,y-13);ctx.lineTo(x-2,y-2);ctx.lineTo(x+3,y-7);ctx.lineTo(x+9,y+12);ctx.stroke();ctx.strokeRect(x-10*(1-t),y-13,20*(1-t),26);}
      else if(e.type==='scan'){ctx.strokeStyle='#b29bd1';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,t*G.SKILLS.scanRange*CELL,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(t*Math.PI*2)*t*G.SKILLS.scanRange*CELL,y+Math.sin(t*Math.PI*2)*t*12*CELL);ctx.stroke();}
      else if(e.type==='guard'){ctx.strokeStyle='#8bcaec';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,13+t*5,Math.PI,Math.PI*2);ctx.stroke();}
      else if(e.type==='fate'){ctx.strokeStyle='#c8adef';ctx.lineWidth=1.2;const ease=1-(1-t)**3;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(x,y,12+ease*22+i*4,t+i*2.1,t+i*2.1+1.3);ctx.stroke();}ctx.save();ctx.translate(x,y);ctx.rotate(t*.6);ctx.strokeRect(-10-ease*5,-10-ease*5,20+ease*10,20+ease*10);ctx.restore();}
      else if(!['reload','smoke','dodge','equip'].includes(e.type)) { for (let i = 0; i < 7; i++) { const a = i * 2.4; ctx.fillStyle = e.type === 'destroy' ? '#a9ab82' : '#ffd88d'; ctx.fillRect(x + Math.cos(a) * t * 30, y + Math.sin(a) * t * 30, 3, 3); } }
      ctx.restore();
    }
    ctx.restore();
  }
  function clashHandIcon(choice){
    const paths={rock:'<path d="M13 25V15a3 3 0 0 1 6 0v-3a3 3 0 0 1 6 0v1a3 3 0 0 1 6 0v3a3 3 0 0 1 6 0v13c0 7-4 11-10 11h-5c-4 0-7-3-9-7l-3-7c-2-4 3-7 5-3l3 5"/><path d="M19 15v7m6-9v9m6-6v7M17 29h10"/>',paper:'<path d="M13 28V15a2.5 2.5 0 0 1 5 0v9V10a2.5 2.5 0 0 1 5 0v13V7a2.5 2.5 0 0 1 5 0v16V11a2.5 2.5 0 0 1 5 0v18l3-7c2-4 6-2 5 1l-5 13c-1 4-4 7-9 7h-5c-4 0-6-2-8-5l-6-9c-2-3 2-6 4-3l4 6"/>',scissors:'<path d="m19 25-5-15c-1-4 4-6 6-2l5 13 6-16c1-4 6-2 5 2l-5 18h4c3 0 5 3 4 6l-2 6c-1 4-4 6-8 6h-5c-5 0-8-2-10-6l-4-8c-2-4 3-7 5-3l4 6"/><path d="M20 28h10m-7 5h8"/>'};
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[choice]+'</svg>';
  }
  let clashOpponent='',clashFocus=null,localClashPick=null,clashLitIds=[];
  const clashSpotlight=document.createElement('div');clashSpotlight.id='clash-spotlight';clashSpotlight.setAttribute('aria-hidden','true');document.body.append(clashSpotlight);
  function updateClashSpotlight(clash,choosing,outcome){
    clashSpotlight.classList.toggle('active',!!choosing);
    if(choosing)clashLitIds=[...clash.ids];else if(outcome?.ids)clashLitIds=[...outcome.ids];
    // Cut out only actors we can already see; this overlay never alters line of sight.
    const rect=canvas.getBoundingClientRect(),sx=rect.width/canvas.width,sy=rect.height/canvas.height,core=Math.max(24,Math.min(50,CELL*camera.zoom*1.1)),edge=core+Math.max(18,Math.min(32,24*camera.zoom));
    const masks=[];
    for(const id of clashLitIds){
      const unit=state.units[id];if(!knownUnit(state,unit))continue;const pose=unitMotion.sample(id,motionTime)||unit;
      const x=rect.x+(pose.x+.5-camera.x)*CELL*camera.zoom*sx,y=rect.y+(pose.y+.5-camera.y)*CELL*camera.zoom*sy;
      masks.push('radial-gradient(circle at '+x.toFixed(2)+'px '+y.toFixed(2)+'px,transparent '+core.toFixed(2)+'px,#000 '+edge.toFixed(2)+'px)');
    }
    const mask=masks.length?masks.join(','):'none';if(clashSpotlight.style.maskImage!==mask)clashSpotlight.style.maskImage=mask;
  }

  const clashPanel=document.createElement('section');clashPanel.id='clash-panel';clashPanel.className='hidden';clashPanel.setAttribute('role','dialog');clashPanel.setAttribute('aria-modal','true');clashPanel.setAttribute('aria-labelledby','clash-title');
  clashPanel.innerHTML='<div class="clash-card"><small class="clash-eyebrow">CONTACT / DUEL</small><h2 id="clash-title"></h2><p id="clash-opponent"></p><div id="clash-hands"><button data-choice="rock"><small class="clash-owner"></small><span class="clash-hand">'+clashHandIcon('rock')+'</span><b></b><small class="clash-matchup"></small><em class="clash-result-label hidden"></em><kbd>1</kbd></button><button data-choice="paper"><small class="clash-owner"></small><span class="clash-hand">'+clashHandIcon('paper')+'</span><b></b><small class="clash-matchup"></small><em class="clash-result-label hidden"></em><kbd>2</kbd></button><button data-choice="scissors"><small class="clash-owner"></small><span class="clash-hand">'+clashHandIcon('scissors')+'</span><b></b><small class="clash-matchup"></small><em class="clash-result-label hidden"></em><kbd>3</kbd></button></div><div id="clash-reveal" class="hidden"><article><small></small><span></span><b></b><em></em></article></div><p id="clash-status" role="status" aria-live="polite"></p><div class="clash-countdown"><i id="clash-fill"></i></div><small id="clash-seconds"></small><p id="clash-rules"></p></div>';
  document.body.append(clashPanel);
  for(const button of clashPanel.querySelectorAll('button[data-choice]'))button.onclick=()=>submitClash(button.dataset.choice);
  function submitClash(choice){
    const c=state.clash;if(soloClashOutcome||network.active&&netPacket?.stage==='clashResult')return;if(!started||state.phase!=='clash'||!c||(network.active?!c.participant:!c.ids.includes(playerId)))return;
    if(network.active){if(!network.connected||network.busy||c.chosen)return;localClashPick={id:c.id,choice};network.command({action:'clash',choice,clashId:c.id}).catch(()=>{if(localClashPick?.id===c.id)localClashPick=null;});}
    else G.chooseClash(state,playerId,choice,c.id);
    sound.play('queue');updateClashUI(performance.now());
  }
  function updateClashUI(now){
    const c=state.clash,participating=started&&!replay&&state.phase==='clash'&&c&&(network.active?c.participant:c.ids.includes(playerId));
    const outcome=started&&!replay?(network.active?netPacket?.clashOutcome:soloClashOutcome):null,show=!!participating||!!outcome;
    updateClashSpotlight(c,participating&&!outcome,outcome);
    if(show&&clashPanel.classList.contains('hidden')){cancelRoute();clashFocus=document.activeElement;clashPanel.classList.remove('hidden');clashPanel.querySelector('button').focus({preventScroll:true});}
    if(!show){localClashPick=null;if(!clashPanel.classList.contains('hidden')){clashPanel.classList.add('hidden');clashFocus?.focus({preventScroll:true});}return;}
    if(participating){const other=c.ids.find(id=>id!==playerId);clashOpponent=network.active?c.names[c.ids.indexOf(other)]:state.units[other].name;}else if(outcome){const other=(outcome.ids||[outcome.winner,outcome.loser]).find(id=>id!==playerId);clashOpponent=state.units[other]?.name||clashOpponent;}
    $('clash-title').textContent=(outcome?'DUEL RESULT':'ROCK PAPER SCISSORS');
    $('clash-opponent').textContent=player().name+'  ×  '+clashOpponent;
    const choiceNames=['ROCK','PAPER','SCISSORS'];
    const chosen=participating?(network.active?c.chosen:!!c.choices[playerId]):true;
    const ownChoice=outcome?outcome.choices[playerId]:participating?(network.active?(localClashPick?.id===c.id?localClashPick.choice:null):c.choices[playerId]):null;
    for(const [i,button]of [...clashPanel.querySelectorAll('button[data-choice]')].entries()){
      const picked=ownChoice===button.dataset.choice,result=outcome&&picked?(outcome.tie?'tie':outcome.winner===playerId?'win':'lose'):null;
      button.querySelector('b').textContent=choiceNames[i];button.querySelector('.clash-owner').textContent=('YOU');button.querySelector('.clash-matchup').textContent=('BEATS '+choiceNames[[2,0,1][i]]);button.setAttribute('aria-label',choiceNames[i]+(result?' · '+result:''));button.disabled=!!outcome||chosen||!participating||network.active&&(!network.connected||network.busy);button.classList.toggle('picked',picked);button.setAttribute('aria-pressed',String(picked));
      if(result)button.dataset.outcome=result;else delete button.dataset.outcome;
      const label=button.querySelector('.clash-result-label');label.classList.toggle('hidden',!result);label.textContent=result?(result.toUpperCase()):'';
    }
    const hand={rock:clashHandIcon('rock'),paper:clashHandIcon('paper'),scissors:clashHandIcon('scissors')};
    $('clash-reveal').classList.toggle('hidden',!outcome);
    $('clash-hands').classList.remove('hidden');
    if(outcome){const other=(outcome.ids||[outcome.winner,outcome.loser]).find(id=>id!==playerId),ids=[other];for(const [i,card]of [...$('clash-reveal').children].entries()){const id=ids[i],choice=outcome.choices[id],result=outcome.tie?'tie':outcome.winner===id?'win':'lose';card.dataset.outcome=result;card.querySelector('small').textContent=clashOpponent;const symbol=card.querySelector('span');if(symbol.dataset.hand!==choice){symbol.dataset.hand=choice;symbol.innerHTML=hand[choice]||'—';}card.querySelector('b').textContent=choiceNames[['rock','paper','scissors'].indexOf(choice)]||'';card.querySelector('em').textContent=(result.toUpperCase());}}
    $('clash-status').textContent=outcome?outcome.tie?('TIE · Choose again after the reveal'):outcome.standoff?('No room for knockback · Loser loses 10 HP'):(outcome.winner===playerId?'YOU WIN · Opponent knocked back · −10 HP':'YOU LOSE · Knocked back · −10 HP'):network.active&&!network.connected?('Reconnecting…'):chosen?('Choice locked · Waiting for opponent'):(c.round>1?'TIE · Choose again':'Choose a hand · Choices reveal together');
    const remaining=Math.max(0,((network.active?deadline:soloClashUntil)-now)/1000);
    $('clash-fill').style.transform='scaleX('+Math.min(1,remaining/((outcome?G.CLASH.revealMs:G.CLASH.choiceMs)/1000))+')';
    $('clash-seconds').textContent=outcome?'':remaining.toFixed(1)+'s';
    $('clash-rules').textContent=('Loser is pushed to an empty cardinal tile and loses 10 HP. Everyone waits until the duel ends.');
    clashPanel.dataset.result=outcome?outcome.tie?'tie':outcome.winner===playerId?'win':'lose':'choose';
  }
  clashPanel.addEventListener('keydown',e=>{if(e.code==='Tab'){e.preventDefault();const buttons=[...clashPanel.querySelectorAll('button:not(:disabled)')];if(buttons.length){const i=buttons.indexOf(document.activeElement);buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}}});
  function updateCountdown(now) {
    const bar=$('countdown-bar'),clock=isPaused()&&!network.active?pausedAt:now;
    const unlimited=!network.active&&planningDuration===0&&!spectating;
    let ratio=0,mode='idle',remaining=0;
    if(replay){ratio=1-replay.index/Math.max(1,replay.frames.length-1);mode='replay';}
    else if(started&&(state.phase==='clash'||netPacket?.stage==='clashResult'||soloClashOutcome)){remaining=Math.max(0,((network.active?deadline:soloClashUntil)-clock)/1000);ratio=remaining/((netPacket?.stage==='clashResult'||soloClashOutcome?G.CLASH.revealMs:G.CLASH.choiceMs)/1000);mode='waiting';}
    else if(started&&state.phase==='resolution'){ratio=(80-state.tick)/80;mode='resolution';remaining=(80-state.tick)*TICK;}
    else if(started&&state.walkthrough&&state.phase==='draft'){ratio=1;mode='unlimited';}
    else if(started&&['draft','draftReveal'].includes(state.phase)){remaining=Math.max(0,(deadline-clock)/1000);ratio=remaining/(state.phase==='draft'?G.FATE.DRAFT_MS/1000:2);mode='planning';}
    else if(started&&state.phase==='planning'){
      remaining=Math.max(0,(deadline-clock)/1000);ratio=unlimited?1:remaining/(spectating?2:planningDuration);
      mode=unlimited?'unlimited':remaining<=2?'urgent':remaining<=5?'warning':network.locked?'waiting':'planning';
    }
    ratio=Math.max(0,Math.min(1,ratio));bar.dataset.mode=mode;
    $('countdown-fill').style.transform='scaleX('+ratio+')';
    bar.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
    bar.setAttribute('aria-valuetext',mode==='unlimited'?"Unlimited":mode==='replay'?'Replay':remaining.toFixed(1)+" seconds");
  }
  function frame(now) {
    const dt = Math.max(0,Math.min(.15, (now - lastTime) / 1000)); lastTime = now;frameDt=dt;
    if(!started&&!replay){requestAnimationFrame(frame);return;}
    if (!isPaused()) {
      const visualDt=dt*(replay?replay.playing?replay.speed:0:1);particles.step(visualDt); effects.forEach(e => {if(e.type!=='throw'||replay||state.phase!=='clash'&&netPacket?.stage!=='clashResult'&&!soloClashOutcome)e.life+=visualDt;}); effects = effects.filter(e => e.life < e.duration);
      if (replay) {
        if (replay.playing) {
          const targetTime=motionTime+visualDt;replay.elapsed+=visualDt;
          while (replay.elapsed >= replay.step && replay.playing) {
            motionTime=targetTime-replay.elapsed+replay.step;replay.elapsed-=replay.step;
            if (replay.index >= replay.frames.length - 1) { replay.playing = false; break; }
            replay.index++;const shown=replay.frames[replay.index];handleEvents(shown.events,true);
            // Feed every recorded step to interpolation, even at 4x or low FPS.
            // Tracks and effects persist when playback crosses a turn boundary.
            unitMotion.sync(shown.units,u=>knownUnit(shown,u),motionTime);
          }
          motionTime=targetTime;updateReplayControls();updateUI();
        }
      }
      else if(started&&!network.active&&state.phase==='draft'){if(!state.walkthrough&&now>=deadline)settleSoloDraft();}
      else if(started&&!network.active&&state.phase==='draftReveal'){if(now>=deadline){state.phase='planning';startPlanning();}}
      else if(started&&!network.active&&soloClashOutcome){if(now>=soloClashUntil){soloClashOutcome=null;if(state.phase==='clash')soloClashUntil=now+G.CLASH.choiceMs;accumulator=0;updateUI();}}
      else if(started&&!network.active&&state.phase==='clash'){
        const count=state.events.length,outcome=G.settleClash(state,now>=soloClashUntil);
        if(outcome){const events=state.events.slice(count);handleEvents(events);archive.capture(state,events);soloClashOutcome=outcome;soloClashUntil=now+G.CLASH.revealMs;updateUI();}
      }
      else if (started && !network.active && state.phase === 'resolution' && (!soloClashOutcome||now>=soloClashUntil)) {
        soloClashOutcome=null;
        accumulator += dt; let advanced = false;
        while (accumulator >= TICK && state.phase === 'resolution') {
          accumulator -= TICK; advanced = true; const events = G.step(state); if (state.tick % 4 === 0) G.observation(state, player()); handleEvents(events); archive.capture(state, events);
          if (state.phase === 'clash'){soloClashUntil=now+G.CLASH.choiceMs;accumulator=0;}else if(state.phase!=='resolution')afterResolution();
        }
        if (advanced) updateUI();
      } else if (started && state.phase === 'planning' && !$('result').classList.contains('hidden')) { /* The result screen pauses the match until spectating. */ }
      else if (started && !network.active && state.phase === 'planning' && (planningDuration > 0 || spectating)) {
        const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
        if (seconds <= 5 && seconds > 0 && warnedSecond !== seconds && !spectating) { warnedSecond = seconds; sound.play('tick'); }
        if (now >= deadline) lock();
      }
    }
    if(['draft','draftReveal'].includes(state.phase)){fateUI.update(state,playerId,started,replay);fateUI.clock(deadline-now);}
    const display = replay ? replay.frames[replay.index] : state;
    if (!isPaused()&&!replay) motionTime += dt;
    const cells = visibleCells(display);
    unitMotion.sync(display.units,u=>knownUnit(display,u),motionTime);
    if(!isPaused())trails.update(display.units,(id,time)=>unitMotion.sample(id,time),u=>knownUnit(display,u),motionTime,P.accents,P.reduced());
    for(const id of unitFacing.keys())if(!unitMotion.tracks.has(id))unitFacing.delete(id);
    if (!isPaused()) advanceCamera(dt, display);else stopKeyboardPan();
    render(display,now);updateActionFeedback();$('camera-mode').classList.toggle('hidden',camera.follow||!started||!!replay); 
    if (replay) { $('timer').textContent = (replay.index * replay.step).toFixed(1); $('timer-unit').textContent = 'REPLAY'; }
    else if(state.walkthrough&&state.phase==='draft'){$('timer').textContent='∞';$('timer-unit').textContent='PRACTICE';}
    else if(state.phase==='clash'){$('timer').textContent=Math.max(0,((network.active?deadline:soloClashUntil)-now)/1000).toFixed(1);$('timer-unit').textContent=('s');}
    else if (state.phase === 'resolution') { $('timer').textContent = Math.max(0,(80-state.tick)*TICK).toFixed(1); $('timer-unit').textContent = ('s'); }
    else { $('timer').textContent = !started ? '20' : state.phase === 'ended' ? '—' : !network.active && planningDuration === 0 && state.phase === 'planning' && !spectating ? '∞' : Math.max(0, Math.ceil((deadline - (isPaused() && !network.active ? pausedAt : now)) / 1000)); $('timer-unit').textContent = ('s'); }
    updateClashUI(now); updateCountdown(now);
    if (now > toastUntil) $('arena-toast').classList.remove('show'); requestAnimationFrame(frame);
  }
  for (const a of ACTIONS) {
    const b = document.createElement('button'); b.className = 'action-button'; b.dataset.type = a.type; b.title = a.hint + ' [' + a.key + ']'; b.innerHTML = '<kbd>' + a.key + '</kbd>' + (['shoot','grenade', 'heal', 'smoke'].includes(a.type) ? '<small>2</small>' : '') + '<span class="action-icon">' + P.icon(a.type) + '</span><b class="action-name">' + a.name + '</b>'; b.onclick = () => selectAction(a.type); $('actions').append(b);
  }
  function readPointer(e) { const rect = canvas.getBoundingClientRect(); const raw = { x: camera.x + (e.clientX - rect.left) / rect.width * viewSpan().x - .5, y: camera.y + (e.clientY - rect.top) / rect.height * viewSpan().y - .5 }; const p = { x: Math.floor(raw.x + .5), y: Math.floor(raw.y + .5) }; aimMouse = raw; hover = p; if (['shoot', 'slash'].includes(selected)) $('cursor-coord').textContent = angleLabel(Math.atan2(raw.y - virtualPosition().y, raw.x - virtualPosition().x)) + ' / FREE AIM'; else { const t = G.tile(state, p.x, p.y); $('cursor-coord').textContent = t ? coord(hover) + ' / ' + (t.loot && !t.loot.taken ? G.LOOT[t.loot.type].name : t.type.toUpperCase()) : "Outside the map"; } if(state.practice)practiceUI.inspect(G.tile(state,p.x,p.y),p.x===state.beacon.x&&p.y===state.beacon.y);return raw; }
  function traceRoute(point){if(!routeDrag)return;routeDrag.route.trace(point,()=>sound.play('routePop'));previewCache.stamp='';}
  function cancelRoute(){if(routeDrag){const id=routeDrag.pointerId;routeDrag=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);previewCache.stamp='';}}
  canvas.style.touchAction='none';
  canvas.addEventListener('pointermove',e=>{
    if(routeDrag){if(!canPlan()){cancelRoute();return;}for(const sample of e.getCoalescedEvents?.()||[e])traceRoute(readPointer(sample));traceRoute(readPointer(e));previewCache.stamp='';return;}
    if(drag){const rect=canvas.getBoundingClientRect();panCamera(-(e.clientX-drag.x)/rect.width*viewSpan().x,-(e.clientY-drag.y)/rect.height*viewSpan().y,true);drag={x:e.clientX,y:e.clientY};}else readPointer(e);
  });
  canvas.addEventListener('pointerleave',()=>{if(!drag&&!routeDrag)hover=aimMouse=null;$('cursor-coord').textContent='— / —';});
  canvas.addEventListener('pointerdown',e=>{
    if(replay)return;
    if(e.button===2||e.button===1){cancelRoute();e.preventDefault();drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);return;}
    if(e.button!==0)return;const raw=readPointer(e);
    if(['move','skillMove'].includes(selected)){
      if(!canPlan()||plan.length>=2)return;const c=previewContext();
      if(c.availability.ok&&hover.x===c.origin.x&&hover.y===c.origin.y){e.preventDefault();cameraFlight=null;const route=new window.GridfallMovement.Route({...state,fields:c.projected.movement.fields},c.origin,c.range);route.pointer={...raw};routeDrag={route,pointerId:e.pointerId,type:selected};canvas.setPointerCapture(e.pointerId);}else handleTile(hover);return;
    }
    if(['shoot','slash'].includes(selected)){const origin=virtualPosition();if(G.distance(origin,raw)>.05)queue({type:selected,angle:Math.atan2(raw.y-origin.y,raw.x-origin.x)});else toast("Move the pointer away from your operator to aim.");}else if(hover)handleTile(hover);
  });
  canvas.addEventListener('pointerup',e=>{if(routeDrag&&routeDrag.pointerId===e.pointerId){traceRoute(readPointer(e));const action=routeDrag.route.action(routeDrag.type);cancelRoute();if(action)queue({...action,drawn:true});}drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
  canvas.addEventListener('pointercancel',()=>{cancelRoute();drag=null;});canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  window.addEventListener('blur',()=>{stopKeyboardPan();cancelRoute();drag=null;});
  window.addEventListener('pointercancel',()=>{cancelRoute();drag=null;});
  window.addEventListener('pointerup',e=>{if(routeDrag&&routeDrag.pointerId===e.pointerId){traceRoute(readPointer(e));const action=routeDrag.route.action(routeDrag.type);cancelRoute();if(action)queue({...action,drawn:true});}});
  window.addEventListener('pointermove',e=>{if(routeDrag&&e.target!==canvas&&e.pointerId===routeDrag.pointerId){if(!canPlan()||!(e.buttons&1)){cancelRoute();return;}traceRoute(readPointer(e));previewCache.stamp='';}});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();cancelRoute();if(!replay)zoomCamera(e.deltaY<0?1.15:1/1.15);},{passive:false});
  $('camera-out').onclick = () => zoomCamera(1 / 1.2); $('camera-in').onclick = () => zoomCamera(1.2);
  $('camera-center').onclick = () => { const p = unitMotion.sample(viewerId(), motionTime) || state.units[viewerId()]; flyCamera({ cx: p.x + .5, cy: p.y + .5, zoom: camera.zoom }, .85, true); hover = aimMouse = null; };
  $('camera-fit').onclick = () => { fitCamera(); hover = aimMouse = null; };
  $('fullscreen-button').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast("Press F11 for fullscreen."); } };
  $('lock-button').onclick = lock;
  $('undo-button').onclick = () => { if (!canPlan()) return; if(routeDrag){cancelRoute();return;} const undone=plan.pop();if(undone)walkEvent('undo');clearActionFlights();sound.play('click'); updateUI(); };
  $('skill-button').onclick = () => selectAction(G.CLASSES[player().class].skillType);
  function soloOptions(){if($('solo-mode').value!=='team')return{};const a=Number($('solo-team-a').value)||4,b=Number($('solo-team-b').value)||4,own=$('solo-team').value,teams={0:own};let id=1;for(const team of ['A','B'])for(let i=team===own?1:0;i<(team==='A'?a:b);i++)teams[id++]=team;return{mode:'team',activeIds:Object.keys(teams).map(Number),teams};}
  $('solo-mode').onchange=()=>{$('solo-team-options').classList.toggle('hidden',$('solo-mode').value!=='team');$('start-button').textContent=$('solo-mode').value==='team'?'DEPLOY TEAM MATCH →':'DEPLOY SOLO →';};
  $('start-button').onclick = ()=>start();$('menu-practice').onclick=()=>P.showPane('training');$('menu-walkthrough').onclick=()=>start('walkthrough');$('menu-free-practice').onclick=()=>start('free');
  function requestExit() {closeAudioSettings(false); cancelRoute();
    if(!$('exit-dialog').classList.contains('hidden'))return;
    exitAt=performance.now();exitFocus=document.activeElement;
    $('exit-title').textContent=(started?'Exit match?':network.active?'Exit room?':'Return to menu?');
    $('exit-copy').textContent=network.active&&started?(player().alive&&state.phase!=='ended'?'Leave this match and wait in the same room.':'Return to the same room for the next match.'):('Return to the main menu.');
    $('exit-dialog').classList.remove('hidden');stopKeyboardPan();updateUI();$('exit-cancel').focus();sound.play('click');
  }
  function cancelExit() { if($('exit-dialog').classList.contains('hidden'))return;if(!network.active){deadline+=performance.now()-exitAt;soloClashUntil+=performance.now()-exitAt;}$('exit-dialog').classList.add('hidden');exitFocus?.focus({preventScroll:true});lastTime=performance.now();updateUI(); }
  $('exit-cancel').onclick=cancelExit;$('exit-confirm').onclick=()=>{$('exit-dialog').classList.add('hidden');if(network.active&&started)returnToRoom();else mainMenu();};
  $('exit-dialog').addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();e.stopPropagation();cancelExit();}if(e.code==='Tab'){e.preventDefault();(document.activeElement===$('exit-cancel')?$('exit-confirm'):$('exit-cancel')).focus();}});
  async function returnToRoom() {
    if(!network.active||returningRoom)return;returningRoom=true;clearTimeout(returnTimer);
    try{await network.returnRoom();}catch{if(network.active)$('exit-dialog').classList.remove('hidden');}finally{returningRoom=false;}
  }
  function resetMatchView() {
    stopKeyboardPan();practiceUI.pause();
    clearTimeout(returnTimer);++resultTicket;clearActionFlights();closeAudioSettings(false);cancelRoute();fateUI.close();
    if(state.phase==='ended'&&archive.turns.length&&network.fullReady)lastMatch={state:structuredClone(state),turns:archive.turns,playerId};
    started=false;spectating=false;spectateId=null;deathShown=false;replay=null;netPacket=null;network.fullReady=false;network.locked=false;fetchingArchive=false;
    soloClashOutcome=null;soloClashUntil=0;plan=[];hover=aimMouse=null;particles.clear();unitMotion.clear();trails.clear();unitFacing.clear();effects=[];signals=[];logs=[];archive=new R.MatchArchive();replayFrames=[];frozenBefore=null;playerDeathTurn=null;
    lobbyDirty=false;lobbySaving=false;lobbyStarting=false;document.body.classList.remove('spectating-live','logs-open','has-pending','practice-mode');$('practice-panel').classList.add('hidden');delete document.body.dataset.practiceCue;
    for(const id of ['result','help','exit-dialog','replay-controls','resolve-banner','action-feedback','camera-mode','turn-report','turn-transition','spectator-bar'])$(id).classList.add('hidden');
    clashPanel.classList.add('hidden');
  }
  function mainMenu() { clearTimeout(returnTimer); clearActionFlights();closeAudioSettings(false);cancelRoute();soloClashOutcome=null;soloClashUntil=0;
    ++resultTicket;fateUI.close();
    if(state.phase==='ended'&&archive.turns.length&&(!network.active||network.fullReady)){lastMatch={state:structuredClone(state),turns:archive.turns,playerId};}
    particles.clear();explored.clear();actionHover=null;menuReplay=false;P.reset();$('turn-report').classList.add('hidden');$('turn-transition').classList.add('hidden');
    network.leave(); network.credentials=null; network.fullReady=false; playerId=0; netPacket=null;
    started=false; spectating=false; spectateId=null; deathShown=false; replay=null; fetchingArchive=false; lobbyPacket=null; lobbyDirty=false; lobbySaving=false; lobbyStarting=false;
    plan=[]; hover=aimMouse=null; effects=[]; signals=[]; logs=[]; archive=new R.MatchArchive(); replayFrames=[]; frozenBefore=null; playerDeathTurn=null;
    state=G.createState(Date.now()&0xffffff,selectedClass,$('map-select').value); fogCache.stamp='';
    camera={x:0,y:0,zoom:window.innerWidth<=790?.9:1.2,follow:true};centerCamera();
    for(const id of ['lobby','result','help','replay-controls','resolve-banner','camera-mode','action-feedback'])$(id).classList.add('hidden');
    $('intro').classList.remove('hidden'); $('network-error').textContent=''; $('arena-toast').classList.remove('show'); toastUntil=0;
    document.body.classList.remove('logs-open','inventory-open','map-open','has-pending','spectating-live','join-mode','practice-mode');$('practice-panel').classList.add('hidden');delete document.body.dataset.practiceCue;
    $('join-code').value=''; $('room-link').value=''; $('room-code').textContent=''; $('lobby-message').textContent='';
    const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url.pathname+url.search+url.hash);
    updateConnection();updateUI();
  }
  window.GRIDFALL_OPEN_LAST_REPLAY=()=>{if(!lastMatch)return false;state=structuredClone(lastMatch.state);playerId=lastMatch.playerId;archive=new R.MatchArchive();archive.turns=lastMatch.turns;started=true;menuReplay=true;$('intro').classList.add('hidden');startReplay('match');return true;};
  $('restart-button').onclick = requestExit; $('main-menu').onclick=requestExit;
  $('result').addEventListener('click',e=>{if(e.target.closest('button'))return;for(const animation of $('result').getAnimations({subtree:true}))animation.finish();});
  function syncAudioControls(){
    const effects=Math.round(sound.volume*100),music=Math.round(sound.musicVolume*100);
    for(const id of ['volume','setting-volume'])$(id).value=effects;for(const id of ['music-volume','setting-music-volume'])$(id).value=music;
    for(const id of ['effect-level-menu','effect-level-ingame'])$(id).textContent=effects+'%';for(const id of ['music-level-menu','music-level-ingame'])$(id).textContent=music+'%';
    $('sound-label').textContent=(sound.enabled?'SOUND ON':'SOUND OFF');$('audio-mute').textContent=(sound.enabled?'MUTE ALL':'UNMUTE');$('sound-button').setAttribute('aria-label',(sound.enabled?'MUTE ALL':'UNMUTE'));$('sound-button').setAttribute('aria-pressed',String(!sound.enabled));
  }
  function saveAudio(){try{localStorage.setItem('gridfall-audio-v2',JSON.stringify({effects:sound.volume,music:sound.musicVolume}));}catch{}}
  try{const saved=JSON.parse(localStorage.getItem('gridfall-audio-v2'));if(saved&&Number.isFinite(saved.effects)&&Number.isFinite(saved.music)){sound.setVolume(saved.effects);sound.setMusicVolume(saved.music);}}catch{}
  syncAudioControls();
  for(const id of ['volume','setting-volume'])$(id).oninput=e=>{sound.setVolume(Number(e.target.value)/100);syncAudioControls();saveAudio();};
  for(const id of ['music-volume','setting-music-volume'])$(id).oninput=e=>{sound.setMusicVolume(Number(e.target.value)/100);syncAudioControls();saveAudio();};
  $('sound-button').onclick=async()=>{await sound.unlock();sound.toggle();syncAudioControls();sound.play('menuSelect');};$('audio-mute').onclick=()=>$('sound-button').click();
  function closeAudioSettings(restoreFocus=true){const wasOpen=!$('ingame-audio-panel').classList.contains('hidden');$('ingame-audio-panel').classList.add('hidden');$('audio-settings-button').setAttribute('aria-expanded','false');if(wasOpen&&restoreFocus)$('audio-settings-button').focus();}
  $('audio-settings-button').innerHTML=P.icon('settings');$('audio-settings-button').onclick=()=>{const open=$('ingame-audio-panel').classList.contains('hidden');if(!open){closeAudioSettings();return;}$('ingame-audio-panel').classList.remove('hidden');$('audio-settings-button').setAttribute('aria-expanded','true');syncAudioControls();$('volume').focus();sound.play('menuSelect');};
  $('audio-settings-close').onclick=()=>closeAudioSettings();
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#ingame-audio-panel,#audio-settings-button'))closeAudioSettings(false);},{capture:true});
  const unlockAudio=()=>{if(!sound.context||sound.context.state==='suspended'||!sound.music?.source)sound.unlock().catch(()=>{});};
  document.addEventListener('pointerdown',unlockAudio,{capture:true});document.addEventListener('keydown',unlockAudio,{capture:true});sound.setMusicVisible(!document.hidden);
  $('help-button').onclick = openHelp; $('close-help').onclick = closeHelp; $('help-done').onclick = closeHelp;
  $('match-replay-button').onclick = () => startReplay('match');
  $('replay-exit').onclick=endReplay;
  $('replay-play').onclick = () => { if (!replay) return; if (replay.index === replay.frames.length - 1) seekReplay(0); replay.playing = !replay.playing; updateReplayControls(); };
  $('replay-seek').oninput = e => seekReplay(Number(e.target.value));
  $('replay-speed').onchange = e => { if (replay) replay.speed = Number(e.target.value); };
  $('replay-view').onchange = e => { if (replay) { replay.view = e.target.value; updateReplayCamera(); } };
  $('replay-prev').onclick = () => { if (replay) seekReplay(R.turnStart(replay.frames, replay.index, -1)); };
  $('replay-next').onclick = () => { if (replay) seekReplay(R.turnStart(replay.frames, replay.index, 1)); };
  $('spectate').onclick = () => chooseSpectator();
  $('spectator-prev').onclick = () => chooseSpectator(-1); $('spectator-next').onclick = () => chooseSpectator(1); $('spectator-exit').onclick = requestExit;
  $('class-picker').addEventListener('click', e => { const button = e.target.closest('button'); if (!button) return; selectedClass = button.dataset.class; for (const b of $('class-picker').children) b.classList.toggle('selected', b === button); $('class-description').textContent=G.CLASSES[selectedClass].description;P.setOperator(selectedClass); sound.play('click'); });
  for(const b of $('class-picker').children)b.title=G.CLASSES[b.dataset.class].description;
  $('map-select').addEventListener('change', e => { selectedMap = e.target.value; $('map-description').textContent = G.MAPS[selectedMap].description; if (!started) { state = G.createState(state.seed, selectedClass, selectedMap); fogCache.stamp = ''; camera = { x: 0, y: 0, zoom: window.innerWidth <= 790 ? .9 : 1.2, follow: true }; centerCamera(); updateUI(); } });
  document.addEventListener('keydown', e => {
    if (PAN_KEYS[e.code] && started && !replay && !isPaused() && !['draft','draftReveal','ended','clash'].includes(state.phase) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.matches('input,select,textarea') && !e.target.isContentEditable) {
      e.preventDefault();if(!panKeys.size){cancelRoute();cameraFlight=null;camera.follow=false;}panKeys.add(e.code);return;
    }
    if(e.code==='Escape'&&!$('ingame-audio-panel').classList.contains('hidden')){e.preventDefault();closeAudioSettings();return;}
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if(!$('exit-dialog').classList.contains('hidden')){if(e.code==='Escape')cancelExit();return;}
    if (e.code === 'Escape'&&routeDrag){e.preventDefault();cancelRoute();return;}
    if (e.code === 'Escape') { if (document.body.classList.contains('logs-open')) {document.body.classList.remove('logs-open'); return;} if (isPaused()) closeHelp(); else if (replay) endReplay(); else if (canPlan()) {clearActionFlights();plan = [];updateUI();} return; }
    if(!clashPanel.classList.contains('hidden')){const choice={Digit1:'rock',Digit2:'paper',Digit3:'scissors'}[e.code];if(choice){e.preventDefault();submitClash(choice);}return;}
    if (e.target.matches('input,select,textarea') || e.target.isContentEditable) return;
    if (e.code === 'Tab' && started) { e.preventDefault(); document.body.classList.toggle('logs-open'); return; }
    if (replay) { if (e.code === 'Space') { e.preventDefault(); $('replay-play').click(); } if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); seekReplay(replay.index + ((e.code === 'ArrowLeft' ? -1 : 1) * Math.round(1 / replay.step))); } return; }
    if (e.code === 'Space' && canPlan()) { e.preventDefault(); lock(); }
    const physical = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.toUpperCase();
    const action = ACTIONS.find(a => a.key === physical); if (action) { e.preventDefault(); selectAction(action.type); }
    if (physical === 'Q' && canPlan()) { e.preventDefault(); if(routeDrag)cancelRoute();else $('undo-button').click(); }
    if (physical === 'E' && canPlan()) $('skill-button').click();
    if (physical === 'C' && started && !isPaused()) $('camera-center').click();
  
  });
  document.addEventListener('keyup',e=>{if(panKeys.delete(e.code))e.preventDefault();});
  document.addEventListener('focusin',e=>{if(e.target.matches('input,select,textarea')||e.target.isContentEditable)stopKeyboardPan();});
  document.addEventListener('visibilitychange', () => { sound.setMusicVisible(!document.hidden);if (document.hidden) { stopKeyboardPan();cancelRoute(); if ($('help').classList.contains('hidden')) { pausedAt = performance.now(); window.__gridfallHiddenAt = pausedAt; } } else { if (window.__gridfallHiddenAt) { if (!network.active){deadline += performance.now() - window.__gridfallHiddenAt;soloClashUntil+=performance.now()-window.__gridfallHiddenAt;} window.__gridfallHiddenAt = 0; lastTime = performance.now(); } if (network.active && !replay) unitMotion.clear(); trails.clear();unitFacing.clear(); updateUI(); } });
  window.GRIDFALL_STATUS = () => ({ practice:!!state.practice,walkthrough:state.walkthrough?{...state.walkthrough,step:W.current(state)?.id}:null,mode:state.mode,team:player().team,winnerTeam:state.winnerTeam,character:player().class,practiceTurns,practiceRespawns:state.practiceRespawns||0, playerId, movement:routeDrag?{origin:routeDrag.route.origin,path:structuredClone(routeDrag.route.path),remaining:routeDrag.route.remaining}:null, clash:state.clash?{id:state.clash.id,ids:state.clash.ids,round:state.clash.round,chosen:network.active?state.clash.chosen:!!state.clash.choices[playerId]}:null, network: {active:network.active,connected:network.connected,locked:network.locked,room:network.credentials?.code,stage:netPacket?.stage,ready:netPacket?.ready}, visibility: {all:allVisible(),cells:visibleCells(replay?replay.frames[replay.index]:state).size}, phase: state.phase, turn: state.turn, tick: state.tick, winner: state.winner, hp: player().hp, shield: player().shield, ammo: player().ammo, reserve: player().reserve, medkits: player().medkits, grenades: player().grenades, smoke: player().smoke, alive: state.aliveCount ?? state.units.filter(u => u.alive).length, queued: plan.length, selected, plan: structuredClone(plan), map: { id: state.mapId, width: state.width, height: state.height }, fate:structuredClone(state.fate?.roster?state.fate:G.FATE.publicState(state,playerId)),player: { x: player().x, y: player().y,facing:player().facing,moveRange:G.moveRange(state,player()) }, camera: { ...camera }, viewport: viewSpan(), weapons: [...player().weapons], pendingPickups: structuredClone(player().pendingPickups), nearbyLoot: lootNearPlan(), sound: { enabled: sound.enabled, state: sound.context ? sound.context.state : 'locked', effectsVolume:sound.volume,music:sound.music?.status()||{playing:false,volume:sound.musicVolume} }, recordedTurns: archive.turns.length, replay: !!replay, replayInfo: replay ? { kind: replay.kind, index: replay.index, frames: replay.frames.length, playing: replay.playing, speed: replay.speed, view: replay.view, turn: replay.frames[replay.index].turn } : null, started });

  window.addEventListener('pagehide',e=>{if(e.persisted||!network.active)return;const c=network.credentials;navigator.sendBeacon('/api/leave',new Blob([JSON.stringify({room:c.code,token:c.token})],{type:'application/json'}));network.detach();});
  function updateConnection() {
    $('connection-status').classList.toggle('hidden',!network.active);
    $('connection-status').textContent = network.active ? network.connected ? '● ' + (network.online ? 'ONLINE' : 'LAN') + ' · ' + network.credentials.code : '◌ RECONNECTING' : '';
    $('lobby-connection').textContent = network.connected ? 'CONNECTED · REALTIME' : "Connecting…";
    $('lobby').classList.toggle('lobby-offline',!network.connected);if(network.active&&lobbyPacket&&!started)refreshLobbyControls();
  }
  function renderLobby(packet) {
    const previous=lobbyPacket;lobbyPacket = packet; const host = packet.host === playerId, me = packet.members.find(m => m.id === playerId);
    $('intro').classList.add('hidden'); $('lobby').classList.remove('hidden'); $('room-code').textContent = packet.code;
    $('lobby-wait').textContent=packet.matchRunning?('MATCH IN PROGRESS · WAITING FOR NEXT MATCH'):('WAITING FOR HOST');
    $('lobby-role').textContent = host ? "HOST · Choose the map and bot count" : "PLAYER · Choose your name and operator";
    $('lobby-map-control').classList.toggle('hidden',!host); $('lobby-map-select').disabled = !host || lobbySaving || packet.matchRunning; $('lobby-map-select').value = packet.options.mapId;
    $('lobby-map').textContent = G.MAPS[packet.options.mapId].name+" / New layout at match start" + ' · ' + packet.options.planningSeconds + 's / TURN';
    if (me && !lobbyDirty) { $('lobby-name').value = me.name; $('lobby-character').value = me.character; }
    P.setLobbyOperator($('lobby-character').value);
    $('lobby-occupancy').textContent=packet.members.length+packet.options.botCount+' / 8';
    $('lobby-mode').value=packet.options.mode||'ffa';$('lobby-team-control').classList.toggle('hidden',packet.options.mode!=='team');
    const roster=[...packet.members,...(packet.bots||[])],counts={A:roster.filter(m=>m.team==='A').length,B:roster.filter(m=>m.team==='B').length};
    $('lobby-team-summary').textContent='A: '+counts.A+' / 4 · B: '+counts.B+' / 4 · Friendly fire off';
    for(const team of ['A','B'])$('team-'+team.toLowerCase()).setAttribute('aria-pressed',String(me?.team===team));
    refreshLobbyControls();
    $('lobby-members').replaceChildren(...Array.from({length:8},(_,id)=>id).sort((a,b)=>packet.options.mode==='team'?((roster.find(m=>m.id===a)?.team||'Z').localeCompare(roster.find(m=>m.id===b)?.team||'Z')||a-b):a-b).map(id=>{
      const m=packet.members.find(m=>m.id===id),bot=packet.bots?.find(b=>b.id===id),old=previous?.members.find(m=>m.id===id),row=document.createElement('div');
      row.className='lobby-member'+(m?.connected?' connected':'')+(JSON.stringify(m)!==JSON.stringify(old)?' slot-changed':'');
      row.style.setProperty('--slot-accent',packet.options.mode==='team'?(m||bot)?.team==='A'?'#79d8ff':'#ffb17b':m?P.accents[m.character]:'#708a9e');row.dataset.team=packet.options.mode==='team'?(m||bot)?.team||'':'';if(m?.id===playerId)row.classList.add('self');if(!m&&!bot)row.classList.add('empty');
      const number=document.createElement('span');number.className='slot-id';if(m)number.innerHTML=P.icon(G.CLASSES[m.character].skillType);else if(bot)number.innerHTML=P.icon('settings');else number.textContent=String(id+1).padStart(2,'0');
      const name=document.createElement('div');name.className='slot-name';name.textContent=m?m.name:bot?bot.name:'OPEN SLOT';
      const character=document.createElement('small');character.textContent=m?G.CLASSES[m.character].name+(m.id===packet.host?' / HOST':'')+(m.id===playerId?' / YOU':''):bot?"Random operator":"Waiting for a player · Empty slots do not spawn.";name.append(character);
      const status=document.createElement('span');status.className='slot-state';status.textContent=m?m.connected?'LINKED':'OFFLINE':bot?'CPU':'EMPTY';row.append(number,name,status);if(packet.options.mode==='team'&&(m||bot)){const badge=document.createElement('span');badge.className='team-badge';badge.textContent='TEAM '+(m||bot).team;row.append(badge);if(host&&bot){const move=document.createElement('button');move.type='button';move.className='team-bot-move';const to=bot.team==='A'?'B':'A';move.textContent='→ '+to;move.title='Move bot to Team '+to;move.disabled=packet.matchRunning||lobbySaving||counts[to]>=4;move.onclick=()=>changeRoomSetting({botTeams:{[bot.id]:to}});row.append(move);}}if(host&&m&&m.id!==playerId){const kick=document.createElement('button');kick.className='lobby-kick';kick.type='button';kick.textContent='×';kick.title=('Kick ')+m.name;kick.setAttribute('aria-label',kick.title);kick.onclick=async()=>{kick.disabled=true;try{await network.kick(m.id);}catch(e){$('lobby-message').textContent=e.message;kick.disabled=false;}};row.append(kick);}return row;
    }));
    if($('lobby-preview').dataset.map!==packet.options.mapId){P.terrainPreview($('lobby-preview'),G.createState(171717,'vanguard',packet.options.mapId));$('lobby-preview').dataset.map=packet.options.mapId;}
    if(previous&&packet.members.length>previous.members.length)sound.play('join');
    const botCount=packet.options.botCount;
    $('lobby-bot-count').textContent=botCount;
    $('lobby-bot-summary').textContent=packet.members.length+" players + "+botCount+" bots / 8";
    $('bot-add').classList.toggle('hidden',!host);$('bot-remove').classList.toggle('hidden',!host);
    $('bot-add').disabled=packet.matchRunning||lobbySaving||lobbyStarting||!network.connected||botCount>=8-packet.members.length;
    $('bot-remove').disabled=packet.matchRunning||lobbySaving||lobbyStarting||!network.connected||botCount<=0;
    $('room-start').disabled = packet.matchRunning || !host || lobbySaving || lobbyStarting || !network.connected || packet.members.length+botCount<2; $('room-start').classList.toggle('hidden',!host); $('lobby-wait').classList.toggle('hidden',host&&!packet.matchRunning);
    const code = packet.code; network.invitation().then(url => { if (network.active && network.credentials?.code === code && !started) $('room-link').value = url; }).catch(()=>{});
  }
  function refreshLobbyControls(){
    const disabled=lobbySaving||lobbyStarting||!network.connected,host=lobbyPacket?.host===playerId;
    $('lobby-name').disabled=disabled;$('lobby-character').disabled=disabled;
    $('lobby-mode').disabled=disabled||!host||!!lobbyPacket?.matchRunning;
    for(const team of ['A','B'])$('team-'+team.toLowerCase()).disabled=disabled||!!lobbyPacket?.matchRunning||lobbyPacket?.members.filter(m=>m.id!==playerId&&m.team===team).length>=4;
    for(const b of $('lobby-operator-picker').children)b.disabled=disabled;
    $('lobby-save').disabled=disabled||!lobbyDirty||!$('lobby-name').value.trim();
    $('room-start').textContent=lobbyStarting?"Deploying…":'START MATCH ↗';$('room-start').setAttribute('aria-busy',String(lobbyStarting));
    $('lobby-profile-state').textContent=lobbySaving?"Saving…":lobbyDirty?"Unsaved changes":"Saved to room";
    $('lobby-profile-state').classList.toggle('pending',lobbyDirty);document.querySelector('.lobby-selection-panel').classList.toggle('saving',lobbySaving);
    $('lobby-map-select').disabled=disabled||!host||!!lobbyPacket?.matchRunning;
    $('bot-add').disabled=disabled||!host||!lobbyPacket||lobbyPacket.matchRunning||lobbyPacket.options.botCount>=8-lobbyPacket.members.length;
    $('bot-remove').disabled=disabled||!host||!lobbyPacket||lobbyPacket.matchRunning||lobbyPacket.options.botCount<=0;
    $('room-start').disabled=disabled||!host||!lobbyPacket||lobbyPacket.matchRunning||lobbyPacket.members.length+lobbyPacket.options.botCount<2;
  }
  async function saveLobby() {
    if (!lobbyDirty || lobbySaving) return;
    if (!$('lobby-name').value.trim()) { $('lobby-message').textContent="Enter a name before saving."; throw new Error('Name required'); }
    const draftName=$('lobby-name').value,data={name:draftName.trim(),character:$('lobby-character').value}, code=network.credentials.code;
    lobbySaving=true;refreshLobbyControls();
    try { await network.updateLobby(data); if(!network.active||network.credentials?.code!==code||started)return; const unchanged=$('lobby-name').value===draftName&&$('lobby-character').value===data.character;lobbyDirty=!unchanged;if(unchanged){$('lobby-name').value=data.name;if(lobbyPacket){const me=lobbyPacket.members.find(m=>m.id===playerId);if(me)Object.assign(me,data);}} selectedClass=data.character;P.setOperator(selectedClass); $('player-name').value=data.name;sessionStorage.setItem('gridfall-name',data.name); for(const b of $('class-picker').children)b.classList.toggle('selected',b.dataset.class===selectedClass);$('class-description').textContent=G.CLASSES[selectedClass].description; $('lobby-message').textContent=lobbyDirty?"Unsaved changes":"Saved ✓"; }
    finally { if(network.active&&network.credentials?.code===code&&!started){lobbySaving=false;if(lobbyPacket)renderLobby(lobbyPacket);} }
  }
  function receivePacket(packet) {
    if(packet.type==='removed'){mainMenu();P.showPane('network');$('network-error').textContent=(packet.reason==='kicked'?'Removed from room by host.':'Disconnected from room.');return;}
    if (!network.active) return;
    playerId = network.credentials.playerId; updateConnection();
    if (packet.type === 'lobby') {
      if(started)resetMatchView();
      renderLobby(packet); return;
    }
    if (packet.type !== 'state') return;
    const previous = netPacket; netPacket = packet;
    if (replay && (packet.stage === 'resolution' || previous?.state.turn !== packet.state.turn)) endReplay();
    const enteringMatch=!started||previous?.matchId!==packet.matchId,first=enteringMatch||packet.init;
    if (first) {
      clearActionFlights();closeAudioSettings(false);if(enteringMatch)sound.restartMusic();
      ++resultTicket;particles.clear();explored.clear();actionHover=null;menuReplay=false;
      started = true; spectating = deathShown = false; spectateId = null; replay = null; logs = []; effects = []; signals = []; plan = []; replayFrames = []; archive = new R.MatchArchive(); fetchingArchive = false; playerDeathTurn = null;
      camera = {x:0,y:0,zoom:window.innerWidth<=790?.9:1.2,follow:true};
      lobbyStarting=false;lobbySaving=false;unitMotion.clear();trails.clear();unitFacing.clear();previewCache.stamp='';sightCache={};
      for (const id of ['intro','lobby','result','help','replay-controls']) $(id).classList.add('hidden');
      sound.play('deploy');
    }
    if(packet.state.phase!=='planning'||packet.state.turn!==state.turn)cancelRoute(); state = packet.state;if(state.phase==='planning'&&previous?.stage==='draftReveal'&&player().alive){makeEffect('fate',player().x,player().y,{duration:.9,color:'#cbb5f3'});}if(!first&&state.phase==='planning'&&previous?.state.units[playerId]?.weapon!==state.units[playerId].weapon){makeEffect('equip',player().x,player().y,{duration:.65});sound.play('reload');} network.locked = packet.locked; deadline = performance.now() + packet.remainingMs; planningDuration = (packet.planningMs??20000)/1000; fogCache.stamp = '';
    if (packet.spectating != null && state.phase !== 'ended') setSpectator(packet.spectating);
    if (first) { centerCamera(); log("Joined " + (network.online ? 'ONLINE' : 'LAN') + ' · ROOM ' + network.credentials.code,'good'); }
    if (['resolution','clash'].includes(state.phase)) {
      if (!archive.current) { reportTurn=state.turn;report={dealt:0,received:0,shots:0,items:0}; frozenBefore = {turn:state.turn}; plan = state.plans[playerId] || []; archive.begin(state); effects = []; resolutionBanner(); }
      else if (packet.stage === 'resolution' && (!previous || previous.state.tick !== state.tick)) archive.capture(state, state.events);
    } else {
        if (archive.current) { turnReport();archive.capture(state,state.events); replayFrames = archive.finish(); if (archive.turns.length > 1) archive.turns[archive.turns.length - 2].frames = []; }
      if (first || previous?.state.turn !== state.turn) { turnFeedback();plan=[];selected='move';signals=signals.filter(s=>s.expires>=state.turn); }
      if (state.phase === 'ended' && previous?.stage !== 'ended') showResult(state.mode==='team'?state.winnerTeam===player().team:state.winner === playerId);
      if (state.phase === 'ended' && !fetchingArchive) {
        fetchingArchive=true; const archiveRoom=network.credentials.code; network.archive().then(turns=>{if(!network.active||network.credentials?.code!==archiveRoom||netPacket?.matchId!==packet.matchId||!started)return;archive.turns=turns; for(const turn of turns) for(const frame of turn.frames){const stats=frame.units[playerId].stats||{};frame.kills=stats.kills||0;frame.damage=stats.damage||0;frame.shots=stats.shots||0;}network.fullReady=true;updateUI();}).catch(()=>{if(network.active&&network.credentials?.code===archiveRoom&&netPacket?.matchId===packet.matchId&&started){fetchingArchive=false;log("Could not load the replay · Try again.");}});
      }
    }
    if (!player().alive && !deathShown) { deathShown=true;playerDeathTurn=frozenBefore?.turn??state.turn;showResult(false); }
    if (!previous || packet.seq !== previous.seq) handleEvents(state.events);
    updateClashUI(performance.now());updateUI();
  }
  async function enterRoom(create) {
    for(const id of ['room-create','room-join'])$(id).classList.remove('failed');
    const enteredName=$('player-name').value.trim(),rejoining=!create&&sessionStorage.getItem('gridfall-room-'+$('join-code').value.trim().toUpperCase());
    if(!enteredName&&!rejoining){$('network-error').textContent="Enter your name to join.";$('player-name').focus();return;}
    if(enteredName)sessionStorage.setItem('gridfall-name',enteredName);
    $('network-error').textContent=''; $('room-create').disabled=$('room-join').disabled=true;
    try { await sound.unlock(); started=false; spectating=false; spectateId=null; lobbyPacket=null; lobbyDirty=false; lobbySaving=false;lobbyStarting=false;playerId=0;netPacket=null;await network.enter(create,{room:$('join-code').value,name:$('player-name').value,character:selectedClass,...(create?{mapId:$('map-select').value,planningSeconds:Number($('planning-time').value)||20,mode:$('room-mode').value}:{})}); }
    catch(e){$(create?'room-create':'room-join').classList.add('failed');$('network-error').textContent=e.message||"Could not join · Check the room code and connection.";} finally{$('room-create').disabled=$('room-join').disabled=false;}
  }
  $('room-create').onclick=()=>enterRoom(true);$('room-join').onclick=()=>enterRoom(false);
  $('room-start').onclick=async()=>{
    if(lobbyStarting||lobbySaving||!network.connected||lobbyPacket?.matchRunning||lobbyPacket?.host!==playerId)return;
    const code=network.credentials.code;let accepted=false;lobbyStarting=true;refreshLobbyControls();$('lobby-message').textContent='';
    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(!network.active||network.credentials?.code!==code||started)return;
      await saveLobby();
      if(network.active&&network.credentials?.code===code&&!started){await network.start();accepted=true;}
    }catch(e){if(network.active&&network.credentials?.code===code&&!started)$('lobby-message').textContent=e.message||"Check your name and connection, then try again.";}
    finally{if(!accepted&&network.active&&network.credentials?.code===code){lobbyStarting=false;if(!started)refreshLobbyControls();}}
  };
  $('room-leave').onclick=requestExit;
  for (const id of ['lobby-name','lobby-character']) $(id).addEventListener('input',()=>{const me=lobbyPacket?.members.find(m=>m.id===playerId);lobbyDirty=!me||$('lobby-name').value!==me.name||$('lobby-character').value!==me.character;$('lobby-message').textContent='';P.setLobbyOperator($('lobby-character').value);refreshLobbyControls();});
  $('lobby-save').onclick=()=>saveLobby().catch(e=>{$('lobby-message').textContent=e.message||"Check your name and connection, then try again.";});
  $('lobby-map-select').onchange=async()=>{const code=network.credentials?.code;lobbySaving=true;refreshLobbyControls();try{await network.updateLobby({mapId:$('lobby-map-select').value});}catch{$('lobby-message').textContent="Could not change the map · Try again.";}finally{lobbySaving=false;if(network.active&&network.credentials?.code===code&&lobbyPacket)renderLobby(lobbyPacket);}};
  async function changeRoomSetting(changes){if(lobbySaving||lobbyStarting||!network.connected||lobbyPacket?.matchRunning)return;const code=network.credentials?.code;lobbySaving=true;refreshLobbyControls();try{await network.updateLobby(changes);}catch(e){$('lobby-message').textContent=e.message||'Could not change room settings.';}finally{lobbySaving=false;if(network.active&&network.credentials?.code===code&&lobbyPacket)renderLobby(lobbyPacket);}}
  $('lobby-mode').onchange=()=>changeRoomSetting({mode:$('lobby-mode').value});
  $('team-a').onclick=()=>changeRoomSetting({team:'A'});$('team-b').onclick=()=>changeRoomSetting({team:'B'});
  async function adjustBots(delta){if(lobbySaving||lobbyStarting||!network.connected||lobbyPacket?.host!==playerId)return;const code=network.credentials?.code;lobbySaving=true;renderLobby(lobbyPacket);try{await network.updateLobby({botCount:lobbyPacket.options.botCount+delta});}catch(e){$('lobby-message').textContent=e.message||"Could not change bots.";}finally{lobbySaving=false;if(network.active&&network.credentials?.code===code&&lobbyPacket)renderLobby(lobbyPacket);}}
  $('bot-add').onclick=()=>adjustBots(1);$('bot-remove').onclick=()=>adjustBots(-1);
  $('player-name').value=sessionStorage.getItem('gridfall-name')||'';
  $('room-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('room-link').value);$('room-copy').textContent='COPIED ✓';}catch{$('room-link').focus();$('room-link').select();document.execCommand('copy');}setTimeout(()=>$('room-copy').textContent='COPY LINK',1800);};
  $('log-button').onclick=()=>document.body.classList.toggle('logs-open');$('logs-close').onclick=()=>document.body.classList.remove('logs-open');
  function updateJoinMode() { document.body.classList.toggle('join-mode',!!$('join-code').value.trim()); }
  $('join-code').value=new URLSearchParams(location.search).get('room')||''; $('join-code').addEventListener('input',updateJoinMode);updateJoinMode();updateConnection();

  window.GRIDFALL_PREVIEW = () => { const c=previewContext();return { selected,origin:c.origin,range:c.range,availability:c.availability,forecast:c.projected,hover:hover?U.target(c,hover):null,ray:aimMouse&&selected==='shoot'?shotPrediction(c,Math.atan2(aimMouse.y-c.origin.y,aimMouse.x-c.origin.x)):null,cells:previewCache.cells.map(p=>c.visible.has(G.key(p.x,p.y))?{x:p.x,y:p.y,kind:p.kind,ok:p.ok,cost:p.cost}:{x:p.x,y:p.y,kind:'unknown'}),actions:Object.fromEntries(ACTIONS.map(a=>[a.type,U.availability(state,playerId,a.type,plan)])) }; };
  window.GRIDFALL_PRESENTATION=()=>({reduced:P.reduced(),particles:particles.count,capacity:particles.capacity,trails:trails.count,trailCapacity:trails.capacity,activeEffects:effects.map(e=>e.type),facing:unitFacing.get(playerId),menuPane:document.body.dataset.menuPane,cameraFollow:camera.follow});
  window.GRIDFALL_MOTION = () => ({ time: motionTime, player: unitMotion.sample(playerId, motionTime), camera: cameraPose(), transitioning: !!cameraFlight, tickMs: G.TIMING.tickMs });
  $('lock-button').innerHTML='<span class="confirm-symbol" aria-hidden="true">'+P.icon('check')+'</span><b id="lock-label">Confirm plan</b><kbd>SPACE</kbd>';
  const skillShortcut=document.createElement('kbd');skillShortcut.className='skill-shortcut';skillShortcut.textContent='E';$('skill-button').append(skillShortcut);
  for(const id of ['actions','skill-button']){$(id).addEventListener('pointerover',e=>{if(e.pointerType==='touch'||innerWidth<=790)return;actionHover=e.target.closest('[data-type]')?.dataset.type||($(id).id==='skill-button'?G.CLASSES[player().class].skillType:null);});$(id).addEventListener('pointerleave',()=>actionHover=null);}
  window.addEventListener('gridfall-ui',e=>sound.play(e.detail));
  for(const [id,type]of Object.entries({'log-button':'log','help-button':'help','fullscreen-button':'fullscreen','restart-button':'home'})){$(id).innerHTML=P.icon(type);}const soundLabel=$('sound-label');$('sound-button').innerHTML=P.icon('sound');$('sound-button').append(soundLabel);

  for(const i of [0,1]){const slot=document.createElement('div');slot.className='plan-slot';$('plan-slots').append(slot);}
  updateUI();requestAnimationFrame(frame);
})();
