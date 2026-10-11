const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process');
test('standalone launcher binds locally and serves the arena and dependencies without opening a browser',async()=>{
  const child=spawn(process.execPath,['tools/bot-arena.js','--no-browser'],{cwd:path.resolve(__dirname,'..'),windowsHide:true,stdio:['ignore','pipe','pipe']});
  const closed=new Promise(resolve=>child.once('exit',resolve));let output='';
  try{
    const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Arena launcher did not start: '+output)),10000);child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:\d+\/bot-arena.html/);if(match){clearTimeout(timer);resolve(match[0]);}});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Launcher exited: '+output));});});
    const html=await fetch(url);assert.equal(html.status,200);const body=await html.text();assert.ok(body.includes('bot-a')&&body.includes('bot-b'));
    const base=new URL(url).origin;for(const filename of ['bot-arena.css','bot-arena.js','bot-arena-view.js','engine.js','fate.js','vision.js','operator-art.js','motion.js','effects.js']){const response=await fetch(base+'/'+filename);assert.equal(response.status,200,filename);assert.ok((await response.text()).length>0);}
    assert.equal((await fetch(base+'/tools/bot-arena.js')).status,404);
  }finally{child.kill();await closed;}
});
