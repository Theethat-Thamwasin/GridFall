'use strict';
// Read-only local workload; no changes to production game code or hosted rooms.
const os=require('node:os'),{performance}=require('node:perf_hooks'),inspector=require('node:inspector');
const G=require('../engine');
const baselineRef=process.argv.find(arg=>arg.startsWith('--baseline-ref='))?.slice('--baseline-ref='.length);
function baselineModule(file){const path=require('node:path'),Module=require('node:module'),root=path.resolve(__dirname,'..'),filename=path.join(root,file),source=require('node:child_process').execFileSync('git',['show',baselineRef+':'+file],{cwd:root,encoding:'utf8',windowsHide:true}),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(root);mod._compile(source,filename);return mod.exports;}
const {RoomHub}=baselineRef?baselineModule('multiplayer.js'):require('../multiplayer'),{TerrainWire}=baselineRef?baselineModule('wire.js'):require('../wire');
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),sum=values.reduce((a,b)=>a+b,0);return{count:values.length,totalMs:+sum.toFixed(2),meanMs:+(sum/(values.length||1)).toFixed(3),p95Ms:+(sorted[Math.ceil(sorted.length*.95)-1]||0).toFixed(3),maxMs:+(sorted.at(-1)||0).toFixed(3)};};
async function remote(){
  const base=process.argv[3];if(!base?.startsWith('https://'))throw Error('Provide an HTTPS game URL');const results=[];
  for(const file of ['','api/health','game.js','engine.js','assets/menu-neon-wraith.png','Circuit Tactics.mp3']){
    const start=performance.now();try{const response=await fetch(new URL(file,base),{signal:AbortSignal.timeout(90000)}),headersMs=performance.now()-start,body=await response.arrayBuffer();results.push({file:file||'index.html',status:response.status,headersMs:+headersMs.toFixed(1),totalMs:+(performance.now()-start).toFixed(1),decodedBytes:body.byteLength,encoding:response.headers.get('content-encoding'),cacheControl:response.headers.get('cache-control'),etag:response.headers.get('etag')});}catch(error){results.push({file,error:error.message});}
  }
  const health=[],errors=[];for(let i=0;i<5;i++){const start=performance.now();try{const response=await fetch(new URL('api/health',base),{signal:AbortSignal.timeout(15000)});await response.arrayBuffer();health.push(performance.now()-start);}catch(error){errors.push(error.message+' ('+(error.cause?.code||'unknown')+')');}}
  return{url:base,assets:results,warmHealth:stats(health),errors,note:'Sequential read-only requests from the measurement environment; not player latency or cold-start simulation.'};
}
async function local(){
  let nextSeed=731;const createState=G.createState;G.createState=(_seed,...args)=>createState(nextSeed++,...args);
  const planBot=G.planBot;G.planBot=(state,id)=>{state.units[id].class=Object.keys(G.CLASSES)[id%Object.keys(G.CLASSES).length];return planBot(state,id);};
  let metrics={},packets=0,packetBytes=0;const record=(name,value)=>(metrics[name]??=[]).push(value);
  function wrap(object,name,label){const original=object[name];object[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{record(label,performance.now()-start);}};}
  for(const [object,name,label]of [[G,'planBot','botPlan'],[G,'step','engineStep'],[G.VISION,'field','visibilityPolygon'],[RoomHub.prototype,'view','filteredPlayerView'],[RoomHub.prototype,'planning','planningWithBots'],[TerrainWire.prototype,'encode','terrainDelta']])wrap(object,name,label);
  const session=new inspector.Session();session.connect();const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));await post('Profiler.enable');await post('Profiler.start');
  const cases=[];
  for(const config of [{map:'medium',humans:1,rooms:1,ticks:80},{map:'large',humans:1,rooms:1,ticks:80},{map:'meadow',humans:1,rooms:1,ticks:80},{map:'large',humans:8,rooms:1,ticks:80},{map:'large',humans:8,rooms:4,ticks:24}]){
    metrics={};packets=packetBytes=0;let now=0;const hub=new RoomHub({now:()=>now}),credentials=[],dimensions=[];
    const setupStart=performance.now();
    for(let i=0;i<config.rooms;i++){
      const host=hub.create({name:'PROFILE',mapId:config.map});const members=[host];for(let j=1;j<config.humans;j++)members.push(hub.join(host.code,{name:'PROFILE '+j}));
      for(const member of members){const wire=new TerrainWire();hub.connect(member.code,member.token,packet=>{const encoded=wire.encode(packet),start=performance.now(),text=JSON.stringify(encoded);record('packetJSON',performance.now()-start);packets++;packetBytes+=Buffer.byteLength(text);});}
      hub.start(host.code,host.token);const room=hub.rooms.get(host.code);dimensions.push([room.state.width,room.state.height]);credentials.push(members);
    }
    const setupMs=performance.now()-setupStart,setupStats=Object.fromEntries(Object.entries(metrics).map(([key,values])=>[key,stats(values)]));metrics={};packets=packetBytes=0;
    for(const members of credentials){const room=hub.rooms.get(members[0].code);for(const member of members)hub.command(member.code,member.token,{action:'lock',turn:room.state.turn,plan:[{type:'shoot',angle:0},{type:'shoot',angle:Math.PI/2}]});}
    metrics={};packets=packetBytes=0;
    const cpuStart=process.cpuUsage(),memoryStart=process.memoryUsage().heapUsed,ticks=[];
    for(let i=0;i<config.ticks;i++){now+=G.TIMING.tickMs;const start=performance.now();hub.tick();ticks.push(performance.now()-start);}
    const cpu=process.cpuUsage(cpuStart);
    cases.push({...config,dimensions,setupMs:+setupMs.toFixed(2),setupStats,tickBudgetMs:G.TIMING.tickMs,ticks:stats(ticks),ticksOverBudget:ticks.filter(ms=>ms>G.TIMING.tickMs).length,cpuMs:+((cpu.user+cpu.system)/1000).toFixed(2),heapGrowthMiB:+((process.memoryUsage().heapUsed-memoryStart)/1048576).toFixed(2),packets,packetBytes,components:Object.fromEntries(Object.entries(metrics).map(([key,values])=>[key,stats(values)])),stages:[...hub.rooms.values()].map(r=>r.stage)});
  }
  const {profile}=await post('Profiler.stop');session.disconnect();const nodes=new Map(profile.nodes.map(node=>[node.id,node])),samples=new Map();for(let i=0;i<(profile.samples||[]).length;i++){const id=profile.samples[i];samples.set(id,(samples.get(id)||0)+(profile.timeDeltas[i]||0));}const total=[...samples.values()].reduce((a,b)=>a+b,0);const hotFunctions=[...samples].map(([id,time])=>({function:nodes.get(id).callFrame.functionName||'(anonymous)',file:nodes.get(id).callFrame.url.replace(/^.*GridBox[\\/]/,''),line:nodes.get(id).callFrame.lineNumber+1,selfMs:+(time/1000).toFixed(2),samplePercent:+(time/total*100).toFixed(2)})).sort((a,b)=>b.selfMs-a.selfMs).slice(0,20);
  return{baselineRef:baselineRef||null,seed:731,environment:{node:process.version,cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,platform:process.platform},note:'Local synchronous RoomHub workloads, profiled with Node inspector; includes filtered views, terrain deltas and JSON but excludes sockets, zlib and real Canvas/GPU. Timings include profiling overhead. Component timings are inclusive and overlap. Fixed map seeds and bot classes for paired comparisons. Heap growth is not retained memory.',cases,hotFunctions};
}
(process.argv[2]==='remote'?remote():local()).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
