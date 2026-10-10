(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GridfallMusic=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,fallback)=>Number.isFinite(Number(v))?Math.max(0,Math.min(1,Number(v))):fallback;
  // Bake the join once, then let the audio clock loop it without timers or MP3 reloads.
  function buildLoop(context,decoded,{crossfadeSeconds=1.2}={}){
    const rate=decoded.sampleRate,channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),block=Math.max(1,Math.round(rate*.01)),energy=[];
    let peak=0;
    for(let i=0;i<decoded.length;i+=block){const end=Math.min(i+block,decoded.length);let power=0;for(const data of channels)for(let n=i;n<end;n++)power+=data[n]*data[n];const rms=Math.sqrt(power/((end-i)*channels.length));energy.push(rms);peak=Math.max(peak,rms);}
    const threshold=Math.max(.0003,peak*.008);let first=energy.findIndex(v=>v>=threshold),last=energy.length-1;while(last>=0&&energy[last]<threshold)last--;
    if(first<0){first=0;last=energy.length-1;}
    const start=Math.max(0,(first-1)*block),end=Math.min(decoded.length,(last+2)*block),length=end-start;
    const fade=Math.max(1,Math.min(Math.round(rate*crossfadeSeconds),Math.floor(length/4))),out=context.createBuffer(decoded.numberOfChannels,Math.max(1,length),rate),body=length-fade;
    for(let channel=0;channel<channels.length;channel++){
      const input=channels[channel],data=out.getChannelData(channel);data.set(input.subarray(start,end-fade));
      for(let n=0;n<fade;n++){const phase=(n+.5)/fade*Math.PI/2;data[body+n]=input[end-fade+n]*Math.cos(phase)+input[start+n]*Math.sin(phase);}
    }
    return{buffer:out,loopStart:fade/rate,loopSeconds:(length-fade)/rate,originalSeconds:decoded.duration,trimStart:start/rate,trimEnd:(decoded.length-end)/rate,crossfadeSeconds:fade/rate};
  }
  class MusicLoop{
    constructor(context,destination,{url='Circuit%20Tactics.mp3',volume=.3,visible=true,fetchAudio=url=>globalThis.fetch(url)}={}){
      this.context=context;this.url=url;this.volume=clamp(volume,.3);this.visible=visible;this.fetchAudio=fetchAudio;this.source=null;this.prepared=null;this.loading=null;this.retryAfter=0;this.duckUntil=0;this.starts=0;this.restarts=0;this.startedAt=0;this.voice=null;
      this.gain=context.createGain();this.gain.gain.value=0;this.gain.connect(destination);
    }
    async start(){
      if(this.source||!this.visible)return this.source;
      if(!this.prepared){
        if(Date.now()<this.retryAfter)return null;
        if(!this.loading)this.loading=(async()=>{const response=await this.fetchAudio(this.url);if(!response.ok)throw Error('Music unavailable');const decoded=await this.context.decodeAudioData(await response.arrayBuffer());this.prepared=buildLoop(this.context,decoded);})().catch(error=>{this.retryAfter=Date.now()+15000;throw error;}).finally(()=>{this.loading=null;});
        await this.loading;
      }
      if(this.source||!this.visible)return this.source;
      const source=this.context.createBufferSource(),voice=this.context.createGain(),now=this.context.currentTime;source.buffer=this.prepared.buffer;source.loop=true;source.loopStart=this.prepared.loopStart;source.loopEnd=source.buffer.duration;voice.gain.value=0;voice.gain.setTargetAtTime(1,now,.35);source.connect(voice);voice.connect(this.gain);source.onended=()=>{source.disconnect();voice.disconnect();};this.source=source;this.voice=voice;this.startedAt=now;this.starts++;source.start(now,0);this.applyVolume();return source;
    }
    restart(){
      this.restarts++;this.duckUntil=0;const now=this.context.currentTime,old=this.source,voice=this.voice;
      if(old){const param=voice.gain;if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);else param.cancelScheduledValues(now);param.setTargetAtTime(0,now,.035);old.stop(now+.18);this.source=null;this.voice=null;}
      return this.start();
    }
    setVolume(volume){this.volume=clamp(volume,this.volume);this.applyVolume();}
    setVisible(visible){this.visible=!!visible;this.applyVolume(.08);if(this.visible)this.start().catch(()=>{});}
    duck(seconds=.55){this.duckUntil=Math.max(this.duckUntil,this.context.currentTime+seconds);this.applyVolume(.035);}
    applyVolume(smoothing=.1){
      const now=this.context.currentTime,param=this.gain.gain,base=this.visible?this.volume:0;
      if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);else{param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);}
      param.setTargetAtTime(base*(this.duckUntil>now ? .55 : 1),now,smoothing);
      if(this.duckUntil>now)param.setTargetAtTime(base,this.duckUntil,.22);
    }
    status(){return{track:'Circuit Tactics',playing:!!this.source,loading:!!this.loading,volume:this.volume,visible:this.visible,starts:this.starts,restarts:this.restarts,positionSeconds:this.source?Math.max(0,this.context.currentTime-this.startedAt):0,loopStart:this.prepared?.loopStart||0,loopSeconds:this.prepared?.loopSeconds||0,crossfadeSeconds:this.prepared?.crossfadeSeconds||0};}
  }
  return{buildLoop,MusicLoop};
});
