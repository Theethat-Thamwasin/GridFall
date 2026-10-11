const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../engine'),U=require('../tactics'),P=require('../practice'),W=require('../walkthrough');
const {RoomHub}=require('../multiplayer'),{UnitMotion}=require('../motion');

function arena(){
  const s=G.createState(71,'vanguard','small',{activeIds:[0,1,2,3]});
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});
  s.safeLimit=s.nextLimit=999;s.humanIds=[0,1,2,3];s.beacon={x:20,y:18,cooldown:1};
  for(const [i,p]of [[4,4],[6,4],[15,12],[17,12]].entries())Object.assign(s.units[i],{x:p[0],y:p[1],class:i===0?'vanguard':'halo',shield:20});
  return s;
}
const route=(points,type='skillMove')=>({type,path:points.map(([x,y])=>({x,y})),target:{x:points.at(-1)[0],y:points.at(-1)[1]}});
const east=(end=9)=>route(Array.from({length:end-4},(_,i)=>[5+i,4]));
const intent=(id,x,y,dash=false)=>({unitId:id,type:'move',actionId:id+':0',target:{x,y},dodge:dash});
function distinct(s){const alive=s.units.filter(u=>u.alive);assert.equal(new Set(alive.map(u=>G.key(u.x,u.y))).size,alive.length);for(const u of alive)assert.ok(G.passable(s,u.x,u.y));}
function resolve(s,plans){G.beginTurn(s,plans);for(let n=0;s.phase==='resolution'&&n<80;n++){G.step(s);distinct(s);}assert.notEqual(s.phase,'resolution');assert.equal(s.events.some(e=>e.type.startsWith('clash')),false);return s.events;}
const hits=(s,id)=>s.events.filter(e=>e.type==='damage'&&e.source==='dash'&&e.unitId===id);

test('a charge wins immediately and carries an enemy ahead, dealing 5 HP on every contact step',()=>{
  const s=arena();resolve(s,{0:[east()]});
  assert.deepEqual([s.units[0].x,s.units[1].x],[9,10]);assert.equal(s.units[1].hp,80);assert.equal(s.units[1].shield,20);
  assert.deepEqual(hits(s,1).map(e=>[e.tick,e.amount]),[[9,5],[14,5],[19,5],[24,5]]);
  assert.equal(s.damage,20);assert.equal(s.units[0].skillCooldown,2);assert.equal(s.clash,null);
  const bumps=s.events.filter(e=>e.type==='knockback');assert.equal(bumps.length,4);for(const e of bumps){assert.equal(e.x,e.contact.x+1);assert.equal(e.y,4);}
});

test('all four charge directions push straight ahead instead of choosing a random neighbor',()=>{
  for(const [dx,dy]of G.CARDINAL){const s=arena();Object.assign(s.units[0],{x:10,y:10});Object.assign(s.units[1],{x:10+dx,y:10+dy});
    resolve(s,{0:[route([1,2,3,4,5].map(n=>[10+dx*n,10+dy*n]))]});
    assert.deepEqual([s.units[1].x,s.units[1].y],[10+dx*6,10+dy*6]);assert.equal(s.units[1].hp,75);assert.equal(hits(s,1).length,5);
  }
});

test('bending the charge route leaves a pushed enemy in the original forward direction',()=>{
  const s=arena();Object.assign(s.units[1],{x:5,y:4});resolve(s,{0:[route([[5,4],[5,5],[6,5],[7,5],[8,5]])]});
  assert.deepEqual([s.units[0].x,s.units[0].y],[8,5]);assert.deepEqual([s.units[1].x,s.units[1].y],[6,4]);assert.equal(s.units[1].hp,95);
});

test('same destination and head-on movement lose to Dash regardless of intent order or actor ID',()=>{
  for(const chargerId of [0,1])for(const reverse of [false,true])for(const swap of [false,true]){
    const s=arena(),victimId=1-chargerId;Object.assign(s.units[chargerId],{class:'vanguard',x:4,y:4});Object.assign(s.units[victimId],{class:'halo',x:swap?5:6,y:4});G.beginTurn(s,{});
    const moves=[intent(chargerId,5,4,true),intent(victimId,swap?4:5,4)];assert.equal(G.resolveMoves(s,reverse?moves.reverse():moves),true);
    assert.deepEqual([s.units[chargerId].x,s.units[victimId].x],[5,6]);assert.equal(s.units[victimId].hp,95);assert.ok(s.canceled.has(victimId+':0'));distinct(s);assert.equal(s.clash,null);
  }
});

