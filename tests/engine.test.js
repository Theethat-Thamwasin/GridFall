const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../engine.js');
function arena(seed = 11) {
  const s = G.createState(seed);
  for (const row of s.tiles) for (const t of row) Object.assign(t, { type: 'floor', hp: 0, loot: null });
  s.units.forEach((u, i) => Object.assign(u, { x: 2 + i * 3, y: 3, weapon: 'pistol', ammo: 8, alive: true, shield: 0 }));
  return s;
}
function resolve(s, plans) { G.beginTurn(s, plans); while (s.phase === 'resolution') G.step(s); return s; }
function intents(list) { return list.map(([unitId, x, y]) => ({ type: 'move', unitId, target: { x, y }, actionId: unitId + ':0' })); }
test('two actors entering the same empty tile duel and one claims the cell', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 6, y: 4 });
  G.resolveMoves(s, intents([[0, 5, 4], [1, 5, 4]]));
  assert.ok(s.events.some(e=>e.type==='clashResult'));assert.equal(s.units.filter(u=>u.alive&&u.x===5&&u.y===4).length,1);assert.notDeepEqual({x:s.units[0].x,y:s.units[0].y},{x:s.units[1].x,y:s.units[1].y});
});
test('head-on and chained contacts resolve without overlapping actors', () => {
  const s = arena(); s.units.slice(0, 3).forEach((u, i) => Object.assign(u, { x: 4 + i, y: 4 }));
  G.resolveMoves(s, intents([[0, 5, 4], [1, 4, 4], [2, 5, 4]]));
  assert.ok(s.events.some(e=>e.type==='clashResult'));assert.equal(new Set(s.units.filter(u=>u.alive).map(u=>G.key(u.x,u.y))).size,8);
});
test('a moving convoy can enter vacated cells', () => {
  const s = arena(); s.units.slice(0, 3).forEach((u, i) => Object.assign(u, { x: 4 + i, y: 4 }));
  G.resolveMoves(s, intents([[0, 5, 4], [1, 6, 4], [2, 7, 4]]));
  assert.deepEqual(s.units.slice(0, 3).map(u => u.x), [5, 6, 7]);
});
test('crossing diagonal movement and corner cutting are blocked', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 5, y: 4 });
  G.resolveMoves(s, intents([[0, 5, 5], [1, 4, 5]])); assert.equal(s.units[0].y, 4); assert.equal(s.units[1].y, 4);
  s.tiles[4][5].type = 'wall'; assert.equal(G.pathfind(s, { x: 4, y: 4 }, { x: 5, y: 5 }, 1), null);
});
test('blocked first move never teleports an actor during its second move', () => {
  const s = arena(); s.tiles[4][5].type='wall'; Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 5, y: 4 });
  resolve(s, { 0: [{ type: 'move', path: [{ x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 }] }, { type: 'move', path: [{ x: 7, y: 5 }] }] });
  assert.equal(s.units[0].x, 4); assert.equal(s.units[0].y, 5);
});
test('water consumes two movement units', () => {
  const s = arena(); s.tiles[4][5].type = 'water';
  assert.equal(G.pathfind(s, { x: 4, y: 4 }, { x: 5, y: 4 }, 1), null);
  assert.equal(G.pathfind(s, { x: 4, y: 4 }, { x: 5, y: 4 }, 2).length, 1);
});
test('simultaneous lethal pistol shots trade kills', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4, hp: 28 }); Object.assign(s.units[1], { x: 7, y: 4, hp: 28 });
  resolve(s, { 0: [{ type: 'shoot', target: { x: 7, y: 4 } }], 1: [{ type: 'shoot', target: { x: 4, y: 4 } }] });
  assert.equal(s.units[0].alive, false); assert.equal(s.units[1].alive, false); assert.equal(s.kills, 1);
});
test('shots aim at the planned tile, not a moving target', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 7, y: 4 });
  resolve(s, { 0: [{ type: 'shoot', target: { x: 7, y: 4 } }], 1: [{ type: 'move', path: [{ x: 7, y: 5 }], target: { x: 7, y: 5 } }] });
  assert.equal(s.units[1].hp, 100);
});
test('shotgun cone rays cannot triple-stack point-blank damage', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4, weapon: 'shotgun', ammo: 4 }); Object.assign(s.units[1], { x: 5, y: 4 });
  resolve(s, { 0: [{ type: 'shoot', target: { x: 5, y: 4 } }] }); assert.equal(s.units[1].hp, 52);
});
test('guard and directional cover do not multiply reductions', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 7, y: 4 });
  Object.assign(s.tiles[4][7], { type: 'cover', hp: 35, side: 'west' });
  resolve(s, { 0: [{ type: 'shoot', target: { x: 7, y: 4 } }], 1: [{ type: 'guard' }] });
  assert.equal(s.units[1].hp, 83);
});
test('smoke blocks vision but bullets still pass through', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 8, y: 4 });
  s.smokes.push({ x: 6, y: 4, expires: 3 }); assert.equal(G.visible(s, s.units[0], s.units[1]), false);
  resolve(s, { 0: [{ type: 'shoot', target: { x: 8, y: 4 } }] }); assert.equal(s.units[1].hp, 72);
});
test('platform falls eliminate through shield', () => {
  const s = arena(); s.safeLimit = 0; s.units[0].shield = 40;
  resolve(s, {}); assert.equal(s.units[0].shield, 40); assert.equal(s.units[0].hp, 0); assert.equal(s.units[0].alive,false); assert.equal(s.tiles[s.units[0].y][s.units[0].x].type,'void');
});
test('bot plans cannot read opponents locked actions', () => {
  const s = G.createState(42), other = G.createState(42);
  s.plans[0] = [{ type: 'shoot', target: { x: 11, y: 21 } }]; other.plans[0] = [{ type: 'move', target: { x: 5, y: 22 } }];
  assert.deepEqual(G.planBot(s, 1), G.planBot(other, 1));
});
test('hidden enemy positions do not influence the bot without observations', () => {
  const s = arena(), other = arena();
  s.units.forEach((u, i) => { if (i !== 1) Object.assign(u, { x: 25, y: 25 }); });
  other.units.forEach((u, i) => { if (i !== 1) Object.assign(u, { x: 26, y: 26 }); });
  assert.deepEqual(G.planBot(s, 1), G.planBot(other, 1));
});
test('the same seed and plans produce the same event log', () => {
  const plans = { 0: [{ type: 'shoot', target: { x: 11, y: 21 } }, { type: 'grenade', target: { x: 10, y: 20 } }] };
  const a = resolve(G.createState(95), plans), b = resolve(G.createState(95), plans);
  assert.deepEqual(a.events, b.events); assert.deepEqual(a.units, b.units);
});
test('free aim preserves sub-grid angles without rounding', () => {
  const a = arena(), b = arena(); G.beginTurn(a, { 0: [{ type: 'shoot', angle: .071 }] }); G.beginTurn(b, { 0: [{ type: 'shoot', angle: .129 }] });
  for (let n = 0; n <= 7; n++) { G.step(a); G.step(b); }
  const angleA=Math.atan2(a.projectiles[0].dy,a.projectiles[0].dx),angleB=Math.atan2(b.projectiles[0].dy,b.projectiles[0].dx);
  assert.ok(Math.abs((angleB-angleA)-(.129-.071))<1e-12); // Identical shot noise preserves the exact free-aim difference.
  assert.ok(Math.abs(angleA-.071)<=G.WEAPONS.pistol.recoilDeg*Math.PI/180);
  assert.equal(a.projectiles[0].left, G.WEAPONS.pistol.range);
});
test('a near aim point cannot shorten the bullet range', () => {
  for (const targetX of [3, 20]) {
    const s = arena(); Object.assign(s.units[0], { x: 2, y: 4 }); Object.assign(s.units[1], { x: 8, y: 4 });
    resolve(s, { 0: [{ type: 'shoot', target: { x: targetX, y: 4 } }] }); assert.equal(s.units[1].hp, 72);
  }
});
test('passing through an occupied tile outside the body radius is a miss', () => {
  const s = arena(); Object.assign(s.units[0], { x: 2, y: 4 }); Object.assign(s.units[1], { x: 5, y: 4 });
  resolve(s, { 0: [{ type: 'shoot', angle: Math.atan2(.4, 3) }] }); assert.equal(s.units[1].hp, 100);
});
test('a locked shooting angle survives a blocked preceding move', () => {
  const s = arena(); s.tiles[4][5].type='wall'; Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 5, y: 4 }); Object.assign(s.units[2], { x: 4, y: 7 });
  resolve(s, { 0: [{ type: 'move', path: [{ x: 5, y: 4 }] }, { type: 'shoot', angle: Math.PI / 2 }] });
  assert.equal(s.units[1].hp, 100); assert.equal(s.units[2].hp, 72);
});
test('slash hits diagonally in its cone but cannot hit behind the attacker', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 5, y: 5 }); Object.assign(s.units[2], { x: 3, y: 4 });
  resolve(s, { 0: [{ type: 'slash', angle: 0 }] }); assert.equal(s.units[1].hp, 55); assert.equal(s.units[2].hp, 100); assert.equal(s.units[0].ammo, 8);
});
test('free aimed bullets cannot cut through a solid wall corner', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 6, y: 6 }); Object.assign(s.tiles[4][5], { type: 'wall', hp: 65 });
  resolve(s, { 0: [{ type: 'shoot', angle: Math.PI / 4 }] }); assert.equal(s.units[1].hp, 100); assert.equal(s.tiles[4][5].hp, 37);
});
test('slash is blocked by wall corners but still works inside smoke', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 5, y: 5 }); Object.assign(s.tiles[4][5], { type: 'wall', hp: 65 });
  resolve(s, { 0: [{ type: 'slash', angle: Math.PI / 4 }] }); assert.equal(s.units[1].hp, 100);
  s.tiles[4][5].type = 'floor'; s.smokes.push({ x: 4, y: 4, expires: 4 });
  resolve(s, { 0: [{ type: 'slash', angle: Math.PI / 4 }] }); assert.equal(s.units[1].hp, 55);
});
test('walking onto loot grants only its own resource next turn', () => {
  for (const type of Object.keys(G.LOOT)) {
    const s = arena(), u = s.units[0]; u.shield = 10; Object.assign(s.tiles[u.y][u.x + 1], { loot: { type, ...(type === 'weapon' ? { weapon: 'sniper' } : {}), taken: false } });
    const before = { reserve: u.reserve, medkits: u.medkits, shield: u.shield, grenades: u.grenades, smoke: u.smoke };
    resolve(s, { 0: [{ type: 'move', path: [{ x: u.x + 1, y: u.y }] }] });
    const expected = { ...before }; const field = { ammo: 'reserve', medkit: 'medkits', shield: 'shield', grenade: 'grenades', smoke: 'smoke' }[type]; if (field) expected[field] += type === 'ammo' ? 24 : type === 'shield' ? 20 : 1;
    for (const [name, value] of Object.entries(expected)) assert.equal(u[name], value, type + ' / ' + name);
    if (type === 'weapon') { assert.ok(u.weapons.includes('sniper')); assert.equal(u.weaponAmmo.sniper, 3); }
  }
});
test('auto pickup never takes adjacent items or consumes an AP', () => {
  const s = arena(), u = s.units[0]; s.tiles[u.y][u.x + 1].loot = { type: 'ammo', taken: true }; s.tiles[u.y + 1][u.x].loot = { type: 'shield', taken: false };
  resolve(s, { 0: [{ type: 'move', path: [{ x: u.x + 1, y: u.y }] }, { type: 'guard' }] }); assert.equal(u.reserve, 60); assert.equal(u.shield, 0); assert.equal(s.tiles[u.y + 1][u.x - 1].loot.taken, false); assert.equal(u.guard, false); assert.ok(s.events.some(e=>e.type==='guard'&&e.unitId===0));
});
test('a full inventory leaves loot on the ground, and an empty tile is harmless', () => {
  const s = arena(), u = s.units[0]; u.medkits = 3; s.tiles[u.y][u.x + 1].loot = { type: 'medkit', taken: false };
  const x = u.x, y = u.y; resolve(s, { 0: [{ type: 'move', path: [{ x: x + 1, y }, { x: x + 1, y: y + 1 }] }] }); assert.equal(u.medkits, 3); assert.equal(s.tiles[y][x + 1].loot.taken, false);
});
test('rectangular maps use real width and height for traversal and bounds', () => {
  for (const mapId of Object.keys(G.MAPS)) {
    const s = G.createState(77, 'volt', mapId); assert.equal(s.tiles.length,s.height);assert.equal(s.tiles[0].length,s.width);
    assert.equal(G.tile(s, s.width, 0), null); assert.equal(G.tile(s, 0, s.height), null); assert.ok(s.units.every(u => G.passable(s, u.x, u.y)));
    assert.equal(s.tiles[s.zoneCenter.y][s.zoneCenter.x].rank, 0); assert.ok(G.passable(s, s.zoneCenter.x, s.zoneCenter.y));
    assert.ok(s.tiles.flat().filter(t=>t.loot).length>=20);
  }
});
test('whole bot matches finish without overlapping living actors', () => {
  for (const seed of [2, 17, 39]) {
    const s = G.createState(seed);
    for (let turn = 0; turn < 45 && s.phase !== 'ended'; turn++) {
      const plans = {}; for (const u of s.units) if (u.alive) plans[u.id] = G.planBot(s, u.id);
      resolve(s, plans);
      const positions = s.units.filter(u => u.alive).map(u => G.key(u.x, u.y)); assert.equal(new Set(positions).size, positions.length);
      assert.ok(s.units.every(u => Number.isFinite(u.hp) && u.ammo >= 0));
    }
    assert.equal(s.phase, 'ended', 'seed ' + seed + ' should finish');
  }
});
test('bot matches on both long maps finish without leaving map bounds', () => {
  for (const mapId of ['cargo', 'alley']) {
    const s = G.createState(17, 'vanguard', mapId);
    for (let n = 0; n < 65 && s.phase !== 'ended'; n++) {
      const plans = {}; for (const u of s.units) if (u.alive) plans[u.id] = G.planBot(s, u.id); resolve(s, plans);
      assert.ok(s.units.every(u => !!G.tile(s, u.x, u.y))); const positions = s.units.filter(u => u.alive).map(u => G.key(u.x, u.y)); assert.equal(new Set(positions).size, positions.length);
    }
    assert.equal(s.phase, 'ended', mapId);
  }
});

