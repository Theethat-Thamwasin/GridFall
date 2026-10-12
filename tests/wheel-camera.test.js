const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
async function setup(){const h=harness(1280);await h.$('menu-free-practice').click();h.document.dispatchEvent({type:'keydown',code:'KeyD',key:'D'});h.frames(1);h.document.dispatchEvent({type:'keyup',code:'KeyD',key:'D'});return {...h,wheel(deltaY,deltaMode=0){h.$('arena').dispatchEvent({type:'wheel',deltaY,deltaMode});},pose:()=>h.window.GRIDFALL_MOTION().camera};}
test('wheel zoom responds on the first frame and continues throughout a rapid scroll stream',async()=>{
  const h=await setup(),before=h.pose();h.wheel(-80);assert.equal(h.pose().zoom,before.zoom,'wheel does not jump the displayed camera');h.frames(1,16);assert.ok(h.pose().zoom>before.zoom*1.02,'zoom begins immediately, not after scrolling ends');
  for(let i=0;i<6;i++){const zoom=h.pose().zoom;h.wheel(-20);h.frames(1,16);assert.ok(h.pose().zoom>zoom+.005,'each frame advances during repeated wheel events');}
  assert.equal(h.pose().cx,before.cx);assert.equal(h.pose().cy,before.cy);const moving=h.pose().zoom;h.wheel(200);h.frames(1,16);assert.ok(h.pose().zoom<moving,'reversing the wheel reverses zoom without an extra tail');
});
test('smooth zoom reaches the same pose at different frame rates',async()=>{
  const a=await setup(),b=await setup();a.wheel(-90);b.wheel(-90);a.frames(1,96);b.frames(6,16);for(const k of ['cx','cy','zoom'])assert.ok(Math.abs(a.pose()[k]-b.pose()[k])<1e-9,k+' is independent of frame rate');
});
test('wheel respects small trackpad deltas, line units, zero motion and zoom bounds',async()=>{
  const a=await setup(),b=await setup();const start=a.pose().zoom;a.wheel(0);a.frames(1,16);assert.equal(a.pose().zoom,start);a.wheel(-1);a.frames(1,16);assert.ok(a.pose().zoom>start&&a.pose().zoom<start*1.002,'trackpad movement keeps its small magnitude');
  a.wheel(1);a.frames(20,16);a.wheel(-48);b.wheel(-3,1);a.frames(1,16);b.frames(1,16);assert.ok(Math.abs(a.pose().zoom-b.pose().zoom)<.0001,'line and pixel wheel deltas agree');
  for(let i=0;i<20;i++)a.wheel(-240);a.frames(16);assert.equal(a.pose().zoom,2.5);for(let i=0;i<30;i++)a.wheel(240);a.frames(16);assert.equal(a.pose().zoom,.35);
});