test('a hit between Wraith movement ticks cancels its current route but keeps the later relative Move',()=>{
  const s=arena();Object.assign(s.units[1],{class:'volt',x:6,y:2});
  resolve(s,{0:[route([[4,5],[5,5],[6,5]])],1:[route([[6,3],[6,4],[6,5],[6,6]],'move'),route([[7,6]],'move')]});
  assert.ok(s.canceled.has('1:0'));assert.equal(s.canceled.has('1:1'),false);
  assert.deepEqual(s.events.filter(e=>e.type==='move'&&e.unitId===1).map(e=>e.tick),[4,8,12,44]);
  assert.deepEqual([s.units[1].x,s.units[1].y],[8,5]);assert.equal(s.units[1].hp,95);
});

test('an interrupted first Move still permits Heal in the second action slot',()=>{
  const s=arena();Object.assign(s.units[1],{class:'volt',x:6,y:2,hp:50});
  resolve(s,{0:[route([[4,5],[5,5],[6,5]])],1:[route([[6,3],[6,4],[6,5],[7,5]],'move'),{type:'heal'}]});
  assert.equal(s.events.filter(e=>e.type==='heal'&&e.unitId===1).length,1);assert.equal(s.units[1].hp,80);assert.equal(s.units[1].medkits,1);
});

test('a charge in the first action does not cancel an enemy Move scheduled for the second action',()=>{
  const s=arena();Object.assign(s.units[1],{x:5,y:4});resolve(s,{0:[east()],1:[{type:'wait'},route([[5,5]],'move')]});
  assert.equal(s.canceled.has('1:1'),false);assert.deepEqual([s.units[1].x,s.units[1].y],[10,5]);assert.equal(s.units[1].hp,75);
});

test('a second-action charge interrupts a second-action Move and deals damage on each remaining step',()=>{
  const s=arena();Object.assign(s.units[1],{class:'volt',x:6,y:2});
  resolve(s,{0:[{type:'wait'},route([[4,5],[5,5],[6,5],[7,5]])],1:[{type:'wait'},route([[6,3],[6,4],[6,5],[7,5]],'move')]});
  assert.ok(s.canceled.has('1:1'));assert.deepEqual(hits(s,1).map(e=>e.tick),[54,59]);assert.deepEqual([s.units[1].x,s.units[1].y],[8,5]);
});

test('walls, barricades, Void and map edges stop a forward push with one 5 HP hit and no overlap',()=>{
  for(const type of ['wall','barricade','void','edge']){const s=arena();
    if(type==='edge'){Object.assign(s.units[0],{x:s.width-2,y:4});Object.assign(s.units[1],{x:s.width-1,y:4});}
    else {s.units[1].x=5;s.tiles[4][6].type=type;}
    const start=s.units[0].x;resolve(s,{0:[route([[start+1,4]])],1:[route([[start,4]],'move')]});
    assert.equal(s.units[0].x,start);assert.equal(s.units[1].hp,95);assert.ok(s.canceled.has('0:0'));assert.ok(s.canceled.has('1:0'));assert.equal(s.events.some(e=>e.type==='knockback'),false);
  }
});

test('an enemy chain is pushed forward together and each member takes 5 HP per push',()=>{
  const s=arena();Object.assign(s.units[1],{x:5,y:4});Object.assign(s.units[2],{x:6,y:4});resolve(s,{0:[east()]});
  assert.deepEqual([s.units[0].x,s.units[1].x,s.units[2].x],[9,10,11]);assert.equal(s.units[1].hp,75);assert.equal(s.units[2].hp,75);
  assert.equal(hits(s,1).length,5);assert.equal(hits(s,2).length,5);
});

test('a blocked chain commits no partial displacement and never pushes through an ally',()=>{
  for(const ally of [false,true]){const s=arena();Object.assign(s.units[1],{x:5,y:4});Object.assign(s.units[2],{x:6,y:4});
    if(ally){s.mode='team';s.units[0].team=s.units[2].team='A';s.units[1].team=s.units[3].team='B';}else s.tiles[4][7].type='wall';
    resolve(s,{0:[east(5)]});assert.deepEqual([s.units[0].x,s.units[1].x,s.units[2].x],[4,5,6]);assert.equal(s.units[1].hp,95);assert.equal(s.units[2].hp,ally?100:95);
  }
});

test('simultaneous contenders are all displaced without a duel or stacked units',()=>{
  const s=arena();Object.assign(s.units[2],{x:5,y:3});G.beginTurn(s,{});
  assert.equal(G.resolveMoves(s,[intent(2,5,4),intent(0,5,4,true),intent(1,5,4)]),true);
  assert.equal(s.units[0].x,5);assert.deepEqual([s.units[1].x,s.units[2].x],[7,6]);assert.equal(s.units[1].hp,95);assert.equal(s.units[2].hp,95);assert.equal(s.clash,null);distinct(s);
});

