const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
test('movement and all thrown action footprints stay above Smoke and roofs without drawing concealed opponents',async()=>{
  for(const cover of ['smoke','roof','both']){
    let state,depth=0,path=[];const stack=[],draws=[];
    const paint={save(){stack.push(depth);},restore(){depth=stack.pop()??0;},clip(){depth++;},beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},stroke(){if(!path.length)return;const xs=path.map(p=>p[0]),ys=path.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);draws.push({kind:'outline',color:this.strokeStyle,rect:[x,y,Math.max(...xs)-x,Math.max(...ys)-y],depth});},createRadialGradient(){return{radial:true,addColorStop(){}};},fill(){draws.push({kind:'fill',color:this.fillStyle});},fillRect(...rect){draws.push({kind:'fillRect',color:this.fillStyle,rect});},strokeRect(...rect){draws.push({kind:'outline',color:this.strokeStyle,rect,depth});}};
    const h=harness(1280,{paint,preparePractice:s=>{state=s;s.units[1].class='rook';if(cover!=='roof')s.smokes=[{x:9,y:10,expires:999}];if(cover!=='smoke'){for(let y=9;y<=11;y++)for(let x=8;x<=11;x++)s.tiles[y][x].roof=1;s.tiles[10][12].roof=2;}}}),drawn=[];
    h.window.GridfallPresentation.drawFieldOperator=(...args)=>drawn.push(args[4]);await h.$('menu-free-practice').click();
    for(const [type,character]of [['move','vanguard'],['smoke','vanguard'],['grenade','vanguard'],['firebomb','pyro'],['stasis','mire'],['mend','halo']]){
      h.$('practice-operators').children.find(b=>b.dataset.character===character).click();(h.$('actions').querySelector('[data-type="'+type+'"]')||h.$('skill-button')).click();
      const status=h.window.GRIDFALL_STATUS();h.$('arena').dispatchEvent({type:'pointermove',buttons:0,pointerId:7,clientX:(10.5-status.camera.x)/status.viewport.x*1280,clientY:(10.5-status.camera.y)/status.viewport.y*720});draws.length=drawn.length=0;h.frames(1);
      const expected=type==='move'?[322,322,28,28]:type==='stasis'?[290,290,124,124]:type==='firebomb'?[290,290,92,124]:[290,290,92,92];
      const outline=draws.findLastIndex(d=>d.kind==='outline'&&['#8de8a9','#e7bd88','#86d2f1'].some(color=>d.color?.startsWith(color))&&JSON.stringify(d.rect)===JSON.stringify(expected));assert.ok(outline>=0,cover+' '+type+' footprint');assert.equal(draws[outline].depth,0,'own outline remains outside the sight clip');
      if(cover!=='smoke'){const roof=draws.findLastIndex(d=>d.kind==='fillRect'&&d.color==='#44545d');assert.ok(roof>=0);assert.ok(outline>roof,cover+' '+type+' above roof');}
      if(cover!=='roof'){const smoke=draws.findLastIndex(d=>d.kind==='fill'&&d.color?.radial);assert.ok(smoke>=0);assert.ok(outline>smoke,cover+' '+type+' above Smoke');}
      assert.equal(drawn.includes('rook'),false,'planning outlines never reveal a concealed opponent');assert.equal(state.units[1].alive,true);
    }
  }
});
