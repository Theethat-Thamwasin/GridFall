// Local browser QA, using a temporary headless Edge session when the app browser is unavailable.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gridfall-qa-'));
const port = 9337;
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=1440,900', 'http://127.0.0.1:4173/'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let diagnostics = ''; browser.stderr.on('data', data => { diagnostics += data.toString(); });
let socket, sequence = 0; const pending = new Map(), errors = [];
async function call(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout ' + method)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
async function click(selector) { if(selector==='#start-button')await evaluate("GridfallPresentation.showPane('maps')");if(selector==='#room-create'||selector==='#room-join')await evaluate("GridfallPresentation.showPane('network')"); const r = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'center'});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...r }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...r }); }
async function keypress(code, key) { await call('Input.dispatchKeyEvent', { type: 'keyDown', code, key }); await call('Input.dispatchKeyEvent', { type: 'keyUp', code, key }); }
async function aimAt(x, y) { const r = await evaluate("(()=>{const r=document.querySelector('#arena').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()"), status = await evaluate('GRIDFALL_STATUS()'), camera = status.camera; const p = { x: r.x + (x + .5 - camera.x) / status.viewport.x * r.width, y: r.y + (y + .5 - camera.y) / status.viewport.y * r.height }; await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p }); await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p }); }
async function screenshot(name) { const clip = await evaluate('({x:0,y:0,width:document.documentElement.clientWidth,height:document.documentElement.scrollHeight,scale:1})'); const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }); fs.mkdirSync(path.join(root, 'qa'), { recursive: true }); fs.writeFileSync(path.join(root, 'qa', name), Buffer.from(r.data, 'base64')); }
(async () => {
  try {
    let target;
    for (let i = 0; i < 60; i++) { try { const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); target = list.find(t => t.type === 'page' && t.url.includes('4173')); if (target) break; } catch {} await wait(150); }
    if (!target) throw new Error('Headless browser failed to start');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = e => { const data = JSON.parse(e.data); if (data.id && pending.has(data.id)) { const p = pending.get(data.id); clearTimeout(p.timer); pending.delete(data.id); data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result); } if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails); };
    await call('Runtime.enable'); await call('Page.enable'); await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await wait(500);
    assert.equal(await evaluate('typeof GRIDFALL_STATUS'), 'function'); await screenshot('intro-desktop.png');
    await evaluate("document.getElementById('planning-time').value='0'; "); await click('#start-button'); await wait(350);
    let status = await evaluate('GRIDFALL_STATUS()'); assert.equal(status.started, true); assert.equal(status.alive, 8); assert.equal(status.sound.state, 'running'); assert.deepEqual(status.map, { id: 'cargo', width: 48, height: 20 });
    const firstSpawn = { ...status.player };
    assert.ok(Math.abs(firstSpawn.x + .5 - status.camera.x - status.viewport.x / 2) < .001, 'random spawn remains horizontally centered');
    assert.ok(Math.abs(firstSpawn.y + .5 - status.camera.y - status.viewport.y / 2) < .001, 'random spawn remains vertically centered');
    await keypress('Digit2', '2'); await aimAt(firstSpawn.x + 1.18, firstSpawn.y + .15); status = await evaluate('GRIDFALL_STATUS()'); assert.equal(status.queued, 1); const firstAngle = status.plan[0].angle;
    await keypress('KeyQ', 'q'); assert.equal((await evaluate('GRIDFALL_STATUS()')).queued, 0);
    await aimAt(firstSpawn.x + 1.2, firstSpawn.y + .3); status = await evaluate('GRIDFALL_STATUS()'); assert.equal(status.queued, 1); assert.ok(Math.abs(status.plan[0].angle - firstAngle) > .005); assert.equal(status.plan[0].target, undefined, 'free aim must lock an angle, not a tile');
    await keypress('KeyG', 'g'); assert.equal((await evaluate('GRIDFALL_STATUS()')).queued, 2); await screenshot('planning-desktop.png');
    await click('#lock-button'); assert.equal((await evaluate('GRIDFALL_STATUS()')).phase, 'resolution'); await wait(1100); await screenshot('resolution-desktop.png'); await wait(5000);
    status = await evaluate('GRIDFALL_STATUS()'); assert.equal(status.phase, 'planning'); assert.equal(status.turn, 2); assert.equal(status.ammo, 12);
    await click('#replay-button'); assert.equal((await evaluate('GRIDFALL_STATUS()')).replay, true); await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await wait(100); assert.equal((await evaluate('GRIDFALL_STATUS()')).replay, false);
    await click('#sound-button'); assert.equal((await evaluate('GRIDFALL_STATUS()')).sound.enabled, false); await click('#sound-button'); assert.equal((await evaluate('GRIDFALL_STATUS()')).sound.enabled, true);
    await click('#help-button'); assert.equal(await evaluate("document.getElementById('help').classList.contains('hidden')"), false); await click('#help-done');
    for (const [code, char, action] of [['Digit1', '1', 'move'], ['Digit2', '2', 'shoot'], ['Digit3', '3', 'slash'], ['Digit4', '4', 'smoke'], ['KeyR', 'r', 'reload'], ['KeyG', 'g', 'guard'], ['KeyH', 'h', 'heal']]) { await keypress(code, char); status = await evaluate('GRIDFALL_STATUS()'); assert.equal(status.selected, action, code); if (status.queued) await keypress('KeyQ', 'q'); }
    await keypress('Digit3', '3'); status = await evaluate('GRIDFALL_STATUS()'); await aimAt(status.player.x + 1.08, status.player.y + .12); status = await evaluate('GRIDFALL_STATUS()'); assert.equal(status.plan[0].type, 'slash'); assert.ok(Number.isFinite(status.plan[0].angle)); await keypress('KeyQ', 'q');
    assert.equal(await evaluate("document.querySelector('[data-type=loot]')"), null);
    const beforeF = (await evaluate('GRIDFALL_STATUS()')).queued; await keypress('KeyF', 'f'); assert.equal((await evaluate('GRIDFALL_STATUS()')).queued, beforeF);
    for (const [width, height] of [[1440, 900], [1280, 720]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await wait(150);
      const layout = await evaluate("(()=>{const r=document.querySelector('#lock-button').getBoundingClientRect(),c=document.querySelector('#arena').getBoundingClientRect();return {overflow:document.documentElement.scrollHeight>innerHeight,lockVisible:r.bottom<=innerHeight&&r.top>=0,canvasWidth:c.width,canvasHeight:c.height}})()");
      await screenshot('fullscreen-'+width+'x'+height+'.png'); assert.equal(layout.overflow,false); assert.equal(layout.lockVisible,true); assert.ok(layout.canvasWidth>800&&layout.canvasHeight>height*.55,JSON.stringify({width,height,...layout}));
    }
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    // A fresh game proves automatic walking pickup, delayed inventory and gun switching in the real UI.
    await click('#restart-button'); await click('#start-button'); await wait(150);
    status=await evaluate('GRIDFALL_STATUS()'); const ammoSpawn={...status.player};
    await keypress('KeyG','g'); await keypress('Digit1','1'); await aimAt(ammoSpawn.x+1,ammoSpawn.y); status=await evaluate('GRIDFALL_STATUS()'); assert.equal(status.plan[1].type,'move');
    await click('#lock-button'); await wait(3800); status=await evaluate('GRIDFALL_STATUS()'); assert.equal(status.reserve,60); assert.ok(status.pendingPickups.some(p=>p.type==='ammo')); assert.ok(await evaluate("document.querySelector('#nearby-loot').textContent.includes('T02')")); await screenshot('auto-pickup-pending.png');
    await wait(2000); status=await evaluate('GRIDFALL_STATUS()'); assert.equal(status.turn,2); assert.equal(status.reserve,84); assert.equal(status.pendingPickups.length,0);
    await click('#restart-button'); await click('#start-button'); await wait(150);
    status=await evaluate('GRIDFALL_STATUS()'); const gunSpawn={...status.player};
    assert.ok(new Set([firstSpawn,ammoSpawn,gunSpawn].map(p=>p.x+','+p.y)).size>1,'new matches randomize spawn locations');
    await keypress('KeyG','g'); await keypress('Digit1','1'); await aimAt(gunSpawn.x+2,gunSpawn.y); await click('#lock-button'); await wait(6000); status=await evaluate('GRIDFALL_STATUS()'); assert.ok(status.weapons.includes('shotgun'));
    await keypress('KeyI','i'); await click('#weapon-tabs button:nth-child(3)'); assert.equal(await evaluate("document.querySelector('#weapon-name').textContent"),'SG / BREACHER'); status=await evaluate('GRIDFALL_STATUS()'); assert.equal(status.ammo,4); await screenshot('collected-gun.png'); await keypress('KeyI','i');
    await click('#camera-fit'); await wait(1250); status = await evaluate('GRIDFALL_STATUS()'); assert.ok(status.camera.zoom < 1); await screenshot('long-haul-overview.png'); await keypress('KeyC', 'c'); assert.equal((await evaluate('GRIDFALL_STATUS()')).camera.follow, true);
    await keypress('KeyD', 'd'); assert.equal((await evaluate('GRIDFALL_STATUS()')).camera.follow, false); await keypress('KeyC', 'c');
    // Render the real SFX implementation offline, verify signal energy, and save an audition file.
    const audio = await evaluate(`(async()=>{
      const sampleRate=22050,c=new OfflineAudioContext(2,sampleRate*6.5,sampleRate),s=new SoundEngine();
      s.context=c;s.master=c.createGain();s.master.gain.value=.3;s.compressor=c.createDynamicsCompressor();s.master.connect(s.compressor);s.compressor.connect(c.destination);
      s.noiseBuffer=c.createBuffer(1,sampleRate*2,sampleRate);const n=s.noiseBuffer.getChannelData(0);for(let i=0;i<n.length;i++)n[i]=Math.random()*2-1;
      s.play('deploy');s.play('gun',-.35,'rifle',.9);s.play('gun',.35,'sniper',1.3);s.play('explosion',.2,'',1.9);s.play('reload',-.3,'',2.9);s.play('heal',0,'',3.4);s.play('victory',0,'',4.2);
      const b=await c.startRendering(),left=b.getChannelData(0),right=b.getChannelData(1),pcm=new Uint8Array(left.length*4),v=new DataView(pcm.buffer);let peak=0,energy=0;for(let i=0;i<left.length;i++){peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));energy+=left[i]*left[i]+right[i]*right[i];v.setInt16(i*4,Math.max(-1,Math.min(1,left[i]))*32767,true);v.setInt16(i*4+2,Math.max(-1,Math.min(1,right[i]))*32767,true);}let binary='';for(let i=0;i<pcm.length;i+=8192)binary+=String.fromCharCode(...pcm.subarray(i,i+8192));return {peak,rms:Math.sqrt(energy/(left.length*2)),data:btoa(binary),sampleRate};})()`);
    assert.ok(audio.peak > .05 && audio.rms > .005, 'SFX must generate audible audio');
    const pcm = Buffer.from(audio.data, 'base64'), header = Buffer.alloc(44); header.write('RIFF', 0); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(audio.sampleRate, 24); header.writeUInt32LE(audio.sampleRate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40); fs.writeFileSync(path.join(root, 'sound-preview.wav'), Buffer.concat([header, pcm]));
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await screenshot('mobile.png');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile must not overflow horizontally');
    await click('#restart-button'); assert.equal(await evaluate("document.getElementById('intro').classList.contains('hidden')"), false);
    await evaluate("document.querySelector('[data-class=volt]').click(); document.querySelector('#map-select').value='alley'"); await click('#start-button'); await wait(100); assert.equal(await evaluate("document.getElementById('operator-name').textContent"), 'WRAITH'); status = await evaluate('GRIDFALL_STATUS()'); assert.deepEqual(status.map, { id: 'alley', width: 20, height: 48 }); await click('#camera-fit'); await wait(1250); await screenshot('iron-corridor-mobile.png');
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log(JSON.stringify({ result: 'PASS', checks: ['deploy', 'free sub-grid aim', 'Q undo', 'all requested hotkeys', 'directional slash', 'automatic pickup and next-turn availability', 'collected gun switching', 'desktop viewport fit', 'horizontal/vertical maps', 'camera fit/pan/follow', 'queue two actions', 'resolve turn', 'ammo consumption', 'replay', 'sound unlock/mute', 'help', 'mobile layout', 'restart/class selection', 'no JS exceptions', 'offline audio signal'], audio: { peak: audio.peak, rms: audio.rms }, screenshots: 'qa/' }, null, 2));
  } finally { if (socket) socket.close(); browser.kill(); }
})().catch(error => { console.error(error); console.error(diagnostics.slice(-3000)); process.exitCode = 1; });
