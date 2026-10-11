(function(){
  'use strict';
  const G=window.Gridfall,A=window.GridfallBotArena,E=window.GridfallEffects,Art=window.GridfallOperatorArt,$=id=>document.getElementById(id);
  const canvas=$('bot-canvas'),ctx=canvas.getContext('2d'),CELL=32,TICK=G.TIMING.tickMs/1000,colors=['#79cfff','#ffab9a'];
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  const motion=new window.GridfallMotion.UnitMotion(TICK),particles=new E.ParticlePool(140);
  let state,running=false,paused=false,time=0,lastTime=performance.now(),accumulator=0,effects=[],previousBullets=new Map(),finishAt=null;
  const fields=['bot-a','bot-b','starting-weapon','arena-seed','arena-fate','new-seed'];
  const names={skillMove:'DASH',blink:'PHASE SHIFT',scan:'SCAN',reflect:'REFLECT',firebomb:'MOLLY',stasis:'STASIS',mend:'BEACON HEAL'};
  const label=type=>names[type]||type.toUpperCase(),bot=id=>id===0?'A':'B';
  function randomSeed(){const a=new Uint32Array(1);if(window.crypto?.getRandomValues)window.crypto.getRandomValues(a);else a[0]=Math.floor(Math.random()*0x100000000);return a[0];}
  function options(){return {seed:Number($('arena-seed').value),left:$('bot-a').value,right:$('bot-b').value,weapon:$('starting-weapon').value,fate:$('arena-fate').checked};}
  function log(text){const li=document.createElement('li');li.textContent=text;$('arena-log').prepend(li);while($('arena-log').children.length>12)$('arena-log').lastElementChild.remove();}
  function portraits(){for(const side of ['a','b']){const id=$('bot-'+side).value,c=$('portrait-'+side).getContext('2d');c.clearRect(0,0,320,200);Art.portrait(c,160,92,.48,id,0,true);$('skill-'+side).textContent=G.CLASSES[id].skill+' · '+G.CLASSES[id].description;}}
  function preview(){
    let next;try{next=A.createDuel(options());}catch(error){$('arena-status').textContent=error.message;return false;}
    running=paused=false;accumulator=time=0;finishAt=null;effects=[];particles.clear();motion.clear();previousBullets.clear();
    state=next;motion.sync(state.units,()=>true,0);$('arena-log').replaceChildren();$('arena-result').hidden=true;portraits();update();render();return true;
  }
  function start(){try{if(!preview())return;running=true;log('Duel started · Seed '+state.seed);processEvents(A.advance(state),time);update();}catch(error){$('arena-status').textContent=error.message;}}
  function stats(){
    $('bot-stats').replaceChildren(...state.units.slice(0,2).map(u=>{
      const card=document.createElement('article');card.className='stat-card';card.style.setProperty('--accent',colors[u.id]);
      const title=document.createElement('h3');title.textContent=u.name;card.append(title);
      const row=document.createElement('div');row.className='hp-row';row.textContent=(u.alive?u.hp+' HP':'ELIMINATED')+' / '+u.shield+' SHIELD';card.append(row);
      const track=document.createElement('div');track.className='hp-track';const fill=document.createElement('div');fill.className='hp-fill';fill.style.width=Math.max(0,u.hp/G.FATE.stats(u).maxHp*100)+'%';track.append(fill);card.append(track);
      for(const text of [G.WEAPONS[u.weapon].name+' · '+u.ammo+' / '+G.weaponStats(u).mag,'Damage dealt '+state.arena.stats[u.id].damage+' · Shots '+state.arena.stats[u.id].shots,'Skill '+(u.skillCooldown?u.skillCooldown+' turns':'ready')+' · Medkits '+u.medkits]){const p=document.createElement('p');p.textContent=text;card.append(p);}
      const plan=document.createElement('div');plan.className='stat-plan';for(const [i,action]of (state.plans[u.id]||[]).entries()){const chip=document.createElement('span');chip.textContent=(i+1)+' / '+label(action.type);plan.append(chip);}card.append(plan);return card;
    }));
  }
  function update(){
    const active=running&&state.phase!=='ended';for(const id of fields)$(id).disabled=active;
    $('start-duel').disabled=active;$('pause-duel').disabled=!active;$('pause-duel').textContent=paused?'Resume':'Pause';
    $('arena-status').textContent=state.phase==='ended'?'Duel complete':!running?'Ready to watch':paused?'Paused':state.phase==='clash'?'Contact duel':'Bots are fighting';
    $('arena-turn').textContent='TURN '+String(Math.min(state.turn,A.MAX_TURNS)).padStart(2,'0');stats();
  }
  function effect(type,event,at){
    if(!Number.isFinite(event.x+event.y))return;
    const e={...event,type,started:at,life:0,duration:type==='damage'||type==='heal'?.9:.6};
    if(!E.mergeCombatText(effects,e))effects.push(e);effects=effects.slice(-80);
  }
  function processEvents(events,at){
    for(const e of events){
      if(e.type==='blink')motion.blink(e.unitId);
      if(e.type==='knockback'&&e.from)motion.bump(e.unitId,e.from,at,e.contact,e.source==='dash');
      if(e.type==='arenaPlan'){log('Turn '+e.turn+' · Both plans locked');continue;}
      if(e.type==='arenaDraft'){log('Turn '+e.turn+' · Bots chose Fate cards');continue;}
      if(e.type==='damage'){effect('damage',e,at);effect('hit',e,at);log('Bot '+bot(e.unitId)+' −'+e.amount+(e.reason==='burn'?' · Burn':e.source==='dash'?' · Dash':' HP / shield'));}
      else if(e.type==='heal'){effect('heal',e,at);log('Bot '+bot(e.unitId)+' healed +'+e.amount);}
      else if(e.type==='fieldPulse'){if(e.amount)effect('heal',e,at);log('Bot '+bot(e.unitId)+' · Field +'+e.amount+' HP / +'+e.shield+' shield');}
      else if(e.type==='shoot')effect('muzzle',e,at);
      else if(e.type==='fieldDeploy'){effect(e.kind,e,at);log('Bot '+bot(e.unitId)+' · '+label(e.kind));}
      else if(e.type==='firebomb'){effect('thermite',e,at);log('Bot '+bot(e.unitId)+' · MOLLY');}
      else if(['scan','guard','reflectReady','blink','reload','slash','dodge','smoke','explosion','reflected'].includes(e.type)){
        effect(e.type==='reflectReady'||e.type==='reflected'?'reflect':e.type,e,at);
        if(['scan','reflectReady','blink','reload'].includes(e.type))log('Bot '+bot(e.unitId)+' · '+label(e.type==='reflectReady'?'reflect':e.type));
      }
      if(['impact','destroy','explosion','eliminated'].includes(e.type))particles.burst(e.x+.5,e.y+.5,e.type==='eliminated'?colors[e.unitId]:'#ffc181',e.type==='explosion'?18:8);
      if(e.type==='clashResult')log('Bot '+bot(e.winner)+' won contact · '+G.CLASH.damage+' damage');
      if(e.type==='pickup')log('Bot '+bot(e.unitId)+' collected '+(e.weapon?G.WEAPONS[e.weapon].short:e.lootType)+' · next turn');
    }
    motion.sync(state.units,()=>true,at);
    if(state.phase==='ended'&&finishAt===null){finishAt=time+.65;update();}
  }
  const bulletKey=b=>[b.owner,b.born,b.shotId,b.weapon,b.dx,b.dy].join(':');
  function result(){
    running=false;$('arena-result').hidden=false;
    const winner=state.units[state.winner];$('winner-label').textContent=winner?'BOT '+bot(winner.id)+' WINS':'DRAW';$('winner-label').style.color=winner?colors[winner.id]:'#d8e4ef';
    $('winner-copy').textContent=winner?G.CLASSES[winner.class].name+' · '+winner.hp+' HP remaining':state.arena.draw?'The 40-turn limit was reached.':'Both bots were eliminated.';update();
  }
  function resize(){const width=canvas.getBoundingClientRect().width||750,dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(width*A.HEIGHT/A.WIDTH*dpr);render();}
  function tileText(text,x,y,color,size=10){ctx.fillStyle=color;ctx.font='bold '+size+'px ui-monospace,Consolas,monospace';ctx.textAlign='center';ctx.fillText(text,x,y);}
  function render(){
    if(!state)return;ctx.setTransform(canvas.width/(A.WIDTH*CELL),0,0,canvas.height/(A.HEIGHT*CELL),0,0);ctx.clearRect(0,0,A.WIDTH*CELL,A.HEIGHT*CELL);
    const palette={grass:'#293d3b',floor:'#31444b',wall:'#182a35',barricade:'#79644c',water:'#285366',cover:'#465c53',rubble:'#4e5551',void:'#09141c'};
    for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){
      const t=state.tiles[y][x],px=x*CELL,py=y*CELL;ctx.fillStyle=palette[t.type]||palette.floor;ctx.fillRect(px,py,CELL,CELL);ctx.strokeStyle='#0a17233d';ctx.lineWidth=.6;ctx.strokeRect(px,py,CELL,CELL);
      if(t.type==='cover'||t.type==='barricade'){ctx.strokeStyle=t.type==='cover'?'#9aba9c6b':'#dbc1936b';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(px+7+i*6,py+9);ctx.lineTo(px+7+i*6,py+23);ctx.stroke();}}
      if(t.type==='water'){ctx.strokeStyle='#73b5c84d';ctx.beginPath();ctx.moveTo(px+6,py+14);ctx.quadraticCurveTo(px+12,py+10,px+18,py+14);ctx.quadraticCurveTo(px+23,py+18,px+27,py+14);ctx.stroke();}
      if(t.loot&&!t.loot.taken){const loot=t.loot,def=G.LOOT[loot.type];ctx.fillStyle='#0e1d29';ctx.fillRect(px+7,py+7,18,18);ctx.strokeStyle=def.color;ctx.lineWidth=1;ctx.strokeRect(px+7,py+7,18,18);tileText(loot.weapon?G.WEAPONS[loot.weapon].short:loot.type==='medkit'?'+':loot.type==='ammo'?'AM':def.icon,px+16,py+20,def.color,loot.type==='medkit'?17:9);}
    }
    for(const f of state.fields||[]){const b=G.areaBounds(f);ctx.save();ctx.fillStyle=f.kind==='mend'?'#e5d89324':'#72d7b42a';ctx.strokeStyle=f.kind==='mend'?'#e5d893':'#72d7b4';ctx.fillRect(b.left*CELL,b.top*CELL,b.width*CELL,b.height*CELL);ctx.setLineDash([4,4]);ctx.strokeRect(b.left*CELL+2,b.top*CELL+2,b.width*CELL-4,b.height*CELL-4);ctx.restore();}
    const b=state.beacon;if(G.passable(state,b.x,b.y)){ctx.strokeStyle=b.cooldown?'#7e968677':'#a1e2b7';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc((b.x+.5)*CELL,(b.y+.5)*CELL,10+(reduced?0:Math.sin(time*3)),0,Math.PI*2);ctx.stroke();tileText('◇',(b.x+.5)*CELL,(b.y+.5)*CELL+5,'#a1e2b7',16);}
    // Spectators see both bots even in Smoke; their AI still obeys normal visibility.
    for(const cloud of state.smokes){const x=(cloud.x+.5)*CELL,y=(cloud.y+.5)*CELL;const grad=ctx.createRadialGradient(x,y,3,x,y,CELL*1.9);grad.addColorStop(0,'#b5cbd554');grad.addColorStop(.6,'#afcbd532');grad.addColorStop(1,'#b5cbd500');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,CELL*1.9,0,Math.PI*2);ctx.fill();}
    for(const u of state.units.slice(0,2)){
      if(!u.alive)continue;const pose=motion.sample(u.id,time)||u,x=(pose.x+.5)*CELL,y=(pose.y+.5)*CELL;
      const firing=effects.findLast(e=>e.type==='muzzle'&&e.unitId===u.id),hit=effects.findLast(e=>e.type==='hit'&&e.unitId===u.id);ctx.save();ctx.globalAlpha=pose.alpha??1;
      ctx.strokeStyle=colors[u.id];ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.stroke();
      Art.field(ctx,x,y,u.facing||0,u.class,firing?Math.max(0,1-firing.life/.2)*G.WEAPONS[u.weapon].kick:0,hit?.35*Math.max(0,1-hit.life/.6):0,'#ffe5d5',u.weapon);
      if(u.guard||u.reflectTurn===state.turn){ctx.strokeStyle=u.guard?'#b5d9ed':'#97dcff';ctx.beginPath();ctx.arc(x,y,15,-Math.PI*.8,Math.PI*.3);ctx.stroke();}
      if(u.burn?.remainingTicks>0){ctx.strokeStyle='#ffc478';ctx.lineWidth=1.5;for(let i=0;i<3;i++){const xx=x-7+i*7;ctx.beginPath();ctx.moveTo(xx,y+10);ctx.quadraticCurveTo(xx-4,y+3,xx+Math.sin(time*7+i)*2,y-1);ctx.stroke();}}
      ctx.fillStyle='#111f29';ctx.fillRect(x-13,y-22,26,4);ctx.fillStyle=colors[u.id];ctx.fillRect(x-13,y-22,26*u.hp/G.FATE.stats(u).maxHp,4);tileText(bot(u.id),x,y+26,colors[u.id],9);ctx.restore();
    }
    for(const bullet of state.projectiles){const old=previousBullets.get(bulletKey(bullet)),t=Math.min(1,accumulator/TICK),x=old?old.x+(bullet.x-old.x)*t:bullet.x,y=old?old.y+(bullet.y-old.y)*t:bullet.y;ctx.strokeStyle=colors[bullet.owner]||'#ffe2a0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x*CELL,y*CELL);ctx.lineTo((x-bullet.dx*.4)*CELL,(y-bullet.dy*.4)*CELL);ctx.stroke();}
    for(const thrown of [...state.canisters,...state.grenades]){const p=G.flightPose(thrown,state.tick+accumulator/TICK);if(p)E.drawFlying(ctx,p,CELL,reduced);}
    particles.draw(ctx,CELL,()=>true);
    for(const e of effects){const x=(e.x+.5)*CELL,y=(e.y+.5)*CELL;if(e.type==='damage'||e.type==='heal'){const text=(e.type==='heal'?'+':'−')+e.amount,ty=y-25-(e.textLane||0)*25-e.life*12;ctx.save();ctx.font='bold 12px ui-monospace,Consolas,monospace';ctx.textAlign='center';ctx.fillStyle=e.type==='heal'?'#b5f5c9':'#ffe2b3';ctx.strokeStyle='#17232d99';ctx.lineWidth=2;ctx.globalAlpha=Math.min(1,(e.duration-e.life)*4);ctx.strokeText(text,x+10,ty);ctx.fillText(text,x+10,ty);ctx.restore();}else E.drawAction(ctx,e,x,y,CELL,reduced);}
  }
  function frame(now){
    const dt=Math.min(.1,Math.max(0,(now-lastTime)/1000));lastTime=now;
    const advancing=!document.hidden&&!paused&&(running||finishAt!==null&&$('arena-result').hidden);
    if(advancing){
      const step=dt*Number($('arena-speed').value);time+=step;particles.step(step);accumulator+=step;
      while(running&&state.phase!=='ended'&&accumulator>=TICK){const at=time-accumulator+TICK;accumulator-=TICK;previousBullets=new Map(state.projectiles.map(b=>[bulletKey(b),{x:b.x,y:b.y}]));processEvents(A.advance(state),at);update();}
      for(const e of effects)e.life=Math.max(e.life,time-e.started);effects=effects.filter(e=>e.life<e.duration);
      if(finishAt!==null&&time>=finishAt&&$('arena-result').hidden)result();
    }
    render();requestAnimationFrame(frame);
  }
  for(const side of ['a','b']){for(const [id,c]of Object.entries(G.CLASSES)){const o=document.createElement('option');o.value=id;o.textContent=c.name;$('bot-'+side).append(o);}$('bot-'+side).onchange=preview;}
  $('bot-a').value='vanguard';$('bot-b').value='pyro';
  for(const [id,w]of Object.entries(G.WEAPONS)){const o=document.createElement('option');o.value=id;o.textContent=w.name;$('starting-weapon').append(o);}$('starting-weapon').value='pistol';$('starting-weapon').onchange=preview;
  $('arena-seed').value=randomSeed();$('arena-seed').onchange=()=>{if($('arena-seed').checkValidity?.()!==false)preview();};$('arena-fate').onchange=preview;
  $('arena-form').onsubmit=e=>{e.preventDefault();start();};$('pause-duel').onclick=()=>{paused=!paused;accumulator=0;update();};$('reset-duel').onclick=preview;
  $('new-seed').onclick=()=>{$('arena-seed').value=randomSeed();preview();};$('rematch-duel').onclick=()=>{$('arena-seed').value=randomSeed();start();};
  document.addEventListener('visibilitychange',()=>{lastTime=performance.now();accumulator=0;});window.addEventListener('resize',resize);
  preview();resize();requestAnimationFrame(frame);
  window.GRIDFALL_BOT_ARENA_STATUS=()=>({running,paused,phase:state.phase,tick:state.tick,turn:state.turn,winner:state.winner,seed:state.seed,fate:state.arena.fate,units:state.units.slice(0,2).map(u=>({id:u.id,class:u.class,hp:u.hp,shield:u.shield,ammo:u.ammo,alive:u.alive,x:u.x,y:u.y,weapon:u.weapon})),plans:structuredClone(state.plans)});
})();
