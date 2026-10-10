(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GridfallVision=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const EPS=1e-7,BODY_RADIUS=.32,TAU=Math.PI*2;
const solid=(s,x,y)=>!s.tiles[y]?.[x]||['wall','barricade'].includes(s.tiles[y][x].type);
const sheltered=(s,p)=>s.tiles[Math.floor(p.y)]?.[Math.floor(p.x)]?.type!=='void'&&!!s.tiles[Math.floor(p.y)]?.[Math.floor(p.x)]?.roof;
const world=p=>({x:p.x+.5,y:p.y+.5});
const roofAt=(s,p)=>sheltered(s,p)?s.tiles[Math.floor(p.y)][Math.floor(p.x)].roof:null;
const sameRoof=(s,a,b)=>!!roofAt(s,a)&&roofAt(s,a)===roofAt(s,b);
const roofConceals=(s,a,b)=>sheltered(s,b)&&!sameRoof(s,a,b);
const inSmoke=(sm,p)=>p.x>=sm.x-1-EPS&&p.x<=sm.x+2+EPS&&p.y>=sm.y-1-EPS&&p.y<=sm.y+2+EPS;
function sameSmoke(s,from,to){
 const a=world(from),b=world(to),smokes=s.smokes||[],connected=new Set(),queue=[];
 for(let i=0;i<smokes.length;i++)if(inSmoke(smokes[i],a)){connected.add(i);queue.push(i);}
 for(let at=0;at<queue.length;at++){const sm=smokes[queue[at]];if(inSmoke(sm,b))return true;for(let i=0;i<smokes.length;i++)if(!connected.has(i)&&Math.abs(sm.x-smokes[i].x)<=3+EPS&&Math.abs(sm.y-smokes[i].y)<=3+EPS){connected.add(i);queue.push(i);}}
 return false;
}
const scanned=(from,to,range=14)=>from.scan>0&&Math.hypot(to.x-from.x,to.y-from.y)<=range+EPS;
function concealed(s,from,to,smoke=true){
 if(scanned(from,to))return false;
 if(roofConceals(s,from,to))return true;
 if(!smoke||!(s.smokes||[]).length)return false;
 const a=world(from),b=world(to);
 return s.smokes.some(sm=>inSmoke(sm,a)||inSmoke(sm,b))&&!sameSmoke(s,from,to);
}
function boxSpan(a,dx,dy,left,top,right,bottom){let near=-Infinity,far=Infinity;for(const [o,d,min,max]of [[a.x,dx,left,right],[a.y,dy,top,bottom]]){if(Math.abs(d)<EPS){if(o<min||o>max)return null;continue;}const t1=(min-o)/d,t2=(max-o)/d;near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2));}return far<0||near>far?null:{near:Math.max(0,near),far};}
function ray(s,a,dx,dy,range,smoke=true){
 let limit=range,kind='range',cell=null;
 if(smoke){
  const spans=(s.smokes||[]).map(sm=>boxSpan(a,dx,dy,sm.x-1,sm.y-1,sm.x+2,sm.y+2)).filter(Boolean).sort((a,b)=>a.near-b.near);
  if(spans.length){let edge=spans[0].near;if(edge<=EPS){edge=spans[0].far;for(const span of spans.slice(1)){if(span.near>edge+EPS)break;edge=Math.max(edge,span.far);}}if(edge<limit){limit=edge;kind='smoke';}}
 }
 let x=Math.floor(a.x),y=Math.floor(a.y);if(solid(s,x,y))return{distance:0,kind:'wall',cell:{x,y}};
 const sx=dx>=0?1:-1,sy=dy>=0?1:-1,stepX=Math.abs(dx)<EPS?Infinity:Math.abs(1/dx),stepY=Math.abs(dy)<EPS?Infinity:Math.abs(1/dy);
 let tx=Math.abs(dx)<EPS?Infinity:((sx>0?x+1:x)-a.x)/dx,ty=Math.abs(dy)<EPS?Infinity:((sy>0?y+1:y)-a.y)/dy;
 for(let n=0;n<200;n++){
  const t=Math.min(tx,ty);if(t>limit+EPS)break;
  if(Math.abs(tx-ty)<EPS){const side=solid(s,x+sx,y)?{x:x+sx,y}:solid(s,x,y+sy)?{x,y:y+sy}:null;if(side)return{distance:t,kind:'wall',cell:side};x+=sx;y+=sy;tx+=stepX;ty+=stepY;}
  else if(tx<ty){x+=sx;tx+=stepX;}else{y+=sy;ty+=stepY;}
  if(solid(s,x,y))return{distance:t,kind:'wall',cell:{x,y}};
 }
 return{distance:limit,kind,cell};
}
function pointVisible(s,from,to,range=9,smoke=true,wallSurface=true){
 if(!Number.isFinite(from.x+from.y+to.x+to.y)||Math.hypot(to.x-from.x,to.y-from.y)>range+EPS)return false;
 if(from.x===to.x&&from.y===to.y)return true;
 const a=world(from),b=world(to),d=Math.hypot(b.x-a.x,b.y-a.y),hit=ray(s,a,(b.x-a.x)/d,(b.y-a.y)/d,d,smoke);
 return hit.distance>=d-EPS||wallSurface&&hit.kind==='wall'&&hit.cell?.x===Math.floor(b.x)&&hit.cell?.y===Math.floor(b.y);
}
function corners(s,a,range,smoke=true){
 const found=new Map(),add=(x,y)=>{if(Math.hypot(x-a.x,y-a.y)<=range+1.5)found.set(x+','+y,{x,y});};
 for(let y=Math.max(0,Math.floor(a.y-range-1));y<Math.min(s.height||s.size,Math.ceil(a.y+range+1));y++)for(let x=Math.max(0,Math.floor(a.x-range-1));x<Math.min(s.width||s.size,Math.ceil(a.x+range+1));x++)if(solid(s,x,y)){
  if(!solid(s,x-1,y)||!solid(s,x,y-1))add(x,y);
  if(!solid(s,x+1,y)||!solid(s,x,y-1))add(x+1,y);
  if(!solid(s,x-1,y)||!solid(s,x,y+1))add(x,y+1);
  if(!solid(s,x+1,y)||!solid(s,x,y+1))add(x+1,y+1);
 }
 if(smoke)for(const sm of s.smokes||[])for(const [dx,dy]of [[-1,-1],[2,-1],[2,2],[-1,2]])add(sm.x+dx,sm.y+dy);
 return [...found.values()];
}
function field(s,from,range=9,smoke=true){
 const origin=world(from);if(!Number.isFinite(origin.x+origin.y)||solid(s,Math.floor(origin.x),Math.floor(origin.y)))return{origin,range,points:[]};
 const angles=[];for(let i=0;i<128;i++)angles.push(i*TAU/128);
 for(const p of corners(s,origin,range,smoke)){const a=Math.atan2(p.y-origin.y,p.x-origin.x);angles.push(a-1e-5,a,a+1e-5);}
 for(let i=0;i<angles.length;i++)angles[i]=(angles[i]%TAU+TAU)%TAU;angles.sort((a,b)=>a-b);const points=[];let previous=-Infinity;
 for(const angle of angles){if(angle-previous<1e-8)continue;previous=angle;const dx=Math.cos(angle),dy=Math.sin(angle),hit=ray(s,origin,dx,dy,range,smoke);points.push({x:origin.x+dx*hit.distance,y:origin.y+dy*hit.distance});}
 return{origin,range,points};
}
function bodyExposure(s,from,to,range=9,smoke=true){
 const hidden={visible:false,centerVisible:false,point:null};if(scanned(from,to,range))return{visible:true,centerVisible:true,point:{x:to.x,y:to.y}};if((from.x!==to.x||from.y!==to.y)&&concealed(s,from,to,smoke))return hidden;if(Math.hypot(to.x-from.x,to.y-from.y)>range+BODY_RADIUS)return hidden;
 if(pointVisible(s,from,to,range,smoke,false))return{visible:true,centerVisible:true,point:{x:to.x,y:to.y}};
 const a=world(from),b=world(to),rx=b.x-a.x,ry=b.y-a.y,d=Math.hypot(rx,ry);if(d<EPS)return hidden;
 const center=Math.atan2(ry,rx),spread=Math.asin(Math.min(1,BODY_RADIUS/d)),angles=[center-spread*.5,center+spread*.5,center-spread+1e-6,center+spread-1e-6];
 for(const p of corners(s,a,Math.min(range,d),smoke)){const angle=Math.atan2(p.y-a.y,p.x-a.x),delta=Math.atan2(Math.sin(angle-center),Math.cos(angle-center));if(Math.abs(delta)<spread)angles.push(center+delta-1e-5,center+delta+1e-5);}
 for(const angle of angles){const dx=Math.cos(angle),dy=Math.sin(angle),along=rx*dx+ry*dy,across=rx*rx+ry*ry-along*along;if(along<0||across>BODY_RADIUS*BODY_RADIUS)continue;const half=Math.sqrt(Math.max(0,BODY_RADIUS*BODY_RADIUS-across)),entry=Math.max(0,along-half);if(entry>=range-EPS)continue;const hit=ray(s,a,dx,dy,range,smoke);if(hit.distance>entry+1e-5){const t=Math.min(entry+.005,along,hit.distance-.00001);return{visible:true,centerVisible:false,point:{x:a.x+dx*t-.5,y:a.y+dy*t-.5}};}}
 return hidden;
}
function contains(f,p){if(!f?.points?.length)return false;const points=f.points;let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function bodyInField(f,unit){const p=world(unit);if(contains(f,p))return true;const points=f?.points||[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(a.x+dx*t-p.x,a.y+dy*t-p.y)<BODY_RADIUS-1e-5)return true;}return false;}
function litCells(s,from,f,centers){
 const cells=new Set(centers||[]),points=f.points,r=f.range+1;
 for(let y=Math.max(0,Math.floor(from.y-r));y<Math.min(s.height||s.size,Math.ceil(from.y+r));y++)for(const offset of [.01,.5,.99]){
  const scan=y+offset,crossings=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a.y>scan)!==(b.y>scan))crossings.push(a.x+(b.x-a.x)*(scan-a.y)/(b.y-a.y));}crossings.sort((a,b)=>a-b);
  for(let i=0;i+1<crossings.length;i+=2)for(let x=Math.max(0,Math.floor(crossings[i]+1e-7));x<Math.min(s.width||s.size,Math.ceil(crossings[i+1]-1e-7));x++)cells.add(x+','+y);
 }
 if(!centers)for(let y=Math.max(0,Math.floor(from.y-r));y<Math.min(s.height||s.size,Math.ceil(from.y+r));y++)for(let x=Math.max(0,Math.floor(from.x-r));x<Math.min(s.width||s.size,Math.ceil(from.x+r));x++)if(pointVisible(s,from,{x,y},f.range))cells.add(x+','+y);
 return cells;
}
return{scanned,sheltered,sameRoof,sameSmoke,concealed,BODY_RADIUS,world,ray,field,pointVisible,bodyExposure,contains,bodyInField,litCells};
});
