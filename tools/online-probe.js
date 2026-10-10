const WebSocket = require('ws'), assert = require('node:assert/strict');
const base = process.env.GRIDFALL_TEST_URL;
async function post(endpoint, body) { const r = await fetch(new URL(endpoint, base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); assert.ok(r.ok, 'HTTP ' + r.status); return r.json(); }
(async () => {
  const a = await post('/api/rooms', { name: 'NET PROBE A', cinematic: false, planningSeconds: 60 }), b = await post('/api/join', { room: a.code, name: 'NET PROBE B', cinematic: false });
  const ws = new WebSocket(base.replace('https:', 'wss:') + 'api/socket?' + new URLSearchParams({ room: a.code, token: a.token, wire: 'delta-v1' }), { origin: new URL(base).origin });
  let timer, first, last, packets = 0, bytes = 0;
  const complete = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('No completed public resolution')), 45000);
    ws.on('error', reject);
    ws.on('message', data => {
      const p = JSON.parse(data); if (p.type !== 'state') return;
      packets++; bytes += data.length;
      if (p.state.phase === 'resolution' && !first) first = Date.now();
      if (p.state.tick >= 20 && (!last || p.state.tick - last >= 20)) { last = p.state.tick; console.log(JSON.stringify({ tick: last, elapsedMs: Date.now() - first, packets })); }
      if (p.state.turn === 2) resolve({ elapsedMs: Date.now() - first, packets, bytes, compression: ws.extensions });
    });
  });
  try {
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    await post('/api/start', { room: a.code, token: a.token });
    for (const c of [a, b]) await post('/api/command', { room: c.code, token: c.token, action: 'lock', turn: 1, plan: [{ type: 'guard' }, { type: 'guard' }] });
    console.log(JSON.stringify({ result: 'PASS', ...await complete }));
  } finally { clearTimeout(timer); ws.terminate(); for (const c of [a, b]) await post('/api/leave', { room: c.code, token: c.token }).catch(() => {}); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