test('a charge wins a contested occupied cell even when its occupant is trying to swap with a third actor',()=>{
  const s=arena();Object.assign(s.units[0],{x:6,y:5});Object.assign(s.units[1],{x:7,y:6});Object.assign(s.units[3],{x:7,y:5});G.beginTurn(s,{});
  assert.equal(G.resolveMoves(s,[intent(0,7,5,true),intent(1,7,5),intent(3,7,6)]),true);
  assert.deepEqual([s.units[0].x,s.units[0].y],[7,5]);assert.equal(s.units[1].hp,95);assert.equal(s.units[3].hp,95);assert.equal(s.clash,null);distinct(s);
});

test('seeded crowded movement keeps tiles distinct and never sends a charge intent into RPS',()=>{
  const base=arena(),rng=G.random(474747);
  for(let trial=0;trial<1000;trial++){const s=structuredClone(base),used=new Set();
    for(const u of s.units.filter(u=>u.alive)){let p;do{p={x:4+Math.floor(rng()*4),y:4+Math.floor(rng()*4)}}while(used.has(G.key(p.x,p.y)));used.add(G.key(p.x,p.y));Object.assign(u,p);}
    G.beginTurn(s,{});const moves=s.units.filter(u=>u.alive).flatMap(u=>{if(u.id!==0&&rng()<.15)return[];const [dx,dy]=G.CARDINAL[Math.floor(rng()*4)];return[intent(u.id,u.x+dx,u.y+dy,u.id===0)];});
    G.resolveMoves(s,moves);distinct(s);assert.equal(s.clash?.intents.some(m=>m.dodge)||false,false,'trial '+trial);
  }
});

test('allied contacts keep friendly swap and blocked movement rules without damage',()=>{
  for(const swap of [false,true]){const s=arena();s.mode='team';s.units[0].team=s.units[1].team='A';s.units[2].team=s.units[3].team='B';s.units[1].x=5;G.beginTurn(s,{});
    G.resolveMoves(s,[intent(0,5,4,true),...(swap?[intent(1,4,4)]:[])]);assert.equal(s.units[1].hp,100);assert.equal(s.units[0].x,swap?5:4);assert.equal(s.clash,null);distinct(s);
  }
});

test('vacating enemies and four-way loops do not receive collision damage',()=>{
  const s=arena();s.units[1].x=5;G.beginTurn(s,{});G.resolveMoves(s,[intent(0,5,4,true),intent(1,6,4)]);assert.equal(s.units[1].hp,100);assert.equal(s.units[0].x,5);distinct(s);
  const cycle=arena(),points=[[4,4],[5,4],[5,5],[4,5]];points.forEach(([x,y],i)=>Object.assign(cycle.units[i],{x,y}));G.beginTurn(cycle,{});
  assert.equal(G.resolveMoves(cycle,points.map((_,i)=>intent(i,...points[(i+1)%4],i===0))),true);assert.equal(cycle.events.some(e=>e.type==='damage'),false);distinct(cycle);
});

test('two opposing simultaneous Dashes stop each other with 5 HP each and no RPS timer',()=>{
  for(const swap of [false,true]){const s=arena();s.units[1].class='vanguard';if(swap)s.units[1].x=5;G.beginTurn(s,{});
    assert.equal(G.resolveMoves(s,[intent(1,swap?4:5,4,true),intent(0,5,4,true)]),true);
    assert.deepEqual([s.units[0].hp,s.units[1].hp],[95,95]);assert.ok(s.canceled.has('0:0'));assert.ok(s.canceled.has('1:0'));assert.equal(s.clash,null);distinct(s);
  }
});

test('a lethal charge frees the contact cell even if the forward push is blocked and cancels same-tick shots',()=>{
  const s=arena();Object.assign(s.units[1],{x:5,y:4,hp:5});s.tiles[4][6].type='wall';G.beginTurn(s,{0:[east(5)],1:[{type:'shoot',angle:Math.PI}]});
  for(const e of s.schedule)if(e.unitId===1&&e.type==='shoot')e.at=4;
  while(s.phase==='resolution'){G.step(s);distinct(s);}assert.equal(s.units[0].x,5);assert.equal(s.units[1].alive,false);assert.equal(s.kills,1);assert.equal(s.damage,5);
  assert.equal(s.events.some(e=>e.type==='shoot'&&e.unitId===1),false);assert.equal(s.events.find(e=>e.type==='eliminated').owner,0);
});