test('pickups on each intermediate step wait until the following planning phase', () => {
  const s = arena(), u = s.units[0], x = u.x, y = u.y;
  s.tiles[y][x + 1].loot = { type: 'ammo', taken: false }; s.tiles[y][x + 2].loot = { type: 'weapon', weapon: 'smg', taken: false };
  G.beginTurn(s, { 0: [{ type: 'move', path: [{ x: x + 1, y }, { x: x + 2, y }] }] });
  while (s.tick < 40) G.step(s);
  assert.equal(u.reserve, 60); assert.equal(u.pendingPickups.length, 2); assert.ok(!u.weapons.includes('smg')); assert.equal(G.equipWeapon(s, u, 'smg'), false);
  while (s.phase === 'resolution') G.step(s);
  assert.equal(s.turn, 2); assert.equal(u.reserve, 84); assert.equal(u.pendingPickups.length, 0); assert.equal(G.equipWeapon(s, u, 'smg'), true); assert.equal(u.ammo, 25);
});
test('new ammo and consumables cannot power the second action of the pickup turn', () => {
  for (const [type, field, action] of [['ammo', 'reserve', { type: 'reload' }], ['grenade', 'grenades', { type: 'grenade', target: { x: 3, y: 5 } }], ['medkit', 'medkits', { type: 'heal' }], ['smoke', 'smoke', { type: 'smoke', target: { x: 3, y: 5 } }]]) {
    const s = arena(), u = s.units[0]; u[field] = 0; u.ammo = 0; u.hp = 50; s.tiles[u.y + 1][u.x].loot = { type, taken: false };
    resolve(s, { 0: [{ type: 'move', path: [{ x: u.x, y: u.y + 1 }] }, action] });
    assert.equal(u.ammo, 0, type); assert.equal(u.hp, 50, type); assert.equal(u[field], type === 'ammo' ? 24 : 1, type);
    assert.ok(!s.events.some(e => e.type === action.type || (action.type === 'grenade' && e.type === 'throw')), type);
  }
});
test('picked armor cannot protect against bullets in the same turn', () => {
  const s = arena(), u = s.units[0]; Object.assign(u, { x: 3, y: 4, shield: 0 }); Object.assign(s.units[1], { x: 7, y: 5 }); s.tiles[5][3].loot = { type: 'shield', taken: false };
  resolve(s, { 0: [{ type: 'move', path: [{ x: 3, y: 5 }] }], 1: [{ type: 'shoot', angle: Math.PI }] });
  assert.equal(u.hp, 72); assert.equal(u.shield, 20);
});
test('pending items count toward capacity without making them usable', () => {
  const s = arena(), u = s.units[0]; u.medkits = 2;
  s.tiles[4][2].loot = { type: 'medkit', taken: false }; s.tiles[5][2].loot = { type: 'medkit', taken: false };
  resolve(s, { 0: [{ type: 'move', path: [{ x: 2, y: 4 }, { x: 2, y: 5 }] }] });
  assert.equal(u.medkits, 3); assert.equal(s.tiles[4][2].loot.taken, true); assert.equal(s.tiles[5][2].loot.taken, false);
});
test('players and bots start with only P9, then preserve magazines of guns they collect', () => {
  const s = G.createState(77), fields = ['hp', 'shield', 'ammo', 'reserve', 'medkits', 'grenades', 'smoke', 'weapons', 'weaponAmmo'];
  for (const u of s.units) for (const field of fields) assert.deepEqual(u[field], s.units[0][field]);
  for(const u of s.units){assert.equal(u.weapon,'pistol');assert.equal(u.ammo,8);assert.deepEqual(u.weapons,['pistol']);assert.deepEqual(u.weaponAmmo,{pistol:8});assert.equal(G.equipWeapon(s,u,'rifle'),false);}
  for(const id of [0,1]){
    const u=s.units[id],target={x:u.x+1,y:u.y};s.tiles[target.y][target.x].loot={type:'weapon',weapon:'rifle',taken:false};
    G.beginTurn(s,{[id]:[{type:'move',target,path:[target]}]});G.step(s);
    assert.equal(u.weapons.includes('rifle'),false);assert.equal(G.equipWeapon(s,u,'rifle'),false);
    while(s.phase==='resolution')G.step(s);
    assert.equal(u.weapons.includes('rifle'),true);u.ammo=3;
    assert.equal(G.equipWeapon(s,u,'rifle'),true);assert.equal(u.ammo,15);u.ammo=4;
    assert.equal(G.equipWeapon(s,u,'pistol'),true);assert.equal(u.ammo,3);
    assert.equal(G.equipWeapon(s,u,'rifle'),true);assert.equal(u.ammo,4);assert.equal(G.equipWeapon(s,u,'sniper'),false);
  }
});
test('bots automatically collect guns and can equip them only next turn', () => {
  const s = arena(), u = s.units[1], x = u.x, y = u.y;
  s.tiles[y + 1][x].loot = { type: 'weapon', weapon: 'shotgun', taken: false };
  resolve(s, { 1: [{ type: 'move', path: [{ x, y: y + 1 }] }] });
  assert.ok(u.weapons.includes('shotgun')); Object.assign(s.units[0], { x: x + 2, y: y + 1 }); G.planBot(s, 1); assert.equal(u.weapon, 'shotgun');
});
test('every map scatters all eight guns and solid barricades', () => {
  for (const mapId of Object.keys(G.MAPS)) for (const seed of [1, 17, 42, 77]) {
    const s = G.createState(seed, 'volt', mapId), found = new Set(s.tiles.flat().filter(t => t.loot?.type === 'weapon').map(t => t.loot.weapon));
    assert.equal(found.size, mapId==='skybridge'?5:8, mapId + ' / ' + seed); assert.equal(s.tiles.flat().filter(t => t.loot?.type === 'weapon').length, mapId==='skybridge'?12:8); assert.ok(s.tiles.flat().filter(t=>t.loot).length<=(mapId==='skybridge'?28:24)); assert.ok(s.tiles.flat().some(t => t.type === 'barricade'));
  }
});
test('barricades block movement, sight and bullets until destroyed', () => {
  const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.units[1], { x: 7, y: 4 }); Object.assign(s.tiles[4][5], { type: 'barricade', hp: 45 });
  assert.equal(G.passable(s, 5, 4), false); assert.equal(G.pathfind(s, s.units[0], { x: 5, y: 4 }, 3), null); assert.equal(G.visible(s, s.units[0], s.units[1]), false);
  resolve(s, { 0: [{ type: 'shoot', angle: 0 }] }); assert.equal(s.units[1].hp, 100); assert.equal(s.tiles[4][5].hp, 17);
  resolve(s, { 0: [{ type: 'shoot', angle: 0 }] }); assert.equal(s.tiles[4][5].type, 'rubble'); assert.equal(G.passable(s, 5, 4), true);
  resolve(s, { 0: [{ type: 'shoot', angle: 0 }] }); assert.equal(s.units[1].hp, 72);
});
test('slash and grenades can breach barricades', () => {
  for (const action of [{ type: 'slash', angle: 0 }, { type: 'grenade', target: { x: 5, y: 4 } }]) { const s = arena(); Object.assign(s.units[0], { x: 4, y: 4 }); Object.assign(s.tiles[4][5], { type: 'barricade', hp: 45 }); resolve(s, { 0: [action] }); assert.equal(s.tiles[4][5].type, 'rubble'); }
});
test('bots use consumables, guard and class skills through normal plans', () => {
  const used = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const s = arena(seed), u = s.units[0]; Object.assign(u, { x: 10, y: 10, hp: 40, class: ['vanguard', 'volt', 'deadeye'][seed % 3], personality: seed % 2 ? 'defensive' : 'looter' });
    s.units.slice(1).forEach(v => Object.assign(v, { x: 14, y: 10 }));
    G.planBot(s, 0).forEach(a => used.add(a.type));
    u.ammo = 0; u.hp = 100; G.planBot(s, 0).forEach(a => used.add(a.type));
    u.hp = 60; u.medkits = 0; u.ammo = 8; u.personality = 'defensive'; u.grenades = 0; u.smoke = 0; G.planBot(s, 0).forEach(a => used.add(a.type));
    u.hp = 40; u.medkits = 0; u.ammo = 0; u.reserve = 0; u.weaponAmmo = { rifle: 0, pistol: 0 }; u.grenades = 0; u.smoke = 0; G.planBot(s, 0).forEach(a => used.add(a.type));
    u.class = 'deadeye'; s.units.slice(1).forEach(v => Object.assign(v, { x: 25, y: 25 })); G.planBot(s, 0).forEach(a => used.add(a.type));
  }
  for (const action of ['heal', 'smoke', 'grenade', 'reload', 'guard', 'skillMove', 'blink', 'scan']) assert.ok(used.has(action), action);
});

