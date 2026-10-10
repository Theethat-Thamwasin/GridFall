'use strict';
const {spawn}=require('node:child_process');
const {createServer}=require('../server.js');
const {lanAddresses}=require('../server.js');
const server=createServer();let closing=false;
function close(){if(closing)return;closing=true;for(const ws of server.sockets.clients)ws.terminate();server.closeAllConnections();server.close(()=>process.exit(process.exitCode||0));}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
server.once('error',e=>{console.error('เปิดเกมไม่สำเร็จ: '+e.message);process.exitCode=1;close();});
server.listen(0,'0.0.0.0',()=>{
 const port=server.address().port,url='http://localhost:'+port;
 console.log('GRIDFALL พร้อมเล่น: '+url);
 for(const ip of lanAddresses().slice(0,1))console.log('เล่นผ่าน LAN: http://'+ip+':'+port);
 console.log('เปิดหน้าต่างนี้ค้างไว้ระหว่างเล่น · กด Ctrl+C เพื่อปิดเกม');
 if(!process.argv.includes('--no-browser')){
  const browser=spawn(require('node:path').join(process.env.SystemRoot||'C:\\Windows','System32','rundll32.exe'),['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});
  browser.once('error',()=>console.log('เปิดเบราว์เซอร์แล้วเข้า '+url));
 }
});
