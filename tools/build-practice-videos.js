'use strict';
// Offline, code-drawn demonstrations of the actual mouse controls. No browser
// recording or encoder is required by the shipped game. Rebuild with:
// node tools/build-practice-videos.js --ffmpeg <exe> [--font <ttf>]
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),W=640,H=360,FPS=24,SECONDS=8;
const arg=name=>process.argv[process.argv.indexOf(name)+1];
let encoder=process.argv.includes('--ffmpeg')?arg('--ffmpeg'):null;
if(!encoder&&process.argv.includes('--ffmpeg-gzip')){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridfall-video-'));
  encoder=path.join(dir,'ffmpeg.exe');fs.writeFileSync(encoder,zlib.gunzipSync(fs.readFileSync(arg('--ffmpeg-gzip'))));
}
if(!encoder)throw Error('Provide --ffmpeg or --ffmpeg-gzip.');
const font=process.argv.includes('--font')?arg('--font'):'C:/Windows/Fonts/segoeui.ttf';
if(!fs.existsSync(font))throw Error('Provide a local TrueType font with --font.');
const color=h=>h.match(/../g).map(v=>parseInt(v,16));
const C=Object.fromEntries(Object.entries({bg:'0b1825',floor:'152b3a',floor2:'172e3e',grid:'2d4654',mint:'a9e6c4',white:'f0f7fc',wall:'546f81',dark:'20313f',grass:'2f5751',orange:'f6b88c',blue:'8fcef6'}).map(([k,v])=>[k,color(v)]));
let image;
function pixel(x,y,c,a=1){x=Math.round(x);y=Math.round(y);if(x<0||x>=W||y<0||y>=H)return;const i=(y*W+x)*3;for(let k=0;k<3;k++)image[i+k]=image[i+k]*(1-a)+c[k]*a;}
function rect(x,y,w,h,c){const x0=Math.max(0,Math.floor(x)),x1=Math.min(W,Math.ceil(x+w)),y0=Math.max(0,Math.floor(y)),y1=Math.min(H,Math.ceil(y+h));for(let j=y0;j<y1;j++)for(let i=x0;i<x1;i++)pixel(i,j,c);}
function line(x1,y1,x2,y2,c,width=2){const dx=x2-x1,dy=y2-y1,d=dx*dx+dy*dy;for(let y=Math.max(0,Math.floor(Math.min(y1,y2)-width));y<Math.min(H,Math.ceil(Math.max(y1,y2)+width));y++)for(let x=Math.max(0,Math.floor(Math.min(x1,x2)-width));x<Math.min(W,Math.ceil(Math.max(x1,x2)+width));x++){const t=d?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/d)):0,dist=Math.hypot(x-x1-dx*t,y-y1-dy*t);if(dist<width/2+.7)pixel(x,y,c,Math.min(1,width/2+.7-dist));}}
function circle(cx,cy,r,c,stroke=false){for(let y=Math.max(0,Math.floor(cy-r-1));y<Math.min(H,cy+r+1);y++)for(let x=Math.max(0,Math.floor(cx-r-1));x<Math.min(W,cx+r+1);x++){const dist=Math.hypot(x-cx,y-cy),edge=stroke?Math.abs(dist-r):Math.max(0,dist-r+1);if(edge<1.2)pixel(x,y,c,Math.min(1,1.2-edge));}}
function cursor(x,y,pressed=false){
  if(pressed)circle(x,y,15,C.mint,true);
  for(let j=0;j<19;j++)for(let i=0;i<12;i++)if(i<=j*.65)pixel(x+i,y+j,i<1||j<1||i>j*.65-1?C.dark:C.white);
  line(x+6,y+12,x+12,y+22,C.white,3);
}
function mouse(button,t){
  const x=589,y=86;rect(x-15,y-21,30,42,C.dark);circle(x,y-10,15,C.dark);circle(x,y+12,15,C.dark);
  line(x-15,y-10,x-15,y+12,C.white,1);line(x+15,y-10,x+15,y+12,C.white,1);line(x-15,y+12,x+15,y+12,C.white,1);line(x,y-25,x,y-2,C.white,1);
  if(button==='right')rect(x+2,y-20,10,15,C.mint);
  if(button==='left')rect(x-12,y-20,10,15,C.mint);
  rect(x-2,y-16,4,10,button==='wheel'?C.mint:C.white);
  if(button==='wheel'){const dir=t<3.4?-1:1;line(x-7,y+38,x,y+38+dir*7,C.mint,2);line(x,y+38+dir*7,x+7,y+38,C.mint,2);}
}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function draw(kind,t){
  image=Buffer.alloc(W*H*3);rect(0,0,W,H,C.bg);
  let zoom=1,offset={x:0,y:0};
  if(kind==='zoom')zoom=t<3.3?1+.65*smooth((t-1)/1.8):t<6?1.65-.85*smooth((t-3.5)/1.7):.8+.2*smooth((t-6)/1.4);
  if(kind==='pan'){const a=t<5?smooth((t-1.5)/2):1-smooth((t-5.5)/1.8);offset={x:135*a,y:-26*a};}
  const cell=34*zoom,origin={x:320-cell*9+offset.x,y:184-cell*8+offset.y};
  const point=(x,y)=>({x:origin.x+x*cell,y:origin.y+y*cell});
  for(let y=0;y<18;y++)for(let x=0;x<22;x++){
    const p=point(x,y);if(p.x+cell<0||p.x>W||p.y+cell<54||p.y>292)continue;
    rect(p.x,p.y,cell-1,cell-1,(x+y)%2?C.floor:C.floor2);
    if(x===5&&y>=5&&y<=8||y===5&&x>=5&&x<=7){rect(p.x+3,p.y+3,cell-7,cell-7,C.wall);line(p.x+4,p.y+4,p.x+cell-5,p.y+4,C.blue,1);}
    if(x>=12&&x<=14&&y>=9&&y<=11){circle(p.x+cell*.5,p.y+cell*.5,cell*.31,C.grass);circle(p.x+cell*.6,p.y+cell*.35,cell*.22,C.grass);}
  }
  const operator=point(9.5,8.5),bot=point(12.5,7.5);
  circle(operator.x,operator.y,14*zoom,C.dark);circle(operator.x,operator.y,14*zoom,C.mint,true);circle(operator.x,operator.y,7*zoom,C.mint);line(operator.x+5*zoom,operator.y-4*zoom,operator.x+14*zoom,operator.y-11*zoom,C.white,3*zoom);
  line(operator.x-16*zoom,operator.y+21*zoom,operator.x+16*zoom,operator.y+21*zoom,C.mint,3*zoom);
  circle(bot.x,bot.y,9*zoom,C.orange);line(bot.x,bot.y,bot.x-13*zoom,bot.y+4*zoom,C.white,3*zoom);
  for(const [x,y,type]of [[8.5,5.5,'heal'],[10.5,5.5,'ammo']]){const p=point(x,y);circle(p.x,p.y,9,C.dark);if(type==='heal'){line(p.x-5,p.y,p.x+5,p.y,C.mint,3);line(p.x,p.y-5,p.x,p.y+5,C.mint,3);}else{for(let i=-1;i<=1;i++)line(p.x+i*4,p.y-5,p.x+i*4,p.y+5,C.orange,2);}}
  let pointer={x:operator.x+48,y:operator.y+22},pressed=false;
  if(kind==='pan'){pointer={x:280+offset.x,y:196+offset.y};pressed=t>1.2&&t<4.7;}
  if(kind==='route'){
    const route=[operator,point(10.5,8.5),point(11.5,8.5),point(11.5,7.5)],progress=Math.max(0,Math.min(3,(t-2)*.85));
    const index=Math.min(2,Math.floor(progress)),a=route[index],b=route[index+1],fraction=progress-index;
    pointer=t<1.5?{x:operator.x-48*(1-smooth(t/1.5)),y:operator.y+20*(1-smooth(t/1.5))}:{x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};pressed=t>=1.5&&t<6;
    for(let i=0;i<3;i++){if(progress<=i)break;const end=progress>=i+1?route[i+1]:pointer;line(route[i].x,route[i].y,end.x,end.y,C.mint,4);circle(end.x,end.y,4,C.mint);}
    if(progress>=3){circle(route[3].x,route[3].y,10,C.mint,true);line(route[3].x-4,route[3].y,route[3].x,route[3].y+4,C.mint,2);line(route[3].x,route[3].y+4,route[3].x+6,route[3].y-5,C.mint,2);}
  }
  cursor(pointer.x,pointer.y,pressed);
  rect(0,0,W,54,C.bg);line(22,53,W-22,53,C.grid,1);rect(0,292,W,68,C.bg);line(22,292,W-22,292,C.grid,1);
  mouse(kind==='zoom'?'wheel':kind==='pan'&&pressed?'right':kind==='route'&&pressed?'left':null,t);
  return image;
}
const lessons={
  zoom:{title:'01 / ZOOM THE MAP',steps:[['Scroll up to zoom in.',0,3.4],['Scroll down to zoom out.',3.4,6],['Use + and - for the same control.',6,8]],tip:'Mouse wheel / + / -'},
  pan:{title:'02 / MOVE THE CAMERA',steps:[['Hold the right or middle mouse button.',0,1.5],['Drag to explore the battlefield.',1.5,5.5],['Release to stop. Press C to follow your operator.',5.5,8]],tip:'Right drag / Middle drag / Hold WASD'},
  route:{title:'03 / DRAW YOUR OWN ROUTE',steps:[['Select MOVE or press 1.',0,1.5],['Hold left click on your operator.',1.5,2.8],['Drag tile by tile in four directions.',2.8,6],['Release to queue the route. Use Q to undo.',6,8]],tip:'Left drag from operator / 3 movement points'}
};
const escape=s=>s.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
function label(text,x,y,size,condition=''){return "drawtext=fontfile='"+escape(font)+"':text='"+escape(text)+"':x="+x+':y='+y+':fontsize='+size+':fontcolor=0xeaf5fc'+(condition?":enable='"+condition+"'":'');}
async function encode(kind){
  const lesson=lessons[kind],dest=path.join(root,'assets','tutorial-'+kind+'.mp4');
  const filters=[label(lesson.title,24,17,20),...lesson.steps.map(([copy,start,end])=>label(copy,24,307,17,'gte(t,'+start+')*lt(t,'+end+')')),label(lesson.tip,24,335,12)];
  const child=spawn(encoder,['-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',W+'x'+H,'-framerate',String(FPS),'-i','pipe:0','-vf',filters.join(','),'-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','-an',dest],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let errors='';child.stderr.on('data',b=>errors+=b);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',c=>c===0?resolve():reject(Error(errors)));});
  for(let frame=0;frame<FPS*SECONDS;frame++){if(!child.stdin.write(draw(kind,frame/FPS)))await new Promise(resolve=>child.stdin.once('drain',resolve));}
  child.stdin.end();await done;
  const poster=spawn(encoder,['-y','-hide_banner','-loglevel','error','-ss','3','-i',dest,'-frames:v','1',path.join(root,'assets','tutorial-'+kind+'.png')],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  await new Promise((resolve,reject)=>{poster.on('error',reject);poster.on('exit',c=>c===0?resolve():reject(Error('Poster failed')));});
  console.log(kind+': '+(fs.statSync(dest).size/1024).toFixed(1)+' KB / '+SECONDS+' seconds / '+FPS+' fps');
}
(async()=>{for(const kind of Object.keys(lessons))await encode(kind);})().catch(e=>{console.error(e);process.exitCode=1;});
