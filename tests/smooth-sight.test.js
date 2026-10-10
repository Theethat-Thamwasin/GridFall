const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./helpers/game-harness');
test('online terrain shadows follow the displayed pose between snapshots while actors retain authoritative clipping',()=>{
  let network,path=[],clips=[];const stack=[],fogClears=[],actorClips=[];
  const paint={beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},save(){stack.push([...clips]);},restore(){clips=stack.pop()||[];},clip(){clips.push([...path]);},clearRect(){if(clips.length)fogClears.push(clips.map(p=>[...p]));}};
  class Network{constructor(packet){this.receive=packet;this.active=this.connected=true;this.credentials={playerId:0,code:'TEST'};network=this;}}
  const h=harness(1280,{Network,paint}),w=h.window,G=w.Gridfall,V=G.VISION,s=w.GridfallPractice.createState(913);s.practice=false;s.phase='resolution';s.tick=0;s.events=[];s.plans={};s.units[1].class='rook';s.units[1].x=12;s.units[1].y=10;
  for(const row of s.tiles)for(const tile of row){tile.type='floor';tile.hp=0;tile.loot=null;delete tile.roof;}
  w.GridfallPresentation.drawFieldOperator=(...args)=>{if(args[4]==='rook')actorClips.push([...clips]);};
  function send(state,seq,init=false){state.visibility=V.field(state,state.units[0],G.sightRange(state.units[0]));state.visibleCells=[];network.receive({type:'state',state,seq,init,matchId:1,stage:'resolution',locked:true,remainingMs:3000,planningMs:20000,spectating:null});}
  send(s,1,true);h.frames(1);const moved=structuredClone(s);moved.units[0].x++;moved.tick=2;send(moved,2);
  for(let i=0;i<4;i++){
    fogClears.length=actorClips.length=0;h.frames(1);const pose=w.GRIDFALL_MOTION().player,expected=V.field(moved,pose,G.sightRange(moved.units[0])).points.map(p=>[p.x*32,p.y*32]);
    assert.ok(pose.x>=9&&pose.x<10,'movement is still between authoritative tiles');assert.equal(fogClears.length,1);assert.equal(fogClears[0].length,1,'terrain shadow is not intersected with a jumping server polygon');assert.deepEqual(fogClears[0][0],JSON.parse(JSON.stringify(expected)));
    assert.ok(actorClips.length>0);assert.equal(actorClips[0].length,2,'opponents still use both interpolated and server sight');
  }
  const hidden=structuredClone(moved);hidden.units[1].hidden=true;hidden.units[1].alive=false;hidden.units[1].x=hidden.units[1].y=-100;hidden.tick=4;send(hidden,3);actorClips.length=0;h.frames(1);assert.equal(actorClips.length,0,'smooth shadows never resurrect a hidden opponent');
});
