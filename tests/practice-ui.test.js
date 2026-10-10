const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
test('How To Play queues two actions, explains healing, changes equipment immediately and exits cleanly into a real match',async()=>{
  const h=harness(),{$,window:w}=h;await $('menu-practice').click();let s=w.GRIDFALL_STATUS();assert.equal(s.practice,true);assert.equal(s.hp,50);assert.equal(s.weapons.length,10);assert.equal($('practice-character').children.length,7);assert.equal($('connection-status').classList.contains('hidden'),true);assert.equal($('log-button').classList.contains('hidden'),true);
  $('actions').querySelector('[data-type="move"]').click();h.point({x:s.player.x,y:s.player.y-1});assert.equal(w.GRIDFALL_STATUS().queued,1);assert.equal(h.document.body.dataset.practiceCue,'second');
  $('actions').querySelector('[data-type="shoot"]').click();h.point({x:12,y:10});assert.equal(w.GRIDFALL_STATUS().queued,2);assert.equal(h.document.body.dataset.practiceCue,'commit');
  $('lock-button').click();h.frames();assert.equal(w.GRIDFALL_STATUS().turn,2);assert.equal(w.GRIDFALL_STATUS().hp,50);assert.equal(h.document.body.dataset.practiceCue,'heal');
  $('actions').querySelector('[data-type="heal"]').click();$('actions').querySelector('[data-type="guard"]').click();$('lock-button').click();h.frames();assert.equal(w.GRIDFALL_STATUS().practiceTurns,2);assert.equal(h.document.body.dataset.practiceCue,'explore');
  $('practice-character').onchange({target:{value:'mire'}});assert.equal(w.GRIDFALL_STATUS().character,'mire');assert.equal($('skill-name').textContent,'STASIS FIELD');assert.equal($('class-picker').querySelector('.selected').dataset.class,'mire');
  $('practice-weapon').onchange({target:{value:'longshot'}});assert.equal($('weapon-name').textContent,'HORIZON');
  $('practice-field').click();assert.match($('practice-info').textContent,/Ammo/);assert.match($('practice-info').textContent,/Roofs/);$('practice-fate').click();assert.match($('practice-info').textContent,/YOU GAIN/);assert.match($('practice-info').textContent,/YOU PAY/);
  $('restart-button').click();assert.equal($('exit-dialog').classList.contains('hidden'),false);$('exit-confirm').click();assert.equal(w.GRIDFALL_STATUS().started,false);assert.equal($('practice-panel').classList.contains('hidden'),true);
  await $('start-button').click();s=w.GRIDFALL_STATUS();assert.equal(s.practice,false);assert.equal(s.hp,100);assert.equal(s.alive,8);assert.match($('drop-countdown').textContent,/Supply Drop in 4 turns/);
});
test('Practice reaches a real Fate draft, shows benefit/cost blocks and applies the chosen card',async()=>{
  const h=harness(),{$,window:w}=h;await $('menu-practice').click();for(let n=0;n<3;n++){$('lock-button').click();h.frames();}
  assert.equal(w.GRIDFALL_STATUS().phase,'draft');const card=$('fate-draft').querySelector('[data-card]');assert.ok(card.querySelector('.fate-blessing'));assert.ok(card.querySelector('.fate-curse'));assert.match(card.textContent,/YOU GAIN/);assert.match(card.textContent,/YOU PAY/);await card.querySelector('.fate-accept').click();assert.equal(w.GRIDFALL_STATUS().fate.roster[0].build.length,1);assert.equal(w.GRIDFALL_STATUS().phase,'draftReveal');h.frames(50);assert.equal(w.GRIDFALL_STATUS().phase,'planning');
});
test('Mobile practice keeps the action coach visible while its larger guide starts collapsed',async()=>{
  const h=harness(390);await h.$('menu-practice').click();assert.equal(h.$('practice-body').classList.contains('hidden'),true);assert.match(h.$('practice-coach').textContent,/Try MOVE/);assert.equal(h.$('practice-collapse').textContent,'Expand');assert.equal(h.$('practice-collapse').getAttribute('aria-controls'),'practice-body');h.$('practice-collapse').click();assert.equal(h.$('practice-body').classList.contains('hidden'),false);assert.equal(h.$('practice-collapse').textContent,'Collapse');assert.equal(h.$('practice-collapse').getAttribute('aria-expanded'),'true');h.$('practice-collapse').click();assert.equal(h.$('practice-collapse').textContent,'Expand');assert.equal(h.$('practice-collapse').getAttribute('aria-expanded'),'false');
});
test('Battlefield map tools, coach and loadout share a left column while all eight actions stay in the action dock',async()=>{
  const h=harness();await h.$('menu-practice').click();
  for(const id of ['drop-countdown','platform-legend','camera-mode'])assert.equal(h.$(id).parentElement,h.$('field-tools'));
  assert.equal(h.document.querySelector('.camera-controls').parentElement,h.$('field-tools'));
  for(const id of ['field-tools','practice-panel','loadout-dock'])assert.equal(h.$(id).parentElement,h.$('left-hud'));
  assert.equal(h.$('actions').children.length,8);assert.deepEqual(h.$('actions').children.map(b=>b.dataset.type),['move','shoot','slash','smoke','guard','reload','heal','grenade']);
  assert.equal(h.$('practice-collapse').textContent,'Collapse');assert.equal(h.$('camera-center').getAttribute('aria-label'),'Follow operator [C]');
});
