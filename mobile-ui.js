(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  function create({cancel,togglePan,layout}){
    let enabled=false,active='actions',lastLesson='',lastView='',view={};const homes=[];
    const dock=document.createElement('section');dock.id='mobile-dock';dock.setAttribute('aria-label','Battlefield touch controls');dock.hidden=true;
    dock.innerHTML='<nav id="mobile-tabs" aria-label="Battlefield panels"></nav><button id="mobile-lesson" type="button" hidden></button><div id="mobile-pane-actions" class="mobile-pane"><div id="mobile-action-grid"></div><p id="mobile-touch-hint" aria-live="polite"></p></div><div id="mobile-pane-gear" class="mobile-pane" hidden></div><div id="mobile-pane-guide" class="mobile-pane" hidden></div><div id="mobile-pane-map" class="mobile-pane" hidden><p class="mobile-camera-help">Pan: drag with one finger. Use two fingers to pan or pinch to zoom at any time.</p></div><div id="mobile-pane-menu" class="mobile-pane" hidden></div><div id="mobile-pane-watch" class="mobile-pane" hidden></div><div id="mobile-plan"></div><div id="mobile-commit"><button id="mobile-cancel" type="button" aria-label="Cancel current aim">×<span>Cancel</span></button><button id="mobile-pan" type="button" aria-pressed="false">✥<span>Pan</span></button></div>';
    document.body.append(dock);
    $('mobile-pan').innerHTML=window.GridfallPresentation.icon('move')+'<span>Pan</span>';
    const tabs={};for(const [id,label]of [['actions','Actions'],['gear','Gear'],['guide','Guide'],['map','Map'],['menu','Menu']]){
      const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-controls','mobile-pane-'+id);b.onclick=()=>show(id==='actions'&&(view.replay||view.spectating)?'watch':id);$('mobile-tabs').append(b);tabs[id]=b;
    }
    function show(id){cancel();active=id;for(const pane of ['actions','gear','guide','map','menu','watch'])$('mobile-pane-'+pane).hidden=pane!==id;for(const [name,b]of Object.entries(tabs))b.setAttribute('aria-pressed',String(name===id||name==='actions'&&id==='watch'));dock.dataset.panel=id;measure();}
    function move(node,parent){const marker=document.createElement('span');marker.hidden=true;node.parentElement.insertBefore(marker,node);homes.push({node,marker});parent.append(node);}
    function measure(){if(enabled&&!dock.hidden){const h=dock.getBoundingClientRect().height;document.documentElement.style.setProperty('--mobile-dock-height',Math.ceil(h)+'px');}}
    function responsive(){
      const use=innerWidth<=790||innerWidth<=1000&&innerHeight<=540&&!!window.matchMedia?.('(pointer: coarse)').matches;
      if(use===enabled){measure();return;}cancel();enabled=use;document.body.classList.toggle('mobile-layout',use);
      if(use){
        move(document.querySelector('.status-row'),dock);move($('skill-button'),$('mobile-action-grid'));move($('actions'),$('mobile-action-grid'));
        move($('plan-slots'),$('mobile-plan'));move($('undo-button'),$('mobile-commit'));move($('lock-button'),$('mobile-commit'));
        move($('loadout-dock'),$('mobile-pane-gear'));move($('fate-build'),$('mobile-pane-gear'));move($('practice-panel'),$('mobile-pane-guide'));move($('field-tools'),$('mobile-pane-map'));move(document.querySelector('.top-right'),$('mobile-pane-menu'));
        move($('replay-controls'),$('mobile-pane-watch'));move($('spectator-bar'),$('mobile-pane-watch'));
      }else{for(const {node,marker}of homes.reverse()){marker.parentElement.insertBefore(node,marker);marker.remove();}homes.length=0;document.documentElement.style.setProperty('--mobile-dock-height','0px');}
      update(view);layout();
    }
    function feedback({aiming=false,pan=false}={}){
      $('mobile-pan').setAttribute('aria-pressed',String(pan));$('mobile-pan').classList.toggle('selected',pan);
      $('mobile-cancel').disabled=!view.canPlan&&!aiming;
      const hint=aiming?'Release to add action · Cancel to discard':pan?'Drag to pan · Pinch to zoom':'Hold to preview · Release to add · 2 fingers: pan / zoom';if($('mobile-touch-hint').textContent!==hint)$('mobile-touch-hint').textContent=hint;
      dock.classList.toggle('mobile-aiming',aiming);
    }
    function update(next={}){
      if(next.started&&!view.started){lastView='';lastLesson='';if(next.touch?.pan){togglePan();next={...next,touch:{...next.touch,pan:false,aiming:false}};}}
      view=next;dock.hidden=!enabled||!view.started;document.body.classList.toggle('mobile-playing',enabled&&!!view.started);
      if(!enabled)return;
      tabs.guide.hidden=!view.practice;
      tabs.gear.textContent='Gear · '+(view.hp??100)+' HP';
      const watch=view.replay||view.spectating;tabs.actions.textContent=view.replay?'Replay':view.spectating?'Watch':'Actions';tabs.actions.setAttribute('aria-controls',watch?'mobile-pane-watch':'mobile-pane-actions');
      const stage=watch?'watch':'play';if(stage!==lastView){lastView=stage;show(watch?'watch':'actions');}
      const lesson=view.walkthrough?.step||'',guided=!!view.walkthrough&&!view.walkthrough.finished;
      if(guided&&lesson!==lastLesson){lastLesson=lesson;show(['zoom','pan'].includes(lesson)?'map':lesson==='weapon'?'gear':lesson==='operator'?'guide':'actions');}
      if(!guided)lastLesson='';if(!view.practice&&active==='guide')show('actions');
      $('mobile-lesson').hidden=!guided;
      $('mobile-lesson').textContent=guided?$('walkthrough-title').textContent+' · '+(view.walkthrough.ready?'Next lesson →':$('walkthrough-task').textContent):'';
      feedback(view.touch);measure();
    }
    $('mobile-cancel').onclick=cancel;$('mobile-pan').onclick=togglePan;
    $('mobile-lesson').onclick=()=>show('guide');
    window.addEventListener('resize',responsive);window.visualViewport?.addEventListener('resize',measure);
    new ResizeObserver(measure).observe(dock);responsive();
    return {update,feedback,show,get enabled(){return enabled;}};
  }
  window.GridfallMobileUI={create};
})();