test('bot combat dashes obey the shared five-point budget across water', () => {
  const s = arena(17), u = s.units[0]; Object.assign(u, { x: 10, y: 10, hp: 40, class: 'vanguard', ammo: 0, reserve: 0, medkits: 0, grenades: 0, smoke: 0, weaponAmmo: { rifle: 0, pistol: 0 } });
  s.units.slice(1).forEach(v => Object.assign(v, { x: 14, y: 10 })); for (let y = 0; y < s.height; y++) s.tiles[y][12].type = 'water';
  const plan = G.planBot(s, 0), roll = plan.find(a => a.type === 'skillMove'); assert.ok(roll); assert.ok(roll.path.reduce((cost, p) => cost + (G.tile(s, p.x, p.y).type === 'water' ? 2 : 1), 0) <= G.SKILLS.dashRange);
});

test('duplicate guns become reserve ammo and beacon supplies wait until next turn', () => {
  const s = arena(), u = s.units[0]; s.tiles[4][2].loot = { type: 'weapon', weapon: 'pistol', taken: false }; s.beacon = { x: 2, y: 5, cooldown: 0 };
  G.beginTurn(s, { 0: [{ type: 'move', path: [{ x: 2, y: 4 }, { x: 2, y: 5 }] }, { type: 'reload' }] }); u.ammo = 0; u.reserve = 0;
  while (s.tick < 70) G.step(s); assert.equal(u.reserve, 0); assert.equal(u.ammo, 0); assert.equal(u.shield, 0);
  while (s.phase === 'resolution') G.step(s); assert.equal(u.reserve, 38); assert.equal(u.shield, 20); assert.equal(u.grenades, 3); assert.equal(u.weapons.filter(w => w === 'pistol').length, 1);
});
