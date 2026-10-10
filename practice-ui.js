(function(){
  'use strict';
  const G=window.Gridfall,P=window.GridfallPresentation,$=id=>document.getElementById(id);
  const lootHelp={weapon:['Weapon','Walk over it to collect it. Equip it next turn.'],ammo:['Ammo','Adds 24 reserve rounds next turn. Reload to fill your magazine.'],medkit:['Medkit','Adds one Medkit next turn. Use HEAL / H to restore HP.'],shield:['Armor','Restores up to 20 shield next turn. Shield absorbs damage before HP.'],grenade:['Grenade','Adds one grenade next turn. Throw with B; the blast destroys walls.'],smoke:['Smoke','Adds one smoke next turn. Throw with 4; it lasts 2 turns. Players inside the same cloud can see each other; outsiders are hidden. Bullets pass through.']};
  const terrainHelp={floor:['Open ground','Normal movement: one movement point per tile.'],road:['Road','Normal movement. Trailblazer reveals you here at turn end.'],cover:['Cover','Reduces bullet damage from its protected side by 25%.'],water:['Water','Costs two movement points per tile.'],forest:['Forest','Terrain decoration; check the visible aim line for obstacles.'],wall:['Wall','Blocks movement, sight and bullets. Can be destroyed.'],barricade:['Barricade','Blocks movement, sight and bullets. Break it with gunfire, Slash or a grenade.'],rubble:['Rubble','Remains after a wall is destroyed. You can walk over it.'],void:['Void','No platform. Falling here eliminates you. Yellow: 2 turns to collapse; red: 1.']};
  const lessons={
    zoom:{title:'Zoom the map',key:'Mouse wheel / + / −',steps:'Scroll up to zoom in. Scroll down to zoom out. You can also use the + and − camera buttons.'},
    pan:{title:'Move the camera',key:'Right drag / Middle drag / WASD',steps:'Hold the right or middle mouse button on the battlefield, then drag. Release to stop. Hold WASD or the arrow keys to pan continuously. Press C to follow your operator again.'},
    route:{title:'Draw your own route',key:'1 / Left drag / Q',steps:'Select MOVE or press 1. Hold left click on your operator, then drag through adjacent tiles in four directions. Release to queue the route. Your movement budget limits its length; water costs two points. Press Q to undo. Clicking a destination instead finds a route automatically.'}
  };
  function row(icon,title,copy,color='#addccb'){return '<div class="practice-legend"><i style="color:'+color+'">'+icon+'</i><div><b>'+title+'</b><small>'+copy+'</small></div></div>';}
  function create({reset,character,weapon}){
    let guide=null,lesson='zoom';
    function pauseLesson(){$('practice-video')?.pause?.();}
    function setExpanded(expanded){
      if(!expanded)pauseLesson();$('practice-body').classList.toggle('hidden',!expanded);
      $('practice-collapse').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg><span>'+(expanded?'Collapse':'Expand')+'</span>';
      $('practice-collapse').setAttribute('aria-expanded',String(expanded));$('practice-collapse').setAttribute('aria-label',expanded?'Collapse practice guide':'Expand practice guide');
    }
    for(const [id,c]of Object.entries(G.CLASSES)){const option=document.createElement('option');option.value=id;option.textContent=c.name+' / '+c.skill;$('practice-character').append(option);}
    for(const [id,w]of Object.entries(G.WEAPONS)){const option=document.createElement('option');option.value=id;option.textContent=w.name;$('practice-weapon').append(option);}
    $('practice-character').onchange=e=>character(e.target.value);$('practice-weapon').onchange=e=>weapon(e.target.value);$('practice-reset').onclick=reset;
    $('practice-collapse').onclick=()=>setExpanded($('practice-body').classList.contains('hidden'));
    $('practice-collapse').setAttribute('aria-controls','practice-body');setExpanded(innerWidth>790);
    function showGuide(kind){
      pauseLesson();
      guide=guide===kind?null:kind;$('practice-info').classList.toggle('hidden',!guide);
      for(const [id,kind]of [['practice-field','field'],['practice-fate','fate'],['practice-lessons','lessons']])$(id).setAttribute('aria-expanded',String(guide===kind));
      if(guide==='field'){
        $('practice-info').innerHTML='<h3>Items on the battlefield</h3><p>Hover a tile to inspect it. Walk over an item to collect it; it becomes available next turn.</p><p id="practice-inspect"></p>'+Object.entries(lootHelp).map(([id,[title,copy]])=>row(id==='weapon'?P.weaponIcon('rifle'):G.LOOT[id].icon,title,copy,G.LOOT[id].color)).join('')+row('◈','Supply beacon','Walk onto the pulsing ring: +30 reserve ammo, +20 shield and +1 grenade, available next turn. It recharges after use.')+row('▱','Roofs','Players under the same roof can see each other. Outside players cannot see in, even with Scan. Walls still block sight.')+row('▰','Cover and obstacles','Cover reduces incoming bullets from its protected side. Walls and barricades block sight and bullets; they can be destroyed.')+row('≈','Water','Costs two movement points per tile.')+row('▧','Collapse warnings','In real matches: yellow = 2 turns left, red = 1 turn left, black = Void. Platforms stay safe in practice.');
      }else if(guide==='fate'){
        const example=G.FATE.cards['quickloader'];
        $('practice-info').innerHTML='<h3>One upgrade. A real price.</h3><p>Every 4 turns, choose a Fate card. Read <b>YOU GAIN</b> and <b>YOU PAY</b> together. Both effects stay for the rest of this match and can stack up to their limits.</p><p><b>'+example.name+'</b><br>Gain: '+example.blessing+'.<br>Pay: '+example.curse+'.</p><p>Your first live draft opens at turn 4 in this arena. You have 16 seconds; a card is chosen for you if time runs out. Choosing costs no action points.</p><p>Open FATE in your loadout to inspect your cards or another player’s build. Special cards move, trade or remove effects; received cards keep their paired costs. Cards reset when you leave this arena.</p>';
      }else if(guide==='lessons'){
        $('practice-info').innerHTML='<h3>Watch. Then try it.</h3><p>Play an 8-second demo, then try the controls in this arena.</p><div class="practice-video-tabs" role="group" aria-label="Video lessons">'+Object.entries(lessons).map(([id,l])=>'<button type="button" data-lesson="'+id+'" aria-pressed="'+(lesson===id)+'">'+l.title+'</button>').join('')+'</div><div id="practice-video-content"></div>';
        for(const button of $('practice-info').querySelectorAll('[data-lesson]'))button.onclick=()=>showLesson(button.dataset.lesson);
        showLesson(lesson);
      }
    }
    function showLesson(id){
      if(!lessons[id])return;pauseLesson();lesson=id;
      const l=lessons[id];
      for(const button of $('practice-info').querySelectorAll('[data-lesson]'))button.setAttribute('aria-pressed',String(button.dataset.lesson===id));
      $('practice-video-content').innerHTML='<video id="practice-video" controls muted loop playsinline preload="metadata" poster="assets/tutorial-'+id+'.png" aria-label="'+l.title+' demonstration" aria-describedby="practice-video-transcript"><source src="assets/tutorial-'+id+'.mp4" type="video/mp4"><track kind="captions" src="assets/tutorial-'+id+'.vtt" srclang="en" label="English instructions">Your browser cannot play this video. Use the instructions below.</video><p class="practice-video-shortcuts">'+l.key+'</p><p id="practice-video-transcript">'+l.steps+'</p>';
    }
    $('practice-field').onclick=()=>showGuide('field');$('practice-fate').onclick=()=>showGuide('fate');$('practice-lessons').onclick=()=>showGuide('lessons');
    function update({active,phase,queued,turns,healed,unit,paused=false}){
      $('practice-panel').classList.toggle('hidden',!active);
      if(!active||paused||phase!=='planning')pauseLesson();
      if(!active){delete document.body.dataset.practiceCue;return;}
      $('practice-character').value=unit.class;$('practice-weapon').value=unit.weapon;
      $('practice-character').disabled=$('practice-weapon').disabled=phase!=='planning';$('practice-reset').disabled=phase==='resolution'||phase==='clash';
      let cue='',copy;
      if(phase==='draft')copy='Choose a card: read its benefit and its cost. Both last for this practice session.';
      else if(phase==='draftReveal')copy='Your card is active. Open FATE to see how your build changed.';
      else if(phase!=='planning')copy='Watch both actions resolve. The bot acts at the same time as you.';
      else if(queued===2){cue='commit';copy='Two actions queued. Press SPACE or Confirm plan to play the turn.';}
      else if(queued===1){cue='second';copy='Add your second action. You can move then shoot, heal then guard, or repeat an action.';}
      else if(!turns){cue='first';copy='Try MOVE: click a nearby tile, or drag from your operator to draw a route. Then choose SHOOT and click toward the bot. Open Video lessons for camera controls.';}
      else if(!healed){cue='heal';copy='Try HEAL / H. You start each turn at half HP; healing raises it during the turn. Add one more action, then confirm.';}
      else{cue='explore';copy='Try every weapon and operator. Switching is instant during planning. Use Field guide for items and Fate cards for upgrades.';}
      document.body.dataset.practiceCue=cue;if($('practice-coach').textContent!==copy)$('practice-coach').textContent=copy;
    }
    function inspect(tile,beacon=false){
      const output=$('practice-inspect');if(guide!=='field'||!output)return;
      let info=beacon?['Supply beacon','Walk onto the ring for ammo, armor and a grenade.']:tile?.loot&&!tile.loot.taken?lootHelp[tile.loot.type]:tile?.roof?['Roof','Share sight with players under the same roof; hide from outside players.']:terrainHelp[tile?.type];
      output.textContent=info?info[0]+' · '+info[1]:'';
    }
    return {update,inspect,pause:pauseLesson};
  }
  window.GridfallPracticeUI={create};
})();
