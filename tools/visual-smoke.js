const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms)),profile=fs.mkdtempSync(path.join(os.tmpdir(),'gridfall-visual-')),errors=[];let browser,socket,seq=0;const pending=new Map();
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(new Error('CDP '+method)),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){const at=Date.now();while(Date.now()-at<15000){if(await evaluate(expression))return;await wait(50);}throw Error('Timeout '+expression);}
async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
async function shot(name){const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.resolve(__dirname,'../qa',name),Buffer.from(r.data,'base64'));}
async function key(code,key){await call('Input.dispatchKeyEvent',{type:'keyDown',code,key});await call('Input.dispatchKeyEvent',{type:'keyUp',code,key});}
(async()=>{try{
browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--disable-extensions','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=9337','--user-data-dir='+profile,'--window-size=1440,900','http://127.0.0.1:4173/'],{windowsHide:true,stdio:'ignore'});
let target;for(let i=0;i<70;i++){try{target=(await(await fetch('http://127.0.0.1:9337/json')).json()).find(t=>t.type==='page');if(target)break;}catch{}await wait(100);}
socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};await call('Runtime.enable');await call('Page.enable');await until('typeof GRIDFALL_STATUS==="function"');
for(const [width,height,mobile]of[[1920,1080,false],[1366,768,false],[1280,720,false],[390,844,true],[412,915,true],[844,390,true]]){
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await wait(80);
 await evaluate('GridfallPresentation.reset()');await wait(400);await shot(`upgrade-menu-${width}.png`);
 await click('#menu-solo');await click('[data-class=volt]');await wait(400);assert.equal(await evaluate("document.querySelector('#showcase-name').textContent"),'WRAITH');await shot(`upgrade-operator-${width}.png`);
 await click('#operator-next');await click('[data-map=large]');await shot(`upgrade-map-${width}.png`);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'No document overflow '+width);
 await evaluate("document.querySelector('#planning-time').value='0'");await click('#start-button');await until('GRIDFALL_STATUS().started');assert.equal(await evaluate('GRIDFALL_STATUS().map.id'),'large');assert.equal(await evaluate("!!document.querySelector('[id*=cinematic]')"),false);
 await shot(`upgrade-hud-${width}.png`);
 assert.equal(await evaluate("(()=>{const r=document.querySelector('#lock-button').getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.x>=0})()"),true,'Commit touch target '+width);
 await key('KeyG','g');await key('KeyG','g');await click('#lock-button');assert.equal(await evaluate('GRIDFALL_STATUS().phase'),'resolution');assert.equal(await evaluate('"cinematic" in GRIDFALL_STATUS()'),false);
 await until('GRIDFALL_STATUS().turn===2');assert.equal(await evaluate('GRIDFALL_STATUS().visibility.all'),false);assert.equal(await evaluate("!!document.querySelector('#replay-button')"),false);
 await click('#restart-button');await click('#exit-confirm');await until('!GRIDFALL_STATUS().started');
}
await click('#menu-settings');await click('#setting-motion');assert.equal(await evaluate('GRIDFALL_PRESENTATION().reduced'),true);await shot('upgrade-settings.png');
assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: menu/operator/map/HUD at 1920,1366,1280,390,412 and mobile landscape; immediate resolution, no cinematic, Fog, 44px commit, reduced motion, no browser errors');
}finally{socket?.close();browser?.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
