'use strict';
const WebSocket=require('ws');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function response(fetcher,url,options={},timeoutMs=5000){const r=await fetcher(url,{...options,cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});if(!r.ok)throw Error('HTTP '+r.status+' — '+new URL(url).pathname);return r;}
async function checkPublic(url,localHealth,{fetcher=globalThis.fetch,probe=probeRoom,timeoutMs=5000}={}){
 const health=await(await response(fetcher,url+'/api/health',{},timeoutMs)).json();
 if(!health.multiplayer||!health.websocket)throw Error('ลิงก์ยังเชื่อมต่อถึงเกมไม่ได้');
 if(localHealth?.instanceId&&health.instanceId!==localHealth.instanceId)throw Error('ลิงก์เชื่อมไปเซิร์ฟเวอร์คนละตัว');
 const page=await(await response(fetcher,url+'/',{},timeoutMs)).text();
 if(!page.includes('id="arena"')||!page.includes('game.js'))throw Error('ลิงก์ยังโหลดหน้าเกมไม่ได้');
 await probe(url,{fetcher,timeoutMs});return health;
}
async function probeRoom(url,{fetcher=globalThis.fetch,timeoutMs=5000}={}){
 let credentials,socket;
 const post=async(endpoint,data)=>{const r=await response(fetcher,url+endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify(data)},timeoutMs);return r.json();};
 try{
  credentials=await post('/api/rooms',{name:'CONNECTION CHECK',character:'vanguard',mapId:'small'});
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{socket?.terminate();reject(Error('WebSocket เชื่อมต่อไม่สำเร็จ'));},timeoutMs),done=e=>{clearTimeout(timer);e?reject(e):resolve();};
   socket=new WebSocket(url.replace(/^http/,'ws')+'/api/socket?'+new URLSearchParams({room:credentials.code,token:credentials.token}),{origin:url});
   socket.once('error',done);socket.once('unexpected-response',(_,r)=>{r.resume();done(Error('WebSocket HTTP '+r.statusCode));});
   socket.on('message',data=>{try{if(JSON.parse(data).type==='lobby')done();}catch{done(Error('WebSocket ส่งข้อมูลเกมไม่สำเร็จ'));}});
  });
 }finally{
  socket?.terminate();if(credentials?.token)await post('/api/leave',{room:credentials.code,token:credentials.token}).catch(()=>{});
 }
}
async function waitForPublicReady(url,localHealth,{timeoutMs=90000,fetcher=globalThis.fetch,probe=probeRoom,sleep=pause,now=Date.now,cancelled=()=>false}={}){
 const start=now();let last;
 while(!cancelled()&&now()-start<timeoutMs){try{return await checkPublic(url,localHealth,{fetcher,probe});}catch(e){last=e;}if(!cancelled())await sleep(1000);}
 if(cancelled())throw Error('ยกเลิกการเปิดออนไลน์');
 throw Error('ลิงก์ออนไลน์ยังไม่พร้อม: '+(last?.cause?.code||last?.message||'เชื่อมต่อไม่สำเร็จ'));
}
module.exports={checkPublic,probeRoom,waitForPublicReady};
