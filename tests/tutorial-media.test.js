const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createServer}=require('../server');
test('Tutorial media is shipped, served with the correct types and supports video seeking',async t=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url='http://127.0.0.1:'+server.address().port,root=path.resolve(__dirname,'..'),pack=fs.readFileSync(path.join(root,'tools/package-windows.js'),'utf8');
  for(const kind of ['zoom','pan','route'])for(const ext of ['mp4','png','vtt']){
    const name='assets/tutorial-'+kind+'.'+ext,response=await fetch(url+'/'+name),bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(response.status,200);assert.ok(bytes.equals(fs.readFileSync(path.join(root,name))));assert.ok(pack.includes("'"+name+"'"));
    assert.match(response.headers.get('content-type'),ext==='mp4'?/video\/mp4/:ext==='png'?/image\/png/:/text\/vtt/);
    if(ext==='mp4'){assert.equal(bytes.toString('ascii',4,8),'ftyp');assert.ok(bytes.indexOf(Buffer.from('moov'))<bytes.indexOf(Buffer.from('mdat')),'fast-start MP4');}
  }
  const name='/assets/tutorial-route.mp4',full=fs.readFileSync(path.join(root,name)),slice=await fetch(url+name,{headers:{Range:'bytes=100-199'}});
  assert.equal(slice.status,206);assert.equal(slice.headers.get('content-range'),'bytes 100-199/'+full.length);assert.ok(Buffer.from(await slice.arrayBuffer()).equals(full.subarray(100,200)));
  const suffix=await fetch(url+name,{headers:{Range:'bytes=-24'}});assert.equal(suffix.status,206);assert.ok(Buffer.from(await suffix.arrayBuffer()).equals(full.subarray(-24)));
  const open=await fetch(url+name,{headers:{Range:'bytes=100-'}});assert.equal(open.status,206);assert.ok(Buffer.from(await open.arrayBuffer()).equals(full.subarray(100)));
  for(const range of ['bytes=999999-','bytes=5-3','bytes=-0','bytes=-','bytes=0-1,4-5','bytes=abc']){const r=await fetch(url+name,{headers:{Range:range}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */'+full.length);await r.arrayBuffer();}
  const head=await fetch(url+name,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(full.length));assert.equal((await head.arrayBuffer()).byteLength,0);
});
