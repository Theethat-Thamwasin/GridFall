(function () {
  'use strict';
  class Network {
    constructor(onPacket, onConnection) { this.onPacket = onPacket; this.onConnection = onConnection; this.active = false; this.connected = false; this.locked = false; this.busy = false; this.fullReady = false; this.generation = 0; this.retryDelay = 500; this.online = location.protocol === 'https:'; }
    async post(path, data) { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const body = await r.json(); if (!r.ok) throw new Error(body.error || "Connection failed."); return body; }
    async enter(create, options) {
      if (this.active) await this.leave();
      const room = String(options.room || '').trim().toUpperCase();
      const token = create ? null : sessionStorage.getItem('gridfall-room-' + room);
      const health=await (await fetch('/api/health',{cache:'no-store'})).json();
      this.supportedOperators=health.operators||['vanguard','volt','deadeye','pyro','rook'];
      if(!token&&options.character&&!this.supportedOperators.includes(options.character))throw new Error("This server does not support that operator yet · Stop the old server and restart it");
      this.credentials = await this.post(create ? '/api/rooms' : '/api/join', { ...options, room, token });
      sessionStorage.setItem('gridfall-room-' + this.credentials.code, this.credentials.token);
      this.active = true; this.fullReady = false; this.locked = false;
      this.retryDelay = 500; this.connectStream(++this.generation);
      return this.credentials;
    }
    connectStream(generation) {
      if (!this.active || generation !== this.generation) return;
      const query = new URLSearchParams({ room: this.credentials.code, token: this.credentials.token });
      query.set('wire', 'delta-v1'); this.tiles = null;
      const url = new URL('/api/socket', location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.search = query.toString();
      const source = typeof WebSocket === 'function' ? new WebSocket(url.href) : new EventSource('/api/events?' + query);
      this.source = source;
      const current = () => this.active && generation === this.generation && this.source === source;
      source.onopen = () => { if (!current()) return; this.retryDelay = 500; this.connected = true; this.onConnection(); };
      source.onerror = async () => {if(!current())return;this.connected=false;this.onConnection();try{const r=await fetch('/api/member?'+query,{cache:'no-store'});if(current()&&(r.status===401||r.status===400)){this.detach();this.onPacket({type:'removed',reason:'offline'});}}catch{}};
      source.onmessage = e => {
        if (!current()) return;
        const packet = JSON.parse(e.data);
        if(packet.type==='removed'){this.detach();this.onPacket(packet);return;}
        if (packet.type === 'state') {
          if (packet.state.tiles) this.tiles = packet.state.tiles;
          else {
            if (!this.tiles || !Array.isArray(packet.tileChanges)) { source.close(); return; }
            const next = this.tiles.slice(), rows = new Set();
            for (const [x, y, tile] of packet.tileChanges) { if (!rows.has(y)) { next[y] = next[y].slice(); rows.add(y); } next[y][x] = tile; }
            this.tiles = next; packet.state.tiles = next;
          }
        }
        this.onPacket(packet);
      };
      source.onclose = () => {
        if (!current()) return; this.connected = false; this.onConnection();
        this.reconnectTimer = setTimeout(() => this.connectStream(generation), this.retryDelay);
        this.retryDelay = Math.min(8000, this.retryDelay * 2);
      };
    }
    async command(data) { if (this.busy || !this.connected) throw new Error("Connecting · Please wait."); this.busy = true; this.onConnection(); try { return await this.post('/api/command', { ...data, room: this.credentials.code, token: this.credentials.token }); } finally { this.busy = false; this.onConnection(); } }
    returnRoom() {return this.post('/api/return',{room:this.credentials.code,token:this.credentials.token});}
    kick(targetId) {return this.post('/api/kick',{room:this.credentials.code,token:this.credentials.token,targetId});}
    detach() {const c=this.credentials;this.active=this.connected=this.locked=this.busy=false;++this.generation;clearTimeout(this.reconnectTimer);this.source?.close();if(c)sessionStorage.removeItem('gridfall-room-'+c.code);}
    start() { return this.post('/api/start', { room: this.credentials.code, token: this.credentials.token }); }
    updateLobby(data) { if(data.character&&this.supportedOperators&&!this.supportedOperators.includes(data.character))return Promise.reject(new Error("This server does not support that operator yet · Stop the old server and restart it"));return this.post('/api/lobby', { ...data, room: this.credentials.code, token: this.credentials.token }); }
    async archive() { const r = await fetch('/api/replay?' + new URLSearchParams({ room: this.credentials.code, token: this.credentials.token })); const body = await r.json(); if (!r.ok) throw new Error(body.error); return body.turns.map(turn => ({ ...turn, frames: turn.frames.map(frame => ({ ...frame, tiles: body.terrains[frame.terrainIndex] })) })); }
    async invitation() { const code = this.credentials?.code; let url = new URL(location.href); url.search = ''; url.hash = ''; if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) { try { const health = await (await fetch('/api/health')).json(); if (health.publicUrl) url = new URL(health.publicUrl); else if (health.addresses[0]) url.hostname = health.addresses[0]; if (this.active && this.credentials?.code === code && this.online !== !!health.publicUrl) { this.online = !!health.publicUrl; this.onConnection(); } } catch {} } url.searchParams.set('room', code); return url.href; }
    async leave() { if (!this.active) return; const c = this.credentials; this.active = this.connected = this.locked = this.busy = false; ++this.generation; clearTimeout(this.reconnectTimer); this.source?.close(); sessionStorage.removeItem('gridfall-room-' + c.code); try { await this.post('/api/leave', { room: c.code, token: c.token }); } catch {} }
  }
  window.GridfallNetwork = Network;
})();
