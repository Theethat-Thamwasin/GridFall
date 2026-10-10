const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{createServer}=require('../server');
function request(url,headers={},method='GET'){return new Promise((resolve,reject)=>{const req=http.request(url,{headers,method},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});}
test('unchanged public assets revalidate without bodies while stale validators receive current bytes',async t=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  for(const file of ['index.html','engine.js','training-team.css','assets/menu-neon-wraith.png','Circuit Tactics.mp3']){
    const first=await request(base+'/'+encodeURI(file));assert.equal(first.status,200);assert.equal(first.headers['cache-control'],'public, no-cache');assert.ok(first.headers.etag);assert.ok(first.body.equals(fs.readFileSync(path.join(__dirname,'..',file))));
    const cached=await request(base+'/'+encodeURI(file),{'If-None-Match':first.headers.etag});assert.equal(cached.status,304);assert.equal(cached.body.length,0);assert.equal(cached.headers.etag,first.headers.etag);
    const changed=await request(base+'/'+encodeURI(file),{'If-None-Match':'W/"old-version"'});assert.equal(changed.status,200);assert.ok(changed.body.equals(first.body));
    const head=await request(base+'/'+encodeURI(file),{},'HEAD');assert.equal(head.status,200);assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),first.body.length);
  }
  const health=await request(base+'/api/health');assert.equal(health.headers['cache-control'],'no-store');assert.equal((await request(base+'/server.js')).status,404);
});
