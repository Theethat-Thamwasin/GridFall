const test = require('node:test'), assert = require('node:assert/strict');
const G = require('../engine.js'), M = require('../motion.js');
const tick = G.TIMING.tickMs / 1000;
const visible = () => true;
const unit = (x = 3, y = 4) => ({ id: 0, x, y, alive: true, class: 'vanguard' });
test('moves interpolate continuously without changing authoritative tiles', () => {
  const motion = new M.UnitMotion(tick), u = unit(); motion.sync([u], visible, 0);
  u.x++; motion.sync([u], visible, 1);
  assert.equal(motion.sample(0, 1).x, 3);
  assert.equal(motion.sample(0, 1 + tick * 2.5).x, 3.5);
  assert.equal(motion.sample(0, 1 + tick * 5).x, 4);
  assert.equal(u.x, 4); assert.equal(u.y, 4);
});
test('consecutive movement and snapshot retargets start at the displayed position', () => {
  const motion = new M.UnitMotion(tick), u = unit(); motion.sync([u], visible, 0);
  u.x++; motion.sync([u], visible, 1); const time = 1 + tick * 3, before = motion.sample(0, time);
  u.y++; motion.sync([u], visible, time); assert.deepEqual(motion.sample(0, time), before);
  const end = motion.sample(0, time + tick * 5); assert.equal(end.x, 4); assert.equal(end.y, 5);
});
test('fog purges hidden tracks and never interpolates an enemy from unseen coordinates', () => {
  const motion = new M.UnitMotion(tick), u = unit(); motion.sync([u], visible, 0);
  motion.sync([{ ...u, hidden: true, x: -100, y: -100 }], visible, .1); assert.equal(motion.sample(0, .2), null);
  Object.assign(u, { x: 20, y: 16 }); motion.sync([u], visible, .3);
  assert.equal(motion.sample(0, .3).x, 20); assert.equal(motion.sample(0, .3).moving, false);
  motion.sync([u], () => false, .4); assert.equal(motion.sample(0, .4), null);
});
test('blink fades instead of traversing walls, including a one-tile blink', () => {
  const motion = new M.UnitMotion(tick), u = { ...unit(), class: 'volt' }; motion.sync([u], visible, 0);
  motion.blink(0); u.x++; motion.sync([u], visible, 1);
  const early = motion.sample(0, 1 + tick); assert.equal(early.x, 3); assert.ok(early.alpha < 1);
  const late = motion.sample(0, 1 + tick * 3); assert.equal(late.x, 4); assert.ok(late.alpha < 1);
  motion.clear(); assert.equal(motion.sample(0, 4), null);
});
test('camera transitions start gently and interpolate zoom in scale space', () => {
  const a = { cx: 2, cy: 4, zoom: .5 }, b = { cx: 22, cy: 10, zoom: 2 };
  assert.equal(M.poseBetween(a, b, .5).zoom, 1);
  assert.ok(M.poseBetween(a, b, .01).cx - a.cx < .001);
  assert.ok(b.cx - M.poseBetween(a, b, .99).cx < .001);
});
test('resolution keeps the shared 3.6 second timing with no intro stage',()=>{assert.equal(G.TIMING.tickMs*80,3600);assert.equal(G.TIMING.briefingMs,undefined);});
test('knockback animates the contact and return even when the final tile equals the origin',()=>{const motion=new M.UnitMotion(tick),u=unit();motion.sync([u],visible,0);motion.bump(0,{x:3,y:4},1,{x:4,y:4});motion.sync([u],visible,1);assert.equal(motion.sample(0,1).x,3);assert.ok(motion.sample(0,1.08).x>3.5);assert.equal(motion.sample(0,1.5).x,3);assert.equal(motion.sample(0,1.08).alpha,1);});
