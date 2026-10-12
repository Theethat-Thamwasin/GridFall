(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GridfallSkyBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1]],key=(x,y)=>x+','+y;
  const tile=(s,x,y)=>s.tiles[y]?.[x];
  const open=(s,x,y)=>{const t=tile(s,x,y);return t&&!['void','wall','barricade'].includes(t.type);};
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function flood(s,root,limit=Infinity){
    const steps=new Map(),queue=[];if(!open(s,root.x,root.y)||tile(s,root.x,root.y).rank>limit)return steps;
    steps.set(key(root.x,root.y),0);queue.push(root);
    for(let i=0;i<queue.length;i++){const p=queue[i],n=steps.get(key(p.x,p.y))+1;for(const[dx,dy]of DIRS){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(!open(s,x,y)||tile(s,x,y).rank>limit||steps.has(k))continue;steps.set(k,n);queue.push({x,y});}}
    return steps;
  }
  function nearestSpawns(s,spawns){
    if(spawns.length<2)return [];
    const owners=new Int16Array(s.width*s.height).fill(-1),steps=new Uint16Array(owners.length),queue=[],nearest=spawns.map(()=>Infinity);
    for(const [id,p]of spawns.entries()){const index=p.y*s.width+p.x;owners[index]=id;queue.push(index);}
    for(let i=0;i<queue.length;i++){const at=queue[i],x=at%s.width,y=Math.floor(at/s.width),id=owners[at];for(const[dx,dy]of DIRS){const nx=x+dx,ny=y+dy;if(!open(s,nx,ny))continue;const next=ny*s.width+nx;if(owners[next]<0){owners[next]=id;steps[next]=steps[at]+1;queue.push(next);}else if(owners[next]!==id){const d=steps[at]+steps[next]+1;nearest[id]=Math.min(nearest[id],d);nearest[owners[next]]=Math.min(nearest[owners[next]],d);}}}
    return nearest;
  }
  class Heap{
    constructor(){this.a=[];}
    push(p){let i=this.a.length;this.a.push(p);while(i){const parent=(i-1)>>1;if(this.a[parent].cost<=p.cost)break;this.a[i]=this.a[parent];i=parent;}this.a[i]=p;}
    pop(){const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let child=i*2+1;if(child+1<this.a.length&&this.a[child+1].cost<this.a[child].cost)child++;if(this.a[child].cost>=last.cost)break;this.a[i]=this.a[child];i=child;}this.a[i]=last;}return first;}
  }
  function rankTerrain(s,rng){
    const heap=new Heap(),costs=s.tiles.map(row=>row.map(()=>.5+rng()*.2));
    for(const row of s.tiles)for(const t of row)t.rank=Infinity;
    tile(s,s.zoneCenter.x,s.zoneCenter.y).rank=0;heap.push({...s.zoneCenter,cost:0});
    while(heap.a.length){const p=heap.pop();if(p.cost!==tile(s,p.x,p.y).rank)continue;for(const[dx,dy]of DIRS){const x=p.x+dx,y=p.y+dy,t=tile(s,x,y);if(!open(s,x,y))continue;const cost=p.cost+costs[y][x];if(cost>=t.rank)continue;t.rank=cost;heap.push({x,y,cost});}}
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){const t=tile(s,x,y);if(['wall','barricade'].includes(t.type)){const near=DIRS.map(([dx,dy])=>open(s,x+dx,y+dy)?tile(s,x+dx,y+dy):null).filter(t=>t&&Number.isFinite(t.rank));if(near.length)t.rank=Math.min(...near.map(t=>t.rank))+.5;else Object.assign(t,{type:'void',hp:0,rank:999});}else if(t.type==='void')t.rank=999;}
  }
  function chooseSpawns(s,rng,count){
    const paths=flood(s,s.zoneCenter),candidates=[];
    for(let y=3;y<s.height-3;y++)for(let x=3;x<s.width-4;x++){
      if(!(tile(s,x,y).island>0))continue;
      let safe=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=2;dx++)if(!open(s,x+dx,y+dy)||tile(s,x+dx,y+dy).bridge)safe=false;
      if(safe)candidates.push({x,y,steps:paths.get(key(x,y))});
    }
    const sorted=candidates.map(p=>p.steps).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
    const pool=candidates.filter(p=>p.steps>=median-5&&p.steps<=median+5);
    for(let attempt=0;attempt<64;attempt++){
      const chosen=[];if(!pool.length)break;chosen.push(pool[Math.floor(rng()*pool.length)]);
      while(chosen.length<count){
        let best=-1,choices=[];
        for(const p of pool){const separation=Math.min(...chosen.map(q=>distance(p,q)));if(separation<8)continue;const score=separation;if(score>best+.001){best=score;choices=[p];}else if(Math.abs(score-best)<.001)choices.push(p);}
        if(!choices.length)break;chosen.push(choices[Math.floor(rng()*choices.length)]);
      }
      if(chosen.length===count&&Math.max(...chosen.map(p=>p.steps))<=Math.min(...chosen.map(p=>p.steps))*1.65){const near=nearestSpawns(s,chosen);if(near.length&&(Math.max(...near)>Math.min(...near)*2||Math.max(...near)-Math.min(...near)>14))continue;return shuffle(chosen.map(({x,y})=>({x,y})),rng);}
    }
    return null;
  }
  function build(s,rng,count){
    const cx=Math.floor(s.width/2)+Math.floor(rng()*3)-1,cy=Math.floor(s.height/2)+Math.floor(rng()*3)-1;
    s.zoneCenter={x:cx,y:cy};s.beacon={x:cx,y:cy,cooldown:0};s.biome='tundra';s.roofs=[];
    s.tiles=Array.from({length:s.height},()=>Array.from({length:s.width},()=>({type:'void',hp:0,loot:null,rank:999})));
    const total=4+Math.floor(rng()*4),outer=total-1,rotation=rng()*Math.PI*2,ring=Math.min(s.width,s.height)/2-12,islands=[],bridges=[],protectedCells=new Set();
    const centers=[{x:cx,y:cy,rx:7+rng(),ry:7+rng()}];
    for(let i=0;i<outer;i++){const angle=rotation+i*Math.PI*2/outer+(rng()-.5)*.12,r=ring+(rng()-.5)*2,size=outer<=4?8.8:7.2;centers.push({x:Math.round(cx+Math.cos(angle)*r),y:Math.round(cy+Math.sin(angle)*r),rx:size+rng(),ry:size+rng()});}
    for(const [id,p]of centers.entries()){
      const phase=rng()*Math.PI*2,phase2=rng()*Math.PI*2,cells=[];
      for(let y=Math.floor(p.y-p.ry*1.25);y<=p.y+p.ry*1.25;y++)for(let x=Math.floor(p.x-p.rx*1.25);x<=p.x+p.rx*1.25;x++){
        if(x<2||y<2||x>=s.width-2||y>=s.height-2)continue;
        const dx=(x-p.x)/p.rx,dy=(y-p.y)/p.ry,angle=Math.atan2(dy,dx),edge=1+.09*Math.sin(angle*3+phase)+.06*Math.sin(angle*5+phase2);
        if(Math.hypot(dx,dy)>edge)continue;
        if(DIRS.some(([dx,dy])=>tile(s,x+dx,y+dy)?.island!=null)||tile(s,x,y).island!=null)return null;
        cells.push({x,y});
      }
      // Test overlap before painting this island, so its own adjacent cells are allowed.
      if(cells.length<80)return null;
      for(const c of cells)Object.assign(tile(s,c.x,c.y),{type:rng()<.15?'grass':'floor',island:id});
      islands.push({id,x:p.x,y:p.y,cells});
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)protectedCells.add(key(p.x+dx,p.y+dy));
    }
    function connect(from,to,detour){
      const a=centers[from],b=centers[to],width=detour?3:2,path=[],cells=new Map();let p={x:a.x,y:a.y};
      const walk=(axis,target)=>{while(p[axis]!==target){path.push({...p});p[axis]+=Math.sign(target-p[axis]);}path.push({...p});};
      const leg=target=>{if(rng()<.5){walk('x',target.x);walk('y',target.y);}else{walk('y',target.y);walk('x',target.x);}};
      if(detour){const mx=(a.x+b.x)/2-cx,my=(a.y+b.y)/2-cy,length=Math.hypot(mx,my)||1,r=ring+2+rng()*3;leg({x:Math.max(3,Math.min(s.width-4,Math.round(cx+mx/length*r))),y:Math.max(3,Math.min(s.height-4,Math.round(cy+my/length*r)))});}
      leg(b);
      for(const point of path)for(let dy=width===3?-1:0;dy<=1;dy++)for(let dx=width===3?-1:0;dx<=1;dx++){
        const x=point.x+dx,y=point.y+dy,t=tile(s,x,y);if(!t||x<2||y<2||x>=s.width-2||y>=s.height-2)return false;
        protectedCells.add(key(x,y));if(t.island!=null)continue;Object.assign(t,{type:'road',bridge:true});cells.set(key(x,y),{x,y});
      }
      bridges.push({from,to,width,detour,path: path.filter((p,i)=>!i||p.x!==path[i-1].x||p.y!==path[i-1].y),cells:[...cells.values()]});return true;
    }
    // A full outer cycle plus separate spokes provides two ways between every
    // island. The core is never the only crossing available in the opening map.
    for(let i=1;i<total;i++)if(!connect(i,i===total-1?1:i+1,true)||!connect(0,i,false))return null;
    const spawns=chooseSpawns(s,rng,count);if(!spawns)return null;
    for(const p of spawns)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=2;dx++)protectedCells.add(key(p.x+dx,p.y+dy));
    for(const island of islands){
      const choices=shuffle(island.cells.filter(p=>!protectedCells.has(key(p.x,p.y))),rng);
      for(const [i,p]of choices.slice(0,10).entries()){const t=tile(s,p.x,p.y);if(i<3)Object.assign(t,{type:i===0?'barricade':'wall',hp:45});else if(i<7)Object.assign(t,{type:'cover',hp:35,side:rng()<.5?'north':'west'});else t.type=rng()<.5?'forest':'rubble';}
    }
    rankTerrain(s,rng);
    s.skyBridge={version:1,islands,bridges,spawns,finalIsland:0};s.layout={style:'skybridge',chambers:total,islands:total,bridges:bridges.length,biome:s.biome};
    const audit=validate(s,spawns);if(!audit.ok)return null;s.skyBridge.validation=audit;return spawns;
  }
  function validate(s,spawns=s.skyBridge?.spawns||[]){
    const errors=[],root=s.zoneCenter,all=s.tiles.flat().filter(t=>!['wall','barricade','void'].includes(t.type)),paths=flood(s,root),meta=s.skyBridge;
    if(!meta||meta.islands.length<4||meta.islands.length>7)return{ok:false,errors:['island count']};
    if(paths.size!==all.length)errors.push('disconnected platform');
    if(tile(s,root.x,root.y)?.rank!==0)errors.push('unsafe final island');
    for(const island of meta.islands)if(!paths.has(key(island.x,island.y)))errors.push('isolated island');
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++)if(open(s,x,y)&&(x!==root.x||y!==root.y)){
      // Strict descent proves that every possible safe rank contour remains
      // connected, not merely a few sampled collapse stages.
      if(!DIRS.some(([dx,dy])=>open(s,x+dx,y+dy)&&tile(s,x+dx,y+dy).rank<=tile(s,x,y).rank-.499999))errors.push('no descending escape');
    }
    const spawnDistances=spawns.map(p=>paths.get(key(p.x,p.y)));
    const nearestSpawnDistances=nearestSpawns(s,spawns);
    if(spawns.length===0||spawnDistances.some(n=>n==null))errors.push('unreachable spawn');
    if(Math.max(...spawnDistances)>Math.min(...spawnDistances)*1.65||Math.max(...spawnDistances)-Math.min(...spawnDistances)>12)errors.push('unbalanced spawn routes');
    if(nearestSpawnDistances.length&&(Math.max(...nearestSpawnDistances)>Math.min(...nearestSpawnDistances)*2.25||Math.max(...nearestSpawnDistances)-Math.min(...nearestSpawnDistances)>16))errors.push('unbalanced encounter distances');
    for(const [i,p]of spawns.entries()){
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=2;dx++)if(!open(s,p.x+dx,p.y+dy)||tile(s,p.x+dx,p.y+dy).bridge||tile(s,p.x+dx,p.y+dy).type==='water')errors.push('unsafe spawn');
      if(spawns.slice(i+1).some(q=>distance(p,q)<8))errors.push('close spawns');
    }
    for(const b of meta.bridges){if(b.width<2||!b.cells.length)errors.push('invalid bridge');for(const p of b.path)if(!open(s,p.x,p.y))errors.push('blocked bridge');}
    // No single bridge edge may cut the island graph. Tile-level rank descent
    // separately guarantees connectivity once several links start falling.
    for(const removed of meta.bridges){const connected=new Set([0]);let changed=true;while(changed){changed=false;for(const b of meta.bridges)if(b!==removed&&(connected.has(b.from)||connected.has(b.to))){const size=connected.size;connected.add(b.from);connected.add(b.to);if(connected.size!==size)changed=true;}}if(connected.size!==meta.islands.length)errors.push('single bridge chokepoint');}
    return {ok:!errors.length,errors:[...new Set(errors)],platforms:all.length,spawnDistances,nearestSpawnDistances,minSeparation:spawns.length>1?Math.min(...spawns.flatMap((p,i)=>spawns.slice(i+1).map(q=>distance(p,q)))):null,maxEscapeSteps:3,warningTurns:2};
  }
  function generate(s,rng,count){
    for(let attempt=0;attempt<96;attempt++){const spawns=build(s,rng,count);if(spawns){s.skyBridge.attempts=attempt+1;return spawns;}}
    throw new Error('SKY BRIDGE failed its map safety checks for seed '+s.seed);
  }
  function addLoot(s,rng,zoneLimit){
    const arrival=new Map(),queue=s.units.filter(u=>u.alive).map(({x,y})=>({x,y}));for(const p of queue)arrival.set(key(p.x,p.y),0);
    for(let i=0;i<queue.length;i++){const p=queue[i];for(const[dx,dy]of DIRS){const x=p.x+dx,y=p.y+dy,k=key(x,y);if(!open(s,x,y)||arrival.has(k))continue;arrival.set(k,arrival.get(key(p.x,p.y))+1);queue.push({x,y});}}
    const candidates=[];for(let y=2;y<s.height-2;y++)for(let x=2;x<s.width-2;x++){const t=tile(s,x,y);if(!open(s,x,y)||t.loot||s.units.some(u=>u.alive&&u.x===x&&u.y===y))continue;const edge=DIRS.some(([dx,dy])=>tile(s,x+dx,y+dy)?.type==='void');let falls=1;while(falls<128&&zoneLimit(s,falls-2)>=t.rank)falls++;if((t.bridge||edge)&&arrival.get(key(x,y))<=(falls-2)*3)candidates.push({x,y,rank:t.rank});}
    candidates.sort((a,b)=>b.rank-a.rank);const pool=shuffle(candidates.slice(0,Math.max(12,Math.floor(candidates.length*.4))),rng);s.skyBridge.highValueLoot=[];
    for(const weapon of ['longshot','sniper','dmr','lmg']){const p=pool.pop();if(!p)throw new Error('SKY BRIDGE has no risky loot site');tile(s,p.x,p.y).loot={type:'weapon',weapon,taken:false};s.skyBridge.highValueLoot.push({...p,weapon});}
  }
  return {generate,validate,addLoot};
});
