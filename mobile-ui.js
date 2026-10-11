(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  function create({cancel,layout}){
    let enabled=false,active='actions',lastLesson='',lastView='',view={};const homes=[];
    const dock=document.createElement('section');dock.id='mobile-dock';dock.setAttribute('aria-label','Battlefield touch controls');dock.hidden=true;
    dock.innerHTML='<nav id="mobile-tabs" aria-label="Battlefield panels"></nav><button id="mobile-lesson" type="button" hidden></button><div id="mobile-pane-actions" class="mobile-pane"><div id="mobile-action-grid"></div><p id="mobile-touch-hint" aria-live="polite"></p></div><div id="mobile-pane-guide" class="mobile-pane" hidden></div><div id="mobile-pane-menu" class="mobile-pane" hidden></div><div id="mobile-pane-watch" class="mobile-pane" hidden></div><div id="mobile-plan"></div><div id="mobile-commit"></div>';
    document.body.append(dock);
    const floating=document.createElement('aside');floating.id='mobile-field-hud';floating.hidden=true;floating.setAttribute('aria-label','Equipment and fullscreen');
    floating.innerHTML='<div id="mobile-floating-buttons"><button id="mobile-gear-button" type="button" aria-controls="mobile-pane-gear" aria-expanded="false"><i id="mobile-gear-icon" aria-hidden="true"></i><span><b id="mobile-gear-name">P9</b><small id="mobile-gear-info">Gear</small></span></button></div><section id="mobile-pane-gear" hidden aria-label="Choose a weapon"><header class="mobile-gear-heading"><b>Choose weapon</b><button id="mobile-gear-close" type="button" aria-label="Close equipment">×</button></header><div id="mobile-gear-content"></div></section>';
    document.body.append(floating);
    const tabs={};for(const [id,label]of [['actions','Actions'],['guide','Guide'],['menu','Menu']]){
      const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-controls','mobile-pane-'+id);b.onclick=()=>show(id==='actions'&&(view.replay||view.spectating)?'watch':id);$('mobile-tabs').append(b);tabs[id]=b;
    }
    function closeGear(focus=false){$('mobile-pane-gear').hidden=true;$('mobile-gear-button').setAttribute('aria-expanded','false');if(focus)$('mobile-gear-button').focus({preventScroll:true});}
    function openGear(){cancel();$('mobile-pane-gear').hidden=false;$('mobile-gear-button').setAttribute('aria-expanded','true');}
    function show(id){cancel();if(id==='gear'){openGear();return;}closeGear();active=id;for(const pane of ['actions','guide','menu','watch'])$('mobile-pane-'+pane).hidden=pane!==id;for(const [name,b]of Object.entries(tabs))b.setAttribute('aria-pressed',String(name===id||name==='actions'&&id==='watch'));dock.dataset.panel=id;measure();}
    function move(node,parent){const marker=document.createElement('span');marker.hidden=true;node.parentElement.insertBefore(marker,node);homes.push({node,marker});parent.append(node);}
    function measure(){if(enabled&&!dock.hidden){const h=dock.getBoundingClientRect().height;document.documentElement.style.setProperty('--mobile-dock-height',Math.ceil(h)+'px');}}
    function responsive(){
      const use=innerWidth<=790||innerWidth<=1000&&innerHeight<=540&&!!window.matchMedia?.('(pointer: coarse)').matches;
      if(use===enabled){measure();return;}cancel();closeGear();enabled=use;document.body.classList.toggle('mobile-layout',use);
      if(use){
        move(document.querySelector('.status-row'),dock);move($('skill-button'),$('mobile-action-grid'));move($('actions'),$('mobile-action-grid'));
        move($('plan-slots'),$('mobile-plan'));move($('undo-button'),$('mobile-commit'));move($('camera-center'),$('mobile-commit'));move($('lock-button'),$('mobile-commit'));
        const label=document.createElement('span');label.id='mobile-follow-label';label.textContent='Follow';$('camera-center').append(label);
        move($('loadout-dock'),$('mobile-gear-content'));move($('fate-build'),$('mobile-gear-content'));move($('practice-panel'),$('mobile-pane-guide'));move($('field-tools'),$('mobile-pane-menu'));move(document.querySelector('.top-right'),$('mobile-pane-menu'));
        move($('fullscreen-button'),$('mobile-floating-buttons'));move($('replay-controls'),$('mobile-pane-watch'));move($('spectator-bar'),$('mobile-pane-watch'));
      }else{$('mobile-follow-label')?.remove();for(const {node,marker}of homes.reverse()){marker.parentElement.insertBefore(node,marker);marker.remove();}homes.length=0;document.documentElement.style.setProperty('--mobile-dock-height','0px');}
      update(view);layout();
    }
    function feedback({aiming=false}={}){
      const hint=aiming?'Release to add · Slide outside the field to discard':'Hold to preview · Release to add · 2 fingers: pan / zoom';if($('mobile-touch-hint').textContent!==hint)$('mobile-touch-hint').textContent=hint;
      dock.classList.toggle('mobile-aiming',aiming);
    }
    function update(next={}){
      if(next.started&&!view.started){lastView='';lastLesson='';closeGear();}
      view=next;dock.hidden=floating.hidden=!enabled||!view.started;document.body.classList.toggle('mobile-playing',enabled&&!!view.started);
      if(!enabled)return;
      tabs.guide.hidden=!view.practice;
      const gun=window.Gridfall.WEAPONS[view.weapon],name=gun?.short||$('weapon-type').textContent;
      $('mobile-gear-name').textContent=name+' · Gear';$('mobile-gear-info').textContent=(view.ammo??0)+' rounds · '+(view.hp??100)+' HP';
      if(gun&&$('mobile-gear-icon').dataset.weapon!==view.weapon){$('mobile-gear-icon').dataset.weapon=view.weapon;$('mobile-gear-icon').innerHTML=window.GridfallPresentation.weaponIcon(view.weapon);}
      $('mobile-gear-button').setAttribute('aria-label','Gear · '+name+' · '+(view.ammo??0)+' rounds · '+(view.hp??100)+' HP');
      const watch=view.replay||view.spectating;tabs.actions.textContent=view.replay?'Replay':view.spectating?'Watch':'Actions';tabs.actions.setAttribute('aria-controls',watch?'mobile-pane-watch':'mobile-pane-actions');
      const stage=watch?'watch':'play';if(stage!==lastView){lastView=stage;show(watch?'watch':'actions');}
      const lesson=view.walkthrough?.step||'',guided=!!view.walkthrough&&!view.walkthrough.finished;
      if(guided&&lesson!==lastLesson){lastLesson=lesson;show(lesson==='operator'?'guide':'actions');if(lesson==='weapon')openGear();}
      if(!guided)lastLesson='';if(!view.practice&&active==='guide')show('actions');
      $('mobile-lesson').hidden=!guided;$('mobile-lesson').textContent=guided?$('walkthrough-title').textContent+' · '+(view.walkthrough.ready?'Next lesson →':$('walkthrough-task').textContent):'';
      feedback(view.touch);measure();
    }
    $('mobile-gear-button').onclick=()=>{$('mobile-pane-gear').hidden?openGear():closeGear();};$('mobile-gear-close').onclick=()=>closeGear(true);
    $('mobile-lesson').onclick=()=>show('guide');
    document.addEventListener('pointerdown',e=>{if(enabled&&!$('mobile-pane-gear').hidden&&!e.target.closest('#mobile-field-hud')){closeGear();if(e.target.closest('#arena')){e.preventDefault();e.stopPropagation?.();}}},{capture:true});
    document.addEventListener('keydown',e=>{if(enabled&&!$('mobile-pane-gear').hidden&&e.code==='Escape'){closeGear(true);e.preventDefault();e.stopPropagation?.();}},{capture:true});
    window.addEventListener('resize',responsive);window.visualViewport?.addEventListener('resize',measure);
    new ResizeObserver(measure).observe(dock);responsive();
    return {update,feedback,show,get enabled(){return enabled;}};
  }
  window.GridfallMobileUI={create};
})();
