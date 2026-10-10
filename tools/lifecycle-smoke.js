// Real browser lobby, death, spectator, exit and fresh-room checks.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createServer}=require('../server.js'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'gridfall-lifecycle-')),clients=[],errors=[];
let browser,server;
class Client {
  constructor(socket){this.socket=socket;this.seq=0;this.pending=new Map();socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};}
  call(method,params={}){return new Promise((resolve,reject)=>{const id=++this.seq,timer=setTimeout(()=>reject(new Error('CDP timeout '+method)),15000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  async eval(expression){const r=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async until(expression){const start=Date.now();while(Date.now()-start<15000){if(await this.eval(expression))return;await wait(60);}throw new Error('Timeout '+expression);}
  async click(selector){if(selector==='#start-button')await this.eval("GridfallPresentation.showPane('maps')");if(selector==='#room-create'||selector==='#room-join')await this.eval("GridfallPresentation.showPane('network')");await this.call('Page.bringToFront');await this.until('!document.hidden');const p=await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await this.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await this.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
  async shot(name){const r=await this.call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.resolve(__dirname,'../qa',name),Buffer.from(r.data,'base64'));}
}
async function connect(url){const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});const c=new Client(socket);clients.push(c);await c.call('Runtime.enable');await c.call('Page.enable');return c;}
(async()=>{try{
  server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
  browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--disable-extensions','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=9337','--user-data-dir='+profile,'--window-size=1440,900',base],{windowsHide:true,stdio:'ignore'});
  let targets;for(let i=0;i<70;i++){try{targets=await(await fetch('http://127.0.0.1:9337/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await wait(100);}
  const host=await connect(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await host.until('typeof GRIDFALL_STATUS === "function"');
  await host.eval("document.querySelector('#player-name').value='HOST';");await host.click('#room-create');await host.until("!document.querySelector('#lobby').classList.contains('hidden')&&GRIDFALL_STATUS().network.connected");
  const code=await host.eval("document.querySelector('#room-code').textContent"),room=server.hub.rooms.get(code);
  const target=await(await fetch('http://127.0.0.1:9337/json/new?'+encodeURIComponent(base+'?room='+code),{method:'PUT'})).json(),guest=await connect(target.webSocketDebuggerUrl);await guest.until('typeof GRIDFALL_STATUS === "function"');
  assert.equal(await guest.eval("document.querySelector('#map-select').offsetParent===null"),true);
  await guest.eval("document.querySelector('#player-name').value='GUEST'");await guest.click('#room-join');await guest.until("!document.querySelector('#lobby').classList.contains('hidden')&&GRIDFALL_STATUS().network.connected");
  assert.equal(await guest.eval("document.querySelector('#lobby-map-control').classList.contains('hidden')&&document.querySelector('#room-start').disabled"),true);
  const guestToken=room.members[1].token;
  await host.eval("document.querySelector('#lobby-map-select').value='large';document.querySelector('#lobby-map-select').dispatchEvent(new Event('change'))");await guest.until("document.querySelector('#lobby-map').textContent.includes('ABYSS')");
  await guest.eval("document.querySelector('#lobby-name').value='NEW NAME';document.querySelector('#lobby-character').value='rook';document.querySelector('#lobby-name').dispatchEvent(new Event('input'))");await guest.click('#lobby-save');await host.until("document.querySelector('#lobby-members').textContent.includes('NEW NAME')&&document.querySelector('#lobby-members').textContent.includes('AEGIS')");
  await host.shot('lobby-host-settings.png');await guest.shot('lobby-guest-settings.png');
  await host.click('#room-start');for(const c of [host,guest])await c.until('GRIDFALL_STATUS().started');assert.equal(await guest.eval('GRIDFALL_STATUS().map.id'),'large');assert.equal(room.state.units[1].class,'rook');
  // A controlled authoritative elimination, during resolution rather than end-of-turn.
  const s=room.state;for(const row of s.tiles)for(const tile of row)Object.assign(tile,{type:'floor',hp:0,loot:null});s.smokes=[];s.fires=[];room.botPlans={};
  Object.assign(s.units[0],{x:3,y:3});Object.assign(s.units[1],{x:4,y:3});Object.assign(s.units[2],{x:15,y:35});
  server.hub.begin(room);Object.assign(s.units[1],{hp:0,alive:false});server.hub.broadcastState(room,[{type:'eliminated',unitId:1,x:4,y:3,owner:0}]);
  await guest.until("!document.querySelector('#result').classList.contains('hidden')");assert.equal(await guest.eval('GRIDFALL_STATUS().phase'),'resolution');assert.equal(await guest.eval("!!document.querySelector('#play-again')"),false);await wait(450);await guest.shot('death-spectate-exit.png');
  await guest.click('#spectate');await guest.until("!document.querySelector('#spectator-bar').classList.contains('hidden')&&document.querySelector('#spectator-name').textContent==='HOST'");
  assert.equal(await guest.eval('GRIDFALL_STATUS().hp'),0);assert.equal(await guest.eval('GRIDFALL_STATUS().visibility.all'),false);assert.equal(await guest.eval("getComputedStyle(document.querySelector('.command-panel')).display"),'none');
  await guest.click('#spectator-next');await guest.until("document.querySelector('#spectator-name').textContent===''+"+JSON.stringify(s.units[2].name));assert.equal(room.members[1].spectating,2);await guest.until('Math.hypot(GRIDFALL_MOTION().camera.cx-15.5,GRIDFALL_MOTION().camera.cy-35.5)<.1');await guest.shot('spectator-follow.png');
  s.units[2].alive=false;server.hub.broadcastState(room);await guest.until("document.querySelector('#spectator-name').textContent==='HOST'");
  await guest.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await guest.until('Math.hypot(GRIDFALL_MOTION().camera.cx-3.5,GRIDFALL_MOTION().camera.cy-3.5)<.1');await guest.shot('spectator-mobile.png');
  await guest.click('#spectator-exit');await guest.click('#exit-confirm');await guest.until('!GRIDFALL_STATUS().network.active&&!GRIDFALL_STATUS().started');await wait(100);
  assert.equal(await guest.eval("document.querySelector('#join-code').value+document.querySelector('#room-link').value+location.search"),'');assert.throws(()=>server.hub.get(code,guestToken));assert.equal(room.state.units[0].alive,true);
  await guest.click('#room-create');await guest.until("!document.querySelector('#lobby').classList.contains('hidden')&&GRIDFALL_STATUS().network.connected");const fresh=await guest.eval("document.querySelector('#room-code').textContent");assert.notEqual(fresh,code);await guest.until("document.querySelector('#room-link').value.includes('?room='+document.querySelector('#room-code').textContent)");
  await guest.click('#room-leave');await guest.click('#exit-confirm');await host.click('#restart-button');await host.click('#exit-confirm');await host.until('!GRIDFALL_STATUS().started');
  // Menu still offers a fresh solo match after leaving multiplayer.
  await host.eval("document.querySelector('#planning-time').value='15'");await host.click('#start-button');
  assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: host map, guest profile, death during resolution, spectator Fog/follow/switch, automatic next survivor, mobile, exit revocation, fresh invitation; no browser exceptions');
}finally{clients.forEach(c=>c.socket.close());if(browser)browser.kill();if(server){for(const ws of server.sockets.clients)ws.terminate();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}})().catch(e=>{console.error(e);process.exitCode=1;});
