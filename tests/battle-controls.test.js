const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
function key(h,type,code,options={}){let prevented=false;h.document.dispatchEvent({type,code,key:code.startsWith('Key')?code.slice(3):code,preventDefault(){prevented=true;},...options});return prevented;}
const pose=h=>h.window.GRIDFALL_STATUS().camera;
test('Holding WASD pans continuously without depending on repeats, and releasing stops immediately',async()=>{
  const h=harness();await h.$('menu-practice').click();const before=pose(h);
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
  const h=harness();await h.$('menu-practice').click();const before=pose(h);
  key(h,'keydown','KeyD');key(h,'keydown','KeyW');h.frames(4);const diagonal=pose(h);
  assert.ok(Math.abs(Math.hypot(diagonal.x-before.x,diagonal.y-before.y)-360/32/before.zoom*.18)<1e-6);
  key(h,'keyup','KeyD');key(h,'keyup','KeyW');
  assert.equal(key(h,'keydown','KeyS',{target:h.$('practice-character')}),false);
  assert.equal(key(h,'keydown','KeyA',{ctrlKey:true}),false);h.frames(2);assert.equal(pose(h).x,diagonal.x);assert.equal(pose(h).y,diagonal.y);
  key(h,'keydown','KeyD');h.document.dispatchEvent({type:'focusin',target:h.$('practice-weapon')});h.frames(2);assert.equal(pose(h).x,diagonal.x);
  key(h,'keydown','ArrowDown');h.frames(2);assert.ok(pose(h).y>diagonal.y);key(h,'keyup','ArrowDown');
});
test('Ready skill outlines track the live operator, queued skill and available action slots',async()=>{
  const h=harness(),{$,window:w}=h;await $('menu-practice').click();const skill=$('skill-button');
  assert.equal(skill.classList.contains('skill-ready'),true);assert.equal(skill.querySelector('kbd').textContent,'E');
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
test('Tutorial exposes three real video demos with posters, captions, controls and written instructions',async()=>{
  const h=harness(),{$}=h;await $('menu-practice').click();$('practice-lessons').click();
  for(const id of ['zoom','pan','route']){
    $('practice-info').querySelector('[data-lesson="'+id+'"]').click();const video=$('practice-video');
    assert.equal(video.querySelector('source').getAttribute('src'),'assets/tutorial-'+id+'.mp4');assert.equal(video.querySelector('track').getAttribute('src'),'assets/tutorial-'+id+'.vtt');
    assert.equal(video.getAttribute('poster'),'assets/tutorial-'+id+'.png');assert.equal(video.hasAttribute('controls'),true);assert.equal(video.hasAttribute('autoplay'),false);assert.equal(video.hasAttribute('muted'),true);
    assert.ok($('practice-video-transcript').textContent.length>80);
  }
  assert.match($('practice-video-transcript').textContent,/four directions/);
  let pauses=0;$('practice-video').pause=()=>pauses++;$('practice-collapse').click();assert.equal(pauses,1);$('practice-collapse').click();$('help-button').click();assert.equal(pauses,2);$('help-done').click();$('practice-fate').click();assert.equal(pauses,3);
});
