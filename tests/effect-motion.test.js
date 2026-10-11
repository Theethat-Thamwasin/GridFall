const test=require('node:test'),assert=require('node:assert/strict'),{EffectMotion}=require('../motion');
const bullet=(x,extra={})=>({x,y:4.5,dx:1,dy:0,owner:0,born:7,weapon:'rifle',speed:1,...extra});
test('bullet poses advance between ticks without changing simulation or extrapolating past known positions',()=>{
  const m=new EffectMotion(),a=bullet(3.5),b=bullet(4.5);m.sync([a],0);m.sync([b],.045);
  assert.equal(m.sample(.045)[0].x,3.5);assert.equal(m.sample(.0675)[0].x,4);assert.equal(m.sample(.09)[0].x,4.5);assert.equal(m.sample(100)[0].x,4.5);assert.equal(b.x,4.5);
  a.x=100;assert.equal(m.sample(.0675)[0].x,4);m.sync([],.09);assert.deepEqual(m.sample(100),[]);
});
test('public snapshots interpolate both bullet speeds across two-tick updates without shooter metadata',()=>{
  for(const speed of [1,2]){const m=new EffectMotion(),p={x:3,y:4,dx:1,dy:0,owner:null};m.sync([p],0);m.sync([{...p,x:3+speed*2}],.09,.09,2);assert.equal(m.sample(.135)[0].x,3+speed);assert.equal(m.sample(2)[0].x,3+speed*2);}
});
test('separate shotgun rays and automatic volleys retain their own paths',()=>{
  const m=new EffectMotion(),points=Array.from({length:11},(_,i)=>{const angle=(i-5)*.064;return bullet(3.5+Math.cos(angle),{y:4.5+Math.sin(angle),dx:Math.cos(angle),dy:Math.sin(angle),shotId:1});});
  points.push(bullet(3.5,{born:8}));m.sync(points,0);const next=points.map(p=>({...p,x:p.x+p.dx,y:p.y+p.dy}));m.sync(next,.045);
  m.sample(.0675).forEach((p,i)=>{assert.ok(Math.abs(p.x-(points[i].x+points[i].dx*.5))<1e-9);assert.ok(Math.abs(p.y-(points[i].y+points[i].dy*.5))<1e-9);});
});
test('new bullets and reflections start at their known position and removed bullets leave no ghost',()=>{
  const m=new EffectMotion();m.sync([bullet(4)],0);const reflected=bullet(5,{dx:-1,owner:1,born:9,weapon:'reflected'});m.sync([reflected,bullet(3,{born:9})],.045);assert.equal(m.sample(.045)[0].x,5);assert.equal(m.sample(.045)[1].x,3);
  m.sync([bullet(4,{born:9})],.09);assert.equal(m.sample(.1125).length,1);assert.equal(m.sample(.1125)[0].owner,0);m.clear();assert.deepEqual(m.sample(.2),[]);
});
test('irregular network arrivals retarget from the displayed position without jumping',()=>{
  const m=new EffectMotion();m.sync([bullet(3)],0);m.sync([bullet(5)],.09,.09,2);const before=m.sample(.12)[0].x;m.sync([bullet(7)],.12,.09,2);assert.equal(m.sample(.12)[0].x,before);assert.ok(m.sample(.15)[0].x>before);assert.equal(m.sample(5)[0].x,7);
});
test('throw poses interpolate height and progress using only visible endpoints and disappear on landing or concealment',()=>{
  const m=new EffectMotion('flight'),a={x:4,y:3,lift:.7,progress:.2,item:'smoke',owner:null},b={...a,x:5,lift:1,progress:.4};m.sync([a],0);m.sync([b],.09,.09,2);const p=m.sample(.135)[0];assert.equal(p.x,4.5);assert.equal(p.lift,.85);assert.ok(Math.abs(p.progress-.3)<1e-9);assert.equal(p.from,undefined);m.sync([],.14);assert.deepEqual(m.sample(.15),[]);
});
