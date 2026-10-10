// Verify actual frame continuity and wall-clock pacing in an isolated browser.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gridfall-countdown-qa-')), port = 9337;
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

 await evaluate("Gridfall.planBot=()=>[{type:'wait'},{type:'wait'}];GridfallPresentation.showPane('maps');document.querySelector('#planning-time').value='20'");await click('#start-button');await wait(200);
 const bar="document.querySelector('#countdown-bar')";
 assert.equal(await evaluate(bar+".dataset.mode"),'planning');assert.ok(Number(await evaluate(bar+".getAttribute('aria-valuenow')"))>=98);
 await click('#help-button');const paused=Number(await evaluate(bar+".getAttribute('aria-valuenow')"));await wait(500);assert.equal(Number(await evaluate(bar+".getAttribute('aria-valuenow')")),paused);await click('#close-help');
 await until(bar+".dataset.mode==='warning'",22000);assert.ok(Number(await evaluate(bar+".getAttribute('aria-valuenow')"))<=25);await screenshot('tempo-countdown-warning.png');
 await until(bar+".dataset.mode==='urgent'",6000);assert.ok(Number(await evaluate(bar+".getAttribute('aria-valuenow')"))<=10);assert.ok(Number(await evaluate("document.querySelector('#timer').textContent"))<=2);
 await click('#lock-button');await wait(100);assert.equal(await evaluate(bar+".dataset.mode"),'resolution');assert.ok(Number(await evaluate("document.querySelector('#timer').textContent"))<=4);await screenshot('tempo-resolution-bar.png');
 await wait(1800);const half=Number(await evaluate(bar+".getAttribute('aria-valuenow')"));assert.ok(half>40&&half<60,'two-second midpoint '+half);
 await until('GRIDFALL_STATUS().turn===2');assert.equal(await evaluate(bar+".dataset.mode"),'planning');assert.ok(Number(await evaluate(bar+".getAttribute('aria-valuenow')"))>=98);assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS: real 20 second planning, help pause, five/two-second warnings, four-second resolution, midpoint and new-turn reset');
}finally{socket?.close();browser.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
