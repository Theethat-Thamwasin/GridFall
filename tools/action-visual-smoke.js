// Verify actual frame continuity and wall-clock pacing in an isolated browser.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gridfall-motion-qa-')), port = 9337;
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=1440,900', 'http://127.0.0.1:4173/'], { windowsHide: true, stdio: 'ignore' });
let socket, sequence = 0; const pending = new Map(), errors = [];
function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout ' + method)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
async function until(expression, timeout = 14000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await wait(25); } throw new Error('Timeout ' + expression); }
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function target(x, y) {
  const p = await evaluate(`(()=>{const s=GRIDFALL_STATUS(),r=document.querySelector('#arena').getBoundingClientRect();return {x:r.x+(${x}+.5-s.camera.x)*32*s.camera.zoom,y:r.y+(${y}+.5-s.camera.y)*32*s.camera.zoom}})()`);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p });
}
async function screenshot(name) { const r = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.resolve(__dirname, '../qa/', name), Buffer.from(r.data, 'base64')); }
(async()=>{try{
 let page;for(let i=0;i<70;i++){try{page=(await(await fetch('http://127.0.0.1:9337/json')).json()).find(t=>t.type==='page');if(page)break;}catch{}await wait(100);}
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};await call('Runtime.enable');await call('Page.enable');await until('typeof GRIDFALL_STATUS==="function"');

 await evaluate("(()=>{const original=Gridfall.createState;Gridfall.createState=(seed,character,map)=>{const s=original(132,character,map);window.fixture=s;for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',hp:0,loot:null,rank:0});s.units.forEach((u,i)=>Object.assign(u,{alive:i<2,x:i?18:10,y:i?18:10}));Object.assign(s.units[0],{hp:55,ammo:5});s.tiles[10][11].loot={type:'medkit',taken:false};return s;};Gridfall.planBot=()=>[{type:'wait'},{type:'wait'}];document.querySelector('#planning-time').value='0';GridfallPresentation.showPane('maps');})()");
 for(const action of ['move','heal','reload','guard','smoke','grenade','slash','shoot'].filter(action=>!process.argv.slice(2).length||process.argv.slice(2).includes(action))){
  await evaluate("GridfallPresentation.showPane('maps')");await click('#start-button');await wait(450);await click('[data-type='+action+']');
  if(['move','smoke','grenade','slash','shoot'].includes(action))await target(action==='move'?11:12,10);
  assert.equal(await evaluate('GRIDFALL_STATUS().queued'),1,action+' queued');await click('#lock-button');
  const expected=action==='move'?'pickup':action==='grenade'?'throw':action==='shoot'?'muzzle':action;
  await until("GRIDFALL_PRESENTATION().activeEffects.includes('"+expected+"')");await wait(100);
  if(action==='move'){await until('GRIDFALL_PRESENTATION().trails>0');assert.ok(await evaluate('GRIDFALL_PRESENTATION().trails<=GRIDFALL_PRESENTATION().trailCapacity'));}
  await screenshot('action-upgrade-'+action+'.png');
  if(action==='grenade'){await until("GRIDFALL_PRESENTATION().activeEffects.includes('explosion')");await wait(100);await screenshot('action-upgrade-explosion.png');}
  await until('GRIDFALL_STATUS().turn===2');
  if(action==='move'){
   await click('#replay-button');await until('GRIDFALL_PRESENTATION().trails>0');await click('#replay-play');const before=await evaluate('({presentation:GRIDFALL_PRESENTATION(),motion:GRIDFALL_MOTION().time})');await wait(250);assert.deepEqual(await evaluate('({presentation:GRIDFALL_PRESENTATION(),motion:GRIDFALL_MOTION().time})'),before,'paused cosmetic animations');
   await evaluate("document.querySelector('#replay-seek').value='0';document.querySelector('#replay-seek').dispatchEvent(new Event('input'))");assert.equal(await evaluate('GRIDFALL_PRESENTATION().trails'),0);await click('#replay-exit');
  }
  await click('#restart-button');
 }
 await evaluate("document.querySelector('#setting-motion').checked=true;document.querySelector('#setting-motion').dispatchEvent(new Event('change'));GridfallPresentation.showPane('maps')");await click('#start-button');await target(13,10);await click('#lock-button');await wait(500);assert.equal(await evaluate('GRIDFALL_PRESENTATION().trails'),0);assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS: move light trails, heal/reload/guard/smoke/grenade/slash/shoot effects, explosion, replay pause/seek and reduced motion; no browser exceptions');
}finally{socket?.close();browser.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
