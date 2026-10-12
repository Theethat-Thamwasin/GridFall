(function (root, factory) {
  const F = typeof module !== 'undefined' && module.exports ? require('./fate.js') : root.GridfallFate;
  const V=typeof module!=='undefined'&&module.exports?require('./vision.js'):root.GridfallVision;
  const SKY=typeof module!=='undefined'&&module.exports?require('./skybridge.js'):root.GridfallSkyBridge;
  const api = factory(F,V,SKY);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gridfall = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (F,V,SKY) {
  'use strict';
  const SIZE = 28;
  const SKILLS = Object.freeze({ dashRange:5, dashDamage:5, blinkRange:5, blinkUses:2, scanRangeBonus:.25, mobilityCooldown:2, dashDodgeTicks:39, scanRange:14, scanTurns:2, reflectShots:1, reflectDamage:1, reflectAbsorb:.8, burnDamage:18, mendHp:16, mendShield:16 });
  const TIMING = Object.freeze({ tickMs: 45 });
  const CLASH=Object.freeze({choiceMs:6000,revealMs:1500,damage:10});
  const THROW=Object.freeze({grenadeTicks:14,smokeTicks:10,skillTicks:10,smokeRadius:1});
  const SKILL_AREAS=Object.freeze({stasis:Object.freeze({width:4,height:4,turns:2}),mend:Object.freeze({width:3,height:3,turns:2}),firebomb:Object.freeze({width:4,height:4,turns:2})});
  const MAPS = {
small:{name:'SMALL / SHATTER',width:32,height:32,min:28,max:36,description:'Compact procedural platforms · random shape / routes'},
medium:{name:'MEDIUM / FRACTURE',width:40,height:40,min:36,max:44,description:'Balanced procedural platforms · random shape / routes'},
meadow:{name:'MEADOW / FRONTLINE',width:52,height:52,min:48,max:56,description:'Open grassland battlefield · trenches, ruins, water and concealing roofs'},
skybridge:{name:'SKY BRIDGE',width:68,height:68,min:64,max:72,description:'Death bridges · 4–7 floating islands · narrow shortcuts and wide detours · seeded collapse with escape routes'},
large:{name:'LARGE / ABYSS',width:52,height:52,min:44,max:56,description:'Wide procedural platforms · random shape / routes'}
};
const normalizeMap=id=>({district:'small',cargo:'medium',alley:'medium',rift:'large'}[id]||(MAPS[id]?id:'medium'));
  const LOOT = {
    weapon: { name: 'WEAPON', description: "WEAPONS", icon: '⌁', color: '#dbabff' },
    ammo: { name: 'AMMO', description: "Ammo +24", icon: '▥', color: '#edc674' },
    medkit: { name: 'MEDKIT', description: "Medkits +1", icon: '+', color: '#a5f08b' },
    shield: { name: 'ARMOR', description: "Shield +20", icon: '◇', color: '#8bcaec' },
    grenade: { name: 'GRENADE', description: "Grenade +1", icon: '◉', color: '#ffa76c' },
    smoke: { name: 'SMOKE', description: "Smoke +1", icon: '≋', color: '#c5d0c2' }
  };
  const WEAPONS = {
    rifle: { name: 'AR / VANDAL', short: 'AR', damage: 16, range: 9, delay: 11, shots: 3, spacing: 2, mag: 15, speed: 1, recoilDeg: .35, kick: .9 },
    pistol: { name: 'P9 / SIDEARM', short: 'P9', damage: 28, range: 7, delay: 7, shots: 1, spacing: 0, mag: 8, speed: 1, recoilDeg: 1, kick: 2 },
    trident: { name:'TRI / TRIDENT',short:'TRI',damage:28,range:9,delay:13,shots:1,spacing:0,mag:6,speed:1,recoilDeg:1.4,kick:4,airDrop:true,spread:[-.3,0,.3] },
    shotgun: { name: 'SG / BREACHER', short: 'SG', damage: 48, range: 4, delay: 8, shots: 1, spacing: 0, mag: 4, speed: 1, recoilDeg: 2.5, kick: 5, spread:[-.32,-.256,-.192,-.128,-.064,0,.064,.128,.192,.256,.32] },
    smg: { name: 'SMG / STINGER', short: 'SMG', damage: 10, range: 6, delay: 6, shots: 5, spacing: 1, mag: 25, speed: 1, recoilDeg: .5, kick: .8 },
    lmg: { name: 'LMG / TITAN', short: 'LMG', damage: 12, range: 10, delay: 16, shots: 4, spacing: 2, mag: 32, speed: 1, recoilDeg: .45, kick: 1.1 },
    dmr: { name: 'DMR / SENTINEL', short: 'DMR', damage: 34, range: 11, delay: 13, shots: 1, spacing: 0, mag: 10, speed: 1, recoilDeg: .7, kick: 3.5 },
    revolver: { name: 'RV / OUTLAW', short: 'RV', damage: 40, range: 6, delay: 9, shots: 1, spacing: 0, mag: 6, speed: 1, recoilDeg: 1.5, kick: 4 },
    longshot: { name:'HSR / HORIZON',short:'HSR',damage:80,range:16,delay:25,shots:1,spacing:0,mag:3,speed:2,recoilDeg:.12,kick:7,stationary:true },
    sniper: { stationary:true, name: 'SR / DEADLOCK', short: 'SR', damage: 62, range: 12, delay: 19, shots: 1, spacing: 0, mag: 3, speed: 1, recoilDeg: .25, kick: 5.5 }
  };
  const CLASSES = {
  "vanguard": {
    "name": "STRIDER",
    "move": 4,
    "color": "#ff6477",
    "skill": "KINETIC DASH",
    "skillType": "skillMove",
    "icon": "↗",
    "role": "BREACH / EVASION",
    "description": "Charge up to 5 tiles, ignoring movement debuffs and water penalties. Automatically win collisions: push enemies ahead of your charge, interrupt their current movement and deal 5 HP damage on every hit, including each repeated push. Stop if a forward push is blocked. Dodge every incoming bullet for the entire Dash action. Cooldown: 2 turns."
  },
  "volt": {
    "name": "WRAITH",
    "move": 3,
    "color": "#66bfff",
    "skill": "PHASE SHIFT",
    "skillType": "blink",
    "icon": "ϟ",
    "role": "FLANK / TELEPORT",
    "description": "Teleport to a visible tile within 5 tiles, including across Void. Up to 2 uses in the same turn, 1 action each. Cooldown: 2 turns after use."
  },
  "deadeye": {
    "name": "ORACLE",
    "move": 3,
    "color": "#c18cff",
    "skill": "PULSE ARRAY",
    "skillType": "scan",
    "icon": "⌖",
    "role": "RECON / PRECISION",
    "description": "Scan enemies within 14 tiles through walls, Smoke and roofs for 2 turns. All weapon ranges +25% while scanning. Recoil reduced 65%. First bullet per Shoot gets +15 damage. Cooldown: 3 turns."
  },
  "pyro": {
    "name": "CINDER",
    "move": 3,
    "color": "#ff9c52",
    "skill": "MOLLY",
    "skillType": "firebomb",
    "icon": "♨",
    "role": "DENIAL / PRESSURE",
    "description": "Throw a Molly within 5 tiles. Leaves a 4×4 fire area for 2 rounds. Targets caught on impact or entering the fire burn for 18 damage twice per turn for 2 turns, even after leaving. Each Molly ignites a target only once; active burns never stack or refresh. Can hit you. Cooldown: 3 turns."
  },
  "rook": {
    "name": "AEGIS",
    "move": 3,
    "color": "#66d5ff",
    "skill": "PRISM BULWARK",
    "skillType": "reflect",
    "icon": "◇",
    "role": "ANCHOR / COUNTER",
    "description": "Gain 12 shield, up to your shield cap. Reflect every incoming bullet this turn at full damage. Absorb 80% of each hit; take the remaining 20%. Melee, blasts and Void are not reflected."
  }
};
  Object.assign(CLASSES,{
    mire:{name:'MIRE',move:3,color:'#85e2bb',skill:'STASIS FIELD',skillType:'stasis',icon:'⌛',role:'CONTROL / ROOT',description:"Throw a 4×4 field within 5 tiles. Everyone inside is rooted and cannot walk. Dash and Blink can escape. Lasts 2 turns. Affects you too. Cooldown: 4 turns."},
    halo:{name:'HALO',move:3,color:'#ffd66e',skill:'MEND FIELD',skillType:'mend',icon:'✧',role:'SUPPORT / RECOVERY',description:"Throw a 3×3 field within 5 tiles. Restore 16 HP and 16 shield per turn inside. In Team Mode, heals your team only. Lasts 2 turns. Cooldown: 4 turns."}
  });
  const BIOMES={
    verdant:{name:'VERDANT',floor:'#566a61',grass:'#486c51',road:'#657570',forest:'#325444',water:'#4b8192',rubble:'#817c69'},
    badlands:{name:'BADLANDS',floor:'#7c6960',grass:'#6e754b',road:'#807c72',forest:'#59624a',water:'#4d8090',rubble:'#927c68'},
    tundra:{name:'TUNDRA',floor:'#6e8490',grass:'#597d72',road:'#788e9b',forest:'#43645c',water:'#4e8ca5',rubble:'#819291'}
  };
  const key = (x, y) => x + ',' + y;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  function random(seed) { let n = seed >>> 0; return () => { n += 0x6D2B79F5; let t = Math.imul(n ^ n >>> 15, 1 | n); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function line(a, b) {
    const result = []; const steps = Math.ceil(distance(a, b) * 5);
    for (let i = 1; i <= steps; i++) { const t = i / steps, x = Math.floor(a.x + .5 + (b.x - a.x) * t), y = Math.floor(a.y + .5 + (b.y - a.y) * t); if (!result.some(p => p.x === x && p.y === y)) result.push({ x, y }); }
    return result;
  }
  function tile(s, x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < (s.width || s.size) && y < (s.height || s.size) ? s.tiles[y][x] : null; }
  function passable(s, x, y) { const t = tile(s, x, y); return t && !['wall', 'barricade', 'void'].includes(t.type); }
  const sameTeam=(s,a,b)=>s.mode==='team'&&!!a&&!!b&&['A','B'].includes(a.team)&&a.team===b.team;
  const opponents=(s,a,b)=>!!a&&!!b&&a.id!==b.id&&!sameTeam(s,a,b);
  function matchOutcome(s){const alive=s.units.filter(u=>u.alive);if(s.mode==='team'){const teams=[...new Set(alive.map(u=>u.team))];if(teams.length>1)return false;s.winnerTeam=teams[0]||null;s.winner=alive[0]?.id??-1;}else{if(alive.length>1)return false;s.winner=alive[0]?.id??-1;}s.phase='ended';emit(s,'end',{winner:s.winner,winnerTeam:s.winnerTeam||null});return true;}
  const sightRange=u=>Math.max(u.scan>0?SKILLS.scanRange:9,WEAPONS[u.weapon]?.sight||0);
  function visible(s,a,b,range=sightRange(a)){return b.id!==undefined&&b.id!==a.id?(sameTeam(s,a,b)||V.bodyExposure(s,a,b,range).visible):V.pointVisible(s,a,b,range);}
  const terrainVisible=(s,a,b,range=9)=>V.pointVisible(s,a,b,range,false);
  function pathfind(s, from, to, budget = 3, dash = false) {
    if (!passable(s, to.x, to.y)) return null;
    const frontier = [{ x: from.x, y: from.y, cost: 0, path: [] }], visited = new Map([[key(from.x, from.y), 0]]);
    while (frontier.length) {
      frontier.sort((a, b) => a.cost - b.cost); const p = frontier.shift();
      if (p.x === to.x && p.y === to.y) return p.path;
      if (!dash && inField(s,p,'stasis')) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
        const x = p.x + dx, y = p.y + dy;
        if (!passable(s, x, y) || (dx && dy && (!passable(s, p.x + dx, p.y) || !passable(s, p.x, p.y + dy)))) continue;
        const cost = p.cost + (!dash && tile(s, x, y).type === 'water' ? 2 : 1), k = key(x, y);
        if (cost > budget || (visited.has(k) && visited.get(k) <= cost)) continue;
        visited.set(k, cost); frontier.push({ x, y, cost, path: [...p.path, { x, y }] });
      }
    }
    return null;
  }
  const CARDINAL = [[0,-1],[1,0],[0,1],[-1,0]];
  function validateRoute(s, from, path, budget, target = path?.at(-1), dash = false) {
    if (!Array.isArray(path) || !path.length || path.length > budget || !target) return null;
    let cost=0, previous=from; const clean=[];
    for (const p of path) {
      if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || !passable(s,p.x,p.y) || Math.abs(p.x-previous.x)+Math.abs(p.y-previous.y)!==1) return null;
      if (!dash && inField(s,previous,'stasis')) return null;
      cost += !dash && tile(s,p.x,p.y).type==='water'?2:1;
      if (cost>budget) return null;
      clean.push({x:p.x,y:p.y}); previous=p;
    }
    return previous.x===target.x && previous.y===target.y ? {path:clean,cost} : null;
  }
  function zoneRank(x, y, cx, cy, seed) {
    const dx = x - cx, dy = y - cy;
    // Rectangular, asymmetric contour; increasing toward the map edge.
    return Math.max(0, Math.max(Math.abs(dx) * .88, Math.abs(dy) * 1.08) + .06 * (dx + dy) + .23 * (Math.sin((x + seed % 9) * .6) - Math.sin((cx + seed % 9) * .6)));
  }
  function selectSpawns(s, rng, count = 8) {
    // Flood fill with cardinal movement. Every spawn
    // belongs to the main walkable area, including its routes to the beacon.
    const visited = new Set(); let main = [];
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      if (!passable(s, x, y) || visited.has(key(x, y))) continue;
      const component = [{ x, y }]; visited.add(key(x, y));
      for (let i = 0; i < component.length; i++) {
        const p = component[i];
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const nx = p.x + dx, ny = p.y + dy;
          if (Math.abs(dx) + Math.abs(dy) !== 1 || visited.has(key(nx, ny)) || !passable(s, nx, ny)) continue;
          if (dx && dy && (!passable(s, p.x + dx, p.y) || !passable(s, p.x, p.y + dy))) continue;
          visited.add(key(nx, ny)); component.push({ x: nx, y: ny });
        }
      }
      if (component.length > main.length) main = component;
    }
    const dry = (x, y) => passable(s, x, y) && tile(s, x, y).type !== 'water';
    const candidates = main.filter(p => {
      if (tile(s,p.x,p.y).rank > s.safeLimit || p.x < 2 || p.y < 2 || p.x >= s.width - 2 || p.y >= s.height - 2 || cheb(p, s.beacon) < 4) return false;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!dry(p.x + dx, p.y + dy)) return false;
      // Equal starter ammo at one step and a weapon at two steps; no walls
      // need to be erased to place either pickup.
      return dry(p.x + 2, p.y);
    });
    for (let attempt = 0; attempt < 64; attempt++) {
      const chosen = [candidates[Math.floor(rng() * candidates.length)]];
      if (!chosen[0]) break;
      while (chosen.length < count) {
        const scores = candidates.map(p => ({ p, score: Math.min(...chosen.map(q => (p.x - q.x) ** 2 + (p.y - q.y) ** 2)) }));
        const farthest = Math.max(...scores.map(p => p.score));
        const pool = scores.filter(p => p.score >= Math.max(64, farthest * .85));
        if (!pool.length) break;
        // Prefer covered starts among equally well-separated candidates.
        const exposure = p => chosen.filter(q => visible(s, p, q, 12)).length;
        const best = Math.min(...pool.map(entry => exposure(entry.p)));
        const sheltered = pool.filter(entry => exposure(entry.p) === best);
        chosen.push(sheltered[Math.floor(rng() * sheltered.length)].p);
      }
      if (chosen.length !== count) continue;
      // Random assignment prevents the host or a particular bot ID from
      // always receiving the first or last location in the spread.
      for (let i = chosen.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; }
      return chosen;
    }
    throw new Error('Map has no safe spread for ' + count + ' spawn points');
  }
  function generatePlatforms(s, rng) {
    const axes = length => { const result=[3]; for(let p=11;p<length-6;p+=8)result.push(p); if(length-4-result.at(-1)>=5)result.push(length-4); return result; };
    const xs=axes(s.width),ys=axes(s.height);let nodes=[];
    for(let row=0;row<ys.length;row++)for(let col=0;col<xs.length;col++)nodes.push({x:Math.max(3,Math.min(s.width-4,xs[col]+Math.floor(rng()*5)-2)),y:Math.max(3,Math.min(s.height-4,ys[row]+Math.floor(rng()*5)-2)),col,row});
    {const shape=Math.floor(rng()*4),shaped=nodes.filter(p=>{const dx=Math.abs(p.x-s.width/2)/(s.width*.61),dy=Math.abs(p.y-s.height/2)/(s.height*.61);return shape===0?dx*dx+dy*dy<1:shape===1?dx+dy<1.28:shape===2?dx<.5||dy<.5:dx<.82||dy<.38;});if(shaped.length>=12)nodes=shaped;s.riftShape=['ellipse','diamond','cross','offset'][shape];}
    const lookup=new Map(nodes.map((p,i)=>[key(p.col,p.row),i]));
    for(let y=0;y<s.height;y++) {s.tiles[y]=[];for(let x=0;x<s.width;x++)s.tiles[y][x]={type:'void',hp:0,loot:null,rank:zoneRank(x,y,s.zoneCenter.x,s.zoneCenter.y,s.seed)};}
    const carve=(x,y,radius=0,type='road')=>{for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const t=tile(s,x+dx,y+dy);if(t)Object.assign(t,{type,hp:0});}};
    for(const p of nodes){carve(p.x,p.y,rng()<.1&&Math.min(s.width,s.height)>=36?3:2,'floor');if(rng()<.45){const[dx,dy]=[[3,0],[-3,0],[0,3],[0,-3]][Math.floor(rng()*4)];carve(p.x+dx,p.y+dy,1,'floor');}}
    const bridge=(a,b)=>{let p={...a};const horizontal=rng()<.5,sideOffset=rng()<.5?-1:1,wide=rng()>=.25; const walk=(axis,destination)=>{while(p[axis]!==destination){carve(p.x,p.y);const side=axis==='x'?{x:p.x,y:p.y+sideOffset}:{x:p.x+sideOffset,y:p.y};if(wide)carve(side.x,side.y);p[axis]+=Math.sign(destination-p[axis]);}carve(p.x,p.y);}; if(horizontal){walk('x',b.x);walk('y',b.y);}else{walk('y',b.y);walk('x',b.x);} };
    const neighbors=i=>[[-1,0],[1,0],[0,-1],[0,1]].map(([dx,dy])=>lookup.get(key(nodes[i].col+dx,nodes[i].row+dy))).filter(n=>n!==undefined);
    const visited=new Set([0]),stack=[0],edges=new Set();
    const edge=(a,b)=>[Math.min(a,b),Math.max(a,b)].join(':');
    while(stack.length){const at=stack.at(-1),available=neighbors(at).filter(n=>!visited.has(n));if(!available.length){stack.pop();continue;}const next=available[Math.floor(rng()*available.length)];bridge(nodes[at],nodes[next]);edges.add(edge(at,next));visited.add(next);stack.push(next);}
    // Extra links create flanks and escape routes instead of a single maze path.
    for(let i=0;i<nodes.length;i++)for(const next of neighbors(i))if(next>i&&!edges.has(edge(i,next))&&rng()<.5){bridge(nodes[i],nodes[next]);edges.add(edge(i,next));}
    if(edges.size<nodes.length){const candidates=[];for(let i=0;i<nodes.length;i++)for(const n of neighbors(i))if(n>i&&!edges.has(edge(i,n)))candidates.push([i,n]);if(candidates.length){const[a,b]=candidates[Math.floor(rng()*candidates.length)];bridge(nodes[a],nodes[b]);edges.add(edge(a,b));}}
    carve(s.beacon.x,s.beacon.y,2);carve(s.zoneCenter.x,s.zoneCenter.y,1);
    const nearest=[...nodes].sort((a,b)=>distance(a,s.beacon)-distance(b,s.beacon))[0];bridge(nearest,s.beacon);
    // Cover and destructible barriers live in chambers; bridges stay connected.
    for(const p of nodes){
      const side=rng()<.5?-2:2, t=tile(s,p.x+side,p.y-2);
      Object.assign(t,{type:rng()<.35?'barricade':'wall',hp:45});
      const cover=tile(s,p.x-side,p.y+2);Object.assign(cover,{type:'cover',hp:35,side:rng()<.5?'north':'west'});
      if(rng()<.45)tile(s,p.x-2,p.y+1).type=rng()<.35?'water':'forest';
    }
    for(const p of [s.beacon,s.zoneCenter])carve(p.x,p.y,1);
    // Geodesic ranks keep every surviving platform connected to the final tile.
    const queue=[{...s.zoneCenter}],seen=new Set([key(s.zoneCenter.x,s.zoneCenter.y)]);tile(s,s.zoneCenter.x,s.zoneCenter.y).rank=0;
    for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(seen.has(k)||!passable(s,x,y))continue;seen.add(k);tile(s,x,y).rank=tile(s,p.x,p.y).rank+.5;queue.push({x,y});}}
    // Isolated decorative cells cannot accidentally become spawn or loot sites.
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const t=tile(s,x,y);if(passable(s,x,y)&&!seen.has(key(x,y)))t.type='void';}
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const t=tile(s,x,y);if(['wall','barricade'].includes(t.type)){const near=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>passable(s,x+dx,y+dy)).map(([dx,dy])=>tile(s,x+dx,y+dy).rank);if(near.length)t.rank=Math.min(...near)+.5;}}
    if(!s.tiles.flat().some(t=>t.type==='barricade')){const wall=s.tiles.flat().find(t=>t.type==='wall');if(wall)wall.type='barricade';}
    // Broad patches vary the ground without cutting the connected routes.
    s.biome=Object.keys(BIOMES)[Math.abs(s.seed)%3];
    for(let y=1;y<s.height-1;y++)for(let x=1;x<s.width-1;x++){const t=tile(s,x,y);if(t.type==='floor'&&Math.sin(x*.24+s.seed%17)+Math.cos(y*.29+s.seed%11)>.1)t.type='grass';}
    s.layout={chambers:nodes.length,bridges:edges.size,style:s.riftShape,biome:s.biome};
  }
  // Effects use terrain sight so smoke hides people without erasing outgoing objects.
  function effectVisible(s,observer,p){return V.pointVisible(s,observer,p,sightRange(observer),false,false);}
  function flightPose(c,tick){
    if(!c.from)return null;const end=c.land??c.explode;if(tick<c.born||tick>=end)return null;
    const progress=(tick-c.born)/(end-c.born),groundX=c.from.x+(c.x-c.from.x)*progress,groundY=c.from.y+(c.y-c.from.y)*progress;
    return {x:groundX,y:groundY,progress,lift:Math.sin(progress*Math.PI)*Math.min(54,22+distance(c.from,c)*5)/32,item:c.item||(c.land!==undefined?'smoke':'grenade')};
  }
  function generateMeadow(s,rng){
    s.biome='verdant';s.roofs=[];
    for(let y=0;y<s.height;y++){s.tiles[y]=[];for(let x=0;x<s.width;x++)s.tiles[y][x]={type:x===0||y===0||x===s.width-1||y===s.height-1?'void':'grass',hp:0,loot:null,rank:0};}
    // Broad grass lanes surround patches of woodland, ponds and shell craters.
    for(let n=0;n<24;n++){const cx=5+Math.floor(rng()*(s.width-10)),cy=5+Math.floor(rng()*(s.height-10)),radius=1+Math.floor(rng()*3),type=['forest','water','rubble'][n%3];for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++)if(distance({x,y},{x:cx,y:cy})<=radius&&tile(s,x,y)?.type!=='void')tile(s,x,y).type=type;}
    for(let y=1;y<s.height-1;y++)for(let x=1;x<s.width-1;x++)if(Math.abs(x-s.beacon.x)<=1||Math.abs(y-s.beacon.y)<=1)tile(s,x,y).type='road';
    for(let n=0;n<8;n++){const x=5+Math.floor(rng()*(s.width-13)),y=5+Math.floor(rng()*(s.height-12));for(let dx=0;dx<6;dx++){const t=tile(s,x+dx,y);Object.assign(t,{type:dx===2?'road':n%2?'barricade':'wall',hp:45});Object.assign(tile(s,x+dx,y+1),{type:'rubble',elevation:-1});}Object.assign(tile(s,x,y+2),{type:'cover',side:'north',hp:35});}
    for(let tries=0;s.roofs.length<4&&tries<200;tries++){const x=4+Math.floor(rng()*(s.width-11)),y=4+Math.floor(rng()*(s.height-10));if(s.roofs.some(r=>Math.abs(r.x-x)<8&&Math.abs(r.y-y)<7))continue;const id=s.roofs.length;s.roofs.push({id,x,y,w:5,h:4});for(let dy=0;dy<4;dy++)for(let dx=0;dx<5;dx++)Object.assign(tile(s,x+dx,y+dy),{type:'floor',hp:0,roof:id+1,elevation:0});}
    for(const p of [s.beacon,s.zoneCenter])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)Object.assign(tile(s,p.x+dx,p.y+dy),{type:'road',hp:0});
    // Geodesic collapse preserves a connected battlefield at every safe limit.
    const queue=[s.zoneCenter],seen=new Set([key(s.zoneCenter.x,s.zoneCenter.y)]);
    for(let i=0;i<queue.length;i++){const p=queue[i];for(const [dx,dy]of CARDINAL){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(seen.has(k)||!passable(s,x,y))continue;seen.add(k);tile(s,x,y).rank=tile(s,p.x,p.y).rank+.5;queue.push({x,y});}}
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const t=tile(s,x,y);if(passable(s,x,y)&&!seen.has(key(x,y)))t.type='void';if(['wall','barricade'].includes(t.type)){const ranks=CARDINAL.map(([dx,dy])=>tile(s,x+dx,y+dy)).filter(t=>t&&!['wall','barricade','void'].includes(t.type)).map(t=>t.rank);t.rank=ranks.length?Math.min(...ranks)+.5:s.width+s.height;}}
    s.layout={style:'grassland',biome:s.biome,roofs:s.roofs.length};
  }
  function createState(seed = 1, character = 'vanguard', mapId = 'medium', options = {}) {
    const activeIds = options.activeIds ?? Array.from({length:8}, (_, id) => id);
    if (!Array.isArray(activeIds) || !activeIds.length || activeIds.length > 8 || new Set(activeIds).size !== activeIds.length || activeIds.some(id => !Number.isInteger(id) || id < 0 || id > 7)) throw new Error('Invalid active roster');
    mapId=normalizeMap(mapId);const rng=random(seed),map=MAPS[mapId],dimension=()=>map.min+4*Math.floor(rng()*((map.max-map.min)/4+1)),width=dimension(),height=dimension();
    const s = { seed, mapId, width, height, size: Math.max(width, height), initialLimit: Math.max(40, width + 8, height + 8), turn: 1, tick: 0, phase: 'planning', tiles: [], units: [], projectiles: [], smokes: [], canisters: [], grenades: [], fires: [], fields:[], events: [], plans: {}, schedule: [], canceled: new Set(), shots: 0, kills: 0, damage: 0, zoneCenter: { x: Math.floor(width / 2) + Math.floor(rng() * 3) - 1, y: Math.floor(height / 2) + Math.floor(rng() * 3) - 1 }, beacon: { x: Math.floor(width / 2), y: Math.floor(height / 2), cooldown: 0 }, winner: null };
    s.mode=options.mode==='team'?'team':'ffa';s.winnerTeam=null;
    const teamCounts={A:0,B:0};for(const id of activeIds){const team=options.teams?.[id]||(teamCounts.A<=teamCounts.B?'A':'B');if(s.mode==='team'&&(!['A','B'].includes(team)||++teamCounts[team]>4))throw new Error('Teams allow at most 4 operators per side');}
    s.safeLimit = s.nextLimit = s.initialLimit;
    let generatedSpawns=null;const initialLimit=s.initialLimit;
    for(let attempt=0;attempt<64;attempt++){
      s.tiles=[];s.roofs=[];s.initialLimit=initialLimit;
      if(mapId==='skybridge')generatedSpawns=SKY.generate(s,rng,activeIds.length);else if(mapId==='meadow')generateMeadow(s,rng);else generatePlatforms(s,rng);
      s.initialLimit=Math.max(initialLimit,Math.max(...s.tiles.flat().filter(t=>t.type!=='void').map(t=>t.rank))+1);s.safeLimit=s.nextLimit=s.initialLimit;
      if(generatedSpawns)break;
      try{generatedSpawns=selectSpawns(s,rng,activeIds.length);s.layout.attempts=attempt+1;break;}catch(e){if(attempt===63||!e.message.startsWith('Map has no safe spread'))throw e;}
    }
    const names = ['YOU', 'REAPER', 'GHOST', 'KILO', 'SPECTRE', 'CIPHER', 'ECHO', 'RAZOR'];
    const spawns = generatedSpawns, positions = new Map(activeIds.map((id, i) => [id, spawns[i]]));
    for (let id = 0; id < 8; id++) {
      const {x, y} = positions.get(id) || {x:-100, y:-100};
      const cls = id === 0 && CLASSES[character] ? character : Object.keys(CLASSES)[id % Object.keys(CLASSES).length];
      if (positions.has(id)) { s.tiles[y][x].type = 'floor'; s.tiles[y][x].hp = 0; }
      s.units.push({ id, name: names[id], class: cls, x, y, hp: 100, shield: 20, alive: true, weapon: 'pistol', ammo: WEAPONS.pistol.mag, weapons: ['pistol'], weaponAmmo: { pistol: WEAPONS.pistol.mag }, pendingPickups: [], reserve: 60, medkits: 2, grenades: 2, smoke: 2, skillCooldown: 0, scan: 0, reflectTurn: 0, reflectCharges: 0, guard: false, dodgeUntil: -1, idle: 0, memory: {}, facing:0,fateRevealTurn:0,personality: ['hunter', 'aggressive', 'defensive', 'looter'][id % 4], moved: false });
      if (!positions.has(id)) Object.assign(s.units[id], {alive:false, hp:0, shield:0, removed:true});
    }
    const weaponTypes = Object.keys(WEAPONS).filter(id=>!WEAPONS[id].airDrop&&id!=='pistol');
    for(let i=weaponTypes.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[weaponTypes[i],weaponTypes[j]]=[weaponTypes[j],weaponTypes[i]];}
    const starterLoot = [[1, 0, 'ammo'], [2, 0, 'weapon']];
    for (const u of s.units.filter(u => u.alive)) for (const [dx, dy, type] of starterLoot) {
      const x = u.x + dx, y = u.y + dy, t = tile(s, x, y);
      if (t && !s.units.some(other => other.x === x && other.y === y)) t.loot = { type, ...(type === 'weapon' ? { weapon: mapId==='skybridge'?'rifle':weaponTypes[(u.id + 2) % weaponTypes.length] } : {}), taken: false };
    }
    for (const type of (Array.from({length:4+Math.floor(rng()*5)},()=>['medkit','shield','grenade','smoke','ammo'][Math.floor(rng()*5)]))) for (let tries = 0; tries < 1000; tries++) {
      const x = 1 + Math.floor(rng() * (width - 2)), y = 1 + Math.floor(rng() * (height - 2)), t = tile(s, x, y);
      if (passable(s, x, y) && t.type !== 'water' && !t.loot && !s.units.some(u => u.x === x && u.y === y)) { t.loot = { type, taken: false }; break; }
    }
    s.maxZoneRank = Math.max(...s.tiles.flat().filter(t=>t.type!=='void').map(t => t.rank));
    if(mapId==='skybridge')SKY.addLoot(s,rng,zoneLimit);
    if(s.mode==='team'){const counts={A:0,B:0};for(const id of activeIds){const u=s.units[id];u.team=options.teams?.[id]||(counts.A<=counts.B?'A':'B');counts[u.team]++;}const points=activeIds.map(id=>({x:s.units[id].x,y:s.units[id].y})).sort((a,b)=>a.x-b.x||a.y-b.y);const ids=[...activeIds.filter(id=>s.units[id].team==='A'),...activeIds.filter(id=>s.units[id].team==='B')];ids.forEach((id,i)=>Object.assign(s.units[id],points[i]));}
    if(mapId==='skybridge'){const sites=s.skyBridge.islands[0].cells.filter(p=>passable(s,p.x,p.y)&&!tile(s,p.x,p.y).loot&&cheb(p,s.zoneCenter)<=3),p=sites[Math.floor(rng()*sites.length)];Object.assign(s.beacon,p);}else relocateBeacon(s,false);
    F.init(s);
    return s;
  }
  function canCollect(u, item) {
    if (!item || !LOOT[item.type] || item.taken) return false;
    const waiting = (u.pendingPickups || []).filter(p => p.type === item.type).length;
    const field = { medkit: 'medkits', grenade: 'grenades', smoke: 'smoke', shield: 'shield' }[item.type];
    if (field) return u[field] + waiting * (item.type === 'shield' ? 20 : 1) < (item.type === 'shield' ? F.stats(u).shield : 3);
    if (item.type === 'weapon') return !!WEAPONS[item.weapon];
    return true;
  }
  function equipWeapon(s, u, weapon) {
    if (s.phase !== 'planning' || !u.alive || !(u.weapons || [u.weapon]).includes(weapon) || !WEAPONS[weapon]) return false;
    u.weaponAmmo = u.weaponAmmo || {}; u.weaponAmmo[u.weapon] = u.ammo;
    u.weapon = weapon; u.ammo = u.weaponAmmo[weapon] ?? WEAPONS[weapon].mag;
    return true;
  }
  function pickupAt(s, u) {
    const item = tile(s, u.x, u.y)?.loot;
    if (canCollect(u, item)) {
      item.taken = true; s.terrainVersion = (s.terrainVersion || 0) + 1; u.pendingPickups = u.pendingPickups || [];
      u.pendingPickups.push({ type: item.type, weapon: item.weapon, availableTurn: s.turn + 1 });
      emit(s, 'pickup', { unitId: u.id, x: u.x, y: u.y, lootType: item.type, weapon: item.weapon, availableTurn: s.turn + 1 });
    }
    if (u.x === s.beacon.x && u.y === s.beacon.y && !s.beacon.cooldown) {
      s.beacon.cooldown = 5; u.pendingPickups = u.pendingPickups || [];
      u.pendingPickups.push({ type: 'supply', availableTurn: s.turn + 1 });
      emit(s, 'beacon', { unitId: u.id, x: u.x, y: u.y, availableTurn: s.turn + 1 });
    }
  }
  function releasePickups(s, u) {
    const later = [];
    for (const item of u.pendingPickups || []) {
      if (item.availableTurn > s.turn) { later.push(item); continue; }
      if (item.type === 'ammo') u.reserve += 24;
      if(item.type==='fateAmmo')u.reserve+=item.amount;
      if (item.type === 'shield') u.shield = Math.min(F.stats(u).shield, u.shield + 20);
      if (item.type === 'medkit') u.medkits = Math.min(3, u.medkits + 1);
      if (item.type === 'grenade') u.grenades = Math.min(3, u.grenades + 1);
      if (item.type === 'smoke') u.smoke = Math.min(3, u.smoke + 1);
      if (item.type === 'weapon' && WEAPONS[item.weapon]) { if ((u.weapons || [u.weapon]).includes(item.weapon)) u.reserve += WEAPONS[item.weapon].mag; else { u.weapons = [...new Set([...(u.weapons || [u.weapon]), item.weapon])]; u.weaponAmmo = u.weaponAmmo || {}; u.weaponAmmo[item.weapon] = WEAPONS[item.weapon].mag; } }
      if (item.type === 'supply') { u.reserve += 30; u.shield = Math.min(F.stats(u).shield, u.shield + 20); u.grenades = Math.min(3, u.grenades + 1); u.medkits = Math.min(3, u.medkits + 1); }
    }
    u.pendingPickups = later;
  }
  function nearbyLoot(s, u) {
    const result = [];
    for (let y = u.y - 1; y <= u.y + 1; y++) for (let x = u.x - 1; x <= u.x + 1; x++) { const t = tile(s, x, y); if (t && t.loot && !t.loot.taken) result.push({ x, y, ...t.loot }); }
    return result.sort((a, b) => distance(u, a) - distance(u, b));
  }
  function observation(s, unit) {
    const range = sightRange(unit);
    const seen=[];for(const u of s.units)if(u.alive&&opponents(s,unit,u)){const sight=V.bodyExposure(s,unit,u,range);if(sight.visible||u.fateRevealTurn===s.turn&&!V.sheltered(s,u))seen.push({id:u.id,name:u.name,x:u.x,y:u.y,hp:sight.visible?u.hp:null,shield:sight.visible?u.shield:null,aim:sight.point});}
    for (const enemy of seen) unit.memory[enemy.id] = { ...enemy, turn: s.turn };
    return { self: { ...unit, memory: { ...unit.memory } }, enemies: seen, lastSeen: Object.values(unit.memory).filter(m => s.turn - m.turn <= 3), loot: s.tiles.flatMap((row, y) => row.flatMap((t, x) => t.loot && !t.loot.taken && visible(s, unit, { x, y }, range) ? [{ x, y, ...t.loot }] : [])), safeLimit: s.safeLimit, nextLimit: s.nextLimit, turn: s.turn };
  }
  function planBot(s, id) {
    const unit = s.units[id], obs = observation(s, unit), rng = random(s.seed * 997 + s.turn * 37 + id * 101), plan = [], virtual = { x: unit.x, y: unit.y };
    const enemy = [...obs.enemies].sort((a, b) => distance(unit, a) - distance(unit, b))[0];
    // Same equipment API and ammo stores as the player; pickups unlock next turn.
    if (enemy) {
      const d = distance(unit, enemy), choices = (unit.weapons || [unit.weapon]).filter(type => (type === unit.weapon ? unit.ammo : unit.weaponAmmo[type]) > 0 || unit.reserve > 0);
      choices.sort((a, b) => gunScore(b) - gunScore(a));
      function gunScore(type) { const w = weaponStats({...unit,weapon:type}); return d > w.range ? -100 - (d - w.range) : w.damage * w.shots - w.delay * .4 + (type === 'shotgun' && d < 3 ? 20 : 0); }
      if (choices.length) equipWeapon(s, unit, choices[0]);
    }
    let ammo = unit.ammo, medkits = unit.medkits, grenades = unit.grenades, smoke = unit.smoke, skillUsed = unit.skillCooldown > 0;
    let weapon = weaponStats(unit);
    function chooseMove(target) {
      const forecast=movementForecast({...s,fields:observedFields(s,unit)},unit,plan),routeState={...s,fields:forecast.fields};
      const uses=plan.filter(a=>a.type==='blink').length,ready=unit.skillCooldown===0&&(unit.class==='volt'?uses<SKILLS.blinkUses:!skillUsed);
      const escape=forecast.remaining===0||tile(s,virtual.x,virtual.y).rank>s.nextLimit||enemy&&unit.hp<50;
      const type=ready&&escape&&unit.class==='vanguard'?'skillMove':ready&&escape&&unit.class==='volt'?'blink':'move';
      const budget=type==='skillMove'?SKILLS.dashRange:type==='blink'?SKILLS.blinkRange:Math.min(forecast.remaining,Math.max(1,Math.min(5,CLASSES[unit.class].move+Math.round(F.stats(unit).move))));
      let best=null,score=-Infinity;
      for(let x=virtual.x-budget;x<=virtual.x+budget;x++)for(let y=virtual.y-budget;y<=virtual.y+budget;y++){
        if(type==='blink'&&(!passable(s,x,y)||!distance(virtual,{x,y})||!visible(s,virtual,{x,y},budget)))continue;
        const path=type==='blink'?[{x,y}]:pathfind(routeState,virtual,{x,y},budget,type==='skillMove');
        if(!path?.length)continue;
        const t=tile(s,x,y),danger=t.rank>s.nextLimit?25:0;
        const lootValue=path.reduce((sum,p)=>sum+(canCollect(unit,tile(s,p.x,p.y).loot)?1.3:0),0);
        const value=-(target===s.zoneCenter?t.rank*2:distance({x,y},target))-danger+(t.type==='cover'?1:0)+lootValue+rng()*.6;
        if(value>score){score=value;best={type,target:{x,y},...(type==='blink'?{}:{path})};}
      }
      if(!best)return {type:'guard'};
      if(type!=='move')skillUsed=true;
      Object.assign(virtual,best.target);return best;
    }
    if (tile(s, unit.x, unit.y).rank > s.nextLimit) plan.push(chooseMove(s.zoneCenter));
    const temperament=unit.personality, mode=rng()<.3?'flank':rng()<.35?'retreat':'pressure';
    while(plan.length<2){
      weapon=weaponStats({...unit,scan:plan.some(a=>a.type==='scan')?SKILLS.scanTurns:unit.scan});
      const d=enemy?distance(virtual,enemy):Infinity, choices=[];
      const add=(type,weight,extra={})=>{if(weight>0)choices.push({weight,action:{type,...extra}});};
      const repeated=type=>plan.some(a=>a.type===type);
      if(tile(s,virtual.x,virtual.y).rank>s.nextLimit){plan.push(chooseMove(s.zoneCenter));continue;}
      if(unit.hp<75&&medkits>0&&!repeated('heal'))add('heal',unit.hp<35?14:unit.hp<55?7:2);
      if(ammo<weapon.shots&&unit.reserve>0&&!repeated('reload'))add('reload',15);
      else if(ammo<weapon.mag*.4&&unit.reserve>0&&!repeated('reload'))add('reload',enemy?1:5);
      if(enemy){
        const exposed=V.bodyExposure(s,virtual,enemy,weapon.range),aim=exposed.point||enemy,angle=Math.atan2(aim.y-virtual.y,aim.x-virtual.x);
        if(d<=1.5&&visible(s,virtual,enemy,1.5))add('slash',10,{angle});
        if(d<=weapon.range&&visible(s,virtual,enemy,weapon.range)&&ammo>=weapon.shots&&!(WEAPONS[unit.weapon].stationary&&plan.some(a=>['move','blink','skillMove'].includes(a.type))))
          add('shoot',(temperament==='aggressive'?8:5)*(repeated('shoot')?.45:1),{angle,target:{x:enemy.x,y:enemy.y}});
        if(grenades>0&&d>2&&d<=6&&!repeated('grenade'))add('grenade',temperament==='aggressive'?3.5:2.3,{target:{x:enemy.x,y:enemy.y}});
        if(smoke>0&&d>2&&!repeated('smoke'))add('smoke',unit.hp<50?7:mode==='retreat'?3:1,{target:{...virtual}});
        if(!repeated('guard'))add('guard',temperament==='defensive'?4:unit.hp<50?3:1.2);
        if(!skillUsed){
          if(unit.class==='rook')add('reflect',5);
          if(unit.class==='pyro'&&d>2&&d<=5)add('firebomb',4,{target:{x:enemy.x,y:enemy.y}});
          if(unit.class==='mire'&&d<=5)add('stasis',4,{target:{x:enemy.x,y:enemy.y}});
          if(unit.class==='halo'&&unit.hp<85)add('mend',6,{target:{...virtual}});
          if(unit.class==='deadeye')add('scan',d>4?4:1);
        }
        const retreat=unit.hp<40||mode==='retreat';
        const flank={x:Math.round(virtual.x+(virtual.y-enemy.y)*.6+(enemy.x-virtual.x)*.35),y:Math.round(virtual.y+(enemy.x-virtual.x)*.6+(enemy.y-virtual.y)*.35)};
        const target=retreat?{x:virtual.x+(virtual.x-enemy.x),y:virtual.y+(virtual.y-enemy.y)}:mode==='flank'?flank:enemy;
        add('reposition',repeated('move')||repeated('skillMove')||repeated('blink')?1:retreat?6:mode==='flank'?5:3.5,{target});
      }else{
        const loot=obs.loot.filter(l=>canCollect(unit,l)&&(l.x!==virtual.x||l.y!==virtual.y)).sort((a,b)=>distance(virtual,a)-distance(virtual,b));
        add('reposition',8,{target:loot[0]||obs.lastSeen[0]||s.beacon});
        if(unit.class==='deadeye'&&!skillUsed&&obs.lastSeen.length)add('scan',2);
        if(unit.class==='halo'&&!skillUsed&&unit.hp<85)add('mend',5,{target:{...virtual}});
      }
      let draw=rng()*choices.reduce((sum,c)=>sum+c.weight,0),choice=choices.at(-1)?.action||{type:'guard'};
      for(const c of choices){draw-=c.weight;if(draw<=0){choice=c.action;break;}}
      if(choice.type==='reposition')choice=chooseMove(choice.target);
      if(choice.type==='shoot')ammo-=weapon.shots;
      if(choice.type==='reload')ammo=Math.min(weapon.mag,ammo+unit.reserve);
      if(choice.type==='heal')medkits--;if(choice.type==='grenade')grenades--;if(choice.type==='smoke')smoke--;
      if(['scan','reflect','firebomb','stasis','mend','blink','skillMove'].includes(choice.type))skillUsed=true;
      plan.push(choice);
    }
    return plan.slice(0, 2);
  }
  function emit(s, type, data = {}) { s.events.push({ tick: s.tick, turn: s.turn, type, ...data }); }

  // Even-sized areas extend one extra tile east/south from the selected tile.
  function areaBounds(p,width=p.width||3,height=p.height||3){const left=p.x-Math.floor((width-1)/2),top=p.y-Math.floor((height-1)/2);return{left,top,right:left+width-1,bottom:top+height-1,width,height};}
  function skillArea(kind,p){const shape=SKILL_AREAS[kind];return areaBounds(p,shape?.width||3,shape?.height||3);}
  function inArea(p,b){return p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom;}
  function inField(s,p,kind){return (s.fields||[]).some(f=>f.kind===kind&&f.expires>s.turn&&inArea(p,areaBounds(f)));}
  function observedFields(s,u){return (s.fields||[]).filter(f=>{if(f.expires<=s.turn)return false;const b=areaBounds(f);for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)if(terrainVisible(s,u,{x,y},sightRange(u)))return true;return false;});}
  function slowBudget(s,u,from=u){return inField(s,from,'stasis')?0:Infinity;}
  function moveRange(s,u){return Math.min(slowBudget(s,u),Math.max(1,Math.min(5,CLASSES[u.class].move+Math.round(F.stats(u).move))));}
  function movementForecast(s,u,plan=[]){
    let from={x:u.x,y:u.y},slowed=inField(s,u,'stasis'),spent=0;let fields=[...(s.fields||[])];
    for(const a of plan){
      if(a.type==='stasis'&&a.target){fields.push({...a.target,...SKILL_AREAS.stasis,kind:'stasis',expires:s.turn+SKILL_AREAS.stasis.turns});slowed=inField({...s,fields},from,'stasis');}
      if(!['move','skillMove','blink'].includes(a.type))continue;
      for(const p of a.path||[a.target].filter(Boolean)){
        slowed=inField({...s,fields},p,'stasis');if(slowed)spent++;from={x:p.x,y:p.y};
      }
    }
    return {from,slowed,spent,remaining:slowed?0:Infinity,fields};
  }
  function weaponStats(u){const w=WEAPONS[u.weapon];return {...w,range:w.range*(u.class==='deadeye'&&u.scan>0?1+SKILLS.scanRangeBonus:1),mag:F.magazine(u,w)};}
  // Shared by actual shots and the aiming envelope, including the last burst round.
  function recoilSpread(u,burstIndex=0,focused=u.class==='deadeye'&&u.scan>0){const w=WEAPONS[u.weapon];return w.recoilDeg*(w.shots>1?1+burstIndex*.18:1)*Math.PI/180*(focused?.35:1)*F.stats(u).recoil;}
  function normalizeEquipment(s){for(const u of s.units){for(const type of u.weapons||[]){u.weaponAmmo[type]=Math.min(u.weaponAmmo[type],F.magazine(u,WEAPONS[type]));}u.ammo=Math.min(u.ammo,F.magazine(u,WEAPONS[u.weapon]));}}
  function beginTurn(s, plans) {
    s.phase = 'resolution'; s.clash = null; s._tickMoves = null; s._tickEventStart=null; s.clashSerial = s.clashSerial || 0; s.tick = 0; s.events = []; s.projectiles = []; s.grenades = []; s.canisters=[]; s.schedule = []; s.canceled = new Set(); s.plans = plans; s.shotgunHits = {};s.volleySerial=0;F.startTurn(s);
    for (const u of s.units) { u.guard = false; u.moved = false; u.blinkUses = 0; u.fateFinalVolley=false; u.dodgeUntil = -1;u.stasisSteps=0;u.stasisTurn=inField(s,u,'stasis')?s.turn:0; if (!u.alive) continue;
      let projected = { x: u.x, y: u.y };
      (plans[u.id] || [{ type: 'wait' }, { type: 'wait' }]).slice(0, 2).forEach((a, slot) => {
        const base = slot * 40, actionId = u.id + ':' + slot;
        const add = (at, type, extra = {}) => s.schedule.push({ at: base + at, unitId: u.id, actionId, type, ...extra });
        if (a.type === 'move' || a.type === 'skillMove') {
          const stepTime = u.class === 'volt' ? 4 : 5;
          let previous = projected;
          (a.path || []).forEach((p, n) => { add(4 + n * stepTime, 'move', { target: p, delta: { x: p.x - previous.x, y: p.y - previous.y }, dodge: a.type === 'skillMove' }); previous = p; });
          projected = { ...previous };
          if (a.type === 'skillMove') add(0, 'skillCost');
        } else if (a.type === 'blink') { add(4, 'blink', { target: a.target }); projected = { ...a.target }; }
        else if (a.type === 'scan') add(1, 'scan');
        else if (a.type === 'reflect') add(1, 'reflect');
        else if (['firebomb','stasis','mend'].includes(a.type)) add(8, a.type, { target: a.target });
        else if (a.type === 'shoot') {
          const w = WEAPONS[u.weapon];
          const angle = Number.isFinite(a.angle) ? a.angle : Math.atan2(a.target.y - projected.y, a.target.x - projected.x);
          for (let n = 0; n < w.shots; n++) add(Math.max(2,w.delay+F.stats(u).shootDelay) + n * w.spacing, 'shoot', { angle, first: n === 0,burstIndex:n });
        } else if (a.type === 'slash') { add(6, 'slash', { angle: a.angle });
        } else if (a.type === 'guard') add(1, 'guard');
        else if (a.type === 'reload') add(12+F.stats(u).reloadDelay, 'reload');
        else if (a.type === 'heal') add(20+F.stats(u).healDelay, 'heal');
        else if (a.type === 'grenade') add(10, 'grenade', { target: a.target });
        else if (a.type === 'smoke') add(8, 'smoke', { target: a.target });
      });
    }
  }
  const RPS = ['rock','paper','scissors'];
  function clashWinner(a,b) { return a===b ? 0 : ((a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')) ? 1 : -1; }
  function clashRandom(s, salt=0) { return random((s.seed ^ Math.imul(s.turn,2654435761) ^ Math.imul(s.tick+1,2246822519) ^ Math.imul(s.clashSerial+salt,3266489917))>>>0); }
  function chooseClash(s, id, choice, clashId=s.clash?.id) {
    const c=s.clash;
    if (s.phase!=='clash' || !c || c.id!==clashId || !c.ids.includes(id) || c.choices[id] || !RPS.includes(choice)) return false;
    c.choices[id]=choice; return true;
  }
  function moveActor(s,m) {
    const u=s.units[m.unitId],from={x:u.x,y:u.y};if(u.stasisTurn===s.turn||inField(s,from,'stasis')||inField(s,m.target,'stasis')){u.stasisTurn=s.turn;u.stasisSteps=(u.stasisSteps||0)+1;}u.facing=Math.atan2(m.target.y-u.y,m.target.x-u.x);u.x=m.target.x;u.y=m.target.y;u.moved=true;
    if(m.dodge)u.dodgeUntil=Math.floor(s.tick/40)*40+39;
    emit(s,m.type==='blink'?'blink':'move',{unitId:u.id,from,x:u.x,y:u.y});pickupAt(s,u);
  }
  function collisionDamage(s,winnerId,loserId,source,damage=CLASH.damage) {
    const loser=s.units[loserId];if(!loser.alive)return 0;
    const amount=Math.min(damage,s.practice&&loserId===0?Math.max(0,loser.hp-1):loser.hp);loser.hp-=amount;
    if(winnerId===0)s.damage+=amount;
    emit(s,'damage',{unitId:loserId,owner:winnerId,x:loser.x,y:loser.y,amount,reason:'clash',bypassShield:true,...(source?{source}:{})});
    if(loser.hp<=0){loser.hp=0;loser.alive=false;if(winnerId===0)s.kills++;emit(s,'eliminated',{unitId:loserId,owner:winnerId,x:loser.x,y:loser.y,reason:'clash',...(source?{source}:{})});}
    return amount;
  }
  function dashIntent(s,m){return m?.type==='move'&&m.dodge&&s.units[m.unitId].class==='vanguard';}
  function interruptMovement(s,id,intents) {
    // The actor may be between scheduled steps when struck. Cancel its current
    // action slot, keeping its next action (and its relative route) intact.
    const actionId=id+':'+Math.floor(s.tick/40),action=s.plans?.[id]?.[Math.floor(s.tick/40)];
    if(['move','skillMove','blink'].includes(action?.type))s.canceled.add(actionId);
    for(const m of intents)if(m.unitId===id)s.canceled.add(m.actionId);
  }
  function chargeContact(s,m,contacts,intents) {
    const charger=s.units[m.unitId],counter=intents.find(n=>contacts.some(u=>u.id===n.unitId)&&dashIntent(s,n));
    // Two simultaneous charges stop one another without choosing an ID-based
    // winner or opening a rock-paper-scissors timer.
    if(counter){collisionDamage(s,m.unitId,counter.unitId,'dash',SKILLS.dashDamage);collisionDamage(s,counter.unitId,m.unitId,'dash',SKILLS.dashDamage);interruptMovement(s,m.unitId,intents);interruptMovement(s,counter.unitId,intents);return;}
    const dx=m.target.x-charger.x,dy=m.target.y-charger.y,positions=new Map(),hits=new Set();
    // Damage once in this contact step, and again on every subsequent push.
    const hit=u=>{if(hits.has(u.id))return;hits.add(u.id);interruptMovement(s,u.id,intents);collisionDamage(s,m.unitId,u.id,'dash',SKILLS.dashDamage);};
    for(const u of contacts)hit(u);
    function push(u,to){
      hit(u);if(!u.alive)return true;
      if(!passable(s,to.x,to.y))return false;
      const occupant=s.units.find(other=>{const p=positions.get(other.id)||other;return other.alive&&other.id!==u.id&&p.x===to.x&&p.y===to.y;});
      if(occupant&&(occupant.id===charger.id||sameTeam(s,charger,occupant)||!push(occupant,{x:to.x+dx,y:to.y+dy})))return false;
      positions.set(u.id,to);return true;
    }
    const ahead={x:m.target.x+dx,y:m.target.y+dy};
    if(!contacts.every(u=>positions.has(u.id)||push(u,ahead))){
      s.canceled.add(m.actionId);emit(s,'blocked',{unitId:charger.id,x:charger.x,y:charger.y,reason:'dashPush'});return;
    }
    // Plan the entire push before moving anyone, so blocked chains never
    // overlap or send a victim sideways or into impassable terrain.
    for(const [id,to]of positions){const u=s.units[id];if(!u.alive)continue;const from={x:u.x,y:u.y};u.x=to.x;u.y=to.y;u.moved=true;
      emit(s,'knockback',{unitId:id,owner:charger.id,from,contact:contacts.some(v=>v.id===id)?{...m.target}:from,x:u.x,y:u.y,source:'dash'});pickupAt(s,u);
    }
    moveActor(s,m);
  }
  function settleClash(s, auto=false) {
    const c=s.clash;if(s.phase!=='clash'||!c)return null;
    const rng=clashRandom(s,c.round*17);
    for(const id of c.ids)if(!c.choices[id]&&(auto||!s.units[id].alive||!(s.humanIds||[]).includes(id)))c.choices[id]=RPS[Math.floor(rng()*3)];
    if(c.ids.some(id=>!c.choices[id]))return null;
    let result=clashWinner(c.choices[c.ids[0]],c.choices[c.ids[1]]);
    if(!s.units[c.ids[0]].alive)result=-1;else if(!s.units[c.ids[1]].alive)result=1;
    if(!result){
      const choices={...c.choices};emit(s,'clashTie',{x:c.target.x,y:c.target.y,ids:c.ids,choices});
      c.round++;c.id=++s.clashSerial;c.choices={};return {tie:true,ids:[...c.ids],choices};
    }
    const winnerId=c.ids[result===1?0:1],loserId=c.ids[result===1?1:0],winner=s.units[winnerId],loser=s.units[loserId];
    const winnerMove=c.intents.find(m=>m.unitId===winnerId&&m.target.x===c.target.x&&m.target.y===c.target.y), loserMove=c.intents.find(m=>m.unitId===loserId);
    if(winnerMove)c.target={...winnerMove.target};
    // Only legal empty cardinal neighbors of the contact tile can receive a bump.
    // The moving winner's old cell becomes vacant; it is a safe fallback in tight corridors.
    const options=CARDINAL.map(([dx,dy])=>({x:c.target.x+dx,y:c.target.y+dy})).filter(p=>passable(s,p.x,p.y)&&!s.units.some(u=>u.alive&&u.id!==loserId&&!(u.id===winnerId&&winnerMove)&&u.x===p.x&&u.y===p.y));
    const from={x:loser.x,y:loser.y};const dest=options.length?options[Math.floor(rng()*options.length)]:null;
    if(loserMove)s.canceled.add(loserMove.actionId);
    if(!dest&&loser.alive){if(winnerMove)s.canceled.add(winnerMove.actionId);}
    else {
      if(loser.alive){loser.x=dest.x;loser.y=dest.y;loser.moved=true;pickupAt(s,loser);}
      if(winnerMove&&winner.alive)moveActor(s,winnerMove);
    }
    if(s._tickMoves)s._tickMoves=s._tickMoves.filter(m=>m.unitId!==winnerId&&m.unitId!==loserId);
    const outcome={ids:[...c.ids],winner:winnerId,loser:loserId,choices:{...c.choices},from,to:dest,contact:{...c.target},standoff:!dest};
    emit(s,'clashResult',{unitId:winnerId,x:c.target.x,y:c.target.y,...outcome});
    if(dest&&loser.alive)emit(s,'knockback',{unitId:loserId,owner:winnerId,x:dest.x,y:dest.y,from,contact:{...c.target}});
    if(loser.alive)outcome.damage=collisionDamage(s,winnerId,loserId);
    s.clash=null;s.phase='resolution';return outcome;
  }
  function resolveMoves(s, intents) {
    if(!Number.isFinite(s.clashSerial))s.clashSerial=0;
    const legal=[];
    for(const m of intents){
      const u=s.units[m.unitId];
      if(!u.alive||s.canceled.has(m.actionId))continue;
      if((!m.dodge&&m.type!=='blink'&&slowBudget(s,u)<=0)||!passable(s,m.target.x,m.target.y)||(m.type!=='blink'&&Math.abs(u.x-m.target.x)+Math.abs(u.y-m.target.y)!==1)){
        s.canceled.add(m.actionId);emit(s,'blocked',{unitId:u.id,x:u.x,y:u.y});
      }else legal.push(m);
    }
    // Resolve chains ending in free cells before asking for a duel. This also
    // vacates a third actor's cell before multiple contenders enter it.
    let progress=true;
    while(progress){progress=false;for(let i=0;i<legal.length;i++){const m=legal[i];if(legal.filter(n=>n.target.x===m.target.x&&n.target.y===m.target.y).length!==1||s.units.some(u=>u.alive&&u.id!==m.unitId&&u.x===m.target.x&&u.y===m.target.y))continue;moveActor(s,m);legal.splice(i,1);progress=true;break;}}
    // Charge contacts resolve before ordinary walking duels. Actors that can
    // vacate their cell still move normally; crossing paths alone is not a hit.
    for(const m of [...legal].filter(n=>dashIntent(s,n)).sort((a,b)=>a.unitId-b.unitId)){
      const charger=s.units[m.unitId],occupant=s.units.find(u=>u.alive&&u.id!==charger.id&&u.x===m.target.x&&u.y===m.target.y);
      const leaving=occupant&&legal.find(n=>n.unitId===occupant.id);
      const contenders=legal.filter(n=>n!==m&&n.target.x===m.target.x&&n.target.y===m.target.y).map(n=>s.units[n.unitId]);
      if(occupant&&(sameTeam(s,charger,occupant)||leaving&&!contenders.length&&(leaving.target.x!==charger.x||leaving.target.y!==charger.y)))continue;
      if(!occupant&&contenders.some(u=>sameTeam(s,charger,u)))continue;
      const contacts=[...(occupant?[occupant]:[]),...contenders].filter((u,i,list)=>opponents(s,charger,u)&&list.findIndex(v=>v.id===u.id)===i);
      if(!contacts.length)continue;
      chargeContact(s,m,contacts,legal);
      return resolveMoves(s,legal.filter(n=>n!==m));
    }
    let pair=null,target=null;
    // Same destination, direct swaps, and entry into a stationary actor are contacts.
    for(let i=0;i<legal.length&&!pair;i++)for(let j=i+1;j<legal.length;j++){
      const a=legal[i],b=legal[j],ua=s.units[a.unitId],ub=s.units[b.unitId];
      if(a.target.x===b.target.x&&a.target.y===b.target.y || a.target.x===ub.x&&a.target.y===ub.y&&b.target.x===ua.x&&b.target.y===ua.y){pair=[a.unitId,b.unitId];target={...a.target};break;}
    }
    if(!pair)for(const m of legal){const occupant=s.units.find(u=>u.alive&&u.id!==m.unitId&&u.x===m.target.x&&u.y===m.target.y);if(occupant&&!legal.some(n=>n.unitId===occupant.id)){pair=[m.unitId,occupant.id];target={...m.target};break;}}
    if(pair&&sameTeam(s,s.units[pair[0]],s.units[pair[1]])){
      const moves=legal.filter(m=>pair.includes(m.unitId));const a=s.units[pair[0]],b=s.units[pair[1]];
      if(moves.length===2&&moves[0].target.x===b.x&&moves[0].target.y===b.y&&moves[1].target.x===a.x&&moves[1].target.y===a.y){for(const m of moves)moveActor(s,m);}else for(const m of moves){s.canceled.add(m.actionId);emit(s,'blocked',{unitId:m.unitId,x:s.units[m.unitId].x,y:s.units[m.unitId].y,reason:'teammate'});}
      return resolveMoves(s,legal.filter(m=>!pair.includes(m.unitId)));
    }
    if(pair){
      const occupied=s.units.find(u=>u.alive&&u.x===target.x&&u.y===target.y&&!pair.includes(u.id));if(occupied)pair=[pair[0],occupied.id];
      s._tickMoves=legal;s.clash={id:++s.clashSerial,ids:pair,target,intents:legal.filter(m=>pair.includes(m.unitId)),choices:{},round:1};s.phase='clash';
      emit(s,'clashStart',{x:target.x,y:target.y,ids:pair});
      // Headless/bot-only games do not need a popup. Human choices stay sealed.
      if(!pair.some(id=>(s.humanIds||[]).includes(id))){while(s.phase==='clash')settleClash(s,true);return resolveMoves(s,s._tickMoves||[]);}
      return false;
    }
    for(const m of legal)moveActor(s,m);
    s._tickMoves=null;return true;
  }
  function spawnBullet(s, u, aim, angleOffset = 0, damage, shotId = null) {
    const w = WEAPONS[u.weapon], angle = aim + angleOffset;
    s.projectiles.push({ owner: u.id, x: u.x + .5, y: u.y + .5, dx: Math.cos(angle), dy: Math.sin(angle), damage: damage || w.damage, multiplier:F.stats(u).damage*(u.fateFinalVolley?1+(F.stats(u).lastBullet||0):1), left: weaponStats(u).range, traveled: 0, speed: w.speed, born: s.tick, weapon: u.weapon, shotId });
  }
  function segmentHitsCircle(ax, ay, bx, by, cx, cy, radius = .32) {
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / length2)) : 0;
    return Math.hypot(ax + dx * t - cx, ay + dy * t - cy) <= radius;
  }
  // Shared by flight and aiming. Compare exact entry distances so a body in
  // front of a wall is hit first, even when both occur within one flight step.
  function projectileCollision(s,ax,ay,bx,by,owner,include=()=>true) {
    const dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy),radius=V.BODY_RADIUS;
    if(!length)return {kind:'clear',point:{x:bx,y:by},distance:0};
    const ux=dx/length,uy=dy/length,terrain=V.ray(s,{x:ax,y:ay},ux,uy,length,false);
    let distance=length,kind='clear',cell,unitId;
    if(terrain.kind==='wall'&&terrain.distance<=length){distance=terrain.distance;cell=terrain.cell;kind=tile(s,cell.x,cell.y)?'wall':'boundary';}
    for(const u of s.units){
      if(!u.alive||!opponents(s,s.units[owner],u)||!include(u))continue;
      const rx=u.x+.5-ax,ry=u.y+.5-ay,along=rx*ux+ry*uy,across=Math.max(0,rx*rx+ry*ry-along*along);
      if(across>radius*radius+1e-12)continue;
      const half=Math.sqrt(Math.max(0,radius*radius-across)),entry=Math.max(0,along-half);
      if(along+half<0||entry>length||entry>distance||kind!=='clear'&&entry>=distance-1e-9)continue;
      distance=entry;kind='unit';unitId=u.id;cell={x:u.x,y:u.y};
    }
    return {kind,point:{x:ax+ux*distance,y:ay+uy*distance},distance,...(cell?{cell}:{}),...(unitId!==undefined?{unitId}:{})};
  }
  function segmentWall(s, ax, ay, bx, by) {
    const sx = Math.floor(ax), sy = Math.floor(ay), ex = Math.floor(bx), ey = Math.floor(by), cells = [];
    if (sx !== ex && sy !== ey) {
      const tx = ((bx > ax ? ex : sx) - ax) / (bx - ax), ty = ((by > ay ? ey : sy) - ay) / (by - ay);
      if (tx <= ty + 1e-9) cells.push({ x: ex, y: sy });
      if (ty <= tx + 1e-9) cells.push({ x: sx, y: ey });
    }
    cells.push({ x: ex, y: ey });
    return cells.find(p => ['wall', 'barricade'].includes(tile(s, p.x, p.y)?.type));
  }
  function step(s) {
    if (s.phase !== 'resolution') return [];
    const eventStart = s.events.length, pending = [], terrainDamage = new Map(), at = s.schedule.filter(e => e.at === s.tick && s.units[e.unitId].alive && !s.canceled.has(e.actionId));
    if(s._tickEventStart==null)s._tickEventStart=eventStart;
    if (!s._tickMoves) {
      const moves=at.filter(e=>e.type==='move'||e.type==='blink').map(e=>e.delta?{...e,target:{x:s.units[e.unitId].x+e.delta.x,y:s.units[e.unitId].y+e.delta.y}}:e);
      s._tickMoves=moves.filter(m=>{const u=s.units[m.unitId];if(m.type==='blink'){if(u.class!=='volt'||(u.skillCooldown>0&&!(u.blinkUses>0))||(u.blinkUses||0)>=SKILLS.blinkUses||!visible(s,u,m.target,SKILLS.blinkRange))return false;u.blinkUses=(u.blinkUses||0)+1;u.skillCooldown=SKILLS.mobilityCooldown+1;}return true;});
    }
    if (!resolveMoves(s,s._tickMoves)) return s.events.slice(eventStart);
    for (const e of at.filter(e => e.type !== 'move' && e.type !== 'blink')) {
      const u = s.units[e.unitId];
      if(!u.alive||s.canceled.has(e.actionId))continue;
      if (e.type === 'skillCost') { if (u.skillCooldown > 0) s.canceled.add(e.actionId); else { u.skillCooldown = SKILLS.mobilityCooldown + 1; u.dodgeUntil=s.tick+SKILLS.dashDodgeTicks; } }
      if (e.type === 'scan' && u.skillCooldown === 0) { u.scan = SKILLS.scanTurns; u.skillCooldown = 4; emit(s, 'scan', { unitId: u.id, x: u.x, y: u.y }); }
      if (e.type === 'reflect' && u.class === 'rook' && u.skillCooldown === 0) {
        u.skillCooldown = 5; u.shield = Math.min(F.stats(u).shield, u.shield + 12); u.reflectTurn = s.turn; u.reflectCharges = SKILLS.reflectShots;
        emit(s, 'reflectReady', { unitId: u.id, x: u.x, y: u.y });
      }
      if(['firebomb','stasis','mend'].includes(e.type)&&CLASSES[u.class].skillType===e.type&&u.skillCooldown===0&&tile(s,e.target.x,e.target.y)&&distance(u,e.target)<=5&&(e.type==='firebomb'||passable(s,e.target.x,e.target.y))){
        u.facing=Math.atan2(e.target.y-u.y,e.target.x-u.x);u.skillCooldown=e.type==='firebomb'?4:5;
        s.canisters.push({owner:u.id,item:e.type,x:e.target.x,y:e.target.y,from:{x:u.x,y:u.y},born:s.tick,land:s.tick+THROW.skillTicks});
        emit(s,'throw',{unitId:u.id,from:{x:u.x,y:u.y},x:e.target.x,y:e.target.y,item:e.type,flightTicks:THROW.skillTicks});
      }
      if (e.type === 'guard') { u.guard = true; emit(s, 'guard', { unitId: u.id, x: u.x, y: u.y }); }
      if (e.type === 'reload' && u.reserve > 0) { const amount = Math.min(weaponStats(u).mag - u.ammo, u.reserve); u.ammo += amount; u.reserve -= amount; emit(s, 'reload', { unitId: u.id, amount }); }
      if (e.type === 'heal' && u.medkits > 0) { u.medkits--; pending.push({ target: u.id, heal: F.stats(u).heal }); emit(s, 'heal', { unitId: u.id, x: u.x, y: u.y, amount: Math.min(F.stats(u).heal, F.stats(u).maxHp - u.hp) }); }
      if (e.type === 'shoot' && u.ammo > 0 && !(WEAPONS[u.weapon].stationary && u.moved)) {
        if(e.first)u.fateFinalVolley=u.ammo<=WEAPONS[u.weapon].shots;u.ammo--; if (u.id === 0) s.shots++;
        u.facing=e.angle;
        const w = WEAPONS[u.weapon], focusBonus=(e.first?F.stats(u).firstHit:0)+(u.class==='deadeye'&&u.scan>0&&e.first?15:0);
        // Server-owned, reproducible shot noise; does not advance map/bot RNG.
        const rng = random((s.seed ^ Math.imul(s.turn, 2654435761) ^ Math.imul(s.tick, 2246822519) ^ Math.imul(u.id + 1, 3266489917)) >>> 0);
        const recoil = (rng() + rng() - 1) * recoilSpread(u,e.burstIndex||0), angle = e.angle + recoil;
        if(w.spread){const shotId=++s.volleySerial;for(const offset of w.spread){const central=offset===0;spawnBullet(s,u,angle,offset,u.weapon==='shotgun'?(central?48:16):w.damage,shotId);if(central&&focusBonus)s.projectiles.at(-1).precision=focusBonus;}}
        else spawnBullet(s,u,angle,0,w.damage+focusBonus);
        emit(s, 'shoot', { unitId: u.id, x: u.x, y: u.y, angle, recoil, weapon: u.weapon, first: e.first });
      }
      if (e.type === 'slash' && Number.isFinite(e.angle)) {
        u.facing=e.angle;emit(s, 'slash', { unitId: u.id, x: u.x, y: u.y, angle: e.angle });
        for (let y = u.y - 1; y <= u.y + 1; y++) for (let x = u.x - 1; x <= u.x + 1; x++) {
          const t = tile(s, x, y); if (t?.type !== 'barricade' || Math.hypot(x - u.x, y - u.y) > 1.5) continue;
          const delta = Math.atan2(Math.sin(Math.atan2(y - u.y, x - u.x) - e.angle), Math.cos(Math.atan2(y - u.y, x - u.x) - e.angle));
          if (Math.abs(delta) <= Math.PI / 3 + .0001) terrainDamage.set(key(x, y), (terrainDamage.get(key(x, y)) || 0) + 45);
        }
        for (const victim of s.units) if (victim.alive && opponents(s,u,victim) && distance(u, victim) <= 1.5 && terrainVisible(s, u, victim, 1.5)) {
          if (victim.x !== u.x && victim.y !== u.y && (!passable(s, victim.x, u.y) || !passable(s, u.x, victim.y))) continue;
          const direction = Math.atan2(victim.y - u.y, victim.x - u.x), delta = Math.atan2(Math.sin(direction - e.angle), Math.cos(direction - e.angle));
          if (Math.abs(delta) <= Math.PI / 3 + .0001){pending.push({target:victim.id,owner:u.id,damage:Math.min(70,F.stats(u).melee+(u.hp<45?(F.stats(u).lowMelee||0):0)),melee:true,origin:{x:u.x,y:u.y}});if(!u.fateOnce.slash){u.fateOnce.slash=true;u.shield=Math.min(F.stats(u).shield,u.shield+F.stats(u).slashShield);}}
        }
      }
      if (e.type === 'grenade' && u.grenades > 0 && distance(u, e.target) <= 6) { u.facing=Math.atan2(e.target.y-u.y,e.target.x-u.x);u.grenades--; s.grenades.push({ owner: u.id, x: e.target.x, y: e.target.y, born:s.tick,from:{x:u.x,y:u.y},explode: s.tick + THROW.grenadeTicks,radius:F.stats(u).radius }); emit(s, 'throw', { unitId: u.id, from: { x: u.x, y: u.y }, x: e.target.x, y: e.target.y,item:'grenade',flightTicks:THROW.grenadeTicks }); }
      if(e.type==='smoke'&&u.smoke>0&&distance(u,e.target)<=5){u.facing=Math.atan2(e.target.y-u.y,e.target.x-u.x);u.smoke--;s.canisters.push({owner:u.id,x:e.target.x,y:e.target.y,from:{x:u.x,y:u.y},born:s.tick,land:s.tick+THROW.smokeTicks});emit(s,'throw',{unitId:u.id,from:{x:u.x,y:u.y},x:e.target.x,y:e.target.y,item:'smoke',flightTicks:THROW.smokeTicks});}

    }
    for(const c of s.canisters||[])if(c.land===s.tick){
      if(c.item==='firebomb'){
        const b=skillArea(c.item,c),ignited=[],castId=s.turn+':'+s.tick+':'+c.owner;
        // Cells share this cast's hit history. Leaving and re-entering another
        // cell of the same Molly cannot refresh or repeat its attached burn.
        for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)if(passable(s,x,y)&&tile(s,x,y).type!=='water')s.fires.push({x,y,owner:c.owner,expires:s.turn+SKILL_AREAS.firebomb.turns,castId,ignited});
        emit(s,'firebomb',{unitId:c.owner,x:c.x,y:c.y,width:b.width,height:b.height});
      }
      else if(c.item==='stasis'||c.item==='mend'){s.fields=s.fields||[];const shape=SKILL_AREAS[c.item];s.fields.push({kind:c.item,x:c.x,y:c.y,width:shape.width,height:shape.height,owner:c.owner,expires:s.turn+shape.turns});emit(s,'fieldDeploy',{unitId:c.owner,kind:c.item,x:c.x,y:c.y,width:shape.width,height:shape.height});}
      else{s.smokes.push({x:c.x,y:c.y,expires:s.turn+2,born:s.tick,bornTurn:s.turn});emit(s,'smoke',{unitId:c.owner,x:c.x,y:c.y});}
    }
    for(const f of s.fields||[])if(f.kind==='mend'&&f.expires>s.turn&&s.tick>=20&&f.pulseTurn!==s.turn){f.pulseTurn=s.turn;for(const u of s.units)if(u.alive&&(s.mode!=='team'||sameTeam(s,s.units[f.owner],u))&&inArea(u,areaBounds(f))&&u.mendPulseTurn!==s.turn){u.mendPulseTurn=s.turn;const hp=u.hp,shield=u.shield;u.hp=Math.min(F.stats(u).maxHp,u.hp+SKILLS.mendHp);u.shield=Math.min(F.stats(u).shield,u.shield+SKILLS.mendShield);emit(s,'fieldPulse',{unitId:u.id,x:u.x,y:u.y,amount:u.hp-hp,shield:u.shield-shield});}}
    s.canisters=(s.canisters||[]).filter(c=>c.land>s.tick);
    for(const f of s.fires||[])if(f.expires>s.turn&&passable(s,f.x,f.y)&&tile(s,f.x,f.y).type!=='water'){
      const ignited=f.ignited||(f.ignited=[]);
      for(const u of s.units)if(u.alive&&u.x===f.x&&u.y===f.y&&(u.id===f.owner||!sameTeam(s,s.units[f.owner],u))&&!ignited.includes(u.id)){
        ignited.push(u.id);
        if(!(u.burn?.remainingTicks>0&&u.burn.expires>s.turn))u.burn={owner:f.owner,remainingTicks:4,expires:s.turn+2,appliedTurn:s.turn,appliedTick:s.tick,pulseTurn:s.turn,pulses:0};
      }
    }
    for(const u of s.units)if(u.alive&&u.burn){
      const burn=u.burn;if(burn.expires<=s.turn||burn.remainingTicks<=0){delete u.burn;continue;}
      if(burn.pulseTurn!==s.turn){burn.pulseTurn=s.turn;burn.pulses=0;}
      // A late second action still delivers two ticks in its application turn.
      const applied=burn.appliedTurn===s.turn,start=applied?burn.appliedTick:0,pulses=[Math.max(20,start),Math.max(60,Math.min(79,start+1))];
      while(burn.pulses<2&&burn.remainingTicks>0&&s.tick>=pulses[burn.pulses]){burn.pulses++;burn.remainingTicks--;pending.push({target:u.id,owner:burn.owner,damage:SKILLS.burnDamage,burn:true,origin:{x:u.x,y:u.y}});}
    }
    for (const grenade of s.grenades.filter(g => g.explode === s.tick)) {
      emit(s, 'explosion', { x: grenade.x, y: grenade.y, owner: grenade.owner });
      for (const u of s.units) if (u.alive && cheb(u, grenade) <= F.stats(s.units[grenade.owner]).radius) pending.push({ target: u.id, owner: grenade.owner, damage:(cheb(u,grenade)===0?50:30)+F.stats(s.units[grenade.owner]).blastDamage, blast: true, origin: grenade });
      for (let y = grenade.y - F.stats(s.units[grenade.owner]).radius; y <= grenade.y + F.stats(s.units[grenade.owner]).radius; y++) for (let x = grenade.x - F.stats(s.units[grenade.owner]).radius; x <= grenade.x + F.stats(s.units[grenade.owner]).radius; x++) { const t = tile(s, x, y); if (t && t.hp > 0) terrainDamage.set(key(x, y), (terrainDamage.get(key(x, y)) || 0) + 70); }
    }
    s.grenades = s.grenades.filter(g => g.explode > s.tick);
    const remaining = [];
    for (const b of s.projectiles) {
      if (b.left <= 1e-9) continue;
      if (b.born === s.tick) { remaining.push(b); continue; }
      let hit = false;
      for (let n = 0; n < 5 && !hit; n++) {
        const stepSize = Math.min(b.speed / 5, b.left), collision=projectileCollision(s,b.x,b.y,b.x+b.dx*stepSize,b.y+b.dy*stepSize,b.owner);
        b.x=collision.point.x;b.y=collision.point.y;b.left-=collision.distance;b.traveled+=collision.distance;
        const x = Math.floor(b.x), y = Math.floor(b.y), t = tile(s, x, y);
        if (collision.kind==='boundary'||!t) { hit = true; break; }
        const wall = collision.kind==='wall'?collision.cell:null;
        if (wall) { terrainDamage.set(key(wall.x, wall.y), (terrainDamage.get(key(wall.x, wall.y)) || 0) + b.damage); emit(s, 'impact', { x: wall.x, y: wall.y }); hit = true; break; }
        const victim = collision.kind==='unit'?s.units[collision.unitId]:null;
        if (victim) {
          if (victim.dodgeUntil >= s.tick) { emit(s,'dodge',{unitId:victim.id,x,y});hit=true;break; }
          if (victim.reflectTurn === s.turn && victim.reflectCharges > 0 && !b.reflections?.includes(victim.id)) {
            const incomingOwner=b.owner;const incoming=((b.weapon==='shotgun'&&b.damage===48?(b.traveled<=2.5?48:b.traveled<=3.5?32:16):b.damage)+(b.precision||0))*(b.multiplier||1);
            let absorbedDamage=incoming*(1-SKILLS.reflectAbsorb);
            if(b.shotId){const k=b.shotId+':'+victim.id,previous=s.shotgunHits[k]||0;absorbedDamage=Math.max(0,absorbedDamage-previous);s.shotgunHits[k]=Math.max(previous,incoming*(1-SKILLS.reflectAbsorb));}
            if(absorbedDamage>0)pending.push({target:victim.id,owner:incomingOwner,damage:absorbedDamage,origin:{x:victim.x-b.dx*2,y:victim.y-b.dy*2},weapon:b.volleyWeapon||b.weapon,shotId:b.shotId});
            b.reflections=[...(b.reflections||[]),victim.id];b.owner = victim.id; b.dx = -b.dx; b.dy = -b.dy;
            if (b.weapon === 'shotgun' && b.damage === 48) b.damage = b.traveled <= 2.5 ? 48 : b.traveled <= 3.5 ? 32 : 16;
            b.damage=(b.damage+(b.precision||0))*SKILLS.reflectDamage;delete b.precision;
            b.volleyWeapon=b.volleyWeapon||b.weapon;b.weapon = 'reflected'; b.left = Math.max(.2, b.traveled); b.traveled = 0; b.born = s.tick;
            remaining.push(b); emit(s, 'reflected', { unitId: victim.id, x: victim.x, y: victim.y }); hit = true; break;
          }
          
          if (victim.dodgeUntil >= s.tick) emit(s, 'dodge', { unitId: victim.id, x, y });
          else {
            const baseDamage = (b.weapon === 'shotgun' && b.damage === 48 ? b.traveled <= 2.5 ? 48 : b.traveled <= 3.5 ? 32 : 16 : b.damage)+(b.precision||0);
            let damage = baseDamage*(b.multiplier||1);
            if (b.shotId) { const k = b.shotId + ':' + victim.id, previous = s.shotgunHits[k] || 0; damage = Math.max(0, damage - previous); s.shotgunHits[k] = Math.max(previous, baseDamage*(b.multiplier||1)); }
            if (damage > 0) pending.push({ target: victim.id, owner: b.owner, damage, origin: { x: victim.x - b.dx * 2, y: victim.y - b.dy * 2 },weapon:b.volleyWeapon||b.weapon,shotId:b.shotId });
          }
          hit = true; break;
        }
        if (b.left <= 1e-9) hit = true;
      }
      if (!hit) remaining.push(b);
    }
    s.projectiles = remaining;
    // All hits use the same pre-damage positions, cover, and alive set.
    const totals = new Map();
    for (const p of pending) {
      if (!totals.has(p.target)) totals.set(p.target, { damage: 0, heal: 0, sources: [] });
      const total = totals.get(p.target), u = s.units[p.target];
      if(!p.heal&&p.owner!==u.id&&sameTeam(s,s.units[p.owner],u))continue;
      if (p.heal) { total.heal += p.heal; continue; }
      const t = tile(s, u.x, u.y);
      const cover = !p.burn && !p.blast && !p.melee && t.type === 'cover' && ((t.side === 'north' && p.origin.y < u.y) || (t.side === 'west' && p.origin.x < u.x));
      const damage = Math.round(p.damage * (p.blast?F.stats(u).blastTaken:1) * (p.burn ? 1 : Math.min(u.guard ? .6-F.stats(u).guardReduction : 1, cover ? .75 : 1)));
      total.damage += damage; total.sources.push({ owner: p.owner, damage });
      if (p.owner === 0 && u.id !== 0) s.damage += damage;
      emit(s, 'damage', { unitId: u.id, owner: p.owner, x: u.x, y: u.y, amount: damage, cover, ...(p.burn?{reason:'burn'}:{}),...(p.weapon==='shotgun'&&p.shotId!=null?{weapon:p.weapon,shotId:p.shotId}:{}) });
    }
    for (const [id, total] of totals) {
      const u = s.units[id], shieldDamage = Math.min(u.shield, total.damage); u.shield -= shieldDamage;
      u.hp = Math.max(s.practice&&id===0?1:0, Math.min(F.stats(u).maxHp, u.hp + total.heal - (total.damage - shieldDamage)));
      if (u.hp <= 0) { u.hp = 0; u.alive = false; const source = total.sources.sort((a, b) => b.damage - a.damage)[0]; if (source && source.owner === 0 && id !== 0) s.kills++; emit(s, 'eliminated', { unitId: id, owner: source ? source.owner : null, x: u.x, y: u.y }); }
    }
    if (terrainDamage.size) s.terrainVersion = (s.terrainVersion || 0) + 1;
    for (const [k, damage] of terrainDamage) { const [x, y] = k.split(',').map(Number), t = tile(s, x, y); t.hp -= damage; if (t.hp <= 0) { t.type = 'rubble'; t.hp = 0; emit(s, 'destroy', { x, y }); } }
    F.hooks(s,s.events.slice(s._tickEventStart));s._tickEventStart=null;
    s.tick++;
    if (s.tick >= 80) finishTurn(s);
    return s.events.slice(eventStart);
  }
  function zoneLimit(s,turn) { return turn<5?s.initialLimit:Math.max(.2,s.maxZoneRank-Math.floor((turn-5)/2)*1.5); }
  function platformRounds(s,t) {
    if(!t||t.type==='void'||t.rank>s.safeLimit)return 0;
    if(t.rank>s.nextLimit)return t.rank>zoneLimit(s,s.turn-1)?1:2;
    return null;
  }
  function collapsePlatforms(s) {
    let count=0;
    for(const row of s.tiles)for(const t of row)if(t.type!=='void'&&t.rank>s.safeLimit){t.type='void';t.hp=0;t.loot=null;t.fellTurn=s.turn;count++;}
    if(count){s.terrainVersion=(s.terrainVersion||0)+1;emit(s,'platformCollapse',{count});}
    for(const u of s.units)if(u.alive&&tile(s,u.x,u.y)?.type==='void'){u.hp=0;u.alive=false;emit(s,'fall',{unitId:u.id,x:u.x,y:u.y});emit(s,'eliminated',{unitId:u.id,owner:null,x:u.x,y:u.y,reason:'void'});}
    s.fires=(s.fires||[]).filter(f=>passable(s,f.x,f.y));s.fields=(s.fields||[]).filter(f=>passable(s,f.x,f.y));
  }
  function finishTurn(s) {
    // Flight belongs to resolution; never leave a tracer in planning/end frames.
    s.projectiles = [];
    F.endTurn(s);
    if(!s.practice)collapsePlatforms(s);
    for (const u of s.units) {
      u.guard = false;
      if (!u.alive) continue;
      if (u.skillCooldown > 0) u.skillCooldown--;
      if (u.scan > 0) u.scan--;
      u.reflectCharges = 0;
      const actions = s.plans[u.id] || []; u.idle = actions.every(a => ['wait', 'guard', 'heal', 'reload'].includes(a.type)) ? u.idle + 1 : 0;
    }
    const beaconRecharged=s.beacon.cooldown===1;
    if (s.beacon.cooldown > 0) s.beacon.cooldown--;
    s.smokes = s.smokes.filter(sm => sm.expires > s.turn);
    s.fires = (s.fires || []).filter(f => f.expires > s.turn + 1);
    s.fields=(s.fields||[]).filter(f=>f.expires>s.turn+1&&passable(s,f.x,f.y));
    if(s.practice){s.turn++;s.phase='planning';for(const u of s.units)if(u.alive)releasePickups(s,u);return;}
    refreshBeacon(s);
    const survivors = s.units.filter(u => u.alive);
    if (matchOutcome(s)) return;
    s.turn++; s.phase = 'planning';
    for (const u of s.units) if (u.alive) releasePickups(s, u);
    // Advance a public two-turn warning contour. The final patch shrinks to one tile.
    const start=5;
    const limitFor = turn => zoneLimit(s,turn);
    s.safeLimit = limitFor(s.turn - 2); s.nextLimit = limitFor(s.turn);
    collapsePlatforms(s);
    refreshBeacon(s,beaconRecharged);
    const remaining=s.units.filter(u=>u.alive);if(matchOutcome(s))return;
    if (s.turn % 5 === 0) dropSupply(s);
    if (s.nextLimit < s.safeLimit) emit(s, 'zoneWarning', { limit: s.nextLimit });
  }
  function supplySites(s,excludeBeacon=false){
    const occupied=new Set(s.units.filter(u=>u.alive).map(u=>key(u.x,u.y))),cells=[];
    for(let y=1;y<s.height-1;y++)for(let x=1;x<s.width-1;x++){
      const t=tile(s,x,y);
      if(passable(s,x,y)&&t.type!=='water'&&t.rank<=s.safeLimit&&(!t.loot||t.loot.taken)&&!occupied.has(key(x,y))&&(!excludeBeacon||x!==s.beacon.x||y!==s.beacon.y))cells.push({x,y,t});
    }
    return cells;
  }
  function relocateBeacon(s,notify=true){
    let cells=supplySites(s,true);if(!cells.length)cells=supplySites(s);
    const distant=cells.filter(p=>s.units.every(u=>!u.alive||cheb(u,p)>=4)),choices=distant.length?distant:cells;
    const rng=random((s.seed^Math.imul(s.turn,2246822519)^0x51bca73d)>>>0);
    const site=choices[Math.floor(rng()*choices.length)],old=s.beacon;
    // No valid site means no reward in the Void. Retry on a later turn.
    s.beacon={...old,x:site?.x??-100,y:site?.y??-100};
    if(notify&&site&&(old.x!==site.x||old.y!==site.y))emit(s,'beaconMove',{x:site.x,y:site.y});
  }
  function refreshBeacon(s,renew=false){
    const b=s.beacon,t=tile(s,b.x,b.y);
    if(renew||!t||!passable(s,b.x,b.y)||t.type==='water'||t.rank>s.safeLimit)relocateBeacon(s);
  }
  function dropSupply(s) {
    const rng = random((s.seed ^ (s.turn * 2654435761)) >>> 0), guns = Object.keys(WEAPONS).filter(id=>!WEAPONS[id].airDrop),cells=supplySites(s,true);
    // Choose without replacement: even a tiny surviving island can receive loot.
    for(let i=cells.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
    const types=['weapon','medkit','ammo','medkit','weapon','shield','grenade','weapon','smoke','weapon'];
    const count=Math.min(types.length,cells.length);
    for(let i=0;i<count;i++){const type=types[i];cells[i].t.loot={type,...(type==='weapon'?{weapon:i===0?'trident':guns[Math.floor(rng()*guns.length)],airdrop:i===0}:{}),taken:false};}
    if (count) { s.terrainVersion = (s.terrainVersion || 0) + 1; emit(s, 'supplyDrop', { count, turn: s.turn }); }
    return count;
  }
  return { projectileCollision, sameTeam, opponents, matchOutcome, SKILL_AREAS, areaBounds, skillArea, inArea, recoilSpread, sightRange, flightPose, effectVisible, platformRounds, zoneLimit, BIOMES, inField, observedFields, slowBudget, movementForecast, CLASH, THROW, VISION:V, terrainVisible, CARDINAL, RPS, validateRoute, chooseClash, settleClash, clashWinner, SIZE, SKILLS, TIMING, MAPS, LOOT, WEAPONS, CLASSES, key, distance, cheb, random, line, tile, passable, visible, pathfind, canCollect, equipWeapon, nearbyLoot, segmentHitsCircle, segmentWall, moveRange, weaponStats, normalizeEquipment, normalizeMap, FATE:F, createState, observation, planBot, beginTurn, resolveMoves, step, finishTurn, dropSupply };
});
