const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createServer } = require('../server.js');
const {waitForPublicReady}=require('./online-ready.js');
const { configFile, normalizePublicUrl, publishedUrl } = require('../online-config.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const CLOUD = { version: '2026.9.3', sha256: 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2' };
const binary = path.join(__dirname, 'bin', 'cloudflared.exe');
async function installCloudflared() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Install cloudflared for your OS, then set CLOUDFLARED_PATH to its executable.');
  const matches = data => crypto.createHash('sha256').update(data).digest('hex') === CLOUD.sha256;
  if (fs.existsSync(binary) && matches(fs.readFileSync(binary))) return binary;
  console.log('Downloading verified Cloudflare tunnel client ' + CLOUD.version + ' into tools/bin…');
  const url = 'https://github.com/cloudflare/cloudflared/releases/download/' + CLOUD.version + '/cloudflared-windows-amd64.exe';
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new Error('Cloudflare download failed: HTTP ' + response.status);
  const chunks = []; let bytes = 0, reported = 0;
  for await (const chunk of response.body) { chunks.push(chunk); bytes += chunk.length; if (bytes - reported >= 4 * 1024 * 1024) { reported = bytes; console.log('Downloaded ' + Math.round(bytes / 1024 / 1024) + ' MB…'); } }
  const data = Buffer.concat(chunks); if (!matches(data)) throw new Error('Cloudflare download checksum did not match.');
  fs.mkdirSync(path.dirname(binary), { recursive: true }); fs.writeFileSync(binary, data);
  return binary;
}
function parsePublicUrl(text, provider) {
  const match = provider === 'ngrok' ? text.match(/url=(https:\/\/[^\s"']+)/) : text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return match ? normalizePublicUrl(match[1] || match[0]) : null;
}
async function readHealth(base,fetchHealth=globalThis.fetch,timeoutMs=2500) {
  try { const response=await fetchHealth(base+'/api/health',{signal:AbortSignal.timeout(timeoutMs),cache:'no-store'});return response.ok?await response.json():null; } catch { return null; }
}
async function isExistingOnline(url,localHealth,fetchHealth=globalThis.fetch) {
  if(!url||!localHealth?.multiplayer||!localHealth.websocket)return false;
  const remote=await readHealth(url,fetchHealth,5000);
  return !!(remote?.multiplayer&&remote.websocket&&remote.publicUrl===url);
}
async function openGameServer({fresh=false,port=4173,health=null}={}) {
  if(!fresh&&health){
    if(!health.multiplayer||!health.websocket)throw new Error('Port '+port+' is running an older/different server. Restart GRIDFALL with npm start first.');
    return {server:null,port};
  }
  const server=createServer();
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});}
  catch(error){server.close();throw error;}
  return {server,port:server.address().port};
}
async function run() {
  const provider = process.argv.includes('--ngrok') ? 'ngrok' : 'cloudflare',fresh=process.argv.includes('--fresh');
  let port=fresh?0:Number(process.env.PORT||4173);
  if (!Number.isInteger(port) || port < (fresh?0:1) || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const health=fresh?null:await readHealth('http://127.0.0.1:'+port,globalThis.fetch,2000),existing=fresh?null:publishedUrl(null,port),newLink=fresh||process.argv.includes('--new-link');
  if(existing&&!newLink){
    if(await isExistingOnline(existing,health)){console.log('GRIDFALL is already online: '+existing+'\nNew link: npm run online:new\nLatest code + new server + new link: npm run online:fresh');return;}
    console.log('The saved online link is no longer reachable. Opening a new tunnel.');
  }
  if(fresh)console.log('Starting a fresh GRIDFALL server from the current code, with a new public link.');
  else if(newLink)console.log('Requesting a new public link. Existing game server processes are kept running.');
  const executable = provider === 'ngrok' ? process.env.NGROK_PATH || 'ngrok' : process.env.CLOUDFLARED_PATH || await installCloudflared();
  let server, tunnel, cleaning = false, online = false, checking=false,watchdog;
  function cleanup() {
    if (cleaning) return; cleaning = true; clearTimeout(watchdog);
    if (tunnel) tunnel.kill();
    if (server) { for (const ws of server.sockets.clients) ws.terminate(); server.closeAllConnections(); server.close(); }
    try { if (JSON.parse(fs.readFileSync(configFile, 'utf8')).pid === process.pid) fs.unlinkSync(configFile); } catch {}
  }
  process.once('exit', cleanup);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup(); process.exit(0); });
  try {
    const game=await openGameServer({fresh,port,health});server=game.server;port=game.port;
    console.log((server?'Started '+(fresh?'fresh ':''):'Using existing ')+'GRIDFALL server on port '+port+'.');
    if(fresh)console.log('Local game: http://localhost:'+port+' · Latest operators: '+Object.keys(require('../engine.js').CLASSES).map(id=>require('../engine.js').CLASSES[id].name).join(', '));
    const args = provider === 'ngrok' ? ['http', 'http://127.0.0.1:' + port, '--log=stdout', '--log-format=logfmt'] : ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:' + port];
    console.log('Opening ' + provider + ' tunnel…');
    tunnel = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const ready = async url => {
      if (!url || online || checking || cleaning) return;checking=true;
      console.log('กำลังตรวจหน้าเกมและการเชื่อมต่อออนไลน์…');
      server?.setPublicUrl(url);
      // Reused servers read the active URL from this session file.
      if(!server)fs.writeFileSync(configFile,JSON.stringify({publicUrl:url,port,pid:process.pid,provider},null,2));
      try{
        const local=await readHealth('http://127.0.0.1:'+port);
        if(!local?.multiplayer)throw Error('เซิร์ฟเวอร์เกมในเครื่องไม่ตอบสนอง');
        await waitForPublicReady(url,local,{cancelled:()=>cleaning});
        if(cleaning)return;online=true;clearTimeout(watchdog);
        fs.writeFileSync(configFile, JSON.stringify({ publicUrl: url, port, pid: process.pid, provider,ready:true }, null, 2));
        console.log('\nGRIDFALL ONLINE READY: '+url+'\nตรวจหน้าเกมและ WebSocket แล้ว · เปิดลิงก์นี้เพื่อ CREATE ROOM และ COPY LINK\nเปิดหน้าต่างนี้ค้างไว้ระหว่างเล่น · Ctrl+C เพื่อปิด\n');
        if(process.argv.includes('--open-browser')){const browser=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','rundll32.exe'),['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});browser.once('error',()=>console.log('เปิดเบราว์เซอร์แล้วเข้า '+url));}
      }catch(error){if(cleaning)return;console.error(error.message+'\nลองเปิด ONLINE-FRESH.cmd ใหม่ หรือใช้ ONLINE-CHECK.cmd เพื่อตรวจปัญหา');fs.writeFileSync(path.join(__dirname,'online-last-error.txt'),new Date().toISOString()+'\n'+error.message+'\n');cleanup();process.exitCode=1;}
    };
    let log = '';
    const output = chunk => {
      log = (log + chunk.toString()).slice(-12000);
      const url = parsePublicUrl(log, provider); if (url) ready(url);
      const lines = chunk.toString().split(/\r?\n/).filter(line => /\bERR\b|\bERROR\b|level=error/.test(line));
      // Only emit diagnostics, never the room socket requests or authentication tokens.
      for (const line of lines) console.error(line.replace(/(authtoken|token|authorization)[=:]\s*[^\s,]+/gi, '$1=[redacted]'));
    };
    tunnel.stdout.on('data', output); tunnel.stderr.on('data', output);
    tunnel.once('error', error => { console.error('Could not launch ' + provider + ': ' + error.message); cleanup(); process.exitCode = 1; });
    tunnel.once('exit', code => { if (!cleaning) { console.error(provider + ' tunnel stopped (code ' + code + ').'); cleanup(); process.exitCode = code || 1; } });
    watchdog = setTimeout(() => { if (!online) { console.error('Online connection did not become ready. Check the internet connection, or run ONLINE-CHECK.cmd.'); cleanup(); process.exitCode = 1; } }, 120000);
    // ngrok also exposes the assigned HTTPS URL via its local agent API.
    if (provider === 'ngrok') for (let n = 0; n < 40 && !online && !cleaning; n++) {
      await wait(250); try { const r = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(1000) }), body = await r.json(); const entry = body.tunnels?.find(t => t.proto === 'https' && new URL(t.config.addr).port === String(port)); if (entry) ready(normalizePublicUrl(entry.public_url)); } catch {}
    }
  } catch (error) { cleanup(); throw error; }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { parsePublicUrl, installCloudflared, readHealth, isExistingOnline, openGameServer };
