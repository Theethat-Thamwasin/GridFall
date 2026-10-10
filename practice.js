(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./engine'):root.Gridfall);if(typeof module==='object'&&module.exports)module.exports=api;else root.GridfallPractice=api;})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  function supplies(s){
    const items=['ammo','medkit','shield','grenade','smoke'];
    for(let i=0;i<items.length;i++)s.tiles[6][5+i*2].loot={type:items[i],taken:false};
    s.tiles[8][5].loot={type:'weapon',weapon:'longshot',taken:false};
    s.tiles[8][7].loot={type:'weapon',weapon:'trident',airdrop:true,taken:false};
    s.terrainVersion=(s.terrainVersion||0)+1;
  }
  function equipAll(u){
    u.weapons=Object.keys(G.WEAPONS);u.weaponAmmo=Object.fromEntries(u.weapons.map(id=>[id,G.FATE.magazine(u,G.WEAPONS[id])]));
    u.weapon='rifle';u.ammo=u.weaponAmmo.rifle;u.reserve=120;u.medkits=3;u.grenades=3;u.smoke=3;
  }
  function createState(seed=73,character='vanguard'){
    const s=G.createState(seed,character,'small',{activeIds:[0,1]});
    Object.assign(s,{practice:true,width:22,height:18,size:22,biome:'verdant',initialLimit:100,safeLimit:100,nextLimit:100,maxZoneRank:0,zoneCenter:{x:11,y:9},layout:{style:'practice'},beacon:{x:17,y:12,cooldown:0},roofs:[]});
    s.tiles=Array.from({length:s.height},(_,y)=>Array.from({length:s.width},(_,x)=>({type:x===0||y===0||x===s.width-1||y===s.height-1?'wall':'floor',hp:0,rank:0,loot:null})));
    Object.assign(s.units[0],{x:9,y:10,hp:50,shield:0,name:'YOU'});equipAll(s.units[0]);
    Object.assign(s.units[1],{x:12,y:10,class:'vanguard',name:'TRAINING BOT',shield:0,weapon:'pistol',ammo:8,weapons:['pistol'],weaponAmmo:{pistol:8},reserve:120});
    Object.assign(s.tiles[5][18],{type:'wall',hp:60});
    Object.assign(s.tiles[6][18],{type:'barricade',hp:45});
    Object.assign(s.tiles[7][18],{type:'forest'});
    Object.assign(s.tiles[8][18],{type:'cover',side:'west'});
    Object.assign(s.tiles[9][18],{type:'water'});
    Object.assign(s.tiles[10][18],{type:'rubble'});
    s.roofs=[{id:0,x:15,y:13,w:3,h:2}];for(let y=13;y<15;y++)for(let x=15;x<18;x++)s.tiles[y][x].roof=1;
    supplies(s);G.observation(s,s.units[0]);return s;
  }
  function changeCharacter(s,id){
    if(!s.practice||s.phase!=='planning'||!G.CLASSES[id])return false;
    const u=s.units[0];Object.assign(u,{class:id,skillCooldown:0,scan:0,reflectCharges:0,reflectTurn:0,dodgeUntil:-1});
    G.observation(s,u);return true;
  }
  function respawn(s){
    const u=s.units[0],bot=s.units[1],spots=[];
    for(let y=2;y<s.height-2;y++)for(let x=2;x<s.width-2;x++)if(G.passable(s,x,y)&&G.distance(u,{x,y})>=3&&G.distance(u,{x,y})<=5)spots.push({x,y});
    const random=G.random(s.seed+s.turn*719),point=spots[Math.floor(random()*spots.length)]||{x:12,y:10};
    Object.assign(bot,{...point,alive:true,hp:100,shield:0,ammo:8,reserve:120,skillCooldown:0,scan:0,guard:false,reflectCharges:0,dodgeUntil:-1,moved:false,pendingPickups:[],fateBuild:[],memory:{}});
    delete bot.burn;s.practiceRespawns=(s.practiceRespawns||0)+1;return {...point};
  }
  function afterTurn(s){
    if(!s.practice)return null;
    const u=s.units[0],before=u.hp,respawned=!s.units[1].alive?respawn(s):null;
    u.hp=Math.ceil(G.FATE.stats(u).maxHp/2);u.alive=true;u.medkits=u.grenades=u.smoke=3;u.reserve=120;
    s.units[1].ammo=8;s.units[1].reserve=120;
    supplies(s);return {before,hp:u.hp,respawned};
  }
  function botPlan(s){
    const bot=s.units[1],random=G.random(s.seed^Math.imul(s.turn,9973));
    const directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}],d=directions[Math.floor(random()*directions.length)],target={x:bot.x+d.x,y:bot.y+d.y};
    // Keep the target close enough to practice on, and avoid intentional contact duels.
    const canMove=G.passable(s,target.x,target.y)&&G.distance(s.units[0],target)>1.5&&G.distance(s.units[0],target)<7;
    return [canMove?{type:'move',target}:{type:'wait'},{type:'shoot',angle:random()*Math.PI*2}];
  }
  return {createState,changeCharacter,afterTurn,botPlan};
});
