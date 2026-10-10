const crypto = require('node:crypto');
const G = require('./engine.js'), R = require('./replay.js');
const clone = value => structuredClone(value);
// Terrain is published as immutable snapshots; compare values before copying.
function sameTerrainValue(a,b,ignoreLoot=false){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  const keys=Object.keys(a),other=Object.keys(b);
  if(keys.length!==other.length)return false;
  for(const key of keys){if(ignoreLoot&&key==='loot')continue;if(!Object.hasOwn(b,key)||!sameTerrainValue(a[key],b[key]))return false;}
  return true;
}
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function validatePlan(s, id, input) {
  const u = s.units[id], w = G.weaponStats(u);
  if (!u.alive || s.phase !== 'planning' || !Array.isArray(input) || input.length > 2) fail("Cannot plan during this phase.");
  let from = { x: u.x, y: u.y }, ammo = u.ammo, reserve = u.reserve, meds = u.medkits, grenades = u.grenades, smoke = u.smoke, skill = u.skillCooldown > 0, moved = false;
  const plan = [],forecastState={...s,fields:G.observedFields(s,u)};
  for (const a of input) {
    if (!a || typeof a.type !== 'string') fail("Invalid action.");
    const target = a.target, validTarget = () => target && Number.isInteger(target.x) && Number.isInteger(target.y) && !!G.tile(s, target.x, target.y);
    if (['move', 'skillMove'].includes(a.type)) {
      if (!validTarget() || (a.type === 'skillMove' && (u.class !== 'vanguard' || skill))) fail("Cannot move.");
      const movement=G.movementForecast(forecastState,u,plan);
      const budget=Math.min(movement.remaining,a.type==='skillMove'?G.SKILLS.dashRange:G.moveRange(s,u)); const path = a.path!==undefined ? G.validateRoute(s,from,a.path,budget,target)?.path : G.pathfind(s,from,target,budget); if (!path?.length||path.slice(0,-1).some(p=>G.inField({...s,fields:movement.fields},p,'stasis'))) fail("Destination is out of range or blocked.");
      plan.push({ type: a.type, path, target: { x: target.x, y: target.y } }); from = { x: target.x, y: target.y }; moved = true; if (a.type === 'skillMove') skill = true;
    } else if (a.type === 'blink') {
      if (u.class !== 'volt' || skill || !validTarget() || !G.passable(s, target.x, target.y) || !G.visible(s, from, target, Math.min(G.SKILLS.blinkRange,G.movementForecast(forecastState,u,plan).remaining))) fail("Invalid teleport destination.");
      plan.push({ type: 'blink', target: { x: target.x, y: target.y } }); from = { x: target.x, y: target.y }; skill = true; moved = true;
    } else if (a.type === 'scan') {
      if (u.class !== 'deadeye' || skill) fail("Skill unavailable."); skill = true; plan.push({ type: 'scan' });
    } else if (a.type === 'reflect') {
      if (u.class !== 'rook' || skill) fail("Skill unavailable."); skill = true; plan.push({ type: 'reflect' });
    } else if (['firebomb','stasis','mend'].includes(a.type)) {
      if (G.CLASSES[u.class].skillType !== a.type || skill || !validTarget() || G.distance(from, target) > 5 || (a.type!=='firebomb'&&!G.passable(s,target.x,target.y))) fail("Skill unavailable.");
      skill = true; plan.push({ type: a.type, target: { x: target.x, y: target.y } });
    } else if (a.type === 'shoot' || a.type === 'slash') {
      if (!Number.isFinite(a.angle)) fail("Invalid aim angle.");
      if (a.type === 'shoot') { if (ammo < w.shots || (G.WEAPONS[u.weapon].stationary && moved)) fail("Not enough ammo, or Sniper already moved."); ammo -= w.shots; }
      plan.push({ type: a.type, angle: Math.atan2(Math.sin(a.angle), Math.cos(a.angle)) });
    } else if (a.type === 'reload') {
      const amount = Math.min(w.mag - ammo, reserve); if (amount <= 0) fail("Cannot reload."); ammo += amount; reserve -= amount; plan.push({ type: 'reload' });
    } else if (a.type === 'heal') {
      if (meds-- <= 0 || u.hp >= G.FATE.stats(u).maxHp) fail("Cannot heal."); plan.push({ type: 'heal' });
    } else if (a.type === 'grenade' || a.type === 'smoke') {
      if (!validTarget() || G.distance(from, target) > (a.type === 'grenade' ? 6 : 5)) fail("Throw out of range.");
      if (a.type === 'grenade' ? grenades-- <= 0 : smoke-- <= 0) fail("Item unavailable."); plan.push({ type: a.type, target: { x: target.x, y: target.y } });
    } else if (a.type === 'guard' || a.type === 'wait') plan.push({ type: a.type });
    else fail("Unknown action.");
  }
  while (plan.length < 2) plan.push({ type: 'wait' }); return plan;
}
class RoomHub {
  constructor({ now = () => Date.now(), planningMs = null, disconnectGraceMs = 10000 } = {}) { this.rooms = new Map(); this.now = now; this.planningMs = planningMs; this.disconnectGraceMs=disconnectGraceMs; }
  create(options = {}) {
    if (this.rooms.size >= 64) fail("Room full. Try another room.");
    let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (this.rooms.has(code));
    const room = { code, host: null, members: [], state: null, stage: 'lobby', locked: {}, connections: new Map(), archive: new R.MatchArchive(), touched: this.now(), seq: 0, matchId: 0 };
    try { this.rooms.set(code, room); return this.join(code, options); } catch (error) { this.rooms.delete(code); throw error; }
  }
  get(code, token) {
    const room = this.rooms.get(String(code).toUpperCase()); if (!room) fail("Room not found.");
    const member = room.members.find(m => m.token === token && !m.exited); if (!member) throw Object.assign(new Error("Join a room first."), { status: 401 });
    room.touched = this.now(); return { room, member };
  }
  join(code, options = {}) {
    const room = this.rooms.get(String(code).toUpperCase()); if (!room) fail("Room not found.");
    if (options.token) { const m = room.members.find(m => m.token === options.token && !m.exited); if (m) return this.credentials(room, m); throw Object.assign(new Error("Join a room first."),{status:401}); }
    if (room.members.length >= 8) fail("Room already has 8 players.");
    if ('name' in options && (typeof options.name !== 'string' || !options.name.trim())) fail("Enter your name before joining.");
    const id = Array.from({ length: 8 }, (_, n) => n).find(n => !room.members.some(m => m.id === n));
    const member = { id, token: crypto.randomBytes(24).toString('hex'), name: String(options.name || 'PLAYER ' + (id + 1)).trim().slice(0, 16) || 'PLAYER', class: G.CLASSES[options.character] ? options.character : 'vanguard', connected: false, disconnectedAt:this.now(), waiting:!!room.state, matchId:null };
    room.members.push(member); if (room.host === null) room.host = id;
    if (!room.options) room.options = { mapId: G.normalizeMap(options.mapId), planningSeconds: Math.max(15, Math.min(60, Number(options.planningSeconds) || 20)), botCount: 7, mode:options.mode==='team'?'team':'ffa', botTeams:{} };
    const counts={A:room.members.filter(m=>m!==member&&m.team==='A').length,B:room.members.filter(m=>m!==member&&m.team==='B').length};
    member.team=['A','B'].includes(options.team)&&counts[options.team]<4?options.team:counts.A<=counts.B?'A':'B';
    room.options.botCount = Math.min(room.options.botCount, 8 - room.members.length);
    this.broadcastLobby(room); return this.credentials(room, member);
  }
  credentials(room, member) { return { code: room.code, token: member.token, playerId: member.id }; }
  updateLobby(code, token, changes = {}) {
    const { room, member } = this.get(code, token);
    if (room.state && room.stage!=='ended' && !member.waiting) fail("Match started. Room settings are locked.");
    if(room.state && room.stage!=='ended' && ('mapId' in changes || 'botCount' in changes || 'mode' in changes || 'botTeams' in changes)) fail("Wait for the match to finish before changing room settings.");
    if (Object.keys(changes).some(k => !['room', 'token', 'name', 'character', 'mapId', 'botCount','mode','team','botTeams'].includes(k))) fail("Only name, operator and map settings can be changed.");
    if ('mapId' in changes && (room.host !== member.id || !G.MAPS[changes.mapId])) fail("Only the host can choose the map.");
    if ('character' in changes && !G.CLASSES[changes.character]) fail("Invalid operator.");
    if ('botCount' in changes && (room.host !== member.id || !Number.isInteger(changes.botCount) || changes.botCount < 0 || changes.botCount > 8 - room.members.length)) fail("Only the host can adjust bots, within the available slots.");
    if('mode' in changes&&(room.host!==member.id||!['ffa','team'].includes(changes.mode)))fail('Only the host can choose the match mode.');
    if('team' in changes&&(!['A','B'].includes(changes.team)||room.members.filter(m=>m!==member&&m.team===changes.team).length>=4))fail('That team already has 4 players.');
    if('botTeams' in changes){if(room.host!==member.id||!changes.botTeams||typeof changes.botTeams!=='object'||Array.isArray(changes.botTeams))fail('Only the host can move bots.');const bots=this.teamBots(room),counts={A:room.members.filter(m=>m.team==='A').length,B:room.members.filter(m=>m.team==='B').length};for(const b of bots){const team=changes.botTeams[b.id]||b.team;if(!['A','B'].includes(team))fail('Invalid bot team.');counts[team]++;}if(Object.keys(changes.botTeams).some(id=>!bots.some(b=>b.id===Number(id)))||counts.A>4||counts.B>4)fail('Teams allow at most 4 operators per side.');}
    const name = 'name' in changes ? String(changes.name).trim().slice(0, 16) : member.name;
    if (!name) fail("Enter a player name.");
    member.name = name;
    if ('character' in changes) member.class = changes.character;
    if ('mapId' in changes) room.options.mapId = changes.mapId;
    if ('botCount' in changes) room.options.botCount = changes.botCount;
    if('mode' in changes)room.options.mode=changes.mode;
    if('team' in changes)member.team=changes.team;
    if('botTeams' in changes)room.options.botTeams={...room.options.botTeams,...changes.botTeams};
    this.broadcastLobby(room);
  }
  participants(room) { return room.members.filter(m=>!m.waiting&&m.matchId===room.matchId); }
  matchRunning(room) { return !!room.state && room.stage!=='ended'; }
  watchTarget(room, member) {
    if (room.state.units[member.id].alive || member.spectating == null) return null;
    if (!room.state.units[member.spectating]?.alive) member.spectating = room.state.units.find(u => u.alive)?.id ?? null;
    return member.spectating;
  }
  teamBots(room){const counts={A:room.members.filter(m=>m.team==='A').length,B:room.members.filter(m=>m.team==='B').length};return this.botIds(room).map(id=>{const preferred=room.options.botTeams?.[id];const team=['A','B'].includes(preferred)&&counts[preferred]<4?preferred:counts.A<=counts.B?'A':'B';counts[team]++;return{id,name:'BOT '+(id+1),team};});}
  botIds(room) { return Array.from({length:8}, (_, id) => id).filter(id => !room.members.some(m => m.id === id)).slice(0, room.options.botCount); }
  lobby(room) { return { bots: this.teamBots(room), type: 'lobby', matchId:room.matchId, matchRunning:this.matchRunning(room), stage:room.stage, code: room.code, host: room.host, options: room.options, members: room.members.map(({ id, name, class: character, connected, waiting,team }) => ({ id, name, character, connected, waiting,team })), locked: Object.keys(room.locked).map(Number) }; }
  send(room, member, message) { const sink = room.connections.get(member.id); if (sink) sink(message); }
  broadcastLobby(room) { for (const m of room.members) {if(room.state&&!m.waiting)this.sendState(room,m);else this.send(room,m,this.lobby(room));} }
  connect(code, token, sink) {
    const { room, member } = this.get(code, token); room.connections.set(member.id, sink); member.connected = true;member.disconnectedAt=null;
    if (room.state&&!member.waiting) this.sendState(room, member, [], true); else this.broadcastLobby(room);
    return () => { if (room.connections.get(member.id) === sink) { room.connections.delete(member.id); member.connected = false;member.disconnectedAt=this.now(); if (!room.state||member.waiting) this.broadcastLobby(room); } };
  }
  start(code, token) {
    const { room, member } = this.get(code, token); if (member.id !== room.host || !['lobby','ended'].includes(room.stage)) fail("Only the host can start the match.");
    const activeIds = [...room.members.map(m => m.id), ...this.botIds(room)];
    if (activeIds.length < 2) fail("At least 2 players or bots are required.");
    const teamAssignments=Object.fromEntries([...room.members,...this.teamBots(room)].map(m=>[m.id,m.team]));
    if(room.options.mode==='team'&&(!Object.values(teamAssignments).includes('A')||!Object.values(teamAssignments).includes('B')))fail('Add at least one operator to each team.');
    room.matchId++;for(const m of room.members){m.waiting=false;m.spectating=null;m.matchId=room.matchId;}room.pendingEvents=[];room.clashOutcome=null;
    const s = G.createState(crypto.randomBytes(4).readUInt32LE(), 'vanguard', room.options.mapId, {activeIds,mode:room.options.mode,teams:teamAssignments});
    const operators=Object.keys(G.CLASSES);
    for (const id of this.botIds(room)) Object.assign(s.units[id],{name:'BOT '+(id+1),class:operators[crypto.randomInt(operators.length)]});
    for (const m of room.members) Object.assign(s.units[m.id], { name: m.name, class: m.class });
    for (const u of s.units) u.stats = { kills: 0, shots: 0, damage: 0 };
    s.humanIds=room.members.map(m=>m.id); room.state = s; room.baseTerrain = clone(s.tiles).map(row => row.map(t => ({ ...t, loot: null }))); room.knowledge = new Map(); room.terrainViews=new Map(); room.archive = new R.MatchArchive(); this.planning(room); this.broadcastState(room, [], true);
  }
  planning(room) {
    const botsOnly=!this.participants(room).some(m=>room.state.units[m.id]?.alive);
    if(G.FATE.open(room.state)){
      room.stage='draft';room.locked={};room.deadline=this.now()+(botsOnly?0:G.FATE.DRAFT_MS);
      for(const u of room.state.units)if(u.alive&&!this.participants(room).some(m=>m.id===u.id)){try{G.FATE.pick(room.state,u.id,G.FATE.botPick(room.state,u.id));}catch{}}
      return;
    }
    room.state.phase='planning';room.stage = 'planning'; room.locked = {}; room.botPlans = {};
    for (const u of room.state.units) if (u.alive && !this.participants(room).some(m => m.id === u.id)) room.botPlans[u.id] = G.planBot(room.state, u.id);
    room.deadline = this.now() + (botsOnly?0:(this.planningMs ?? room.options.planningSeconds * 1000));
  }
  command(code, token, message = {}) {
    const { room, member } = this.get(code, token), s = room.state;
    if(member.waiting)fail("Wait for the next match.");
    if(message.action==='clash'){
      if(!s||room.stage!=='clash'||this.now()>=room.deadline||!G.chooseClash(s,member.id,message.choice,message.clashId))fail('Clash choice unavailable');
      this.broadcastState(room);return;
    }
    if(message.action==='draft'){
      if(!s||room.stage!=='draft'||!s.units[member.id].alive||this.now()>=room.deadline)fail('Draft has closed');
      try{G.FATE.pick(s,member.id,message);}catch(error){fail(error.message);}
      if(this.participants(room).filter(m=>s.units[m.id].alive).every(m=>s.fate.draft.picks[m.id]))this.finishDraft(room);
      this.broadcastState(room);return;
    }
    if (message.action === 'spectate') {
      if (!s || s.phase === 'ended' || s.units[member.id].alive || !Number.isInteger(message.targetId) || !s.units[message.targetId]?.alive) fail("After elimination, you may only spectate a living player.");
      member.spectating = message.targetId; room.seq++; this.sendState(room, member); return;
    }
    if (!s || !s.units[member.id].alive || s.phase !== 'planning' || room.stage !== 'planning' || room.locked[member.id] || message.turn !== s.turn) fail("Turn changed or plan is already locked.");
    if (message.action === 'equip') { if (!G.equipWeapon(s, s.units[member.id], message.weapon)) fail("Cannot equip this weapon."); this.sendState(room, member); return; }
    if (message.action !== 'lock') fail("Invalid action."); room.locked[member.id] = validatePlan(s, member.id, message.plan); this.broadcastState(room);
    if (this.participants(room).filter(m => s.units[m.id].alive).every(m => room.locked[m.id])) this.begin(room);
  }
  begin(room) {
    const s = room.state, plans = { ...room.botPlans, ...room.locked };
    for (const m of this.participants(room)) if (s.units[m.id].alive && !plans[m.id]) plans[m.id] = [{ type: 'wait' }, { type: 'wait' }];
    G.beginTurn(s, plans); room.archive.begin(s); room.stage = 'resolution'; this.broadcastState(room);
  }
  view(room, member, events = []) {
    const s = room.state, self = s.units[member.id], observer = s.units[this.watchTarget(room, member) ?? member.id]; G.observation(s, observer);
    const visible = new Set(); for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (G.visible(s, observer, { x, y }, G.sightRange(observer))) visible.add(G.key(x, y));
    const visibility=G.VISION.field(s,observer,G.sightRange(observer)),lit=G.VISION.litCells(s,observer,visibility,visible);visibility.points=visibility.points.map(p=>({x:Math.round(p.x*1e5)/1e5,y:Math.round(p.y*1e5)/1e5}));
    const seen = p => visible.has(G.key(Math.floor(p.x), Math.floor(p.y)));
    let knowledge = room.knowledge.get(member.id); if (!knowledge) { knowledge = clone(room.baseTerrain); room.knowledge.set(member.id, knowledge); }
    for(const key of lit){const [x,y]=key.split(',').map(Number),terrain=s.tiles[y]?.[x];if(terrain&&!sameTerrainValue(terrain,knowledge[y][x],true))knowledge[y][x]={...clone(terrain),loot:null};}
    room.terrainViews??=new Map();const prior=room.terrainViews.get(member.id),cache=prior?.state===s?prior:null;
    const sources=[],tiles=Object.freeze(s.tiles.map((row,y)=>{sources[y]=[];return Object.freeze(row.map((t,x)=>{
      const known=knowledge[y][x],previous=cache?.tiles[y]?.[x],collapsed=t.rank>s.safeLimit,loot=!collapsed&&visible.has(G.key(x,y))?t.loot:null;sources[y][x]=known;
      if(previous&&cache.sources[y][x]===known&&previous.rank===t.rank&&collapsed===(previous.rank>cache.safeLimit)&&(!collapsed||previous.fellTurn===t.fellTurn)&&sameTerrainValue(previous.loot,loot))return previous;
      const safeLoot=loot?Object.freeze(clone(loot)):null;
      return Object.freeze({...known,rank:t.rank,...(collapsed?{type:'void',hp:0,fellTurn:t.fellTurn}:{}),loot:safeLoot});
    }));}));room.terrainViews.set(member.id,{state:s,sources,tiles,safeLimit:s.safeLimit});
    const units = s.units.map(u => u.id === member.id ? {...clone(u),...(u.burn?{burn:{remainingTicks:u.burn.remainingTicks}}:{})} : u.alive && G.visible(s,observer,u,G.sightRange(observer)) ? { id: u.id, name: u.name, class: u.class, team:u.team, scan:u.scan, facing:u.facing,weapon:u.weapon,x: u.x, y: u.y, hp: u.hp, shield: u.shield, alive: true, guard: u.guard, reflectTurn: u.reflectTurn, reflectCharges: u.reflectCharges, ...(u.burn?.remainingTicks>0?{burn:{remainingTicks:u.burn.remainingTicks}}:{}), memory: {} } : { id: u.id, name: u.name, class: u.class, team:u.team, x: -100, y: -100, hp: 0, shield: 0, alive: false, hidden: true, removed: !!u.removed, memory: {} });
    const safeEvents = [];
    for (const e of events) {
      const position = Number.isFinite(e.x) && Number.isFinite(e.y) ? e : e.unitId === member.id ? self : null;
      if (e.unitId === member.id || ['end', 'zoneWarning', 'supplyDrop', 'platformCollapse','fateAccepted'].includes(e.type) || (position && (seen(position)||G.sameTeam(s,observer,s.units[e.unitId])||G.VISION.scanned(observer,position,G.sightRange(observer)))&&!(G.VISION.concealed(s,observer,position)&&!G.sameTeam(s,observer,s.units[e.unitId])&&['shoot','slash','heal','reload','guard','scan','reflect','equip','damage','eliminated','move','knockback','blink','dodge','fieldPulse','reflectReady','reflected'].includes(e.type)))) { const safe = clone(e); if(safe.unitId!==member.id&&!units[safe.unitId]?.alive)safe.unitId=null; if (safe.from && (!(seen(safe.from)||G.sameTeam(s,observer,s.units[e.unitId])||G.VISION.scanned(observer,safe.from,G.sightRange(observer)))||G.VISION.concealed(s,observer,safe.from)&&!G.sameTeam(s,observer,s.units[e.unitId]))) delete safe.from; if(safe.to&&!seen(safe.to))delete safe.to; if(safe.contact&&!seen(safe.contact))delete safe.contact; if(['clashStart','clashTie','clashResult'].includes(safe.type)&&!s.clash?.ids.includes(member.id)&&![safe.winner,safe.loser].includes(member.id)){if(safe.ids)safe.ids=safe.ids.filter(id=>units[id]?.alive);if(safe.choices)safe.choices=Object.fromEntries(Object.entries(safe.choices).filter(([id])=>units[id]?.alive));for(const field of ['winner','loser'])if(safe[field]!=null&&!units[safe[field]]?.alive)safe[field]=null;} if (safe.owner !== member.id && !units[safe.owner]?.alive) safe.owner = null; safeEvents.push(safe); }
      else if (e.owner === member.id && ['damage', 'eliminated'].includes(e.type)) safeEvents.push({ type: 'hitConfirmed', amount: e.amount, eliminated: e.type === 'eliminated' });
      else if (e.type === 'shoot' && e.first && position && G.distance(observer, position) < 16) safeEvents.push({ type: 'distantShot', x: Math.floor(position.x / 5) * 5 + 2, y: Math.floor(position.y / 5) * 5 + 2, weapon: e.weapon, turn: e.turn, tick: e.tick });
    }
    const stats = self.stats || {};
    const owner = id => id === member.id || units[id]?.alive ? id : null;
    const effectSeen=p=>G.effectVisible(s,observer,p);
    const flights=[...(s.canisters||[]),...s.grenades].map(c=>{const p=G.flightPose(c,s.tick);return p&&effectSeen(p)?{...p,owner:owner(c.owner)}:null;}).filter(Boolean);
    const projectiles = s.projectiles.filter(b=>effectSeen({x:b.x-.5,y:b.y-.5})).map(b => ({ x: b.x, y: b.y, dx: b.dx, dy: b.dy, owner: owner(b.owner) }));
    const grenades = s.grenades.filter(seen).map(g => ({ x: g.x, y: g.y, ...(Number.isFinite(g.born)?{born:g.born}:{}),explode: g.explode,...(g.radius?{radius:g.radius}:{}), owner: owner(g.owner) }));
    const fires = (s.fires || []).filter(seen).map(f => ({ x: f.x, y: f.y, expires: f.expires, owner: owner(f.owner) }));
    const c=s.clash,participant=c?.ids.includes(member.id);
    const clash=c?{id:c.id,round:c.round,participant:!!participant,...(participant?{ids:c.ids,names:c.ids.map(id=>s.units[id].name),target:c.target,chosen:!!c.choices[member.id]}:{})}:null;
    return { clash, fate:clone(G.FATE.publicState(s,member.id)),revealedUnits:s.units.filter(u=>u.alive&&u.id!==member.id&&u.fateRevealTurn===s.turn&&!G.VISION.sheltered(s,u)).map(u=>({id:u.id,name:u.name,x:u.x,y:u.y,expires:s.turn+1})),seed: 0, mode:s.mode,winnerTeam:s.winnerTeam,mapId: s.mapId, biome:s.biome, width: s.width, height: s.height, size: s.size, initialLimit: s.initialLimit, maxZoneRank:s.maxZoneRank, turn: s.turn, tick: s.tick, phase: s.phase, winner: s.winner, safeLimit: s.safeLimit, nextLimit: s.nextLimit, zoneCenter: s.zoneCenter, beacon: { ...s.beacon }, tiles, units, plans: ['resolution','clash'].includes(s.phase) ? { [member.id]: clone(s.plans[member.id] || []) } : {}, projectiles, canisters:(s.canisters||[]).filter(seen).map(c=>({...clone(c),owner:owner(c.owner),...(seen(c.from)&&!G.VISION.concealed(s,observer,c.from)?{}:{from:undefined})})), flights, fields:(s.fields||[]).filter(f=>{const b=G.areaBounds(f);for(let y=b.top;y<=b.bottom;y++)for(let x=b.left;x<=b.right;x++)if(G.terrainVisible(s,observer,{x,y},G.sightRange(observer)))return true;return false;}).map(f=>({...clone(f),owner:owner(f.owner)})), smokes: s.smokes.filter(sm=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(G.terrainVisible(s,observer,{x:sm.x+dx,y:sm.y+dy},G.sightRange(observer)))return true;return false;}), fires, grenades, visibility,litCells:[...lit],visibleCells: [...visible], aliveCount: s.units.filter(u => u.alive).length, kills: stats.kills || 0, damage: stats.damage || 0, shots: stats.shots || 0, terrainVersion: room.seq, events: safeEvents };
  }
  sendState(room, member, events = [], init = false) { if (member.waiting) {this.send(room,member,this.lobby(room));return;} if (member.exited) return; this.send(room, member, { type: 'state', matchId:room.matchId, init, seq: room.seq, playerId: member.id, spectating: this.watchTarget(room, member), watchable: room.state.units[member.id].alive ? [] : room.state.units.filter(u => u.alive).map(({id,name,class:character}) => ({id,name,character})), stage: room.stage, clashOutcome:room.stage==='clashResult'&&room.clashOutcome&&(room.clashOutcome.ids||[room.clashOutcome.winner,room.clashOutcome.loser]).includes(member.id)?clone(room.clashOutcome):null, remainingMs: Math.max(0, room.deadline - this.now()), planningMs: this.planningMs ?? room.options.planningSeconds * 1000, locked: !!room.locked[member.id], ready: this.participants(room).filter(m => room.state.units[m.id].alive && room.locked[m.id]).length, required: room.members.filter(m => room.state.units[m.id].alive).length, state: this.view(room, member, events) }); }
  broadcastState(room, events = [], init = false) { room.seq++; for (const m of room.members) this.sendState(room, m, events, init); }
  advance(room) {
    if (!room.state || room.stage === 'ended') return;
    const botsOnly=!this.participants(room).some(m=>room.state.units[m.id]?.alive);
    if(room.stage==='draft'){if(botsOnly||this.now()>=room.deadline){this.finishDraft(room);this.broadcastState(room);}return;}
    if(room.stage==='draftReveal'){if(botsOnly||this.now()>=room.deadline){this.planning(room);this.broadcastState(room);}return;}
    if (room.stage === 'planning') { if (botsOnly||this.now() >= room.deadline) this.begin(room); return; }
    if(room.stage==='clash'){
      const before=room.state.events.length, c=room.state.clash;
      const outcome=G.settleClash(room.state,this.now()>=room.deadline);
      if(!outcome)return;
      const events=room.state.events.slice(before);room.archive.capture(room.state,events);
      this.recordCombat(room,events);room.stage='clashResult';room.deadline=this.now()+G.CLASH.revealMs;room.clashOutcome=outcome;
      this.broadcastState(room,events);return;
    }
    if(room.stage==='clashResult'){if(this.now()<room.deadline)return;room.stage=room.clashOutcome?.tie?'clash':'resolution';room.clashOutcome=null;if(room.stage==='clash')room.deadline=this.now()+G.CLASH.choiceMs;this.broadcastState(room);return;}
    const events = G.step(room.state);
    this.recordCombat(room,events);
    room.archive.capture(room.state, events); room.pendingEvents = [...(room.pendingEvents || []), ...events];
    if (room.state.phase === 'clash') {room.stage='clash';room.deadline=this.now()+G.CLASH.choiceMs;}
    else if (room.state.phase !== 'resolution') { room.archive.finish(); if (room.state.phase === 'ended') room.stage = 'ended'; else this.planning(room); }
    if (room.state.tick % 2 === 0 || room.stage !== 'resolution') { this.broadcastState(room, room.pendingEvents); room.pendingEvents = []; }
  }
  recordCombat(room,events){for (const e of events) { if (e.type === 'shoot') room.state.units[e.unitId].stats.shots++; if (e.type === 'damage' && e.owner != null && e.owner !== e.unitId) room.state.units[e.owner].stats.damage += e.amount; if (e.type === 'eliminated' && e.owner != null && e.owner !== e.unitId) room.state.units[e.owner].stats.kills++; }}
  finishDraft(room){
    const summary=G.FATE.settle(room.state);G.normalizeEquipment(room.state);room.stage='draftReveal';room.deadline=this.now()+2000;
    if(!this.participants(room).some(m=>room.state.units[m.id]?.alive))room.deadline=this.now();
    room.pendingEvents=[{type:'fateAccepted',turn:room.state.turn,tick:0,summary}];
    room.archive.draftHistory=clone(room.state.fate.history);
    this.broadcastState(room,room.pendingEvents);room.pendingEvents=[];
  }
  replay(code, token) {
    const { room } = this.get(code, token); if (room.stage !== 'ended') throw Object.assign(new Error("Full replay is only available after the match ends."), { status: 403 });
    const terrains = [], lookup = new Map();
    const turns = room.archive.turns.map(turn => ({ turn: turn.turn, plans: turn.plans, frames: turn.frames.map(frame => { if (!lookup.has(frame.tiles)) { lookup.set(frame.tiles, terrains.length); terrains.push(frame.tiles); } const { tiles, ...rest } = frame; return { ...rest, terrainIndex: lookup.get(tiles) }; }) }));
    return { terrains, turns, draftHistory:clone(room.state.fate.history) };
  }
  forfeit(room,member) {
    if(!room.state||member.waiting||member.matchId!==room.matchId||room.stage==='ended')return;
    const u=room.state.units[member.id],wasAlive=u.alive;u.alive=false;u.hp=0;member.spectating=null;delete room.locked[member.id];
    room.state.humanIds=room.state.humanIds.filter(id=>id!==member.id);
    member.waiting=true;
    this.broadcastState(room,wasAlive?[{type:'eliminated',unitId:u.id,x:u.x,y:u.y,owner:null}]:[]);
    if(room.stage==='draft'&&this.participants(room).filter(m=>room.state.units[m.id].alive).every(m=>room.state.fate.draft.picks[m.id]))this.finishDraft(room);
    if(room.stage==='planning'&&this.participants(room).filter(m=>room.state.units[m.id].alive).every(m=>room.locked[m.id]))this.begin(room);
  }
  returnRoom(code,token) {
    const {room,member}=this.get(code,token);this.forfeit(room,member);member.waiting=!!room.state;member.spectating=null;
    this.send(room,member,this.lobby(room));
  }
  removeMember(room,member,reason='left') {
    this.send(room,member,{type:'removed',reason});room.connections.delete(member.id);this.forfeit(room,member);
    room.members=room.members.filter(m=>m!==member);room.terrainViews?.delete(member.id);room.knowledge?.delete(member.id);member.exited=true;member.connected=false;
    if(!room.members.length){this.rooms.delete(room.code);return;}
    if(room.host===member.id)room.host=(room.members.find(m=>m.connected)||room.members[0]).id;
    // Waiting players receive the updated roster; active players retain their match view.
    if(!room.state)this.broadcastLobby(room);else this.broadcastState(room);
  }
  kick(code,token,targetId) {
    const {room,member}=this.get(code,token);if(member.id!==room.host)fail("Only the host can kick players.");
    if(!Number.isInteger(targetId)||targetId===member.id)fail("Choose another player.");
    const target=room.members.find(m=>m.id===targetId);if(!target)fail("Player not found.");this.removeMember(room,target,'kicked');
  }
  leave(code,token) {const {room,member}=this.get(code,token);this.removeMember(room,member);}
  tick() {for(const room of this.rooms.values()) {
    for(const m of [...room.members])if(!m.connected&&m.disconnectedAt!=null&&this.now()-m.disconnectedAt>=this.disconnectGraceMs)this.removeMember(room,m,'offline');
    if(!this.rooms.has(room.code))continue;
    if(this.now()-room.touched>3600000&&!room.connections.size){this.rooms.delete(room.code);continue;}this.advance(room);
  }}

}
module.exports = { RoomHub, validatePlan };
