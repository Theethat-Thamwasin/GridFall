'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {installCloudflared}=require('./online.js');
const root=path.resolve(__dirname,'..');
const files=['mobile.css','mobile-ui.js','touch-controls.js','assets/tutorial-zoom.mp4','assets/tutorial-zoom.png','assets/tutorial-zoom.vtt','assets/tutorial-pan.mp4','assets/tutorial-pan.png','assets/tutorial-pan.vtt','assets/tutorial-route.mp4','assets/tutorial-route.png','assets/tutorial-route.vtt', 'training-team.css','walkthrough.js','index.html', 'practice.js', 'practice-ui.js', 'refinement.css','audio.js','effects.js','engine.js','fate.js','fate-ui.js','fate.css','game.js','hud.css','interface.css','match-ui.css','menu-art.css','assets/menu-neon-frontline.png','assets/menu-neon-wraith.png','motion.js','movement.js','multiplayer.js','music.js','network.js','online-config.js','presentation.js','operator-art.js','presentation.css','replay.js','replay.css','server.js','style.css','tactics.js','vision.js','wire.js','Circuit Tactics.mp3','package.json','package-lock.json','README.md','START-HERE.txt','INSTALL.cmd','PLAY.cmd','ONLINE-FRESH.cmd','tools/online.js','tools/online-ready.js','tools/check-online.js','ONLINE-CHECK.cmd','tools/install.js','tools/launch.js'];
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function license(url,destination,expected){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('License download failed: '+url);const text=await response.text();if(!text.includes(expected))throw Error('Unexpected license at '+url);fs.writeFileSync(destination,text);}
function enumerate(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{const file=path.join(folder,e.name);return e.isDirectory()?enumerate(file):[file];});}
async function build(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build this portable package using Windows x64 Node.js.');
 const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
 const stage=fs.mkdtempSync(path.join(dist,'GRIDFALL-Windows-x64-'));
 for(const name of files){const to=path.join(stage,name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,name),to);}
 fs.cpSync(path.join(root,'node_modules','ws'),path.join(stage,'node_modules','ws'),{recursive:true});
 fs.mkdirSync(path.join(stage,'runtime'),{recursive:true});fs.copyFileSync(process.execPath,path.join(stage,'runtime','node.exe'));
 const binary=await installCloudflared();fs.mkdirSync(path.join(stage,'tools','bin'),{recursive:true});fs.copyFileSync(binary,path.join(stage,'tools','bin','cloudflared.exe'));
 const licenses=path.join(stage,'licenses');fs.mkdirSync(licenses);
 await Promise.all([
  license('https://raw.githubusercontent.com/nodejs/node/'+process.version+'/LICENSE',path.join(licenses,'NODE-LICENSE.txt'),'Node.js is licensed'),
  license('https://raw.githubusercontent.com/cloudflare/cloudflared/2026.9.3/LICENSE',path.join(licenses,'CLOUDFLARED-LICENSE.txt'),'Apache License')
 ]);
 fs.copyFileSync(path.join(root,'node_modules','ws','LICENSE'),path.join(licenses,'WS-LICENSE.txt'));
 fs.writeFileSync(path.join(stage,'THIRD-PARTY-NOTICES.txt'),'Node.js '+process.version+' — Node.js contributors / OpenJS Foundation. License and dependency notices: licenses/NODE-LICENSE.txt\nhttps://github.com/nodejs/node\n\ncloudflared 2026.9.3 — Cloudflare, Inc. Apache License 2.0: licenses/CLOUDFLARED-LICENSE.txt\nhttps://github.com/cloudflare/cloudflared\n\nws '+require('../node_modules/ws/package.json').version+' — MIT License: licenses/WS-LICENSE.txt\nhttps://github.com/websockets/ws\n\nBinaries are redistributed without modification. The game and Circuit Tactics.mp3 are included from the supplied GRIDFALL project.\n'.replace(/\\n/g,'\n'));
 const manifest={name:'GRIDFALL Windows x64',createdAt:new Date().toISOString(),node:process.version,operators:Object.keys(require('../engine.js').CLASSES),files:{}};
 for(const filename of enumerate(stage)){const name=path.relative(stage,filename).split(path.sep).join('/');manifest.files[name]={bytes:fs.statSync(filename).size,sha256:hash(filename)};}
 fs.writeFileSync(path.join(stage,'INSTALL-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Portable folder: '+stage);console.log('Bundled Node, ws, music, cloudflared, launchers and licenses.');
 if(!process.argv.includes('--no-zip')){
  const zip=stage+'.zip',quote=s=>"'"+s.replace(/'/g,"''")+"'",powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  await new Promise((resolve,reject)=>{const child=spawn(powershell,['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath '+quote(stage)+' -DestinationPath '+quote(zip)+' -CompressionLevel Optimal'],{windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>error+=b);child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('ZIP failed: '+error)));});
  const readyZip=path.join(dist,'GRIDFALL-Windows-x64.zip');fs.copyFileSync(zip,readyZip);console.log('Ready to send: '+readyZip);
  console.log('ZIP: '+zip);console.log('Size: '+(fs.statSync(zip).size/1024/1024).toFixed(1)+' MB');console.log('SHA256: '+hash(zip));
 }
 return stage;
}
if(require.main===module)build().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={build};
