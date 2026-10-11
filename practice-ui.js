(function(){
  'use strict';
  const G=window.Gridfall,P=window.GridfallPresentation,$=id=>document.getElementById(id);
  const lootHelp={weapon:['Weapon','Walk over it to collect it. Equip it next turn.'],ammo:['Ammo','Adds 24 reserve rounds next turn. Reload to fill your magazine.'],medkit:['Medkit','Adds one Medkit next turn. Use HEAL / H to restore HP.'],shield:['Armor','Restores up to 20 shield next turn. Shield absorbs damage before HP.'],grenade:['Grenade','Adds one grenade next turn. Throw with B; the blast destroys walls.'],smoke:['Smoke','Adds one smoke next turn. Throw with 4; it lasts 2 turns. Players inside the same cloud can see each other; outsiders are hidden. Bullets pass through.']};
  const terrainHelp={floor:['Open ground','Normal movement: one movement point per tile.'],road:['Road','Normal movement. Trailblazer reveals you here at turn end.'],cover:['Cover','Reduces bullet damage from its protected side by 25%.'],water:['Water','Costs two movement points per tile.'],forest:['Forest','Terrain decoration; check the visible aim line for obstacles.'],wall:['Wall','Blocks movement, sight and bullets. Can be destroyed.'],barricade:['Barricade','Blocks movement, sight and bullets. Break it with gunfire, Slash or a grenade.'],rubble:['Rubble','Remains after a wall is destroyed. You can walk over it.'],void:['Void','No platform. Falling here eliminates you. Yellow: 2 turns to collapse; red: 1.']};
  function row(icon,title,copy,color='#addccb'){return '<div class="practice-legend"><i style="color:'+color+'">'+icon+'</i><div><b>'+title+'</b><small>'+copy+'</small></div></div>';}
  function create({reset,character,weapon,mode,next,retry,jump,previous}){
    let guide=null,focusStamp='',lessonStamp='',cueStamp='';const heldKeys=new Set(),W=window.GridfallWalkthrough;
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a lesson';placeholder.disabled=true;$('walkthrough-lesson').append(placeholder);
    const groups=new Map();for(const [index,step]of W.steps.entries()){const name=step.character?'Signature skills':step.id==='fate'?'Fate cards':['zoom','pan','weapon','operator'].includes(step.id)?'Camera and loadout':'Actions';if(!groups.has(name)){const group=document.createElement('optgroup');group.label=name;groups.set(name,group);$('walkthrough-lesson').append(group);}const option=document.createElement('option');option.value=step.id;option.dataset.lesson=step.id;option.dataset.label=String(index+1).padStart(2,'0')+' · '+step.title;option.textContent=option.dataset.label;groups.get(name).append(option);}
    $('walkthrough-lesson').onchange=e=>jump(e.target.value);$('walkthrough-prev').onclick=previous;
    function keyCode(key){return key==='SPACE'?'Space':key==='Enter'?'Enter':/^[0-9]$/.test(key)?'Digit'+key:/^[A-Z]$/.test(key)?'Key'+key:'';}
    function refreshKeys(){for(const key of $('walkthrough-keyboard').children)key.classList.toggle('key-held',heldKeys.has(key.dataset.code));}
    document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input,select,textarea')||e.target.isContentEditable)return;heldKeys.add(e.code);refreshKeys();});
    document.addEventListener('keyup',e=>{heldKeys.delete(e.code);refreshKeys();});window.addEventListener('blur',()=>{heldKeys.clear();refreshKeys();});
    function showCue(cue){const stamp=JSON.stringify(cue);if(stamp!==cueStamp){$('walkthrough-keyboard').replaceChildren(...cue.keys.map(key=>{const k=document.createElement('kbd');k.textContent=key;k.dataset.code=keyCode(key);if(k.dataset.code)k.classList.add('key-invite');return k;}));$('walkthrough-input-label').textContent=cue.keys.length?cue.keys.some(key=>keyCode(key))?'TRY THE KEYBOARD':'MOUSE CONTROL':'YOUR NEXT STEP';$('walkthrough-task').textContent=cue.task;$('walkthrough-followup').textContent=cue.after;cueStamp=stamp;}refreshKeys();}
    function pauseLesson(){}
    function setExpanded(expanded){
      if(!expanded)pauseLesson();$('practice-body').classList.toggle('hidden',!expanded);
      $('practice-collapse').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg><span>'+(expanded?'Collapse':'Expand')+'</span>';
      $('practice-collapse').setAttribute('aria-expanded',String(expanded));$('practice-collapse').setAttribute('aria-label',expanded?'Collapse practice guide':'Expand practice guide');
    }
    for(const [id,c]of Object.entries(G.CLASSES)){const option=document.createElement('option');option.value=id;option.textContent=c.name+' / '+c.skill;$('practice-character').append(option);}
    for(const [id,w]of Object.entries(G.WEAPONS)){const option=document.createElement('option');option.value=id;option.textContent=w.name;$('practice-weapon').append(option);}
    for(const [id,c]of Object.entries(G.CLASSES)){const b=document.createElement('button');b.type='button';b.dataset.character=id;b.style.setProperty('--operator-color',P.accents[id]||c.color);b.innerHTML='<i aria-hidden="true">'+P.icon(c.skillType)+'</i><span><b>'+c.name+'</b><small>'+c.skill+'</small></span>';b.setAttribute('aria-pressed','false');b.onclick=()=>character(id);$('practice-operators').append(b);}
    $('practice-walkthrough').onclick=()=>mode('walkthrough');$('practice-free').onclick=()=>mode('free');$('walkthrough-next').onclick=next;$('walkthrough-retry').onclick=retry;
    $('practice-character').onchange=e=>character(e.target.value);$('practice-weapon').onchange=e=>weapon(e.target.value);$('practice-reset').onclick=reset;
    $('practice-collapse').onclick=()=>setExpanded($('practice-body').classList.contains('hidden'));
    $('practice-collapse').setAttribute('aria-controls','practice-body');setExpanded(innerWidth>790);
    function showGuide(kind){
      pauseLesson();
      guide=guide===kind?null:kind;$('practice-info').classList.toggle('hidden',!guide);
      $('practice-field').setAttribute('aria-expanded',String(guide==='field'));
      if(guide==='field'){
        $('practice-info').innerHTML='<h3>Items on the battlefield</h3><p>Hover a tile to inspect it. Walk over an item to collect it; it becomes available next turn.</p><p id="practice-inspect"></p>'+Object.entries(lootHelp).map(([id,[title,copy]])=>row(id==='weapon'?P.weaponIcon('rifle'):G.LOOT[id].icon,title,copy,G.LOOT[id].color)).join('')+row('◈','Supply beacon','Walk onto the pulsing ring: +30 reserve ammo, +20 shield, +1 grenade and +1 Medkit, available next turn. In real matches it spawns at random safe locations and moves after recharging.')+row('▱','Roofs','Players under the same roof can see each other. Outside players cannot normally see in. Oracle Scan reveals operators through roofs. Walls still block normal sight.')+row('▰','Cover and obstacles','Cover reduces incoming bullets from its protected side. Walls and barricades block sight and bullets; they can be destroyed.')+row('≈','Water','Costs two movement points per tile.')+row('▧','Collapse warnings','In real matches: yellow = 2 turns left, red = 1 turn left, black = Void. Platforms stay safe in practice.');
      }
    }
    $('practice-field').onclick=()=>showGuide('field');
    function update({active,phase,queued,turns,healed,unit,paused=false,walkthrough=null}){
      $('practice-panel').classList.toggle('hidden',!active);
      if(!active||paused||phase!=='planning')pauseLesson();
      if(!active){delete document.body.dataset.practiceCue;delete document.body.dataset.trainingMode;delete document.body.dataset.trainingLesson;for(const node of document.querySelectorAll('.walk-focus'))node.classList.remove('walk-focus');focusStamp=lessonStamp='';heldKeys.clear();return;}
      const step=walkthrough?window.GridfallWalkthrough.steps[walkthrough.index]:null;
      const guided=!!walkthrough&&!walkthrough.finished;
      $('walkthrough-coach').classList.toggle('hidden',!walkthrough);$('practice-coach').classList.toggle('hidden',!!walkthrough);
      $('practice-walkthrough').setAttribute('aria-pressed',String(!!walkthrough));$('practice-free').setAttribute('aria-pressed',String(!walkthrough));
      const navigable=['planning','draft','draftReveal'].includes(phase);
      $('practice-walkthrough').disabled=$('practice-free').disabled=!navigable;$('walkthrough-retry').disabled=$('walkthrough-lesson').disabled=!navigable;$('walkthrough-prev').disabled=!navigable||!walkthrough||walkthrough.index===0;
      document.body.dataset.trainingMode=walkthrough?'guided':'free';document.body.dataset.trainingLesson=step?.id||'';
      $('practice-panel').querySelector('h2').textContent=walkthrough?'Pick a lesson. Try it.':'Two actions. One plan.';
      for(const b of $('practice-operators').children){const chosen=b.dataset.character===unit.class;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));b.disabled=phase!=='planning'||guided&&step?.id!=='operator';}
      $('practice-operator-description').textContent=G.CLASSES[unit.class].description;
      if(walkthrough){
        const completed=walkthrough.completed||[],count=completed.length,total=W.steps.length;
        $('walkthrough-position').textContent=count+' / '+total+' LESSONS PRACTICED';$('walkthrough-progress').value=count;$('walkthrough-progress').max=total;
        $('walkthrough-lesson').value=step?.id||'';for(const option of $('walkthrough-lesson').querySelectorAll('[data-lesson]'))option.textContent=(completed.includes(option.dataset.lesson)?'✓ ':'')+option.dataset.label;
        $('walkthrough-title').textContent=step?.title||'Ready for the battlefield';$('walkthrough-copy').textContent=(document.body.classList.contains('mobile-layout')&&step?(step.character?G.CLASSES[step.character].description:step.copy.split(/(?<=\.)\s+/).filter(sentence=>!/Press|Select|Click|Scroll|Hold|click|mouse|SPACE|WASD|lower left/.test(sentence)).join(' ')||W.cue({walkthrough,phase},queued,true).after):step?.copy)||'You practiced '+count+' of '+total+' lessons. Pick any lesson above to try it again, or continue in Free Mode.';
        $('walkthrough-next').disabled=!navigable;$('walkthrough-next').textContent=walkthrough.finished?'Free Mode →':walkthrough.ready?walkthrough.index===total-1?'Finish ✓':'Next lesson →':walkthrough.index===total-1?'Other lessons →':'Skip lesson →';
        $('walkthrough-status').textContent=walkthrough.ready?'✓ Practiced — you can repeat or continue.':walkthrough.finished?count+' lessons practiced. Choose any lesson above.':'Jump to any lesson. Skipping does not mark it practiced.';
        showCue(W.cue({walkthrough,phase},queued,document.body.classList.contains('mobile-layout')));const stamp=String(walkthrough.index);if(stamp!==lessonStamp){setExpanded(true);lessonStamp=stamp;}
      }else lessonStamp='';
      const expected=step?.actions?.[queued]||step?.action;
      const focus=guided&&!walkthrough.ready?(step.id==='undo'&&queued?'#undo-button':queued&&(step.actions?queued>=step.actions.length:true)?'#lock-button':step.focus||(['skillMove','blink','scan','firebomb','reflect','stasis','mend'].includes(expected)?'#skill-button':'#actions [data-type="'+expected+'"]')):walkthrough?'#walkthrough-next':'';
      if(focus!==focusStamp){for(const node of document.querySelectorAll('.walk-focus'))node.classList.remove('walk-focus');document.querySelector(focus||'#walkthrough-next')?.classList.toggle('walk-focus',!!focus);focusStamp=focus;}
      $('practice-character').value=unit.class;$('practice-weapon').value=unit.weapon;
      $('practice-character').disabled=$('practice-weapon').disabled=phase!=='planning';$('practice-reset').disabled=phase==='resolution'||phase==='clash';
      let cue='',copy;
      if(phase==='draft')copy='Choose a card: read its benefit and its cost. Both last for this practice session.';
      else if(phase==='draftReveal')copy='Your card is active. Open FATE to see how your build changed.';
      else if(phase!=='planning')copy='Watch both actions resolve. The bot acts at the same time as you.';
      else if(queued===2){cue='commit';copy='Two actions queued. Press SPACE or Confirm plan to play the turn.';}
      else if(queued===1){cue='second';copy='Add your second action. You can move then shoot, heal then guard, or repeat an action.';}
      else if(!turns){cue='first';copy=document.body.classList.contains('mobile-layout')?'Try MOVE: hold a nearby tile to preview, then release to add it. Or hold your operator and drag to draw a route. Choose SHOOT and hold to aim. Tap Pan to drag the camera, or use two fingers to pan and pinch to zoom.':'Try MOVE: click a nearby tile, or drag from your operator to draw a route. Then choose SHOOT and click toward the bot. Use the mouse wheel to zoom; hold WASD or drag with the right mouse button to pan.';}
      else if(!healed){cue='heal';copy='Try HEAL / H. You start each turn at half HP; healing raises it during the turn. Add one more action, then confirm.';}
      else{cue='explore';copy='Try every weapon and operator. Switching is instant during planning. Use Field guide for items. Fate drafts let you choose an upgrade and its cost every four turns.';}
      document.body.dataset.practiceCue=walkthrough?'guided':cue;if($('practice-coach').textContent!==copy)$('practice-coach').textContent=copy;
    }
    function inspect(tile,beacon=false){
      const output=$('practice-inspect');if(guide!=='field'||!output)return;
      let info=beacon?['Supply beacon','Walk onto the ring for ammo, armor, a grenade and a Medkit.']:tile?.loot&&!tile.loot.taken?lootHelp[tile.loot.type]:tile?.roof?['Roof','Share sight with players under the same roof; hide from outside players.']:terrainHelp[tile?.type];
      output.textContent=info?info[0]+' · '+info[1]:'';
    }
    return {update,inspect,pause:pauseLesson};
  }
  window.GridfallPracticeUI={create};
})();
