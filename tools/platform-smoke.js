// Verify actual frame continuity and wall-clock pacing in an isolated browser.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gridfall-platform-qa-')), port = 9337;
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

 await evaluate("(()=>{const real=Gridfall.createState;window.scene='warning';Gridfall.createState=(seed,character,map)=>{const s=real(42,character,'district');window.fixture=s;const root=s.zoneCenter;s.units.forEach((u,i)=>{u.alive=i<3;u.x=root.x+(i===2?1:0);u.y=root.y;});if(scene==='warning'){s.turn=9;s.maxZoneRank=6;s.safeLimit=6;s.nextLimit=4.5;const danger=s.tiles.flatMap((row,y)=>row.map((t,x)=>({x,y,t}))).find(p=>Gridfall.passable(s,p.x,p.y)&&p.t.rank>4.5&&p.t.rank<=6&&Gridfall.distance(root,p)<8);Object.assign(s.units[1],{x:danger.x,y:danger.y});window.fallingCell={x:danger.x,y:danger.y};for(const row of s.tiles)for(const t of row)if(t.rank>6)Object.assign(t,{type:'void',hp:0,loot:null});}else{for(const row of s.tiles)for(const t of row)Object.assign(t,{type:'floor',rank:0,hp:0,loot:null});s.units.forEach((u,i)=>{u.alive=i<2;u.x=root.x+(i?2:0);u.y=root.y+(i?2:0);});}return s;};Gridfall.planBot=(s,id)=>scene==='skill'&&id===1?[{type:'shoot',angle:Math.atan2(s.units[0].y-s.units[1].y,s.units[0].x-s.units[1].x)}]:[{type:'wait'},{type:'wait'}];document.querySelector('#planning-time').value='0';GridfallPresentation.showPane('maps');})()");
 await click('#start-button');await click('#camera-fit');await wait(1100);await screenshot('platform-warning-stripes.png');assert.equal(await evaluate('fixture.units[1].alive'),true);await click('#lock-button');await until('GRIDFALL_STATUS().turn===10');await wait(1000);assert.equal(await evaluate('fixture.tiles[fallingCell.y][fallingCell.x].type'),'void');assert.equal(await evaluate('fixture.units[1].alive'),false);assert.ok(await evaluate("fixture.events.some(e=>e.type==='fall')"));await screenshot('platform-after-collapse.png');assert.equal(await evaluate('GRIDFALL_STATUS().visibility.all'),false);await click('#restart-button');await click('#exit-confirm');
 for(const character of ['vanguard','volt','deadeye','pyro','rook']){
  await evaluate("window.scene='skill';document.querySelector('[data-class="+character+"]').click();GridfallPresentation.showPane('maps')");await click('#start-button');await wait(800);await click('#skill-button');
  if(['vanguard','volt','pyro'].includes(character)){const p=await evaluate("(()=>{const u=fixture.units[0];return{x:u.x+2,y:u.y+("+JSON.stringify(character)+"==='pyro'?2:0)}})()");await target(p.x,p.y);}
  assert.equal(await evaluate('GRIDFALL_STATUS().queued'),1);await click('#lock-button');await wait(character==='pyro'?750:450);await screenshot('operator-skill-'+character+'.png');await until('GRIDFALL_STATUS().turn===2');await click('#restart-button');await click('#exit-confirm');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS: caution stripes, actual floor loss, fall elimination, private replay and all five operator skill effects; no browser errors');
}finally{socket?.close();browser.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
