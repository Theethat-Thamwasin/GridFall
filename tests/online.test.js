const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const WebSocket = require('ws');
const { createServer } = require('../server.js'), { RoomHub } = require('../multiplayer.js');
const { normalizePublicUrl } = require('../online-config.js'), { parsePublicUrl } = require('../tools/online.js');
async function openServer(options) { const server = createServer(options); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return { server, base: 'http://127.0.0.1:' + server.address().port }; }
async function closeServer(server) { for (const ws of server.sockets.clients) ws.terminate(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
async function post(base, endpoint, body, origin) { const response = await fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; }
function client(base, credentials, origin) {
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/socket?' + new URLSearchParams({ room: credentials.code, token: credentials.token }), { ...(origin ? { origin } : {}), perMessageDeflate: true });
  const packets = [], waiters = [];
  ws.on('error', () => {});
  ws.on('message', data => { const packet = JSON.parse(data.toString()), index = waiters.findIndex(w => w.predicate(packet)); if (index < 0) packets.push(packet); else { const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(packet); } });
  return { ws, next(predicate = () => true) { const index = packets.findIndex(predicate); if (index >= 0) return Promise.resolve(packets.splice(index, 1)[0]); return new Promise((resolve, reject) => { const waiter = { predicate, resolve }; waiter.timer = setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error('No websocket packet')); }, 5000); waiters.push(waiter); }); } };
}
test('two compressed WebSocket clients share validated turns and retain private fog', async () => {
  const hub = new RoomHub({ planningMs: 60000, briefingMs: 0 }), { server, base } = await openServer({ hub }); const clients = [];
  try {
    const a = (await post(base, '/api/rooms', { name: 'A', cinematic: false })).body, b = (await post(base, '/api/join', { room: a.code, name: 'B', cinematic: false })).body;
    const ca = client(base, a), cb = client(base, b); clients.push(ca, cb);
    await Promise.all([ca.next(p => p.type === 'lobby'), cb.next(p => p.type === 'lobby')]);
    assert.equal(ca.ws.extensions, 'permessage-deflate'); assert.equal(cb.ws.extensions, 'permessage-deflate');
    assert.equal((await post(base, '/api/start', { room: a.code, token: a.token })).status, 200);
    await Promise.all([ca.next(p => p.type === 'state'), cb.next(p => p.type === 'state')]);
    const room = hub.rooms.get(a.code); room.botPlans = {};
    for (const row of room.state.tiles) for (const tile of row) Object.assign(tile, { type: 'floor', hp: 0 });
    Object.assign(room.state.units[0], { x: 2, y: 2 }); Object.assign(room.state.units[1], { x: 35, y: 15 }); hub.broadcastState(room);
    const pack = await ca.next(p => p.type === 'state' && p.state.units[0].x === 2);
    assert.equal(pack.state.units[1].hidden, true); assert.equal(pack.state.units[1].x, -100); assert.equal(pack.state.schedule, undefined);
    for (const c of [a, b]) assert.equal((await post(base, '/api/command', { room: c.code, token: c.token, action: 'lock', turn: 1, plan: [{ type: 'guard' }] })).status, 200);
    const [ra, rb] = await Promise.all([ca.next(p => p.type === 'state' && p.state.tick >= 2), cb.next(p => p.type === 'state' && p.state.tick >= 2)]);
    assert.equal(ra.state.tick, rb.state.tick); assert.equal(ra.state.units[0].guard, true); assert.equal(rb.state.units[1].guard, true);
    assert.deepEqual(Object.keys(ra.state.plans), ['0']); assert.deepEqual(Object.keys(rb.state.plans), ['1']);
    assert.equal((await post(base, '/api/command', { room: a.code, token: a.token, action: 'lock', turn: 1, plan: [] })).status, 400);
    ca.ws.close(); await new Promise(resolve => ca.ws.once('close', resolve));
    const rejoined = client(base, a); clients.push(rejoined); const resumed = await rejoined.next(p => p.type === 'state');
    assert.equal(resumed.playerId, 0); assert.equal(resumed.init, true); assert.equal(resumed.state.units[0].name, 'A');
    for (const name of ['online-config.js', 'tools/online-session.json', 'tools/bin/cloudflared.exe', 'package-lock.json', 'node_modules/ws/index.js']) assert.equal((await fetch(base + '/' + name)).status, 404);
  } finally { clients.forEach(c => c.ws.terminate()); await closeServer(server); }
});
test('proxy host rewriting permits only the configured public origin for HTTP and WebSocket', async () => {
  const { server, base } = await openServer({ publicUrl: 'https://arena.example.test' });
  try {
    const health = await (await fetch(base + '/api/health')).json(); assert.equal(health.publicUrl, 'https://arena.example.test'); assert.equal(health.websocket, true);
    const a = await post(base, '/api/rooms', {}, 'https://arena.example.test'); assert.equal(a.status, 201);
    assert.equal((await post(base, '/api/rooms', {}, 'https://forged.example.test')).status, 403);
    const valid = client(base, a.body, 'https://arena.example.test'); await valid.next(p => p.type === 'lobby'); valid.ws.terminate();
    for (const [credentials, origin, expected] of [[a.body, 'https://forged.example.test', 403], [{ code: a.body.code, token: 'fake' }, 'https://arena.example.test', 401]]) {
      const invalid = client(base, credentials, origin);
      const status = await new Promise(resolve => invalid.ws.once('unexpected-response', (request, response) => { response.resume(); request.destroy(); resolve(response.statusCode); }));
      assert.equal(status, expected); invalid.ws.terminate();
    }
  } finally { await closeServer(server); }
});
test('tunnel URL parsing and public configuration reject malformed or credential-bearing URLs', () => {
  assert.equal(parsePublicUrl('Your tunnel is ready https://fun-gridfall.trycloudflare.com |', 'cloudflare'), 'https://fun-gridfall.trycloudflare.com');
  assert.equal(parsePublicUrl('lvl=info msg="started tunnel" url=https://game.ngrok-free.app', 'ngrok'), 'https://game.ngrok-free.app');
  assert.equal(parsePublicUrl('https://developers.cloudflare.com/tunnel/', 'cloudflare'), null);
  for (const value of ['file:///C:/secret', 'https://token@game.example', 'https://game.example/?token=123', 'https://game.example/rooms', 'bad']) assert.equal(normalizePublicUrl(value), null);
});
function networkFixture(href, health = {}) {
  const storage = new Map(), sockets = [], timers = new Map(); let timerId = 0;
  class Socket { constructor(url) { this.url = url; sockets.push(this); } close() { this.onclose?.(); } }
  const context = { window: {}, location: new URL(href), URL, URLSearchParams, WebSocket: Socket, sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, fetch: async endpoint => ({ ok: true, json: async () => endpoint === '/api/health' ? health : { code: 'ABC123', token: 'test-token', playerId: 0 } }), setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../network.js'), 'utf8'), context);
  return { Network: context.window.GridfallNetwork, sockets, timers, context };
}
test('HTTPS players use WSS, reconnect with the same token and ignore obsolete connections', async () => {
  const fixture = networkFixture('https://play.trycloudflare.com/?room=ABC123'), received = []; const n = new fixture.Network(p => received.push(p), () => {});
  await n.enter(false, { room: 'ABC123' }); assert.ok(fixture.sockets[0].url.startsWith('wss://play.trycloudflare.com/api/socket?'));
  const first = fixture.sockets[0]; first.onopen(); assert.equal(n.connected, true); first.onclose(); assert.equal(n.connected, false);
  fixture.timers.values().next().value(); assert.equal(fixture.sockets.length, 2); const next = fixture.sockets[1]; assert.equal(next.url, first.url);
  first.onmessage({ data: '{"old":true}' }); assert.equal(received.length, 0); next.onopen(); next.onmessage({ data: '{"ok":true}' }); assert.equal(received.length, 1);
  await n.leave(); next.onmessage({ data: '{"late":true}' }); assert.equal(received.length, 1); assert.equal(n.active, false);
});
test('localhost invitations use the published HTTPS tunnel while public visitors keep their origin', async () => {
  for (const [href, health, expected] of [['http://localhost:4173/', { publicUrl: 'https://arena.ngrok-free.app', addresses: ['192.168.1.7'] }, 'https://arena.ngrok-free.app/?room=ABC123'], ['https://arena.trycloudflare.com/?room=OLD#plan', { publicUrl: 'https://other.example' }, 'https://arena.trycloudflare.com/?room=ABC123'], ['http://localhost:4173/', { addresses: ['192.168.1.7'] }, 'http://192.168.1.7:4173/?room=ABC123']]) {
    const { Network } = networkFixture(href, health), n = new Network(() => {}, () => {}); n.credentials = { code: 'ABC123' }; assert.equal(await n.invitation(), expected);
  }
});
test('terrain patches reduce unchanged packets and hydrate immutable replay snapshots', async () => {
  const { TerrainWire } = require('../wire.js'), wire = new TerrainWire();
  const packet = { type: 'state', state: { tick: 0, units: [], tiles: [[{ type: 'floor', loot: null }, { type: 'wall', hp: 45 }]] } };
  const first = wire.encode(packet), same = wire.encode(structuredClone(packet));
  assert.equal(same.state.tiles, undefined); assert.deepEqual(same.tileChanges, []); assert.ok(JSON.stringify(same).length < JSON.stringify(first).length);
  const changed = structuredClone(packet); changed.state.tick = 2; changed.state.tiles[0][1] = { type: 'rubble', hp: 0 };
  const patch = wire.encode(changed); assert.deepEqual(patch.tileChanges, [[1, 0, { type: 'rubble', hp: 0 }]]);
  const fixture = networkFixture('https://play.trycloudflare.com/'), received = [], n = new fixture.Network(p => received.push(p), () => {});
  await n.enter(true, {}); const source = fixture.sockets[0]; assert.ok(source.url.includes('wire=delta-v1'));
  for (const p of [first, same, patch]) source.onmessage({ data: JSON.stringify(p) });
  assert.deepEqual(JSON.parse(JSON.stringify(received[2].state.tiles)), changed.state.tiles);
  assert.equal(received[0].state.tiles[0][1].type, 'wall', 'later changes never mutate an archived frame');
  assert.equal(received[1].state.tiles[0][1].type, 'wall');
  changed.init = true; assert.ok(wire.encode(changed).state.tiles, 'reconnect receives a complete map');
  await n.leave();
});


test('stale saved online sessions cannot be reused when the game server is down, even if the PID was reused',async()=>{
  const {isExistingOnline}=require('../tools/online.js');let requests=0;const probe=async()=>{requests++;return{ok:true,json:async()=>({multiplayer:true,websocket:true,publicUrl:'https://old.trycloudflare.com'})};};
  assert.equal(await isExistingOnline('https://old.trycloudflare.com',null,probe),false);assert.equal(requests,0);
  assert.equal(await isExistingOnline('https://old.trycloudflare.com',{multiplayer:false,websocket:true},probe),false);assert.equal(requests,0);
});
test('online reuse requires a reachable public game endpoint for the advertised URL',async()=>{
  const {isExistingOnline}=require('../tools/online.js'),local={multiplayer:true,websocket:true},url='https://live.trycloudflare.com';
  assert.equal(await isExistingOnline(url,local,async()=>{throw Error('DNS failed')}),false);
  assert.equal(await isExistingOnline(url,local,async()=>({ok:false,status:502})),false);
  assert.equal(await isExistingOnline(url,local,async()=>({ok:true,json:async()=>({multiplayer:true,websocket:true,publicUrl:'https://other.trycloudflare.com'})})),false);
  let requested;assert.equal(await isExistingOnline(url,local,async u=>{requested=u;return{ok:true,json:async()=>({...local,publicUrl:url})}}),true);assert.equal(requested,url+'/api/health');
});

test('fresh online starts current code on a new free port even while an older server is running',async()=>{
 const {openGameServer}=require('../tools/online.js'),old=await openServer();let game;
 try{
  const health=await(await fetch(old.base+'/api/health')).json();game=await openGameServer({fresh:true,port:0,health});
  assert.ok(game.server);assert.notEqual(game.port,old.server.address().port);
  const base='http://127.0.0.1:'+game.port,current=await(await fetch(base+'/api/health')).json();
  assert.ok(current.operators.includes('mire'));assert.ok(current.operators.includes('halo'));
  const host=(await post(base,'/api/rooms',{name:'FRESH HOST',character:'mire'})).body;
  const guest=(await post(base,'/api/join',{room:host.code,name:'FRESH GUEST',character:'halo'})).body;
  assert.equal((await post(base,'/api/start',{room:host.code,token:host.token})).status,200);
  const room=game.server.hub.rooms.get(host.code);assert.equal(room.state.units[host.playerId].class,'mire');assert.equal(room.state.units[guest.playerId].class,'halo');
  assert.equal((await fetch(old.base+'/api/health')).status,200,'other servers stay alive');
 }finally{if(game?.server)await closeServer(game.server);await closeServer(old.server);}
});
test('regular online can reuse a healthy server, while fresh mode never reuses it',async()=>{
 const {openGameServer}=require('../tools/online.js'),health={multiplayer:true,websocket:true};
 const reused=await openGameServer({port:4173,health});assert.equal(reused.server,null);assert.equal(reused.port,4173);
 await assert.rejects(()=>openGameServer({port:4173,health:{multiplayer:false,websocket:false}}),/older/);
 let game;try{game=await openGameServer({fresh:true,port:0,health:{multiplayer:false}});assert.ok(game.server);}finally{if(game)await closeServer(game.server);}
});


test('public readiness checks the current server, page and authenticated socket and leaves no test room',async()=>{
 const {checkPublic}=require('../tools/online-ready.js'),{server,base}=await openServer();
 try{const health=await(await fetch(base+'/api/health')).json();assert.ok(health.instanceId);assert.equal(server.hub.rooms.size,0);
 const ready=await checkPublic(base,health);assert.equal(ready.instanceId,health.instanceId);assert.equal(server.hub.rooms.size,0);
 }finally{await closeServer(server);}
});
test('readiness rejects a different server before creating any test room',async()=>{
 const {checkPublic}=require('../tools/online-ready.js'),{server,base}=await openServer();let probed=false;
 try{await assert.rejects(()=>checkPublic(base,{instanceId:'old-server'},{probe:async()=>{probed=true;}}));assert.equal(probed,false);assert.equal(server.hub.rooms.size,0);
 }finally{await closeServer(server);}
});
test('a tunnel URL is not ready until temporary HTTP errors stop and WebSocket succeeds',async()=>{
 const {waitForPublicReady}=require('../tools/online-ready.js');let time=0,healthChecks=0,socketChecks=0;
 const fetcher=async url=>{if(url.endsWith('/api/health')){healthChecks++;if(healthChecks===1)return{ok:false,status:502};return{ok:true,json:async()=>({multiplayer:true,websocket:true,instanceId:'new'})};}return{ok:true,text:async()=>'<canvas id="arena"></canvas><script src="game.js"></script>'};};
 const ready=await waitForPublicReady('https://game.example',{instanceId:'new'},{fetcher,probe:async()=>{if(++socketChecks===1)throw Error('WebSocket not ready');},now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:4000});
 assert.equal(ready.instanceId,'new');assert.equal(healthChecks,3);assert.equal(socketChecks,2);assert.equal(time,2000);
});
test('blocked WebSocket and DNS never report an online-ready success',async()=>{
 const {waitForPublicReady}=require('../tools/online-ready.js');
 for(const dns of [true,false]){let time=0;
 const fetcher=async url=>{if(dns)throw Object.assign(Error('fetch failed'),{cause:{code:'ENOTFOUND'}});return url.endsWith('/api/health')?{ok:true,json:async()=>({multiplayer:true,websocket:true})}:{ok:true,text:async()=>'<canvas id="arena"></canvas><script src="game.js"></script>'};};
 await assert.rejects(()=>waitForPublicReady('https://game.example',{}, {fetcher,probe:async()=>{throw Error('WebSocket HTTP 403');},now:()=>time,sleep:async ms=>{time+=ms;},timeoutMs:2000}),dns?/ENOTFOUND/:/WebSocket HTTP 403/);
 }
});

 test('an expired room token stops socket retries and returns the player to room entry',async()=>{
 const fixture=networkFixture('https://play.trycloudflare.com/'),received=[],n=new fixture.Network(p=>received.push(p),()=>{});await n.enter(true,{});const source=fixture.sockets[0];source.onopen();fixture.context.fetch=async()=>({status:401,ok:false});await source.onerror();assert.equal(n.active,false);assert.equal(n.connected,false);assert.equal(received.at(-1).type,'removed');assert.equal(received.at(-1).reason,'offline');source.onclose();assert.equal(fixture.timers.size,0);
 });
