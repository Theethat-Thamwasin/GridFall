const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RoomHub } = require('./multiplayer.js');
const { TIMING, CLASSES } = require('./engine.js');
const { WebSocketServer, WebSocket } = require('ws');
const { publishedUrl,normalizePublicUrl } = require('./online-config.js');
const { TerrainWire } = require('./wire.js');
const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8' };
const publicFiles = new Set(['mobile.css','mobile-ui.js','touch-controls.js','bot-arena.html','bot-arena.css','bot-arena.js','bot-arena-view.js','assets/tutorial-zoom.mp4','assets/tutorial-zoom.png','assets/tutorial-zoom.vtt','assets/tutorial-pan.mp4','assets/tutorial-pan.png','assets/tutorial-pan.vtt','assets/tutorial-route.mp4','assets/tutorial-route.png','assets/tutorial-route.vtt', 'training-team.css','walkthrough.js','index.html', 'practice.js', 'practice-ui.js', 'refinement.css', 'interface.css','match-ui.css', 'menu-art.css', 'assets/menu-neon-frontline.png','assets/menu-neon-wraith.png', 'style.css', 'replay.css', 'presentation.css', 'presentation.js','operator-art.js', 'effects.js', 'hud.css', 'engine.js', 'vision.js', 'fate.js', 'fate-ui.js', 'fate.css', 'tactics.js', 'movement.js', 'audio.js', 'music.js', 'Circuit Tactics.mp3', 'replay.js', 'motion.js', 'game.js', 'network.js']);
function lanAddresses(interfaces = os.networkInterfaces()) {
  return [...new Set(Object.entries(interfaces).flatMap(([name, entries]) => entries.filter(i => i.family === 'IPv4' && !i.internal).map(i => ({ address: i.address, rank: /vmware|virtual|vbox|docker|wsl|vpn|tunnel|loopback|tailscale|zerotier/i.test(name) ? 0 : /wi[- ]?fi|wlan|wireless|ethernet|local area/i.test(name) ? 100 : 50 }))).sort((a,b) => b.rank-a.rank).map(i => i.address))];
}
function createServer(options = {}) {
  const hub = options.hub || new RoomHub(),instanceId=require('node:crypto').randomUUID();let tunnelUrl=null;
  const publicUrl = () => tunnelUrl||publishedUrl(options.publicUrl || process.env.PUBLIC_URL, server.address()?.port);
  const allowedOrigin = req => {
    if (!req.headers.origin) return true;
    try { const origin = new URL(req.headers.origin).origin; return new URL(origin).host === req.headers.host || origin === publicUrl(); } catch { return false; }
  };
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const server = http.createServer(async (req, res) => {
    let url; try { url = new URL(req.url, 'http://' + req.headers.host); } catch { res.writeHead(400).end(); return; }
    if (url.pathname.startsWith('/api/')) {
      try {
        if (!allowedOrigin(req)) { json(res, 403, { error: 'Origin rejected' }); return; }
        if (req.method === 'GET' && url.pathname === '/api/health') { json(res, 200, { status: 'ok', instanceId, multiplayer: true, websocket: true, operators:Object.keys(CLASSES), publicUrl: publicUrl(), addresses: lanAddresses() }); return; }
        if (req.method === 'GET' && url.pathname === '/api/events') {
          const code = url.searchParams.get('room'), token = url.searchParams.get('token'); hub.get(code, token);
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.write(': connected\n\n');
          const disconnect = hub.connect(code, token, message => { if (res.writableLength > 2000000) res.destroy(); if (!res.destroyed) res.write('data: ' + JSON.stringify(message) + '\n\n'); });
          const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000); res.on('close', () => { clearInterval(heartbeat); disconnect(); }); return;
        }
        if(req.method==='GET'&&url.pathname==='/api/member'){hub.get(url.searchParams.get('room'),url.searchParams.get('token'));json(res,200,{ok:true});return;}
        if (req.method === 'GET' && url.pathname === '/api/replay') { json(res, 200, hub.replay(url.searchParams.get('room'), url.searchParams.get('token'))); return; }
        if (req.method !== 'POST') { json(res, 404, { error: 'Not found' }); return; }
        let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 8192) { json(res, 413, { error: 'Request too large' }); return; } }
        const body = JSON.parse(text || '{}');
        if (url.pathname === '/api/rooms') { json(res, 201, hub.create(body)); return; }
        if (url.pathname === '/api/join') { json(res, 200, hub.join(body.room, body)); return; }
        if (url.pathname === '/api/start') hub.start(body.room, body.token);
        else if (url.pathname === '/api/lobby') hub.updateLobby(body.room, body.token, body);
        else if (url.pathname === '/api/command') hub.command(body.room, body.token, body);
        else if (url.pathname === '/api/return') hub.returnRoom(body.room,body.token);
        else if (url.pathname === '/api/kick') hub.kick(body.room,body.token,body.targetId);
        else if (url.pathname === '/api/leave') hub.leave(body.room, body.token);
        else { json(res, 404, { error: 'Not found' }); return; }
        json(res, 200, { ok: true });
      } catch (error) { json(res, error.status || 400, { error: error.message || 'Request failed' }); }
      return;
    }
    let filename;try{filename=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));}catch{res.writeHead(400).end('Bad request');return;}
    if (!publicFiles.has(filename)) { res.writeHead(404).end('Not found'); return; }
    const filePath=path.join(root,filename),extension=path.extname(filename);
    fs.stat(filePath,(error,stat)=>{
      if(error||!stat.isFile()){res.writeHead(404).end('Not found');return;}
      // Revalidate every reuse so new deployments never reuse stale game rules.
      const etag='W/"'+stat.size.toString(16)+'-'+stat.mtimeMs.toString(16)+'-'+stat.ctimeMs.toString(16)+'"',cacheHeaders={'Cache-Control':'public, no-cache',ETag:etag,'Last-Modified':stat.mtime.toUTCString()};
      const matches=req.headers['if-none-match']?.split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===etag.replace(/^W\//,''));
      if((req.method==='GET'||req.method==='HEAD')&&!req.headers.range&&matches){res.writeHead(304,cacheHeaders).end();return;}
      if(req.method==='HEAD'&&!req.headers.range){res.writeHead(200,{...cacheHeaders,'Content-Type':types[extension],'Content-Length':stat.size,...(extension==='.mp4'?{'Accept-Ranges':'bytes'}:{})}).end();return;}
    fs.readFile(filePath, (error, data) => {
      if (error) { res.writeHead(404).end('Not found'); return; }
      const media=extension==='.mp4',headers={ ...cacheHeaders,'Content-Type': types[extension], 'Content-Length':data.length };
      if(media)headers['Accept-Ranges']='bytes';
      if(media&&req.headers.range){
        const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range),size=data.length;
        let start=match?.[1]?Number(match[1]):null,end=match?.[2]?Number(match[2]):null;
        if(match&&start===null&&end>0){start=Math.max(0,size-end);end=size-1;}else if(start!==null){end=end===null?size-1:Math.min(end,size-1);}
        if(!match||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return;}
        headers['Content-Range']='bytes '+start+'-'+end+'/'+size;headers['Content-Length']=end-start+1;
        res.writeHead(206,headers);res.end(req.method==='HEAD'?undefined:data.subarray(start,end+1));return;
      }
      res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:data);
    });
    });
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true, concurrencyLimit: 4, zlibDeflateOptions: { level: 3 } } });
  server.on('upgrade', (req, socket, head) => {
    const reject = status => { socket.end('HTTP/1.1 ' + status + ' Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); };
    socket.on('error', () => {});
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (url.pathname !== '/api/socket') { reject(404); return; }
      if (!allowedOrigin(req)) { reject(403); return; }
      const code = url.searchParams.get('room'), token = url.searchParams.get('token'); hub.get(code, token);
      const wire = url.searchParams.get('wire') === 'delta-v1' ? new TerrainWire() : null;
      sockets.handleUpgrade(req, socket, head, ws => {
        sockets.emit('connection', ws, req); ws.alive = true;
        ws.on('pong', () => { ws.alive = true; }); ws.on('error', () => {});
        // Commands stay on the validated HTTP API; this socket only receives state.
        ws.on('message', () => ws.close(1008, 'Use the command API'));
        const disconnect = hub.connect(code, token, message => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (ws.bufferedAmount > 2000000) { ws.terminate(); return; }
          ws.send(JSON.stringify(wire ? wire.encode(message) : message));
        });
        ws.once('close', disconnect);
      });
    } catch (error) { reject(error.status || 400); }
  });
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
  }, 20000); heartbeat.unref();
  // Stop upgraded connections too, so restarting the local server reconnects clients.
  server.once('close', () => { clearInterval(heartbeat); for (const ws of sockets.clients) ws.terminate(); sockets.close(); });
  server.sockets = sockets;
  const timer = setInterval(() => hub.tick(), TIMING.tickMs); timer.unref(); server.on('close', () => clearInterval(timer)); server.hub = hub;server.setPublicUrl=url=>{tunnelUrl=normalizePublicUrl(url);}; return server;
}
if (require.main === module) { const port = Number(process.env.PORT || 4173), host = process.env.HOST || '0.0.0.0'; createServer().listen(port, host, () => console.log('GRIDFALL realtime ready at http://localhost:' + port + ' (LAN / online tunnels enabled)')); }
module.exports = { createServer, lanAddresses };
