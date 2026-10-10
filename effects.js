(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GridfallEffects=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  class ParticlePool {
    constructor(capacity=240){this.capacity=capacity;this.data=new Float32Array(capacity*8);this.active=new Uint8Array(capacity);this.colors=new Array(capacity);this.cursor=0;}
    clear(){this.active.fill(0);}
    burst(x,y,color,count=6,kind='spark',reduced=false){count=Math.min(reduced?2:count,this.capacity);for(let i=0;i<count;i++){const n=this.cursor++%this.capacity,p=n*8,angle=i*2.399963+this.cursor*.13,speed=kind==='ember'?.25:.65+(i%4)*.23;this.active[n]=1;this.colors[n]=color;this.data[p]=x;this.data[p+1]=y;this.data[p+2]=Math.cos(angle)*speed;this.data[p+3]=Math.sin(angle)*speed-(kind==='ember'?.3:0);this.data[p+4]=0;this.data[p+5]=kind==='death'?.95:kind==='debris'?.6:kind==='ember'?.75:.32+(i%3)*.08;this.data[p+6]=kind==='death'?2:kind==='debris'?3:kind==='shield'?2:1.4;this.data[p+7]=kind==='debris'?2:0;}}
    step(dt){for(let n=0;n<this.capacity;n++)if(this.active[n]){const p=n*8;this.data[p+4]+=dt;if(this.data[p+4]>=this.data[p+5]){this.active[n]=0;continue;}this.data[p]+=this.data[p+2]*dt;this.data[p+1]+=this.data[p+3]*dt;this.data[p+3]+=this.data[p+7]*dt;}}
    draw(ctx,cell,visible){ctx.save();for(let n=0;n<this.capacity;n++)if(this.active[n]){const p=n*8,x=this.data[p],y=this.data[p+1];if(!visible(x,y))continue;ctx.globalAlpha=(1-this.data[p+4]/this.data[p+5])*.75;ctx.fillStyle=this.colors[n];const size=this.data[p+6];ctx.fillRect(x*cell-size/2,y*cell-size/2,size,size);}ctx.restore();}
    get count(){let count=0;for(const active of this.active)count+=active;return count;}
  }

  // Cosmetic trails sample interpolated poses, never simulation destinations.
  class MotionTrails {
    constructor(capacity=384){this.capacity=capacity;this.segments=[];this.previous=new Map();}
    clear(){this.segments.length=0;this.previous.clear();}
    update(units, sample, visible, time, colors, reduced=false){
      if(reduced){this.clear();return;}
      const present=new Set();
      for(const u of units){
        if(!u.alive||u.hidden||u.x<0||!visible(u))continue;
        present.add(u.id);const p=sample(u.id,time);if(!p)continue;
        const last=this.previous.get(u.id),distance=last?Math.hypot(p.x-last.x,p.y-last.y):0;
        if(p.moving&&(p.alpha??1)>.99&&last&&last.alpha>.99&&distance>=.035&&distance<.8){
          this.segments.push({id:u.id,x:last.x+.5,y:last.y+.5,tx:p.x+.5,ty:p.y+.5,born:time,color:colors[u.class]||'#a9decf'});
        }
        if(!last||distance>=.035||!p.moving||(p.alpha??1)<1)this.previous.set(u.id,{x:p.x,y:p.y,alpha:p.alpha??1});
      }
      for(const id of this.previous.keys())if(!present.has(id))this.previous.delete(id);
      this.segments=this.segments.filter(p=>present.has(p.id)&&time-p.born<.58).slice(-this.capacity);
    }
    draw(ctx,cell,time,visible){ctx.save();ctx.lineCap='round';
      for(const p of this.segments){if(!visible(p.x,p.y)||!visible(p.tx,p.ty))continue;
        const fade=Math.max(0,1-(time-p.born)/.58);ctx.strokeStyle=p.color;
        ctx.globalAlpha=.055*fade*fade;ctx.lineWidth=10*fade+2;ctx.beginPath();ctx.moveTo(p.x*cell,p.y*cell+5);ctx.lineTo(p.tx*cell,p.ty*cell+5);ctx.stroke();
        ctx.globalAlpha=.24*fade*fade;ctx.lineWidth=1.7*fade+.3;ctx.stroke();
      }ctx.restore();}
    get count(){return this.segments.length;}
  }
  function drawAction(ctx,e,x,y,cell,reduced=false){
    const t=Math.min(1,e.life/e.duration),ease=1-Math.pow(1-t,3),color=e.color||({stasis:'#8fdbbd',mend:'#f0d49a',fate:'#cbb5f3',heal:'#9fe3b3',reload:'#bdd9e9',smoke:'#c0d5de',pickup:'#b5eab8',thermite:'#ffb57f',scan:'#c3adf1',blink:'#9ae3f5',roll:'#ff6477',slash:'#bdeaff',guard:'#9dd7f5',reflect:'#a6d8ff',muzzle:'#ffe5a4',explosion:'#ffbb83',hit:'#f0ad9a',destroy:'#d5c0a0',equip:'#d8b5f2',dodge:'#e8d2a2'}[e.type]);
    if(!color)return;
    ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=1.2;
    // Gentle envelope avoids a full-bright frame at the start of each action.
    ctx.globalAlpha*=reduced?.22:Math.min(1,t*12)*(1-t);
    const glow=radius=>{const g=ctx.createRadialGradient(x,y,1,x,y,radius);g.addColorStop(0,color+'38');g.addColorStop(.45,color+'12');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;};
    const ring=(r,a=0,b=Math.PI*2)=>{ctx.beginPath();ctx.arc(x,y,r,a,b);ctx.stroke();};
    if(['heal','reload','pickup','equip','guard','reflect','blink','scan','roll','dodge','fate'].includes(e.type))glow(22+ease*14);
    if(['stasis','mend'].includes(e.type)){
      glow(cell*1.6);ctx.globalAlpha*=.55;const w=e.width||3,h=e.height||3,cx=x+(w%2?0:cell*.5),cy=y+(h%2?0:cell*.5);ctx.strokeRect(cx-cell*w*.5*ease,cy-cell*h*.5*ease,cell*w*ease,cell*h*ease);ring(7+ease*26);for(let i=0;i<4;i++){const a=i*Math.PI/2,r=12+ease*22,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;ctx.fillRect(px-2,py-1,4,2);if(e.type==='mend')ctx.fillRect(px-1,py-2,2,4);}
    }else if(e.type==='heal'){
      ctx.globalAlpha*=.65;ring(12+ease*15);for(let i=0;i<4;i++){const a=i*Math.PI/2+.3,px=x+Math.cos(a)*18,py=y+Math.sin(a)*12-ease*16;ctx.fillRect(px-3,py-1,6,2);ctx.fillRect(px-1,py-3,2,6);}
    }else if(e.type==='reload'||e.type==='equip'){
      for(let i=0;i<3;i++){const a=t*2+i*2.1;ring(16+i*3,a,a+1.1);}
      const py=y+9-ease*19;ctx.save();ctx.translate(x-13,py);ctx.rotate(-.3+ease*.4);ctx.strokeRect(-2,-4,5,10);ctx.restore();
    }else if(e.type==='smoke'){
      for(let i=0;i<6;i++){const a=i*2.399,r=cell*(.3+ease*.85);ctx.globalAlpha=.08*(1-t);ctx.beginPath();ctx.ellipse(x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.4,9+ease*20,7+ease*14,a,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=.35*(1-t);ring(8+ease*cell*1.4);
    }else if(e.type==='pickup'){
      ring(9+ease*16);for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,r=14+ease*14;ctx.save();ctx.translate(x+Math.cos(a)*r,y+Math.sin(a)*r-ease*7);ctx.rotate(Math.PI/4);ctx.strokeRect(-2,-2,4,4);ctx.restore();}
    }else if(e.type==='guard'||e.type==='reflect'){
      ctx.globalAlpha*=.5;ring(17+ease*5);for(let i=0;i<6;i++){const a=i*Math.PI/3+t*.4;ring(22,a,a+.35);}
    }else if(e.type==='fate'){
      ctx.globalAlpha*=.65;ring(15+ease*20);ring(12+ease*12);for(let i=0;i<4;i++){const a=i*Math.PI/2+t*.4;ring(23,a,a+.6);}
    }else if(e.type==='scan'){
      ctx.globalAlpha*=.3;ring(cell*(.3+ease*3));ring(cell*(.15+ease*1.7));for(let i=0;i<4;i++){const a=i*Math.PI/2+t;ring(22,a,a+.7);}
    }else if(e.type==='blink'||e.type==='roll'||e.type==='dodge'){
      ctx.globalAlpha*=.65;for(let i=0;i<3;i++)ring(9+ease*14+i*5,i*.8+t,i*.8+t+1.2);
    }else if(e.type==='slash'){
      ctx.globalAlpha*=.4;ctx.lineWidth=2;for(let i=0;i<3;i++)ring(cell*(.8+ease*.5)+i*4,e.angle-1+ease*.4,e.angle+.7);
    }else if(e.type==='thermite'){
      ctx.globalAlpha*=.3;glow(cell*1.6);for(let i=0;i<8;i++){const a=i*Math.PI/4,px=x+Math.cos(a)*cell,py=y+Math.sin(a)*cell-ease*12;ctx.beginPath();ctx.moveTo(px,py+7);ctx.quadraticCurveTo(px-4,py,px+Math.sin(t*5+i)*3,py-8);ctx.stroke();}
    }else if(e.type==='muzzle'){
      ctx.save();ctx.translate(x,y);ctx.rotate(e.angle||0);ctx.globalAlpha*=.35;ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(16,0,12*(1-t)+3,5*(1-t)+2,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }else if(e.type==='explosion'){ctx.globalAlpha*=.3;ring(8+ease*cell*2);ring(5+ease*cell*1.4);
    }else{ctx.globalAlpha*=.45;ring(8+ease*12);}
    ctx.restore();
  }
  function throwPoint(from,to,t,cell=32,reduced=false){t=Math.max(0,Math.min(1,t));const lift=reduced?8:Math.min(54,22+Math.hypot(to.x-from.x,to.y-from.y)*5);return {x:(from.x+.5+(to.x-from.x)*t)*cell,y:(from.y+.5+(to.y-from.y)*t)*cell-Math.sin(t*Math.PI)*lift};}
  function drawThrow(ctx,e,cell,reduced){
    const t=Math.max(0,Math.min(1,e.life/e.duration)),p=throwPoint(e.from,e,t,cell,reduced),smoke=e.item==='smoke',color=({smoke:'#b8e0de',firebomb:'#ffb57f',stasis:'#8fdbbd',mend:'#f0d49a'})[e.item]||'#e9c995';ctx.save();ctx.lineCap='round';
    if(!reduced){for(let i=7;i>0;i--){const a=throwPoint(e.from,e,Math.max(0,t-i*.026),cell,false),b=throwPoint(e.from,e,Math.max(0,t-(i-1)*.026),cell,false);ctx.globalAlpha=(1-i/8)*.36;ctx.strokeStyle=color;ctx.lineWidth=1.1+(1-i/8)*2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
    ctx.globalAlpha=.15;ctx.fillStyle='#07121e';ctx.beginPath();ctx.ellipse(p.x,(e.from.y+.5+(e.y-e.from.y)*t)*cell,5,2,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;ctx.translate(p.x,p.y);ctx.rotate(t*Math.PI*3);ctx.shadowColor=color;ctx.shadowBlur=reduced?0:5;ctx.fillStyle=color;ctx.strokeStyle='#edf9f4';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-3.5,-5,7,10,smoke?2:3);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=smoke?'#457b7e':'#637354';ctx.fillRect(-3.5,-1,7,3);ctx.fillStyle='#d6e0dc';ctx.fillRect(-2,-7,4,2);ctx.restore();
  }
  function drawFlying(ctx,p,cell,reduced=false){
    const color=({smoke:'#c4e2e4',grenade:'#f1c383',firebomb:'#ff9d64',stasis:'#8fdbbd',mend:'#ffe4a5'})[p.item]||'#e9c995';
    const x=(p.x+.5)*cell,groundY=(p.y+.5)*cell,y=groundY-(reduced?Math.sin(p.progress*Math.PI)*8:(p.lift||0)*cell);
    ctx.save();ctx.fillStyle='#07121e';ctx.globalAlpha=.22;ctx.beginPath();ctx.ellipse(x,groundY,5,2,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.translate(x,y);ctx.rotate(p.progress*Math.PI*3);ctx.shadowColor=color;ctx.shadowBlur=reduced?0:8;ctx.fillStyle=color;ctx.strokeStyle='#f2fff4';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-3.5,-5,7,10,2.5);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#586e65';ctx.fillRect(-3.5,-1,7,3);ctx.fillStyle='#e2e9e2';ctx.fillRect(-2,-7,4,2);ctx.restore();
  }
  return {drawFlying,ParticlePool,MotionTrails,drawAction,throwPoint,drawThrow};

});
