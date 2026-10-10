'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function verify(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('ชุดนี้ใช้กับ Windows 64-bit');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('ต้องใช้ Node.js 22 ขึ้นไป หรือ runtime ที่อยู่ใน ZIP');
 const essentials=['index.html','server.js','engine.js','multiplayer.js','wire.js','Circuit Tactics.mp3','tools/online.js'];
 for(const name of essentials)if(!fs.existsSync(path.join(root,name)))throw Error('ไฟล์ไม่ครบ: '+name+' · แตก ZIP ใหม่ให้ครบทั้งโฟลเดอร์');
 const manifestFile=path.join(root,'INSTALL-MANIFEST.json');
 if(fs.existsSync(manifestFile)){
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  for(const [name,record]of Object.entries(manifest.files)){
   const filename=path.resolve(root,name),relative=path.relative(root,filename);
   if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('รายการไฟล์ติดตั้งไม่ถูกต้อง');
   if(!fs.existsSync(filename)||crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')!==record.sha256)throw Error('ไฟล์ไม่ครบหรือถูกแก้ไข: '+name+' · แตก ZIP ใหม่ให้ครบทั้งโฟลเดอร์');
  }
 }
 require(path.join(root,'node_modules','ws'));
 const G=require(path.join(root,'engine.js'));
 if(!G.CLASSES.mire||!G.CLASSES.halo)throw Error('ไฟล์เกมไม่ใช่ชุดล่าสุด');
 console.log('GRIDFALL พร้อมใช้งาน ✓');
 console.log('ตัวละครครบ '+Object.keys(G.CLASSES).length+' ตัว · เพลงและไฟล์เกมครบ');
 console.log('เล่นคนเดียว / LAN: เปิด PLAY.cmd');
 console.log('เปิดลิงก์ออนไลน์ใหม่: เปิด ONLINE-FRESH.cmd');
}
if(require.main===module){try{verify();}catch(e){console.error('ตรวจไฟล์ไม่ผ่าน: '+e.message);process.exitCode=1;}}
module.exports={verify};
