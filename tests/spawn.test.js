const test = require('node:test'), assert = require('node:assert/strict');
const G = require('../engine.js'), { RoomHub } = require('../multiplayer.js');
const locations = s => s.units.map(({ id, x, y }) => ({ id, x, y }));

// Check connectivity independently of the spawn selector, using actual legal
// one-step moves so an apparent diagonal exit through a wall corner cannot pass.
function accessible(s) {
  const seen = new Set([G.key(s.beacon.x, s.beacon.y)]), pending = [{ ...s.beacon }];
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const next = { x: p.x + dx, y: p.y + dy }, k = G.key(next.x, next.y);
      if ((!dx && !dy) || seen.has(k) || !G.pathfind(s, p, next, 2)) continue;
      seen.add(k); pending.push(next);
    }
  }
  return seen;
}

test('random spawns stay dry, separate, open and connected on all three maps', () => {
  for (const map of Object.keys(G.MAPS)) for (let seed = 0; seed < 100; seed++) {
    const s = G.createState(seed, 'volt', map), connected = accessible(s), label = `${map}/${seed}`;
    assert.equal(s.units.length, 8, label);
    assert.equal(new Set(s.units.map(u => G.key(u.x, u.y))).size, 8, label);
    for (const u of s.units) {
      assert.ok(u.x >= 2 && u.y >= 2 && u.x < s.width - 2 && u.y < s.height - 2, label);
      assert.ok(connected.has(G.key(u.x, u.y)), label + ' must reach the beacon');
      assert.ok(G.cheb(u, s.beacon) >= 4, label + ' no spawn on central reward');
      assert.ok(G.tile(s, u.x, u.y).rank <= s.safeLimit, label + ' initial Zone');
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const t = G.tile(s, u.x + dx, u.y + dy);
        assert.ok(t && !['wall', 'barricade', 'water'].includes(t.type), label + ' open dry exits');
      }
      for (const other of s.units) if (u.id < other.id) assert.ok(G.distance(u, other) >= 8, label + ' spawn separation');
    }
  }
});

test('every random spawn has reachable starter ammo and its own weapon without terrain breaches', () => {
  for (const map of Object.keys(G.MAPS)) for (let seed = 1; seed <= 50; seed++) {
    const s = G.createState(seed, 'vanguard', map);
    for (const u of s.units) {
      const ammo = { x: u.x + 1, y: u.y }, gun = { x: u.x + 2, y: u.y };
      assert.equal(G.tile(s, ammo.x, ammo.y).loot.type, 'ammo');
      assert.equal(G.tile(s, gun.x, gun.y).loot.type, 'weapon');
      const weapon=G.tile(s,gun.x,gun.y).loot.weapon;assert.ok(G.WEAPONS[weapon]&&!G.WEAPONS[weapon].airDrop);if(map==='skybridge')assert.equal(weapon,'rifle');
      assert.equal(G.pathfind(s, u, ammo, 1).length, 1);
      assert.equal(G.pathfind(s, u, gun, 2).length, 2);
      assert.equal(G.tile(s, u.x, u.y).loot, null);
    }
    assert.equal(s.tiles.flat().filter(t => t.loot?.type === 'weapon').length, map==='skybridge'?12:8);
    const supplies=s.tiles.flat().filter(t=>t.loot).length;assert.ok(supplies>=(map==='skybridge'?24:20)&&supplies<=(map==='skybridge'?28:24));
    assert.ok(s.tiles.flat().some(t => t.type === 'barricade'));
  }
});

test('seeds reproduce the same spawns and terrain while classes do not change spawn assignments', () => {
  for (const map of Object.keys(G.MAPS)) for (const seed of [0, 1, 42, 0xffffffff]) {
    const a = G.createState(seed, 'vanguard', map), b = G.createState(seed, 'volt', map), c = G.createState(seed, 'deadeye', map);
    assert.deepEqual(a, G.createState(seed, 'vanguard', map));
    assert.deepEqual(locations(a), locations(b)); assert.deepEqual(locations(a), locations(c));
    assert.deepEqual(a.tiles, b.tiles); assert.deepEqual(a.tiles, c.tiles);
  }
});

test('new seeds vary every operator location across all four quarters of every map', () => {
  for (const map of Object.keys(G.MAPS)) {
    const points = Array.from({ length: 8 }, () => new Set()), quarters = Array.from({ length: 8 }, () => new Set()), layouts = new Set();
    for (let seed = 0; seed < 100; seed++) {
      const s = G.createState(seed, 'vanguard', map); layouts.add(JSON.stringify(locations(s)));
      for (const u of s.units) { points[u.id].add(G.key(u.x, u.y)); quarters[u.id].add((u.x < s.width / 2 ? 'L' : 'R') + (u.y < s.height / 2 ? 'T' : 'B')); }
    }
    assert.equal(layouts.size, 100);
    for (let id = 0; id < 8; id++) { assert.ok(points[id].size >= 50, `${map}/${id}`); assert.equal(quarters[id].size, 4, `${map}/${id}`); }
  }
});

test('LAN players share server-selected spawns, keep their identity on rejoin and preserve replay origins', () => {
  for (const mapId of Object.keys(G.MAPS)) {
    const hub = new RoomHub(), host = hub.create({ name: 'HOST', mapId, cinematic: false });
    const members = [host]; for (let i = 1; i < 8; i++) members.push(hub.join(host.code, { name: 'PLAYER' + i }));
    hub.start(host.code, host.token); const room = hub.get(host.code, host.token).room, before = locations(room.state);
    assert.deepEqual(before, locations(G.createState(room.state.seed, 'vanguard', mapId)));
    for (const member of members) {
      const packet = hub.view(room, room.members[member.playerId]);
      assert.deepEqual({ x: packet.units[member.playerId].x, y: packet.units[member.playerId].y }, { x: before[member.playerId].x, y: before[member.playerId].y });
      assert.equal(hub.join(host.code, { token: member.token }).playerId, member.playerId);
    }
    assert.deepEqual(locations(room.state), before);
    for (const member of members) hub.command(host.code, member.token, { action: 'lock', turn: 1, plan: [{ type: 'guard' }] });
    assert.deepEqual(locations(room.archive.current.frames[0]), before);
  }
});
