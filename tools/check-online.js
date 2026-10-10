'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readHealth}=require('./online.js'),{checkPublic}=require('./online-ready.js'),{configFile}=require('../online-config.js');
(async()=>{
 console.log('GRIDFALL — ตรวจการเชื่อมต่อออนไลน์');
 let session;try{session=JSON.parse(fs.readFileSync(configFile,'utf8'));}catch{}
 if(!session){console.log('ยังไม่มีลิงก์ที่พร้อมใช้งาน · เปิด ONLINE-FRESH.cmd แล้วรอ ONLINE READY');const last=path.join(__dirname,'online-last-error.txt');if(fs.existsSync(last))console.log('ปัญหาล่าสุด:\n'+fs.readFileSync(last,'utf8'));process.exitCode=1;return;}
 const local='http://127.0.0.1:'+session.port,health=await readHealth(local);console.log('เกมในเครื่อง: '+local+' — '+(health?'พร้อม':'ไม่ได้เปิดอยู่'));
 console.log('ลิงก์ออนไลน์: '+session.publicUrl);
 if(!health){console.log('เปิด ONLINE-FRESH.cmd ใหม่ แล้วเปิดหน้าต่างนั้นค้างไว้');process.exitCode=1;return;}
 try{await checkPublic(session.publicUrl,health);console.log('ออนไลน์พร้อม ✓ · หน้าเกม สร้างห้อง และ WebSocket ผ่าน');}
 catch(e){console.log('ออนไลน์ยังไม่พร้อม: '+(e.cause?.code||e.message));console.log('คัดลอกข้อความนี้ให้ผู้พัฒนาเพื่อตรวจต่อ');process.exitCode=1;}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
