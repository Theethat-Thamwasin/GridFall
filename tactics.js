(function (root, factory) {
  const G = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.Gridfall;
  const api = factory(G);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GridfallTactics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';
  const moves = ['move', 'skillMove', 'blink'], skills = ['skillMove', 'blink', 'scan', 'firebomb', 'stasis', 'mend', 'reflect'];
  const no = (code, reason, extra = {}) => ({ ok: false, kind: 'blocked', code, reason, ...extra });
  function project(s, id, plan = []) {
    s={...s,fields:G.observedFields(s,s.units[id])};
    const u = s.units[id], w = G.weaponStats(u);
    const p = { origin: { x: u.x, y: u.y }, ammo: u.ammo, reserve: u.reserve, medkits: u.medkits, grenades: u.grenades, smoke: u.smoke, moved: false, skillUsed: false };
    for (const a of plan) {
      if (moves.includes(a.type)) { p.origin = { ...(a.target || a.path?.at(-1) || p.origin) }; p.moved = true; }
      if (skills.includes(a.type)) p.skillUsed = true;
      if (a.type === 'shoot') p.ammo -= w.shots;
      if (a.type === 'reload') { const amount = Math.min(w.mag - p.ammo, p.reserve); p.ammo += amount; p.reserve -= amount; }
      if (a.type === 'heal') p.medkits--;
      if (a.type === 'grenade') p.grenades--;
      if (a.type === 'smoke') p.smoke--;
    }
    p.movement=G.movementForecast(s,u,plan);
    return p;
  }
  function range(s, id, type, plan=[],forecast=null) {
    const movement=(forecast||project(s,id,plan)).movement;
    const normal=G.CLASSES[s.units[id].class].move+Math.round(G.FATE.stats(s.units[id]).move);
    if(moves.includes(type))return Math.min(movement.remaining,type==='move'?Math.max(1,Math.min(5,normal)):type==='skillMove'?G.SKILLS.dashRange:G.SKILLS.blinkRange);
    return { move: G.moveRange(s,s.units[id]), skillMove: G.SKILLS.dashRange, blink: G.SKILLS.blinkRange, shoot: G.WEAPONS[s.units[id].weapon].range, slash: 1.5, grenade: 6, smoke: 5, scan: G.SKILLS.scanRange, firebomb: 5, stasis:5, mend:5 }[type] || 0;
  }
  function availability(s, id, type, plan = []) {
    const u = s.units[id], p = project(s, id, plan), w = G.weaponStats(u);
    if (!u.alive) return no('dead', "You have been eliminated.");
    if (s.phase !== 'planning') return no('phase', "Wait for the next planning phase.");
    if (plan.length >= 2) return no('ap', "Both actions filled · Q to undo / SPACE to confirm");
    if (type === 'shoot' && G.WEAPONS[u.weapon].stationary && p.moved) return no('sniperMoved', "Sniper cannot shoot after moving this turn · Q to undo");
    if (type === 'shoot' && p.ammo < w.shots) return no('ammo', "Needs " + w.shots + " rounds · Have " + Math.max(0,p.ammo) + " · R to reload");
    if (type === 'reload' && p.reserve <= 0) return no('reserve', "No reserve ammo. New loot is usable next turn.");
    if (type === 'reload' && p.ammo >= w.mag) return no('fullMagazine', "Magazine full. Fire before reloading.");
    if (type === 'heal' && p.medkits <= 0) return no('medkit', "No Medkit available. New loot is usable next turn.");
    if (type === 'heal' && u.hp >= G.FATE.stats(u).maxHp) return no('fullHealth', "HP is full.");
    if (type === 'grenade' && p.grenades <= 0) return no('grenade', "No grenade available. New loot is usable next turn.");
    if (type === 'smoke' && p.smoke <= 0) return no('smoke', "No smoke available. New loot is usable next turn.");
    if(moves.includes(type)&&range(s,id,type,plan,p)===0)return no('stasis',"Movement limit reached: 1 tile this turn");
    if (skills.includes(type)) {
      if (G.CLASSES[u.class].skillType !== type) return no('class', "This skill belongs to another operator.");
      if (u.skillCooldown > 0) return no('cooldown', "Skill ready in " + u.skillCooldown + " turns");
      if (p.skillUsed) return no('skillUsed', "Skill already queued · Q to undo");
    }
    return { ok: true, kind: 'valid', code: 'ready', reason: "Ready · 1 AP", range: range(s,id,type,plan,p) };
  }
  function moveCost(s, path) { return (path || []).reduce((cost,p)=>cost+(G.tile(s,p.x,p.y)?.type === 'water' ? 2 : 1),0); }
  function reachable(s, from, budget) {
    const frontier = [{ ...from, cost: 0, path: [] }], found = new Map([[G.key(from.x,from.y),frontier[0]]]);
    while (frontier.length) {
      frontier.sort((a,b)=>a.cost-b.cost); const p = frontier.shift();
      if (p.cost !== found.get(G.key(p.x,p.y)).cost) continue;
      if(p.path.length&&G.inField(s,p,'stasis'))continue;
      for (let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
        if (Math.abs(dx)+Math.abs(dy)!==1) continue;
        const x=p.x+dx,y=p.y+dy;
        if (!G.passable(s,x,y) || dx && dy && (!G.passable(s,p.x+dx,p.y)||!G.passable(s,p.x,p.y+dy))) continue;
        const cost=p.cost+(G.tile(s,x,y).type==='water'?2:1), key=G.key(x,y);
        if (cost>budget || found.has(key)&&found.get(key).cost<=cost) continue;
        const next={x,y,cost,path:[...p.path,{x,y}]};found.set(key,next);frontier.push(next);
      }
    }
    return found;
  }
  function visibility(s,id) {
    if (s.visibleCells) return new Set(s.visibleCells);
    const u=s.units[id], cells=new Set();
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(G.visible(s,u,{x,y},G.sightRange(u)))cells.add(G.key(x,y));
    return cells;
  }
  function context(s,id,type,plan=[],visible=visibility(s,id),continuous=false) {
    const projected=project(s,id,plan),origin=projected.origin,budget=range(s,id,type,plan,projected),precise=continuous||!!s.visibility||arguments.length<5,sight=precise?(s.visibility||G.VISION.field(s,s.units[id],G.sightRange(s.units[id]))):null;
    return { s,id,type,plan,visible,sight,projected,origin,range:budget,availability:availability(s,id,type,plan),reachable:['move','skillMove'].includes(type)?reachable({...s,fields:projected.movement.fields},origin,budget):null };
  }
  function target(c,p) {
    const {s,id,type,origin,range,visible}=c, t=G.tile(s,p.x,p.y);
    if (!c.availability.ok) return c.availability;
    if (!t) return no('bounds',"Outside the map");
    const seen=visible.has(G.key(p.x,p.y)), warnings=[];
    if (['move','skillMove','blink'].includes(type)) {
      if (p.x===origin.x&&p.y===origin.y) return no('origin',"Already here · Choose another tile.");
      if(t.type==='void')return no('void',"Void · No platform here");
      if (!G.passable(s,p.x,p.y)) return no('solid',t.type==='barricade'?"Barricade blocks the way. Shoot, slash or explode it.":"Wall blocks movement.");
      if (type==='blink') {
        if (G.distance(origin,p)>range) return no('range',"Teleport range: "+G.SKILLS.blinkRange+" tiles");
        if(s.visibleCells&&!c.projected.moved&&!visible.has(G.key(p.x,p.y)))return no('sight',"Destination is not visible · Cannot teleport.");
        if (!G.visible(s,origin,p,range)) return no('sight',G.visible({...s,smokes:[]},origin,p,range)?"Smoke blocks vision · Cannot teleport.":"Wall blocks vision · Cannot teleport.");
      } else if (!c.reachable.has(G.key(p.x,p.y))) {
        if (G.cheb(origin,p)>range) return no('range',"Move range exceeded: " + range + " · Water costs 2 per tile");
        const dx=p.x-origin.x,dy=p.y-origin.y;
        return no('path',Math.abs(dx)===1&&Math.abs(dy)===1&&(!G.passable(s,origin.x+dx,origin.y)||!G.passable(s,origin.x,origin.y+dy))?"Cannot cut wall corners. Go around.":"Path blocked or water exceeds move budget: "+range);
      }
      const route=c.reachable?.get(G.key(p.x,p.y)), path=route?.path||[p];
      if (s.units.some(u=>u.alive&&u.id!==id&&!G.VISION.concealed(s,origin,u)&&visible.has(G.key(u.x,u.y))&&path.some(point=>point.x===u.x&&point.y===u.y))) warnings.push("Occupied · Movement may collide.");
      if ((s.fires||[]).some(f=>f.expires>s.turn&&visible.has(G.key(f.x,f.y))&&path.some(p=>p.x===f.x&&p.y===f.y))) warnings.push("Fire hazard · You may take damage.");
      if (t.rank>s.safeLimit) warnings.push("Platform falling · Leave this tile.");
      else if (t.rank>s.nextLimit) warnings.push("Striped tile · Platform falls within 2 turns.");
      const cost=route?.cost, water=path.some(point=>G.tile(s,point.x,point.y)?.type==='water');
      const detail=type==='blink'?'Blink '+G.distance(origin,p).toFixed(1)+'/'+range: "Move "+cost+'/'+range+(water?" · Water costs 2":'');
      return {ok:true,kind:warnings.length?'risky':seen?'valid':'unknown',code:warnings.length?'risk':seen?'reachable':'fog',reason:[detail,...warnings,...(!seen?["Not visible · Occupants and loot unknown."]:[])].join(' · '),path:route?.path,cost,warnings,seen};
    }
    if (['grenade','smoke','firebomb','stasis','mend'].includes(type)) {
      if(G.distance(origin,p)>range) return no('range',"Throw range exceeded: "+range+" tiles");
      if(['stasis','mend'].includes(type)&&!G.passable(s,p.x,p.y))return no('solid',"Choose a tile with a platform");
      const radius=type==='grenade'?G.FATE.stats(s.units[id]).radius:1,diameter=radius*2+1,selfHit=type==='firebomb'?G.inArea(origin,G.skillArea(type,p)):type==='grenade'&&G.cheb(origin,p)<=radius;
      if(selfHit) warnings.push(type==='firebomb'?"Fire will hit you too.":"Grenade "+diameter+'×'+diameter+" hits you too");
      const note=type==='stasis'?"4×4 area · Movement: 1 tile per turn · Lasts 3 turns · Affects everyone":type==='mend'?"3×3 area · Restore 16 HP and 12 shield per turn · Heals allies in Team Mode":type==='firebomb'?"Molly 3×4 · Burn: 12 damage twice per turn for 2 turns, even after leaving the area":type==='grenade'?"Grenade "+diameter+'×'+diameter+" · Destroys walls and barricades":"Smoke 3×3 · Blocks vision for 2 turns";
      return {ok:true,kind:selfHit?'risky':seen?'valid':'unknown',code:selfHit?'selfBlast':'inRange',reason:[note,...warnings,...(!seen?["Not visible · Target unknown."]:[])].join(' · '),seen,warnings};
    }
    if(type==='scan') {
      if(G.distance(origin,p)>range) return no('range',"Scan range: "+G.SKILLS.scanRange);
      return {ok:true,kind:seen?'valid':'unknown',reason:"Scan reveals operators within 14 tiles through walls, Smoke and roofs for 2 turns.",seen};
    }
    return {ok:true,kind:'valid',reason:"Ready · 1 AP",seen};
  }
  function area(c) {
    const cells=[];
    for(let y=Math.max(0,c.origin.y-Math.ceil(c.range));y<=Math.min(c.s.height-1,c.origin.y+Math.ceil(c.range));y++)for(let x=Math.max(0,c.origin.x-Math.ceil(c.range));x<=Math.min(c.s.width-1,c.origin.x+Math.ceil(c.range));x++){
      if(!['move','skillMove'].includes(c.type)&&G.distance(c.origin,{x,y})>c.range)continue;
      cells.push({x,y,...target(c,{x,y})});
    }
    return cells;
  }
  function ray(c,angle,range=c.range) {
    const {s,origin,visible,id}=c, start={x:origin.x+.5,y:origin.y+.5};let previous=start;
    for(let traveled=.05;traveled<=range+.00001;traveled+=.05){
      const d=Math.min(traveled,range),p={x:start.x+Math.cos(angle)*d,y:start.y+Math.sin(angle)*d},cell={x:Math.floor(p.x),y:Math.floor(p.y)};
      if(!G.tile(s,cell.x,cell.y))return {kind:'boundary',point:p,cell,distance:d,reason:"Bullets stop at the map edge."};

      const wall=G.segmentWall(s,previous.x,previous.y,p.x,p.y);
      if(wall&&visible.has(G.key(wall.x,wall.y)))return {kind:'wall',point:p,cell:wall,distance:d,reason:G.tile(s,wall.x,wall.y).type==='barricade'?"Barricade blocks bullets · Can be destroyed.":"Wall blocks bullets · Can be destroyed."};
      if(!visible.has(G.key(cell.x,cell.y))&&!(c.sight&&G.VISION.contains(c.sight,p)))return {kind:'unknown',point:p,cell,distance:d,reason:"Aim enters fog · Obstacles unknown."};
      const victim=s.units.find(u=>u.alive&&!u.hidden&&!G.VISION.concealed(s,{...s.units[id],...origin},u)&&G.opponents(s,s.units[id],u)&&(visible.has(G.key(u.x,u.y))||G.visible(s,s.units[id],u)||c.sight&&G.VISION.bodyInField(c.sight,u))&&G.segmentHitsCircle(previous.x,previous.y,p.x,p.y,u.x+.5,u.y+.5));
      if(victim)return {kind:'unit',point:p,cell:{x:victim.x,y:victim.y},distance:d,reason:"Occupied by "+victim.name+" now · Target may move."};
      previous=p;
    }
    return {kind:'clear',point:previous,distance:range,reason:"Free aim · Fixed range "+range+" tiles"};
  }
  function slashCells(c,angle) {
    const {s,origin,visible}=c, result=[];
    for(let y=origin.y-1;y<=origin.y+1;y++)for(let x=origin.x-1;x<=origin.x+1;x++){
      const p={x,y},t=G.tile(s,x,y);if(!t||!G.distance(origin,p)||G.distance(origin,p)>1.5)continue;
      const delta=Math.atan2(Math.sin(Math.atan2(y-origin.y,x-origin.x)-angle),Math.cos(Math.atan2(y-origin.y,x-origin.x)-angle));if(Math.abs(delta)>Math.PI/3+.0001)continue;
      if(!visible.has(G.key(x,y))){result.push({...p,kind:'unknown'});continue;}
      const corner=x!==origin.x&&y!==origin.y&&(!G.passable(s,x,origin.y)||!G.passable(s,origin.x,y));
      result.push({...p,kind:t.type==='barricade'?'breach':t.type==='wall'||corner||!G.visible({...s,smokes:[]},origin,p,1.5)?'blocked':'valid'});
    }
    return result;
  }
  return {project,range,availability,moveCost,reachable,visibility,context,target,area,ray,slashCells};
});
