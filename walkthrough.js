(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./engine'):root.Gridfall);if(typeof module==='object'&&module.exports)module.exports=api;else root.GridfallWalkthrough=api;})(typeof globalThis!=='undefined'?globalThis:this,function(G){
  'use strict';
  const steps=[
    {id:'zoom',title:'Zoom the battlefield',focus:'#camera-in',event:'zoom',copy:'Scroll the mouse wheel over the battlefield, or click + / −. Zoom in to see your operator.'},
    {id:'pan',title:'Move the camera',focus:'#arena',event:'pan',copy:'Hold the right or middle mouse button and drag the battlefield. You can also hold WASD. Press C to follow your operator again.'},
    {id:'pickup',title:'Walk over an item',action:'move',target:{x:10,y:10},copy:'Select MOVE / 1 and click the highlighted ammo tile. Confirm your plan with SPACE. Walking over loot collects it; it becomes usable next turn.'},
    {id:'route',title:'Draw your own route',action:'move',target:{x:10,y:11},copy:'Select MOVE / 1. Hold left click on your operator, drag through adjacent tiles, then release. Draw at least two steps, end on the highlighted tile and confirm. Each tile costs movement points; water costs two.'},
    {id:'undo',title:'Change your plan',action:'move',event:'undo',copy:'Queue a MOVE by clicking a nearby tile. Press Q or Undo to remove it. You can change your plan before confirming.'},
    {id:'weapon',title:'Choose a weapon',focus:'#weapon-tabs',event:'weapon',copy:'Click a different weapon in the normal loadout at the lower left. Each gun has its own range, magazine and damage. Switching before planning costs no action.'},
    {id:'shoot',title:'Shoot with free aim',action:'shoot',target:{x:12,y:10},copy:'Select SHOOT / 2, aim toward the training bot and click. Confirm the plan. Bullets hit walls and travel only as far as your weapon allows.'},
    {id:'slash',title:'Slash nearby targets',action:'slash',target:{x:10,y:10},copy:'Select SLASH / 3, aim toward the nearby bot and click. Confirm to swing through a 120° arc. Slash works through Smoke but cannot pass through walls.'},
    {id:'smoke',title:'Throw Smoke',action:'smoke',target:{x:11,y:10},copy:'Select SMOKE / 4 and click the highlighted tile, then confirm. Players in the same cloud can see each other; players outside are hidden. Bullets still pass through.'},
    {id:'guard',title:'Guard, then heal',action:'guard',actions:['guard','heal'],copy:'Press G to queue GUARD, then H to queue HEAL, and SPACE to confirm. Guard reduces incoming damage by 40% from activation until the turn ends, including while you heal. It costs one action and does not stack.'},
    {id:'reload',title:'Refill your magazine',action:'reload',copy:'Your magazine is empty. Press R or click RELOAD and confirm. Reserve ammo moves into your magazine. Reload consumes one action.'},
    {id:'heal',title:'Use a Medkit',action:'heal',copy:'You have half HP. Press H or click HEAL, then confirm to restore HP. Practice resets HP to half after each turn so you can try healing again.'},
    {id:'grenade',title:'Throw a grenade',action:'grenade',target:{x:12,y:10},copy:'Press B or click GRENADE. Click the highlighted target and confirm. The blast damages nearby operators and destroys walls. Keep yourself outside the blast.'},
    {id:'two-actions',title:'Combine two actions',action:'move',actions:['move','shoot'],target:{x:10,y:10},copy:'Queue MOVE to the highlighted tile, then SHOOT toward the bot. Confirm both together. Everyone plays their two actions at the same time. An empty slot becomes WAIT.'},
    {id:'operator',title:'Switch your operator',focus:'#practice-operators',event:'character',copy:'Choose a different operator below. Its skill, movement and portrait update immediately. Free Mode lets you try all seven at any time during planning.'},
    {id:'dash',title:'STRIDER · Kinetic Dash',character:'vanguard',action:'skillMove',target:{x:9,y:12},copy:'Select the glowing skill / E and click the highlighted destination. Confirm to Dash. Every incoming bullet is dodged for the entire Dash action; melee and blasts can still hurt you.'},
    {id:'blink',title:'WRAITH · Phase Shift',character:'volt',action:'blink',target:{x:11,y:11},copy:'Press E and click the highlighted visible tile, then confirm. Blink crosses gaps without walking the route. Your destination must be visible and within range.'},
    {id:'scan',title:'ORACLE · Pulse Array',character:'deadeye',action:'scan',copy:'The bot is behind a wall, Smoke and a roof. Press E and confirm. Scan reveals operators within 14 tiles through all three for 2 turns. Your bullets still stop at walls.'},
    {id:'molly',title:'CINDER · Molly',character:'pyro',action:'firebomb',target:{x:12,y:10},copy:'Press E, aim the 3×4 area at the bot and confirm. Only targets caught on impact ignite. Burning follows them for 2 turns with two damage ticks each turn.'},
    {id:'reflect',title:'AEGIS · Prism Bulwark',character:'rook',action:'reflect',copy:'Press E and confirm while the bot fires at you. Every incoming bullet is reflected this turn. The shield absorbs 80% of each bullet; you take the remaining 20%.'},
    {id:'stasis',title:'MIRE · Stasis Field',character:'mire',action:'stasis',target:{x:12,y:10},copy:'Press E, place the 4×4 field on the bot and confirm. Inside it, movement is limited to one tile across both actions. The field lasts 3 turns and affects you too.'},
    {id:'mend',title:'HALO · Mend Field',character:'halo',action:'mend',target:{x:9,y:10},copy:'Press E, place the 3×3 field on yourself and confirm. It restores 16 HP and 12 shield per turn for 2 turns. In Team Mode, it heals your team only.'},
    {id:'fate',title:'Choose a Fate Card',focus:'#fate-draft',event:'fate',copy:'Choose a card in the interactive draft. Read YOU GAIN and YOU PAY together: both stay for this session. In matches, a draft opens every four turns.'}
  ];
  const keyMap={move:'1',shoot:'2',slash:'3',smoke:'4',guard:'G',reload:'R',heal:'H',grenade:'B',skillMove:'E',blink:'E',scan:'E',firebomb:'E',reflect:'E',stasis:'E',mend:'E'};
  function cue(s,queued=0){
    const step=current(s);if(!step||s.walkthrough.ready)return{keys:[],task:'Lesson practiced. Choose another lesson or continue.',after:'You can replay any lesson from the list above.'};
    if(s.phase==='resolution')return{keys:[],task:'Watch your action play out.',after:'The bot takes its actions at the same time.'};
    if(step.id==='undo'&&queued)return{keys:['Q'],task:'Press Q to remove your queued MOVE.',after:'Your plan is editable until you confirm it.'};
    if(!step.event&&queued>=(step.actions?.length||1))return{keys:['SPACE'],task:'Press SPACE to play your plan.',after:'One empty action slot becomes WAIT.'};
    if(step.id==='zoom')return{keys:['Mouse wheel'],task:'Scroll up over the battlefield to zoom in.',after:'Scroll down to zoom out. The + / − buttons work too.'};
    if(step.id==='pan')return{keys:['W','A','S','D'],task:'Hold a WASD key to move the camera.',after:'You can also drag with the right or middle mouse button. C follows your operator.'};
    if(step.id==='weapon')return{keys:['Click'],task:'Click a different gun in the lower-left loadout.',after:'Changing weapons during planning costs no action.'};
    if(step.id==='operator')return{keys:['Click'],task:'Choose a different operator below.',after:'Its skill and movement update immediately.'};
    if(step.id==='fate')return{keys:['Enter'],task:'Read YOU GAIN and YOU PAY, then choose one card.',after:'Click CHOOSE THIS CARD, or focus a card and press Enter. Take your time in this lesson.'};
    const type=step.actions?.[queued]||step.action,key=keyMap[type],name=type===step.action&&step.character?G.CLASSES[step.character].skill:type.toUpperCase();
    const task=step.id==='route'?'Press 1, then drag from your operator to the highlighted tile.':step.id==='undo'?'Press 1, then click a nearby tile to queue MOVE.':step.id==='two-actions'&&queued===1?'Press 2, then click toward the bot.':['guard','reload','heal','scan','reflect'].includes(type)?'Press '+key+' to queue '+name+'.':'Press '+key+', then '+(type==='shoot'||type==='slash'?'click toward the bot.':'click the highlighted tile.');
    return{keys:[key],task,after:step.id==='route'?'Hold left click, draw at least two steps, then release.':step.id==='undo'?'Next, use Q to undo it.':step.id==='two-actions'&&!queued?'Next, queue SHOOT with 2.':step.id==='guard'&&!queued?'Next, press H to heal. Guard protects both actions.':'Next, press SPACE to confirm your plan.'};
  }
  function current(s){return s.walkthrough?steps[s.walkthrough.index]||null:null;}
  function prepare(s){
    const step=current(s);if(!step)return;const u=s.units[0],bot=s.units[1];
    s.phase='planning';s.tick=0;s.events=[];s.fate.draft=null;delete u.burn;delete bot.burn;s.smokes=[];s.fields=[];s.projectiles=[];s.canisters=[];s.grenades=[];
    Object.assign(u,{x:9,y:10,hp:50,shield:0,scan:0,skillCooldown:0,reflectCharges:0,dodgeUntil:-1,memory:{}});
    Object.assign(bot,{x:step.id==='slash'?10:12,y:10,alive:true,hp:100,shield:0,scan:0,weapon:'rifle',ammo:15,weapons:['rifle'],weaponAmmo:{rifle:15},skillCooldown:0,memory:{}});delete bot.burn;
    for(let y=8;y<=13;y++)for(let x=7;x<=14;x++)Object.assign(s.tiles[y][x],{type:'floor',hp:0,roof:null,loot:null});
    u.weapon='rifle';u.ammo=step.id==='reload'?0:G.WEAPONS.rifle.mag;u.weaponAmmo.rifle=u.ammo;
    if(step.character)u.class=step.character;
    if(step.id==='pickup')s.tiles[10][10].loot={type:'ammo',taken:false};
    if(step.id==='scan'){s.tiles[10][11].type='wall';s.tiles[10][11].hp=100;s.tiles[10][12].roof=2;s.smokes=[{x:12,y:10,expires:s.turn+3}];}
    s.terrainVersion=(s.terrainVersion||0)+1;
    if(step.id==='fate'){s.turn=Math.max(4,Math.ceil(s.turn/4)*4);s.fate.lastDraft=0;G.FATE.open(s);}
    G.observation(s,u);
  }
  function begin(s){s.walkthrough={index:0,ready:false,finished:false,drawn:false,completed:[]};prepare(s);return s;}
  function complete(s){const id=current(s).id;s.walkthrough.completed??=[];if(!s.walkthrough.completed.includes(id))s.walkthrough.completed.push(id);s.walkthrough.ready=true;}
  function notify(s,event){const step=current(s);if(!step||s.walkthrough.ready)return false;if(step.event===event){complete(s);return true;}return false;}
  function accepts(s,action,plan=[]){const step=current(s);if(!step)return true;if(s.walkthrough.ready)return false;const types=step.actions||[step.action];return !!step.action&&action.type===types[plan.length]&&(!action.target||!step.target||action.target.x===step.target.x&&action.target.y===step.target.y)&&(step.id!=='route'||!!action.drawn&&action.path?.length>=2);}
  function canConfirm(s,plan){const step=current(s);if(!step)return true;if(step.event)return false;const types=step.actions||[step.action];return types.every((type,i)=>plan[i]?.type===type)&&(step.id!=='route'||plan[0]?.drawn&&plan[0].path.length>=2);}
  function resolved(s,plan,events){const step=current(s);if(!step||step.event||!canConfirm(s,plan))return false;
    const eventType={move:'move',shoot:'shoot',slash:'slash',smoke:'smoke',guard:'guard',reload:'reload',heal:'heal',grenade:'throw',skillMove:'move',blink:'blink',scan:'scan',reflect:'reflectReady',firebomb:'firebomb',stasis:'fieldDeploy',mend:'fieldDeploy'}[step.action];
    if(step.id==='pickup'&&!events.some(e=>e.type==='pickup'&&e.unitId===0&&e.lootType==='ammo'))return false;
    if(!events.some(e=>e.type===eventType&&(e.unitId===0||e.type==='fieldDeploy'&&e.unitId===0)))return false;
    if(step.id==='two-actions'&&!events.some(e=>e.type==='shoot'&&e.unitId===0))return false;
    complete(s);return true;
  }
  function jump(s,lesson){const index=typeof lesson==='string'?steps.findIndex(step=>step.id===lesson):lesson;if(!s.walkthrough||!['planning','draft','draftReveal'].includes(s.phase)||!Number.isInteger(index)||index<0||index>=steps.length)return false;Object.assign(s.walkthrough,{index,ready:false,finished:false,drawn:false});prepare(s);return true;}
  function advance(s){if(!s.walkthrough?.ready||!['planning','draftReveal'].includes(s.phase))return false;s.walkthrough.index++;s.walkthrough.ready=false;if(s.walkthrough.index>=steps.length){s.walkthrough.finished=true;return true;}prepare(s);return true;}
  function retry(s){if(!s.walkthrough||!['planning','draftReveal'].includes(s.phase))return false;s.walkthrough.ready=false;prepare(s);return true;}
  function botPlan(s){const step=current(s);if(['dash','reflect','guard'].includes(step?.id))return[{type:'shoot',angle:Math.atan2(s.units[0].y-s.units[1].y,s.units[0].x-s.units[1].x)},{type:'shoot',angle:Math.PI}];return[{type:'wait'},{type:'wait'}];}
  return{steps,current,prepare,begin,notify,accepts,canConfirm,resolved,advance,retry,jump,cue,botPlan};
});
