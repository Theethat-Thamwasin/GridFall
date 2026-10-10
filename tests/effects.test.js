const test=require('node:test'),assert=require('node:assert/strict'),{ParticlePool}=require('../effects.js');
test('cosmetic particles stay bounded, expire, reuse storage and respect reduced motion',()=>{const pool=new ParticlePool(24),storage=pool.data;for(let i=0;i<100;i++)pool.burst(2,3,'#fff',12);assert.equal(pool.count,24);assert.equal(pool.data,storage);pool.step(2);assert.equal(pool.count,0);pool.burst(2,3,'#fff',12,'spark',true);assert.equal(pool.count,2);pool.clear();assert.equal(pool.count,0);});
test('particles cannot draw positions outside the current allowed view',()=>{const pool=new ParticlePool(10),drawn=[],ctx={save(){},restore(){},fillRect(...args){drawn.push(args);}};pool.burst(3,4,'#fff',2);pool.burst(18,14,'#fff',2);pool.draw(ctx,32,(x,y)=>x<5&&y<5);assert.equal(drawn.length,2);assert.ok(drawn.every(d=>d[0]<160));});

const {MotionTrails}=require('../effects.js');
test('motion trails expire, respect capacity, and never connect teleports or unseen actors',()=>{
 const trails=new MotionTrails(10),u={id:0,x:2,y:3,alive:true,class:'volt'};let p={x:2,y:3,moving:true,alpha:1};const sample=()=>p,colors={volt:'#9ae3f5'};
 for(let i=0;i<30;i++){p={...p,x:2+i*.05};trails.update([u],sample,()=>true,i*.01,colors);}assert.equal(trails.count,10);
 p={...p,x:20};trails.update([u],sample,()=>true,.31,colors);assert.equal(trails.count,10);
 trails.update([u],sample,()=>false,.32,colors);assert.equal(trails.count,0);assert.equal(trails.previous.size,0);
 trails.update([u],sample,()=>true,1,colors);assert.equal(trails.count,0);p={...p,x:20.1};trails.update([u],sample,()=>true,1.1,colors);assert.equal(trails.count,1);
 trails.update([u],sample,()=>true,2,colors);assert.equal(trails.count,0);
 p={...p,x:20.2};trails.update([u],sample,()=>true,2.1,colors,true);assert.equal(trails.count,0);assert.equal(trails.previous.size,0);
});
test('trail glow and core both require visible endpoints and retain pause time',()=>{
 const trails=new MotionTrails(),u={id:0,x:0,y:0,alive:true,class:'volt'},colors={volt:'#fff'};let p={x:0,y:0,moving:true};
 trails.update([u],()=>p,()=>true,0,colors);p={...p,x:.2};trails.update([u],()=>p,()=>true,.1,colors);
 const strokes=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes.push(this.globalAlpha);}};
 trails.draw(ctx,32,.1,(x)=>x<.6);assert.equal(strokes.length,0);trails.draw(ctx,32,.1,()=>true);assert.equal(strokes.length,2);
 const previous=strokes.slice();strokes.length=0;trails.draw(ctx,32,.1,()=>true);assert.deepEqual(strokes,previous);
});
