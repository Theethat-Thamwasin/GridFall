const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
function setup(){const h=harness(1280,{html:'bot-arena.html',entry:'bot-arena-view.js'});h.$('arena-seed').value=123;h.$('reset-duel').click();h.status=()=>structuredClone(h.window.GRIDFALL_BOT_ARENA_STATUS());h.start=()=>h.$('arena-form').onsubmit({preventDefault(){}});return h;}
test('standalone controls choose both operators and lock setup while the actual AI duel is running',()=>{
  const h=setup();assert.equal(h.$('bot-a').children.length,7);assert.equal(h.$('bot-b').children.length,7);
  for(const id of Object.keys(h.window.Gridfall.CLASSES)){h.$('bot-a').value=id;h.$('bot-a').onchange();assert.equal(h.status().units[0].class,id);}
  h.$('bot-b').value='deadeye';h.$('bot-b').onchange();assert.equal(h.status().units[1].class,'deadeye');
  h.start();assert.equal(h.status().running,true);assert.equal(h.status().units.length,2);assert.equal(h.$('bot-a').disabled,true);assert.equal(h.$('start-duel').disabled,true);assert.equal(h.$('pause-duel').disabled,false);
  h.frames(40);assert.ok(h.status().tick>0);assert.ok(h.$('bot-stats').textContent.includes('HP'));assert.ok(h.$('arena-log').children.length>0);
});
test('Pause and hidden tabs freeze combat, Resume advances it, and Reset restores both fighters',()=>{
  const h=setup();h.start();h.frames(10);h.$('pause-duel').click();const paused=structuredClone(h.status());
  h.frames(30);assert.deepEqual(h.status(),paused);assert.equal(h.$('pause-duel').textContent,'Resume');
  h.$('pause-duel').click();h.frames(5);assert.notEqual(h.status().tick,paused.tick);
  h.document.hidden=true;const hidden=structuredClone(h.status());h.frames(20);assert.deepEqual(h.status(),hidden);
  h.document.hidden=false;h.frames(5);assert.notEqual(h.status().tick,hidden.tick);
  h.$('reset-duel').click();assert.equal(h.status().running,false);assert.equal(h.status().phase,'planning');assert.deepEqual(h.status().units.map(u=>u.hp),[100,100]);assert.equal(h.$('bot-a').disabled,false);assert.equal(h.$('arena-result').hidden,true);
});
test('speed scales the simulation and a complete duel shows its real winner with a working rematch',()=>{
  const a=setup(),b=setup();a.start();b.start();b.$('arena-speed').value='2';a.frames(10);b.frames(10);assert.ok(b.status().tick>a.status().tick);
  a.$('arena-speed').value='4';for(let i=0;i<1300&&a.$('arena-result').hidden;i++)a.frames(1);
  assert.equal(a.status().phase,'ended');assert.equal(a.$('arena-result').hidden,false);assert.match(a.$('winner-label').textContent,/WINS|DRAW/);assert.equal(a.$('bot-a').disabled,false);
  const old=a.status().seed;a.$('rematch-duel').click();assert.equal(a.$('arena-result').hidden,true);assert.equal(a.status().running,true);assert.notEqual(a.status().seed,old);
});
test('weapon and Fate controls apply to the new duel, while invalid seeds show a usable error',()=>{
  const h=setup();h.$('starting-weapon').value='shotgun';h.$('arena-fate').checked=true;h.$('reset-duel').click();
  assert.deepEqual(h.status().units.map(u=>u.weapon),['shotgun','shotgun']);assert.equal(h.status().fate,true);
  h.$('arena-seed').value=-1;h.start();assert.equal(h.status().running,false);assert.match(h.$('arena-status').textContent,/Seed/);
  h.$('new-seed').click();h.start();assert.equal(h.status().running,true);
});