test('practice protects the player at 1 HP and normal RPS still deals 10 HP',()=>{
  const s=arena();s.practice=true;Object.assign(s.units[0],{hp:3,x:5,y:4,class:'halo'});Object.assign(s.units[1],{class:'vanguard',x:4,y:4});G.beginTurn(s,{});
  G.resolveMoves(s,[intent(1,5,4,true)]);assert.equal(s.units[0].hp,1);assert.equal(s.units[0].alive,true);assert.equal(hits(s,0)[0].amount,2);distinct(s);
  const duel=arena();G.beginTurn(duel,{});G.resolveMoves(duel,[intent(0,5,4),intent(1,5,4)]);G.chooseClash(duel,0,'rock');G.chooseClash(duel,1,'scissors');assert.equal(G.settleClash(duel).damage,10);assert.equal(duel.units[1].hp,90);
});

test('multiplayer charge ticks stay in resolution, replay every hit once, and conceal distant events',()=>{
  const hub=new RoomHub({now:()=>0}),a=hub.create({name:'A',character:'vanguard'}),b=hub.join(a.code,{name:'B'}),c=hub.join(a.code,{name:'C'});
  hub.updateLobby(a.code,a.token,{botCount:0});hub.start(a.code,a.token);const room=hub.get(a.code,a.token).room,s=room.state;
  for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});s.safeLimit=s.nextLimit=999;
  Object.assign(s.units[0],{class:'vanguard',x:4,y:4});Object.assign(s.units[1],{x:6,y:4});Object.assign(s.units[2],{x:s.width-2,y:s.height-2});room.botPlans={};
  hub.command(a.code,a.token,{action:'lock',turn:1,plan:[east()]});for(const member of [b,c])hub.command(member.code,member.token,{action:'lock',turn:1,plan:[]});
  for(let n=0;n<25;n++){hub.advance(room);assert.equal(room.stage,'resolution');assert.equal(s.clash,null);distinct(s);}
  assert.equal(hits(s,1).length,4);assert.equal(hub.view(room,room.members[2],s.events).events.length,0);
  const frames=room.archive.current.frames,damages=frames.flatMap(f=>f.events).filter(e=>e.source==='dash'&&e.type==='damage');assert.equal(damages.length,4);
  const frame=frames.find(f=>f.events.some(e=>e.type==='knockback'));const hp=frame.units[1].hp;s.units[1].hp=1;assert.equal(frame.units[1].hp,hp);
});

test('concealed charge victims give only hit confirmation and hidden attackers have no exposed identity',()=>{
  const hub=new RoomHub(),a=hub.create({name:'A'}),b=hub.join(a.code,{name:'B'});hub.start(a.code,a.token);const room=hub.get(a.code,a.token).room;
  const s=arena();room.state=s;Object.assign(s.units[0],{x:4,y:4});Object.assign(s.units[1],{x:5,y:4});s.tiles[4][4].roof=2;s.tiles[4][5].roof=1;s.tiles[4][6].type='wall';
  G.beginTurn(s,{});G.resolveMoves(s,[intent(0,5,4,true)]);
  const attacker=hub.view(room,room.members[0],s.events);assert.equal(attacker.units[1].hidden,true);assert.ok(attacker.events.some(e=>e.type==='hitConfirmed'&&e.amount===5));
  assert.equal(attacker.events.some(e=>e.type==='damage'&&e.unitId===1),false);
  const victim=hub.view(room,room.members[1],s.events);assert.equal(victim.units[0].hidden,true);assert.equal(victim.events.find(e=>e.type==='damage').owner,null);
});

test('push animation keeps the enemy one tile ahead at the same speed as the charge, including Wraith',()=>{
  const tick=G.TIMING.tickMs/1000,motion=new UnitMotion(tick),s=arena();s.units[1].x=5;s.units[1].class='volt';motion.sync(s.units,()=>true,0);
  for(let step=0;step<3;step++){const time=1+step*tick*5,from={x:s.units[1].x,y:4};s.units[0].x++;s.units[1].x++;
    motion.bump(1,motion.sample(1,time),time,from,true);motion.sync(s.units,()=>true,time);
    for(const fraction of [0,.2,.5,.8,1])assert.ok(Math.abs(motion.sample(1,time+tick*5*fraction).x-motion.sample(0,time+tick*5*fraction).x-1)<1e-9);
  }
});

test('the guided Dash lesson charges through the bot and aiming explains automatic 5 HP hits',()=>{
  const s=W.begin(P.createState(13));assert.equal(W.jump(s,'dash'),true);const step=W.current(s),path=G.pathfind(s,s.units[0],step.target,5,true),action={type:'skillMove',target:step.target,path};
  assert.equal(W.accepts(s,action),true);assert.match(U.target(U.context(s,0,'skillMove'),step.target).reason,/5 HP every hit/);
  resolve(s,{0:[action],1:W.botPlan(s)});assert.equal(W.resolved(s,[action],s.events),true);assert.equal(s.units[1].hp,85);assert.deepEqual([s.units[0].x,s.units[1].x],[14,15]);
});
