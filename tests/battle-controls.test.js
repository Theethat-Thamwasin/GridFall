const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
function key(h,type,code,options={}){let prevented=false;h.document.dispatchEvent({type,code,key:code.startsWith('Key')?code.slice(3):code,preventDefault(){prevented=true;},...options});return prevented;}
const pose=h=>h.window.GRIDFALL_STATUS().camera;
test('Holding WASD pans continuously without depending on repeats, and releasing stops immediately',async()=>{
  const h=harness();await h.$('menu-practice').click();await h.$('menu-free-practice').click();const before=pose(h);
  assert.equal(key(h,'keydown','KeyD'),true);assert.equal(pose(h).x,before.x,'keydown must not jump the camera');
  h.frames(4);const halfway=pose(h);h.frames(4);const after=pose(h);
  assert.ok(halfway.x>before.x);assert.ok(after.x>halfway.x);assert.ok(Math.abs((after.x-before.x)-360/32/before.zoom*.36)<1e-6);
  key(h,'keydown','KeyD',{repeat:true});assert.equal(pose(h).x,after.x,'repeat must not add a separate jump');
  key(h,'keyup','KeyD');h.frames(3);assert.equal(pose(h).x,after.x);assert.equal(pose(h).follow,false);
  key(h,'keydown','KeyW');h.frames(2);h.window.dispatchEvent({type:'blur'});const blurred=pose(h);h.frames(2);assert.equal(pose(h).y,blurred.y);
  key(h,'keydown','KeyS');h.document.hidden=true;h.document.dispatchEvent({type:'visibilitychange'});h.document.hidden=false;h.document.dispatchEvent({type:'visibilitychange'});h.frames(2);assert.equal(pose(h).y,blurred.y);
  key(h,'keydown','KeyA');h.$('help-button').click();h.$('help-done').click();const helped=pose(h);h.frames(2);assert.equal(pose(h).x,helped.x,'a dialog must release held movement');
  h.$('camera-center').click();h.frames(25);assert.equal(pose(h).follow,true);
});
test('Diagonal pan has the same speed as axial pan and text/select focus does not capture movement',async()=>{
  const h=harness();await h.$('menu-practice').click();await h.$('menu-free-practice').click();const before=pose(h);
  key(h,'keydown','KeyD');key(h,'keydown','KeyW');h.frames(4);const diagonal=pose(h);
  assert.ok(Math.abs(Math.hypot(diagonal.x-before.x,diagonal.y-before.y)-360/32/before.zoom*.18)<1e-6);
  key(h,'keyup','KeyD');key(h,'keyup','KeyW');
  assert.equal(key(h,'keydown','KeyS',{target:h.$('practice-character')}),false);
  assert.equal(key(h,'keydown','KeyA',{ctrlKey:true}),false);h.frames(2);assert.equal(pose(h).x,diagonal.x);assert.equal(pose(h).y,diagonal.y);
  key(h,'keydown','KeyD');h.document.dispatchEvent({type:'focusin',target:h.$('practice-weapon')});h.frames(2);assert.equal(pose(h).x,diagonal.x);
  key(h,'keydown','ArrowDown');h.frames(2);assert.ok(pose(h).y>diagonal.y);key(h,'keyup','ArrowDown');
});
test('Ready skill outlines track the live operator, queued skill and available action slots',async()=>{
  const h=harness(),{$,window:w}=h;await $('menu-practice').click();await $('menu-free-practice').click();const skill=$('skill-button');
  assert.equal(skill.classList.contains('skill-ready'),true);assert.equal(skill.querySelector('kbd').textContent,'E');
  const dock=h.document.querySelector('.command-panel');assert.equal(dock.children.find(n=>n===skill||n.classList?.contains('actions-heading')||n.id==='actions'),skill,'signature skill is first in the action panel');
  key(h,'keydown','KeyE');assert.equal(w.GRIDFALL_STATUS().selected,'skillMove','E selects the top skill button');
  $('practice-character').onchange({target:{value:'mire'}});assert.equal($('skill-name').textContent,'STASIS FIELD');assert.equal(skill.classList.contains('skill-ready'),true);
  skill.click();const s=w.GRIDFALL_STATUS();h.point({x:s.player.x+1,y:s.player.y});assert.equal(w.GRIDFALL_STATUS().queued,1);assert.equal(skill.classList.contains('skill-ready'),false);assert.equal($('skill-cooldown').textContent,'QUEUED');
  $('undo-button').click();assert.equal(skill.classList.contains('skill-ready'),true);
  $('actions').querySelector('[data-type="guard"]').click();$('actions').querySelector('[data-type="guard"]').click();assert.equal(skill.classList.contains('skill-ready'),false);
  $('undo-button').click();assert.equal(skill.classList.contains('skill-ready'),true);
  $('help-button').click();assert.equal(skill.classList.contains('skill-ready'),false);$('help-done').click();assert.equal(skill.classList.contains('skill-ready'),true);
  skill.click();h.point({x:s.player.x+1,y:s.player.y});$('lock-button').click();assert.equal(skill.classList.contains('skill-ready'),false);
  h.frames(86);assert.equal(w.GRIDFALL_STATUS().phase,'planning');assert.match($('skill-cooldown').textContent,/\d T/);assert.equal(skill.classList.contains('skill-ready'),false,'cooling down after a real cast');
  for(const button of $('actions').children)assert.ok(button.querySelector('kbd').textContent);
  assert.ok($('lock-button').querySelector('.confirm-symbol'));assert.equal($('lock-button').querySelector('kbd').textContent,'SPACE');
});
test('Practice reset clears the plan and restores the arena while Field guide remains available',async()=>{
  const h=harness(),{$,window:w}=h;await $('menu-free-practice').click();
  $('practice-field').click();assert.match($('practice-info').textContent,/Items on the battlefield/);assert.equal($('practice-field').getAttribute('aria-expanded'),'true');
  $('actions').querySelector('[data-type="guard"]').click();assert.equal(w.GRIDFALL_STATUS().queued,1);
  await $('practice-reset').click();assert.equal(w.GRIDFALL_STATUS().queued,0);assert.equal(w.GRIDFALL_STATUS().turn,1);assert.equal(w.GRIDFALL_STATUS().hp,50);assert.equal(w.GRIDFALL_STATUS().practice,true);
  $('lock-button').click();assert.equal($('practice-reset').disabled,true);h.frames(86);assert.equal($('practice-reset').disabled,false);
  await $('practice-reset').click();assert.equal(w.GRIDFALL_STATUS().turn,1);assert.equal(w.GRIDFALL_STATUS().queued,0);
  $('practice-field').click();assert.equal($('practice-info').classList.contains('hidden'),true);assert.equal($('practice-field').getAttribute('aria-expanded'),'false');
});
