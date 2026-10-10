const test=require('node:test'),assert=require('node:assert/strict'),{RoomHub}=require('../multiplayer'),{harness}=require('./helpers/game-harness');
test('multiplayer controller displays all operators and confirmation, moves teams and bots and deploys authoritative team state',async()=>{
  const hub=new RoomHub();let instance,disconnect;
  class Network{
    constructor(packet,connection){this.onPacket=packet;this.onConnection=connection;this.active=this.connected=this.locked=this.busy=false;instance=this;}
    async enter(create,options){this.credentials=hub.create(options);this.active=this.connected=true;this.onConnection();disconnect=hub.connect(this.credentials.code,this.credentials.token,p=>this.onPacket(p));return this.credentials;}
    async updateLobby(changes){hub.updateLobby(this.credentials.code,this.credentials.token,changes);}
    async start(){hub.start(this.credentials.code,this.credentials.token);}
    async leave(){disconnect?.();this.active=this.connected=false;}
    invitation(){return Promise.resolve('https://example.test/?room='+this.credentials.code);}
  }
  const h=harness(1280,{Network}),{$,window:w}=h;$('player-name').value='HOST';$('room-mode').value='team';await $('room-create').click();const room=hub.get(instance.credentials.code,instance.credentials.token).room;
  assert.equal($('lobby').classList.contains('hidden'),false);assert.equal($('lobby-operator-picker').children.length,0,'presentation stub is separate from this controller harness');assert.ok($('lobby-save'));assert.equal($('lobby-mode').value,'team');assert.equal($('team-a').getAttribute('aria-pressed'),'true');assert.match($('lobby-team-summary').textContent,/A: 4 \/ 4 · B: 4 \/ 4/);
  $('lobby-character').value='halo';$('lobby-character').dispatchEvent({type:'input'});await $('lobby-save').click();assert.equal(room.members[0].class,'halo');
  await $('team-b').click();assert.equal(room.members[0].team,'B');assert.equal($('team-b').getAttribute('aria-pressed'),'true');assert.ok($('lobby-members').children.some(row=>row.dataset.team==='A'));assert.ok($('lobby-members').children.some(row=>row.dataset.team==='B'));assert.ok($('lobby-members').children.some(row=>row.querySelector('.team-badge')));
  await $('bot-remove').click();const first=$('lobby-members').children.find(row=>row.querySelector('.team-bot-move')&&!row.querySelector('.team-bot-move').disabled);assert.ok(first);await first.querySelector('.team-bot-move').click();assert.ok(hub.teamBots(room).every(b=>['A','B'].includes(b.team)));
  const deploying=$('room-start').click();h.frames(2);await deploying;assert.equal(w.GRIDFALL_STATUS().mode,'team');assert.equal(w.GRIDFALL_STATUS().team,'B');assert.equal(w.GRIDFALL_STATUS().character,'halo');assert.equal(w.GRIDFALL_STATUS().alive,7);
});
test('all seven operator cards and confirmation remain in the lobby markup, with a compact grid and sticky confirm',()=>{const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'training-team.css'),'utf8'),presentation=fs.readFileSync(path.join(root,'presentation.js'),'utf8');assert.match(html,/id="lobby-operator-picker"/);assert.match(html,/id="lobby-save"/);assert.match(presentation,/Object.entries\(G.CLASSES\)/);assert.match(css,/#lobby-operator-picker\{grid-template-columns:repeat\(3/);assert.match(css,/\.lobby-profile-confirm\{position:sticky;bottom:-1px/);});
