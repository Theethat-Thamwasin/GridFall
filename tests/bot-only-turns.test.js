const test=require('node:test'),assert=require('node:assert/strict'),{RoomHub}=require('../multiplayer'),{harness}=require('./helpers/game-harness');
function fixture(){let now=1000;const hub=new RoomHub({now:()=>now}),host=hub.create({planningSeconds:60}),guest=hub.join(host.code,{});hub.start(host.code,host.token);return{hub,host,guest,room:hub.rooms.get(host.code),setNow:value=>now=value};}
test('Multiplayer preserves the countdown with any living human and starts immediately when all humans are eliminated',()=>{
  const {hub,host,guest,room}=fixture();room.state.units[host.playerId].alive=false;hub.advance(room);assert.equal(room.stage,'planning','one living human still gets planning time');
  room.state.units[guest.playerId].alive=false;const newcomer=hub.join(host.code,{});assert.equal(room.members.find(m=>m.id===newcomer.playerId).waiting,true);
  hub.advance(room);assert.equal(room.stage,'resolution','waiting newcomers are not participants in this match');assert.equal(room.state.tick,0);hub.advance(room);assert.equal(room.state.tick,1);
});
test('bot-only Fate drafts settle, reveal and start the next turn without advancing the clock',()=>{
  const {hub,room}=fixture();for(const member of room.members)room.state.units[member.id].alive=false;room.state.turn=4;hub.planning(room);
  assert.equal(room.stage,'draft');assert.equal(room.deadline,1000);const survivors=room.state.units.filter(u=>u.alive);for(const bot of survivors)assert.ok(room.state.fate.draft.picks[bot.id]);
  hub.advance(room);assert.equal(room.stage,'draftReveal');assert.equal(room.deadline,1000);for(const bot of survivors)assert.equal(bot.fateBuild.length>0,true);
  hub.advance(room);assert.equal(room.stage,'planning');assert.equal(room.deadline,1000);hub.advance(room);assert.equal(room.stage,'resolution');
});
test('Singleplayer keeps bots running across turns even while the eliminated result panel is open',async()=>{
  for(const initialTurn of [1,4]){
  const h=harness(),w=h.window,create=w.Gridfall.createState;let state;w.Gridfall.createState=(...args)=>{state=create(...args);state.units[0].alive=false;state.units[0].hp=0;for(const bot of state.units.slice(1))bot.hp=1000;return state;};
  const setup=w.Gridfall.createState;w.Gridfall.createState=(...args)=>{const s=setup(...args);s.turn=initialTurn;return s;};
  await h.$('start-button').click();h.$('result').classList.remove('hidden');h.frames(initialTurn===4?2:1);assert.equal(w.GRIDFALL_STATUS().phase,'resolution');h.frames(82);assert.equal(w.GRIDFALL_STATUS().turn,initialTurn+1);assert.equal(w.GRIDFALL_STATUS().phase,'resolution');assert.ok(Object.keys(state.plans).length>1);
  }
});
