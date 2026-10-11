const test=require('node:test'),assert=require('node:assert/strict'),G=require('../engine'),{harness}=require('./helpers/game-harness');
test('the game queues both Wraith Blinks through the skill button, shows remaining uses, and explains active and incomplete Fate combinations',async()=>{
  const h=harness(1280,{preparePractice(s){G.FATE.add(s,0,'fortress');G.FATE.add(s,0,'quickloader');G.FATE.add(s,0,'scavenger');}}),{$,window:w}=h;
  await $('menu-practice').click();await $('menu-free-practice').click();$('practice-character').onchange({target:{value:'volt'}});
  assert.equal($('skill-cooldown').textContent,'2 / 2');$('skill-button').click();h.point({x:13,y:10});assert.equal(w.GRIDFALL_STATUS().queued,1);assert.equal($('skill-cooldown').textContent,'1 / 2');assert.equal($('skill-button').getAttribute('aria-disabled'),'false');assert.equal($('skill-button').classList.contains('skill-ready'),true);
  $('skill-button').click();h.point({x:17,y:10});assert.equal(w.GRIDFALL_STATUS().queued,2);assert.equal($('skill-cooldown').textContent,'0 / 2');
  $('fate-hud').click();assert.equal($('fate-build').querySelectorAll('.fate-combo.active').length,1);assert.match($('fate-build').textContent,/ARMORED RELOAD/);assert.match($('fate-build').textContent,/4 extra shield/);assert.match($('fate-build').textContent,/SUPPLY CHAIN/);assert.match($('fate-build').textContent,/Both curses still apply/);assert.match($('fate-build').textContent,/EXTENDED MAG/);
  $('lock-button').click();h.frames();const status=w.GRIDFALL_STATUS();assert.deepEqual([status.player.x,status.player.y],[17,10]);assert.equal($('skill-cooldown').textContent,'2 T');assert.equal($('skill-button').getAttribute('aria-disabled'),'true');
});
