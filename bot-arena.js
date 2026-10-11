(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./engine'):root.Gridfall);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.GridfallBotArena=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  const WIDTH=15,HEIGHT=11,MAX_TURNS=40;
  function createDuel({seed=1,left='vanguard',right='pyro',weapon='pistol',fate=false}={}){
    if(!G.CLASSES[left]||!G.CLASSES[right]||!G.WEAPONS[weapon])throw new Error('Choose valid operators and a weapon.');
    if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be an integer from 0 to 4294967295.');
    const s=G.createState(seed,left,'small',{activeIds:[0,1]});
    Object.assign(s,{width:WIDTH,height:HEIGHT,size:WIDTH,initialLimit:100,safeLimit:100,nextLimit:100,maxZoneRank:0,humanIds:[],zoneCenter:{x:7,y:5},beacon:{x:7,y:5,cooldown:0},roofs:[],layout:{style:'bot-arena'}});
    s.tiles=Array.from({length:HEIGHT},(_,y)=>Array.from({length:WIDTH},(_,x)=>({type:x===0||y===0||x===WIDTH-1||y===HEIGHT-1?'wall':'grass',hp:0,rank:0,loot:null})));
    // Mirror symmetry gives both bots the same cover and pickup routes.
    for(const [x,y,type,side]of [[5,3,'cover','north'],[9,3,'cover','north'],[7,2,'barricade'],[7,8,'barricade'],[5,7,'water'],[9,7,'water']])Object.assign(s.tiles[y][x],{type,side,hp:type==='barricade'?45:0});
    for(const [x,y,loot]of [[4,3,{type:'weapon',weapon:'rifle'}],[10,3,{type:'weapon',weapon:'rifle'}],[4,7,{type:'weapon',weapon:'shotgun'}],[10,7,{type:'weapon',weapon:'shotgun'}],[6,5,{type:'medkit'}],[8,5,{type:'medkit'}],[3,6,{type:'ammo'}],[11,6,{type:'ammo'}]])s.tiles[y][x].loot={...loot,taken:false};
    for(const [id,character,x,y]of [[0,left,3,5],[1,right,11,5]])Object.assign(s.units[id],{class:character,x,y,name:(id?'BOT B':'BOT A')+' · '+G.CLASSES[character].name,weapon,ammo:G.WEAPONS[weapon].mag,weapons:[weapon],weaponAmmo:{[weapon]:G.WEAPONS[weapon].mag},personality:'aggressive',facing:id?Math.PI:0});
    s.arena={fate:!!fate,maxTurns:MAX_TURNS,draw:false,stats:[{damage:0,shots:0},{damage:0,shots:0}]};
    return s;
  }
  function advance(s){
    if(!s.arena)throw new Error('Not a bot arena state.');
    if(s.phase==='ended')return [];
    let events=[];
    if(s.phase==='planning'){
      if(s.arena.fate&&G.FATE.open(s)){
        G.FATE.settle(s);G.normalizeEquipment(s);s.phase='planning';
        events.push({type:'arenaDraft',turn:s.turn,tick:0,summary:s.fate.summary});
      }
      const plans={};for(const u of s.units)if(u.alive)plans[u.id]=G.planBot(s,u.id);
      G.beginTurn(s,plans);events.push({type:'arenaPlan',turn:s.turn,tick:0});
    }else if(s.phase==='clash'){
      const start=s.events.length;G.settleClash(s,true);events=s.events.slice(start);
    }else if(s.phase==='resolution')events=G.step(s);
    for(const e of events){
      if(e.type==='damage'&&e.owner!=null&&e.owner!==e.unitId&&s.arena.stats[e.owner])s.arena.stats[e.owner].damage+=e.amount;
      if(e.type==='shoot'&&s.arena.stats[e.unitId])s.arena.stats[e.unitId].shots++;
    }
    if(s.phase==='planning'&&s.turn>MAX_TURNS){s.phase='ended';s.winner=-1;s.arena.draw=true;events.push({type:'end',turn:s.turn,tick:s.tick,winner:-1});}
    return events;
  }
  return {WIDTH,HEIGHT,MAX_TURNS,createDuel,advance};
});
