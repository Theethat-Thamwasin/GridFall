'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),{createServer}=require('../server');
const server=createServer();
server.once('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(0,'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+server.address().port+'/bot-arena.html';
  console.log('GRIDFALL Bot Arena: '+url);console.log('Choose both operators, then click Start duel. Ctrl+C closes the server.');
  if(process.argv.includes('--no-browser'))return;
  let executable,args;
  if(process.platform==='win32'){executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','rundll32.exe');args=['url.dll,FileProtocolHandler',url];}
  else{executable=process.platform==='darwin'?'open':'xdg-open';args=[url];}
  const browser=spawn(executable,args,{windowsHide:true,stdio:'ignore'});browser.once('error',()=>console.log('Open '+url+' in your browser.'));
});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.closeAllConnections();server.close();});
