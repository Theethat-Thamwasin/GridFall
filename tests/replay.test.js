const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../engine.js'), R = require('../replay.js');
function recordTurn(s, archive, plans) { G.beginTurn(s, plans); archive.begin(s); const events = []; while (s.phase === 'resolution') { const tickEvents = G.step(s); events.push(...tickEvents); archive.capture(s, tickEvents); } archive.finish(); return events; }
test('archived units, locked actions and terrain survive later live mutations', () => {
  const s = G.createState(17), archive = new R.MatchArchive(); G.beginTurn(s, { 0: [{ type: 'shoot', angle: .2 }] }); archive.begin(s);
  const before = structuredClone(archive.current.frames[0]); s.units[0].ammo = 1; s.units[0].memory[99] = { x: 0, y: 0 }; s.plans[0][0].angle = .8; s.tiles[0][0].type = 'rubble';
  assert.deepEqual(archive.current.frames[0], before);
});
test('history records each event exactly once and all eighty resolution ticks', () => {
  const s = G.createState(17), archive = new R.MatchArchive(); const actual = recordTurn(s, archive, { 0: [{ type: 'shoot', angle: 0 }, { type: 'guard' }] });
  const frames = archive.frames(); assert.equal(frames.length, 81); assert.deepEqual(frames.flatMap(frame => frame.events), actual); assert.equal(frames[0].turn, 1); assert.equal(frames.at(-1).turn, 1); assert.equal(frames.at(-1).tick, 80);
  assert.strictEqual(frames[0].tiles, frames[1].tiles, 'unchanged terrain is shared rather than duplicated per tick');
});
test('replay preserves the terrain before and after a barricade is destroyed', () => {
  const s = G.createState(17), archive = new R.MatchArchive(), u = s.units[0]; Object.assign(u, { x: 4, y: 4 }); Object.assign(s.tiles[4][5], { type: 'barricade', hp: 12 });
  recordTurn(s, archive, { 0: [{ type: 'shoot', angle: 0 }] }); const frames = archive.frames();
  assert.equal(frames[0].tiles[4][5].type, 'barricade'); assert.equal(frames.at(-1).tiles[4][5].type, 'rubble'); assert.notStrictEqual(frames[0].tiles, frames.at(-1).tiles);
});
test('replay shows automatic loot pickups disappearing only after entry', () => {
  const s = G.createState(17, 'vanguard', 'cargo'), archive = new R.MatchArchive(), target = { x: s.units[0].x + 1, y: s.units[0].y }; recordTurn(s, archive, { 0: [{ type: 'move', path: [target] }] }); const frames = archive.frames();
  assert.equal(frames[0].tiles[target.y][target.x].loot.taken, false); assert.equal(frames.at(-1).tiles[target.y][target.x].loot.taken, true); assert.equal(frames[0].units[0].reserve, 60); assert.equal(frames.at(-1).units[0].reserve, 84);
});
test('projected action origins use planned movement without changing the simulation', () => {
  const s = G.createState(17), origin = { x: s.units[0].x, y: s.units[0].y }, next = { x: origin.x + 1, y: origin.y }; s.plans = { 0: [{ type: 'move', path: [next] }, { type: 'shoot', target: { x: next.x + 2, y: next.y + 1 } }] }; const before = structuredClone(s), actions = R.plannedActions(s, 0);
  assert.deepEqual(actions[0].from, origin); assert.deepEqual(actions[1].from, next); assert.equal(actions[1].angle, Math.atan2(1, 2)); assert.deepEqual(s, before);
});
test('whole-match history retains the opening turn through the actual winner', () => {
  const s = G.createState(2), archive = new R.MatchArchive(); const allEvents = [];
  for (let n = 0; n < 50 && s.phase !== 'ended'; n++) { const plans = {}; for (const u of s.units) if (u.alive) plans[u.id] = G.planBot(s, u.id); allEvents.push(...recordTurn(s, archive, plans)); }
  assert.equal(s.phase, 'ended'); const frames = archive.frames(); assert.equal(frames.length, archive.turns.length * 80 + 1); assert.equal(frames[0].turn, 1); assert.equal(frames.at(-1).winner, s.winner); assert.deepEqual(frames.flatMap(frame => frame.events), allEvents);
  const next = R.turnStart(frames, 0, 1); assert.equal(frames[next].turn, 2); assert.equal(R.turnStart(frames, next, -1), 0); assert.equal(R.turnStart(frames, next + 5, -1), next);
  const final = structuredClone(s); R.plannedActions(frames[0], 0); assert.deepEqual(s, final, 'watching archived frames never reruns or changes the battle');
});
test('continuous match playback shortens idle turn seams without changing combat, events or the final result', () => {
  const s=G.createState(17),archive=new R.MatchArchive();
  recordTurn(s,archive,{0:[{type:'shoot',angle:0}]});recordTurn(s,archive,{0:[{type:'shoot',angle:.2}]});
  const raw=archive.frames(),before=structuredClone(raw),frames=R.continuousFrames(raw);
  assert.ok(frames.length<raw.length-20,'long idle stretches are removed');
  assert.strictEqual(frames[0],raw[0]);assert.strictEqual(frames.at(-1),raw.at(-1));
  assert.deepEqual(frames.flatMap(f=>f.events),raw.flatMap(f=>f.events));assert.deepEqual(raw,before);
  for(const f of raw)if(f.projectiles.length||f.canisters.length||f.grenades.length||f.events.length)assert.ok(frames.includes(f),'every action and flight frame survives');
  const next=R.turnStart(frames,0,1);assert.equal(frames[next].turn,2);assert.equal(R.turnStart(frames,next,-1),0);
});
test('continuous playback preserves terrain, health and throws even without an accompanying event',()=>{
  const base={turn:1,tick:0,units:[{id:0,x:2,y:2,alive:true,hp:100}],tiles:[[{type:'floor'}]],events:[],projectiles:[],canisters:[],grenades:[]};
  const frames=Array.from({length:100},(_,tick)=>({...base,tick}));
  frames[20]={...frames[20],units:[{...base.units[0],hp:80}]};
  frames[40]={...frames[40],tiles:[[{type:'rubble'}]]};
  frames[60]={...frames[60],canisters:[{x:4,y:2,born:60,land:70}]};
  frames[70]={...frames[70],flights:[{x:3,y:2,progress:.5}]};
  const kept=R.continuousFrames(frames);
  for(const i of [0,20,21,40,41,60,70,99])assert.ok(kept.includes(frames[i]));
  assert.ok(kept.length<frames.length/2);assert.deepEqual(R.continuousFrames([]),[]);
});
test('continuous movement crosses a turn seam without resetting interpolation or turning into a teleport',()=>{
  const M=require('../motion'),motion=new M.UnitMotion(.045),base={events:[],tiles:[[{type:'floor'}]],projectiles:[],canisters:[],grenades:[]};
  const raw=Array.from({length:40},(_,i)=>({...base,turn:i<20?1:2,tick:i%20,units:[{id:0,class:'vanguard',x:Math.floor(i/5),y:2,alive:true}]}));
  const frames=R.continuousFrames(raw);let previous=-Infinity;
  for(let i=0;i<frames.length;i++){motion.sync(frames[i].units,()=>true,i*.045);const pose=motion.sample(0,i*.045);assert.ok(pose.x>=previous);assert.equal(pose.alpha,1);assert.equal(motion.tracks.get(0).blink,false);previous=pose.x;}
  assert.equal(frames.filter(f=>f.turn===1).length,20);assert.equal(frames.filter(f=>f.turn===2).length,20);
});
