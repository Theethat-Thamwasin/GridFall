/* Shared medium-detail operator art: portraits and readable directional field sprites. */
(function(root){
'use strict';
const colors=Object.freeze({vanguard:'#ff6477',volt:'#66bfff',deadeye:'#c18cff',pyro:'#ff9c52',rook:'#66d5ff',mire:'#85e2bb',halo:'#ffd66e'});
const suit={dark:'#101923',cloth:'#17212d',edge:'#627181',plate:'#35424f',light:'#53616d'};
function polygon(c,p,fill,stroke=suit.edge,width=1){c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,p,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
function plate(c,p,tone=suit.plate){polygon(c,p,tone,'#101923',1.5);line(c,p.slice(0,3),'#7f8c995c',1);}
function circle(c,x,y,r,fill,stroke){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1.4;c.stroke();}}
function light(c,x,y,w,h,a,blur=5){c.save();c.fillStyle=a;c.shadowColor=a;c.shadowBlur=blur;c.fillRect(x,y,w,h);c.shadowBlur=0;c.fillStyle='#eff8ffb0';c.fillRect(x+1,y,w-2,Math.max(.6,h*.22));c.restore();}
function cross(c,x,y,size,a){c.fillStyle=a;c.fillRect(x-size/2,y-size*.18,size,size*.36);c.fillRect(x-size*.18,y-size/2,size*.36,size);}
function canister(c,x,y,a){plate(c,[[x-6,y-19],[x+6,y-19],[x+7,y+13],[x+3,y+18],[x-4,y+18],[x-7,y+13]],'#28313b');c.fillStyle='#76818c';c.fillRect(x-4,y-19,8,4);light(c,x-3,y-11,6,19,a,4);c.fillStyle='#101821';c.fillRect(x-6,y+7,12,4);}
function cape(c,id,a,sway){
 const long=['volt','mire','deadeye'].includes(id),bottom=long?172:91;
 c.beginPath();c.moveTo(-32,-102);c.bezierCurveTo(-54,-63,-68+sway,24,-84+sway,bottom);c.lineTo(-61+sway,bottom-13);c.lineTo(-67+sway,bottom+8);c.lineTo(-35+sway,bottom-15);c.lineTo(-22+sway,bottom+2);c.lineTo(21,bottom-22);c.lineTo(39,-87);c.closePath();c.fillStyle=id==='volt'?'#122033':'#19202a';c.fill();
 line(c,[[-35,-87],[-50,21],[-67+sway,bottom-18]],'#6a718a60',1.2);
 line(c,[[-20,-81],[-26,34],[-39+sway,bottom-21]],'#070e1966',3);
 if(long){line(c,[[-43,-40],[-60+sway,bottom-32]],a+'38',1);for(let i=0;i<3;i++)polygon(c,[[-69+sway-i*3,68+i*26],[-82+sway-i*2,82+i*26],[-73+sway-i*3,81+i*26]],id==='volt'?a+'65':'#3c455955',null);}
}
function rifle(c,a,x=-5,y=17,angle=-.23){c.save();c.translate(x,y);c.rotate(angle);
 plate(c,[[-82,-9],[-71,-16],[-35,-12],[-27,-18],[20,-17],[29,-8],[55,-7],[56,5],[23,7],[14,23],[-1,22],[-3,7],[-43,7],[-46,14],[-73,13]],'#1a2530');
 plate(c,[[-43,-10],[15,-10],[20,-4],[17,4],[-43,4]],'#43515e');c.fillStyle='#09111d';c.fillRect(26,-4,40,5);c.fillStyle='#8997a3';c.fillRect(57,-5,10,7);c.fillStyle='#121a24';c.fillRect(-7,5,13,24);c.fillRect(-16,-25,23,7);light(c,-13,-23,17,2,a,3);light(c,29,-5,22,2,a,2);
 for(let i=0;i<4;i++){c.fillStyle='#0a141f';c.fillRect(25+i*6,1,3,4);}line(c,[[-73,-5],[-50,-5]],'#9cabb75c');circle(c,10,-3,2,'#aebac0');c.restore();}
function helmet(c,id,a){
 if(id==='volt'){
  polygon(c,[[-34,-135],[-25,-157],[-8,-170],[17,-164],[33,-147],[31,-107],[17,-89],[-17,-93],[-33,-110]],'#1a2535','#516174');
  polygon(c,[[-25,-135],[-12,-151],[14,-147],[24,-128],[18,-106],[-10,-101],[-23,-112]],'#070e1a','#2f4158');
  line(c,[[-24,-139],[-8,-160],[17,-153]],'#75839583',1.6);
 }else{
  plate(c,[[-24,-139],[-17,-155],[-3,-161],[16,-158],[28,-144],[28,-117],[17,-100],[-7,-100],[-24,-115]],'#3b4653');
  polygon(c,[[-24,-131],[-3,-137],[25,-131],[23,-112],[8,-105],[-17,-112]],'#101b28','#54616e');
  plate(c,[[-16,-152],[-3,-158],[12,-154],[18,-139],[-7,-141]],'#515d69');
  line(c,[[1,-154],[7,-141]],'#919ba657',1);
  polygon(c,[[-16,-116],[20,-116],[12,-101],[-5,-100]],'#202a36','#566473');
  line(c,[[1,-112],[1,-103]],'#83909a60');
 }
 light(c,-18,-130,37,5,a,id==='volt'?8:6);
 if(id==='deadeye'){circle(c,23,-126,8,'#1f263a',a);circle(c,24,-126,4,a);circle(c,25,-128,1.8,'#fff');line(c,[[-24,-143],[-31,-169]],'#707d8b',2);light(c,-33,-171,4,4,a,3);}
 if(id==='pyro'){for(const x of [-14,15]){circle(c,x,-108,6,'#121d28','#7d8791');line(c,[[x-3,-108],[x+3,-108]],a,1.5);}}
 if(id==='rook'){plate(c,[[-24,-144],[-15,-160],[16,-160],[29,-145],[25,-136],[-22,-136]],'#465362');light(c,-8,-154,14,2,a,3);}
 if(id==='halo'){plate(c,[[-30,-141],[-24,-145],[-20,-115],[-28,-107]],'#59616a');plate(c,[[26,-142],[33,-130],[28,-109],[23,-115]],'#59616a');cross(c,3,-149,9,a);}
 if(id==='mire'){circle(c,-28,-128,9,'#1b2b2d','#71898b');circle(c,-28,-128,4,null,a);}
 // A layered cloth collar, rather than a bright outlined neck block.
 polygon(c,[[-30,-105],[-9,-111],[22,-108],[31,-97],[13,-85],[-19,-87],[-35,-95]],'#1b2430','#46535f');line(c,[[-25,-99],[1,-93],[23,-100]],'#8691a056');
}
function portrait(c,x,y,scale,id,time=0,reduced=false){
 const a=colors[id]||colors.vanguard,sway=reduced?0:Math.sin(time*.0011)*3,bob=reduced?0:Math.sin(time*.0016)*1.3,wide=id==='rook'?6:0;
 c.save();c.translate(x,y+bob);c.scale(scale,scale);c.lineJoin='round';c.lineCap='round';
 c.fillStyle='#0005';c.beginPath();c.ellipse(0,203,73,10,0,0,Math.PI*2);c.fill();cape(c,id,a,sway);
 if(id==='halo'){plate(c,[[-51,-91],[-34,-104],[35,-103],[51,-87],[48,-35],[-48,-35]],'#333d47');cross(c,-42,-74,14,a);}
 for(const side of [-1,1]){const tx=side<0?-33:12;
  plate(c,[[tx,57],[tx+24,58],[tx+26,126],[tx+23,182],[tx+1,183],[tx-4,126]],'#232e39');
  plate(c,[[tx-1,61],[tx+23,64],[tx+23,102],[tx+4,105]],'#394651');line(c,[[tx+5,73],[tx+16,75]],'#83909b55');
  circle(c,tx+12,120,11,'#151f2b','#4a5966');plate(c,[[tx,110],[tx+21,108],[tx+25,128],[tx+6,137],[tx-3,127]],'#4b5863');light(c,tx+3,117,14,3,a,4);
  plate(c,[[tx+2,139],[tx+20,138],[tx+22,176],[tx+1,176]],'#35434e');line(c,[[tx+8,141],[tx+8,167]],'#77859450');
  plate(c,[[tx-3,176],[tx+23,175],[tx+30,194],[tx+29,203],[tx-9,202],[tx-10,194]],'#18212a');plate(c,[[tx-4,187],[tx+24,186],[tx+27,195],[tx-7,195]],'#3b4550');line(c,[[tx-7,199],[tx+27,199]],'#81939d65');
 }
 plate(c,[[-38-wide,-84],[-19,-101],[21,-98],[41+wide,-75],[33+wide,59],[-32-wide,63],[-45-wide,-9]],'#2d3844');
 plate(c,[[-30,-68],[-4,-77],[4,-21],[-20,-13],[-36,-36]],'#49555f');plate(c,[[2,-76],[29,-68],[33,-30],[19,-14],[7,-22]],'#394550');
 line(c,[[-22,-62],[-8,-65],[-4,-43]],'#9ba7b261');line(c,[[13,-65],[23,-60],[25,-43]],'#78879266');
 for(const px of [-25,-3,19]){plate(c,[[px,-6],[px+15,-7],[px+17,11],[px+1,13]],'#27333e');c.fillStyle='#7f8a94';c.fillRect(px+4,-6,7,2);}
 for(let i=0;i<3;i++)plate(c,[[-24+i*18,22],[-9+i*18,21],[-8+i*18,45],[-23+i*18,45]],'#3b4752');
 line(c,[[-32,18],[33,17]],'#101824',5);plate(c,[[-6,14],[6,14],[6,22],[-6,22]],'#89939c');
 // Shoulder pauldrons, elbow joints, forearm gauntlets and fingered gloves.
 for(const side of [-1,1]){const sx=side*42;
  plate(c,[[sx-13,-77],[sx+9,-72],[sx+19,-40],[sx+2,-28],[sx-17,-49]],side<0?'#414e5a':'#35434f');
  plate(c,[[sx-15,-75],[sx-7,-91],[sx+13,-83],[sx+21,-59],[sx+12,-50],[sx-15,-57]],'#485563');light(c,sx-9,-68,18,3,a,4);
  circle(c,sx+2,-24,9,'#111c28','#626d77');
  plate(c,[[sx-8,-25],[sx+11,-24],[sx+14,5],[sx+3,26],[sx-12,12]],'#374550');line(c,[[sx-3,-17],[sx+4,-16],[sx+4,3]],'#75828d77');
  plate(c,[[sx-9,17],[sx+5,11],[sx+14,24],[sx+6,34],[sx-7,33]],'#1b2531');for(let i=0;i<3;i++)line(c,[[sx-5+i*5,20],[sx-3+i*5,28]],'#596776',1.1);
 }
 if(id==='vanguard'){for(const px of [-29,24]){plate(c,[[px,142],[px+9,140],[px+11,169],[px,172]],'#232c38');light(c,px+2,158,6,10,a,7);}line(c,[[-24,-54],[-15,-46],[-24,-38]],a,2);line(c,[[-15,-54],[-6,-46],[-15,-38]],a,2);}
 if(id==='mire'||id==='pyro'){canister(c,-27,-37,a);canister(c,21,-37,a);}
 if(id==='halo'){cross(c,-10,-47,20,a);cross(c,-42,-59,10,a);plate(c,[[22,31],[41,29],[45,52],[25,53]],'#59616b');cross(c,33,41,10,a);}
 if(id==='deadeye'){plate(c,[[-26,-69],[-6,-75],[5,-60],[-2,-35],[-23,-32]],'#393d53');circle(c,-12,-53,9,null,a);}
 if(id==='volt'){circle(c,-16,-52,9,null,a);light(c,13,-40,17,3,a);line(c,[[-29,30],[-35,56]],a+'75',2);}
 // Utility webbing, fasteners and class equipment retain broad readable shapes.
 line(c,[[-29,-72],[-22,-10]],'#18212b',4);line(c,[[27,-70],[25,-6]],'#18212b',4);
 for(const px of [-28,26]){plate(c,[[px-3,-68],[px+3,-68],[px+3,-61],[px-3,-61]],'#8c969e');}
 for(const px of [-27,13]){plate(c,[[px,48],[px+15,47],[px+17,68],[px+1,69]],'#35434f');line(c,[[px+2,52],[px+13,51]],'#8e9ca56a');}
 if(id==='pyro'){polygon(c,[[-12,-68],[4,-68],[-4,-53]],a,null);polygon(c,[[-8,-65],[0,-65],[-4,-58]],'#1a2330',null);}
 if(id==='mire'){circle(c,40,-42,8,'#172b2d',a);circle(c,40,-42,3,'#acffe0');}
 if(id==='vanguard'){light(c,-20,-11,9,2,a,3);light(c,12,-11,9,2,a,3);}
 rifle(c,a,id==='deadeye'?-15:0,id==='deadeye'?31:19,id==='deadeye'?.92:-.24);
 helmet(c,id,a);
 if(id==='deadeye'){plate(c,[[39,-67],[52,-69],[38,-99],[27,-102],[23,-92]],'#33404d');plate(c,[[25,-114],[34,-110],[37,-95],[28,-92],[23,-103]],'#26323e');}
 if(id==='mire'||id==='halo'||id==='pyro'){
  const yy=id==='pyro'?-69:-40;plate(c,[[44,-58],[55,-58],[76,yy+6],[70,yy+19],[53,-29]],'#34424e');plate(c,[[70,yy+7],[82,yy],[91,yy+6],[88,yy+16],[76,yy+18]],'#22303b');
  if(id==='mire'||id==='halo')canister(c,88,yy-26,a);else canister(c,88,yy-18,a);
 }
 if(id==='rook'){
  plate(c,[[42,-71],[77,-81],[98,-57],[103,89],[77,118],[40,94]],'#293847');plate(c,[[48,-62],[74,-71],[87,-55],[91,78],[75,97],[47,80]],'#465765');
  plate(c,[[52,-52],[70,-57],[79,-43],[81,70],[67,80],[52,70]],'#273742');light(c,85,-46,4,119,a,7);light(c,51,-44,3,99,a,4);for(const yy of [-24,17,58])line(c,[[57,yy],[67,yy+9],[76,yy-2]],'#90c9e09c',2);circle(c,74,-63,2,'#a3b7c4');circle(c,76,91,2,'#a3b7c4');
 }
 // Sparse wear marks give a used suit without photorealistic noise.
 line(c,[[-21,-60],[-15,-59]],'#bac4cb77');line(c,[[23,83],[29,85]],'#aab7c16b');line(c,[[-43,-78],[-36,-77]],'#c0c9d16b');
 c.restore();
}
// Distinct silhouettes match the equipped weapon, independent of operator class.
const weaponModels={pistol:{length:8,width:3},revolver:{length:10,width:3},smg:{length:12,width:4},rifle:{length:17,width:3},shotgun:{length:19,width:3},lmg:{length:21,width:5},dmr:{length:21,width:3},sniper:{length:26,width:3},longshot:{length:32,width:4},trident:{length:16,width:5}};
function gun(c,id='rifle',accent='#b3c9d4'){
 const p=weaponModels[id]||weaponModels.rifle,end=8+p.length;c.save();c.translate(0,4);c.lineJoin='round';
 polygon(c,[[6,-p.width/2],[end-4,-p.width/2],[end-4,p.width/2],[6,p.width/2]],'#263744','#a0b2be',.65);
 c.fillStyle='#d3dde0';c.fillRect(end-4,-.8,4,1.6);c.fillStyle='#15222e';c.fillRect(9,1,3,4);
 if(!['pistol','revolver'].includes(id)){polygon(c,[[4,-2],[9,-1],[9,2],[3,3]],'#56616b','#13202b',.7);}
 if(['rifle','smg','dmr'].includes(id))polygon(c,[[13,1],[16,1],[15,6],[12,5]],'#6d7b81','#15202c',.6);
 if(id==='revolver'){circle(c,12,0,2.6,'#697882','#c3d1d8');for(let i=0;i<3;i++)circle(c,11+i*.9,-.6, .35,'#22313d');}
 if(id==='shotgun'){c.fillStyle='#977755';c.fillRect(15,-2,7,4);line(c,[[16,-1],[20,-1]],'#d5b991',.6);}
 if(id==='lmg'){polygon(c,[[13,2],[20,2],[20,7],[13,7]],'#5b6658','#a4ad92',.7);line(c,[[end-8,1],[end-5,7],[end-2,1]],'#afc0c6',.9);}
 if(['dmr','sniper','longshot'].includes(id)){const scope=id==='dmr'?6:id==='sniper'?9:12;c.fillStyle='#142333';c.fillRect(13,-5,scope,3);c.fillStyle='#93cddd';c.fillRect(13+scope-1,-5,1,3);line(c,[[16,-2],[16,-4]],'#a8bcc6',.7);}
 if(['sniper','longshot'].includes(id)){line(c,[[end-9,1],[end-12,6],[end-6,1]],'#899ea9',.8);circle(c,19,2,1,'#dae0da');}
 if(id==='longshot'){c.fillStyle='#647b6b';c.fillRect(end-9,-2,5,4);c.fillStyle='#acb7b4';c.fillRect(end-2,-1.5,3,3);}
 if(id==='trident'){c.fillStyle='#b5bec7';for(const y of [-3,0,3])c.fillRect(end-7,y-.6,8,1.2);}
 c.fillStyle=accent;c.fillRect(10,-1.5,3,.7);c.restore();
}
function field(c,x,y,angle,id,recoil=0,hitFlash=0,hitColor='#ffe1d5',weapon='rifle'){
 const a=colors[id]||colors.vanguard;c.save();c.translate(x,y);c.rotate(angle);c.translate(-recoil,0);c.lineJoin='round';
 // +X is always the face and muzzle; faction indicators are drawn by the game.
 const long=['volt','mire','deadeye'].includes(id);
 polygon(c,[[-4,-7],[-13,-8],[-16,long?-5:-2],[-12,0],[-16,long?7:4],[-9,6],[-4,8]],id==='volt'?'#15263b':'#202734','#566477',.65);
 if(id==='volt')line(c,[[-13,-6],[-15,-3],[-11,0],[-14,4]],a+'85',.7);
 plate(c,[[-8,-6],[-2,-9],[5,-7],[7,0],[5,7],[-3,9],[-9,5]],'#34414c');
 polygon(c,[[-7,-5],[-2,-6],[0,0],[-2,5],[-7,5]],'#54606a',null);
 for(const side of [-1,1]){plate(c,[[-4,side*5],[0,side*9],[5,side*9],[7,side*5]],'#47555f');light(c,0,side*7,4,1,a,2);}
 if(id==='mire'||id==='pyro'){for(const sy of [-1,1]){polygon(c,[[-11,sy*5-2],[-7,sy*5-2],[-7,sy*5+2],[-11,sy*5+2]],'#293941',a,.7);light(c,-10,sy*5-1,2,2,a,2);}}
 if(id==='halo'){polygon(c,[[-12,-4],[-7,-4],[-7,4],[-12,4]],'#56606a','#a6b1b875',.7);cross(c,-9.5,0,4,a);}
 // Arm and rifle retain their readable forward direction at every zoom.
 polygon(c,[[4,4],[11,3],[13,6],[6,8]],'#475560','#101c28',.8);
 gun(c,weapon,a);
 if(id==='volt'){polygon(c,[[-3,-5],[1,-7],[7,-5],[8,0],[6,5],[0,6],[-4,3]],'#243449','#6a819470',.8);polygon(c,[[0,-4],[5,-4],[6,0],[5,3],[0,4]],'#0c1624',null);}
 else{polygon(c,[[-2,-4],[2,-6],[6,-3],[7,0],[5,4],[0,5],[-3,2]],'#53616c','#a2b1bc70',.65);polygon(c,[[3,-3],[7,-2],[7,2],[4,3]],'#17232f',null);}
 light(c,5.5,-2.5,1.5,5,a,2);
 if(id==='deadeye'){circle(c,6,-3,1.7,'#201c33',a);circle(c,6,-3,.8,'#f4deff');line(c,[[-1,-5],[-3,-9]],'#96a6b4',.6);}
 if(id==='vanguard'){line(c,[[-8,-3],[-5,0],[-8,3]],a,1.1);light(c,-9,-6,2,2,a,2);light(c,-9,5,2,2,a,2);}
 if(id==='mire')circle(c,-3,-6,1.6,null,a);
 if(id==='halo')cross(c,-3,5,3,a);
 if(id==='rook'){polygon(c,[[0,-12],[8,-12],[11,-9],[7,-6],[0,-6]],'#344f63','#739caf',.7);line(c,[[1,-11],[7,-11],[9,-9]],a,1.4);}
 if(hitFlash>0){c.save();c.globalAlpha*=Math.min(.7,hitFlash);polygon(c,[[-8,-6],[-2,-9],[5,-7],[8,-2],[7,5],[-3,9],[-9,5]],hitColor,null);c.restore();}
 c.restore();
}
root.GridfallOperatorArt={colors,portrait,field,gun,weaponModels};
})(typeof globalThis!=='undefined'?globalThis:this);
