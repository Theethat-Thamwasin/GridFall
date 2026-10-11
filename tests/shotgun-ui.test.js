const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/game-harness');
async function practice(weapon){
  let state;const labels=[],tracers=[];
  const h=harness(1280,{preparePractice:s=>{state=s;Object.assign(s.units[1],{x:10,y:10,shield:0,hp:100});},paint:{
    strokeText(text,x,y){if(String(text).startsWith('−'))labels.push({text,x,y,width:this.lineWidth,color:this.strokeStyle,font:this.font});},
    stroke(){if(this.strokeStyle==='#c8f4e5'&&this.lineWidth===1.6)tracers.push(true);}
  }});
  h.window.GridfallPractice.botPlan=()=>[{type:'wait'},{type:'wait'}];
  await h.$('menu-free-practice').click();h.$('practice-weapon').onchange({target:{value:weapon}});
  h.$('actions').querySelector('[data-type="shoot"]').click();
  return {h,state,labels,tracers};
}
test('real shotgun damage renders one shell total with a thin translucent outline',async()=>{
  const {h,state,labels}=await practice('shotgun');h.point({x:10,y:10});h.$('lock-button').click();
  const frames=[];for(let i=0;i<22;i++){labels.length=0;h.frames(1);if(labels.length)frames.push(labels.slice());}
  assert.ok(frames.length>0);assert.ok(frames.every(f=>f.length===1));assert.equal(frames.at(-1)[0].text,'−48');
  const final=frames.at(-1)[0];assert.equal(final.width,2);assert.equal(final.color,'#17232d99');assert.equal(final.font,'bold 14px Consolas');
  assert.equal(state.units[1].hp,52);
});
test('rapid rifle hits render on separate lanes with space between numbers',async()=>{
  const {h,labels}=await practice('rifle');h.point({x:10,y:10});h.$('lock-button').click();
  let three=[];for(let i=0;i<24;i++){labels.length=0;h.frames(1);if(labels.length===3)three=labels.slice();}
  assert.equal(three.length,3);assert.ok(three.every(e=>e.text==='−16'));
  const positions=three.map(e=>e.y).sort((a,b)=>a-b);for(let i=1;i<positions.length;i++)assert.ok(positions[i]-positions[i-1]>20);
});
test('late automatic bullets disappear from the actual canvas when planning resumes',async()=>{
  const {h,state,tracers}=await practice('lmg');Object.assign(state.units[1],{x:16,y:16});
  h.point({x:15,y:10});h.point({x:15,y:10});h.$('lock-button').click();
  let sawFlight=false;for(let i=0;i<100;i++){tracers.length=0;h.frames(1);sawFlight||=tracers.length>0;}
  assert.ok(sawFlight);assert.equal(h.window.GRIDFALL_STATUS().phase,'planning');
  assert.equal(state.projectiles.length,0);assert.equal(tracers.length,0);
});
test('the aiming UI explains a grazing body hit and a centered body hit differently',async()=>{
  const {h,state}=await practice('rifle');Object.assign(state.units[1],{x:14,y:10});
  const G=h.window.Gridfall,angle=Math.asin(G.VISION.BODY_RADIUS/5)-G.recoilSpread(state.units[0],2)/2;
  const pointer=a=>{const st=h.window.GRIDFALL_STATUS();h.$('arena').dispatchEvent({type:'pointermove',buttons:0,pointerId:7,clientX:(9.5+5*Math.cos(a)-st.camera.x)/st.viewport.x*1280,clientY:(10.5+5*Math.sin(a)-st.camera.y)/st.viewport.y*720});};
  pointer(angle);assert.equal(h.window.GRIDFALL_PREVIEW().ray.confidence,'edge');assert.match(h.$('field-note').textContent,/Grazing aim/);
  pointer(0);assert.equal(h.window.GRIDFALL_PREVIEW().ray.confidence,'steady');assert.match(h.$('field-note').textContent,/On target/);
});
