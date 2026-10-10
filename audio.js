(function () {
  'use strict';
  class SoundEngine {
    constructor() { this.context = null; this.enabled = true; this.volume = 1; this.lastTick = -1; this.offset = 0; this.music = null; this.musicVolume = .3; this.musicVisible = true; }
    async unlock() {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio(); this.master = this.context.createGain(); this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -18; this.compressor.ratio.value = 5;
        this.master.gain.value = this.enabled ? .55 : 0;
        this.effectsBus=this.context.createGain();this.effectsBus.gain.value=this.volume;this.effectsBus.connect(this.master);
        this.musicBus=this.context.createGain();this.musicBus.gain.value=.35;this.musicBus.connect(this.master); this.master.connect(this.compressor); this.compressor.connect(this.context.destination);
        if(window.GridfallMusic)this.music=new window.GridfallMusic.MusicLoop(this.context,this.musicBus,{volume:this.musicVolume,visible:this.musicVisible});
        this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
        const data = this.noiseBuffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.music?.start().catch(()=>{});
    }
    setVolume(v) { this.volume = Math.max(0,Math.min(1,Number(v)||0)); if(this.context)this.effectsBus.gain.setTargetAtTime(this.volume,this.context.currentTime,.04); }
    setMusicVolume(v) { this.musicVolume = Math.max(0,Math.min(1,Number(v)||0)); this.music?.setVolume(this.musicVolume); }
    restartMusic() { return (this.music?this.music.restart():this.unlock().then(()=>this.music?.restart())).catch(()=>{}); }
    setMusicVisible(visible) { this.musicVisible = !!visible; this.music?.setVisible(visible); }
    toggle() { this.enabled = !this.enabled; this.applyVolume(); return this.enabled; }
    applyVolume() { if (this.context) this.master.gain.setTargetAtTime(this.enabled ? .55 : 0, this.context.currentTime, .03); }
    tone(freq, end, duration, volume = .3, type = 'sine', delay = 0, pan = 0) {
      if (!this.context || !this.enabled || this.volume===0) return;
      const c = this.context, start = c.currentTime + delay + this.offset, osc = c.createOscillator(), gain = c.createGain(), stereo = c.createStereoPanner();
      osc.type = type; osc.frequency.setValueAtTime(Math.max(20, freq), start); osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
      gain.gain.setValueAtTime(.001, start); gain.gain.exponentialRampToValueAtTime(Math.max(.002, volume), start + .005); gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      stereo.pan.value = Math.max(-1, Math.min(1, pan)); osc.connect(gain); gain.connect(stereo); stereo.connect(this.effectsBus); osc.start(start); osc.stop(start + duration + .02); osc.onended = () => { osc.disconnect(); gain.disconnect(); stereo.disconnect(); };
    }
    noise(duration, volume = .3, cutoff = 2000, delay = 0, pan = 0, filterType = 'lowpass') {
      if (!this.context || !this.enabled || this.volume===0) return;
      const c = this.context, start = c.currentTime + delay + this.offset, source = c.createBufferSource(), gain = c.createGain(), filter = c.createBiquadFilter(), stereo = c.createStereoPanner();
      source.buffer = this.noiseBuffer; filter.type = filterType; filter.frequency.setValueAtTime(cutoff, start); filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * .15), start + duration);
      gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(.001, start + duration); stereo.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(filter); filter.connect(gain); gain.connect(stereo); stereo.connect(this.effectsBus); source.start(start); source.stop(start + duration); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); };
    }
    play(name, pan = 0, variant = '', offset = 0) {
      if (!this.context || !this.enabled || this.volume===0) return;
      if(name==='menuHover'){const now=this.context.currentTime;if(now-(this.lastMenuHover??-Infinity)<.095)return;this.lastMenuHover=now;}
      if(name==='warning'){const now=this.context.currentTime;if(now-(this.lastWarning??-Infinity)<1.5)return;this.lastWarning=now;}
      if(['gun','explosion','lock','victory','defeat','eliminate','fateStart','bump'].includes(name))this.music?.duck(name==='victory'||name==='defeat'?2.4:name==='explosion'?1:.55);
      this.offset = offset;
      switch (name) {
        case 'menuHover': this.noise(.012,.014,5200,0,pan,'highpass');this.tone(1080,820,.035,.025,'triangle',0,pan);this.tone(1680,1680,.019,.012,'sine',.026,pan);break;
        case 'menuSelect': this.noise(.018,.025,3400,0,pan,'highpass');this.tone(760,960,.045,.055,'triangle',0,pan);this.tone(1440,1440,.04,.025,'sine',.052,pan);break;
        case 'hover': this.tone(580,620,.035,.025,'sine'); break;
        case 'operator': this.tone(240,480,.11,.07,'triangle'); break;
        case 'map': this.tone(330,700,.09,.07,'sine'); break;
        case 'turn': this.tone(380,540,.09,.065,'triangle'); break;
        case 'join': this.tone(620,840,.08,.065,'sine'); break;
        case 'invalid': this.tone(170,120,.06,.045,'triangle'); break;
        case 'shieldBreak': this.noise(.18,.12,3800,0,pan,'highpass');this.tone(1100,240,.2,.11,'sine',0,pan);break;
        case 'click': this.tone(680, 960, .055, .12, 'sine'); break;
        case 'queue': this.tone(460,760,.085,.075,'triangle');this.tone(920,1100,.06,.04,'sine',.055);break;
        case 'actionFly': this.noise(.16,.022,2200,0,pan,'highpass');this.tone(420,720,.14,.025,'sine',0,pan);break;
        case 'slotLand': {const now=this.context.currentTime;if(now-(this.lastSlotLand??-Infinity)<.065)break;this.lastSlotLand=now;this.tone(660,660,.12,.035,'sine',0,pan);this.tone(990,990,.1,.025,'sine',.04,pan);break;}
        case 'lock': this.noise(.12, .14, 2200); this.tone(90, 45, .28, .25); [220, 330, 440].forEach((f, i) => this.tone(f, f * 1.01, .14, .085, 'triangle', i * .085)); break;
        case 'gun': {
          if(variant==='trident'){this.tone(480,840,.1,.055,'triangle',0,pan);this.tone(610,320,.12,.04,'sine',0,pan);}
          const profile = { trident:[.15,.34,4400,210,.12], rifle: [.15, .35, 3800, 180, .1], pistol: [.11, .3, 4300, 220, .1], smg: [.085, .28, 5200, 260, .07], lmg: [.2, .46, 2300, 130, .17], dmr: [.2, .42, 2900, 155, .16], revolver: [.23, .5, 2000, 145, .2], shotgun: [.28, .55, 1500, 110, .24], longshot:[.4,.7,950,70,.36], sniper: [.34, .6, 1200, 85, .3] }[variant] || [.15, .35, 3800, 180, .1];
          this.noise(profile[0], profile[1], profile[2], 0, pan);
          this.tone(profile[3], 35, profile[4], .5, 'triangle', 0, pan);
          this.noise(.045, .16, 6500, .025, pan, 'highpass'); break;
        }
        case 'hit': this.noise(.09, .25, 2400, 0, pan); this.tone(850, 170, .07, .18, 'square', 0, pan); break;
        case 'shield': this.tone(1400, 420, .18, .17, 'sine', 0, pan); this.noise(.1, .1, 4500, 0, pan, 'highpass'); break;
        case 'explosion': this.noise(.85, .75, 1900, 0, pan); this.tone(95, 22, .65, .7, 'sine', 0, pan); this.noise(.35, .25, 4000, .05, pan); break;
        case 'collision': this.tone(155,62,.19,.22,'sine',0,pan);this.noise(.075,.11,1600,0,pan);this.tone(430,180,.075,.045,'triangle',.012,pan);break;
        case 'bump': this.tone(205,65,.26,.42,'sine',0,pan);this.tone(520,155,.12,.18,'triangle',0,pan);this.noise(.16,.3,3800,0,pan);this.noise(.035,.12,5200,0,pan,'highpass');break;
        case 'smoke': this.noise(.32,.09,1300,0,pan);this.tone(160,75,.12,.035,'sine',0,pan);break;
        case 'throw': this.noise(.12, .13, 1600, 0, pan); this.tone(380, 700, .2, .1, 'sine', 0, pan); break;
        case 'reload': this.noise(.06, .15, 4400, 0, pan, 'highpass'); this.noise(.07, .2, 1800, .12, pan); this.tone(180, 80, .08, .15, 'triangle', .13, pan); break;
        case 'heal': [440, 554, 660].forEach((f, i) => this.tone(f, f, .28, .12, 'sine', i * .12, pan)); break;
        case 'loot': [620, 830, 1240].forEach((f, i) => this.tone(f, f, .12, .12, 'triangle', i * .065, pan)); break;
        case 'routePop': { const now=this.context.currentTime,delay=Math.min(.18,Math.max(0,(this.nextRoutePop||now)-now));this.nextRoutePop=now+delay+.045;this.tone(540,220,.065,.05,'sine',delay,pan);this.tone(780,440,.035,.012,'sine',delay,pan);break; }
        case 'step': this.noise(.045, .06, 600, 0, pan); break;
        case 'slash': this.noise(.19, .28, 6500, 0, pan, 'highpass'); this.tone(230, 1100, .14, .12, 'triangle', 0, pan); this.tone(850, 120, .09, .1, 'sine', .06, pan); break;
        case 'blink': this.tone(140, 2200, .22, .25, 'sawtooth', 0, pan); this.noise(.23, .17, 6000, 0, pan); break;
        case 'scan': this.tone(1400, 600, .55, .15); this.tone(1800, 1200, .35, .13, 'sine', .2); break;
        case 'stasis': this.tone(580,190,.32,.1,'sine',0,pan);this.tone(290,145,.38,.07,'triangle',.04,pan);this.noise(.22,.045,1900,0,pan);break;
        case 'mend': this.tone(440,554,.26,.055,'sine',0,pan);this.tone(660,660,.3,.045,'sine',.065,pan);break;
        case 'fire': this.noise(.65,.28,1700,0,pan); this.tone(95,35,.4,.2,'triangle',0,pan); break;
        case 'reflect': this.tone(420,1600,.22,.17,'triangle',0,pan); this.tone(1250,700,.3,.12,'sine',.08,pan); break;
        case 'guard': this.tone(420, 120, .2, .2, 'triangle', 0, pan); this.noise(.12, .12, 1300, 0, pan); break;
        case 'eliminate': this.tone(620, 100, .32, .2, 'sawtooth', 0, pan); this.tone(80, 28, .4, .4, 'sine', .05, pan); break;
        case 'warning': this.noise(.35,.055,700,0,pan);this.tone(180,110,.38,.055,'sine',0,pan);break;
        case 'collapse': this.noise(.55,.1,520,0,pan);this.tone(85,38,.5,.12,'sine',0,pan);break;
        case 'fateStart': [146,220,293].forEach((f,i)=>this.tone(f,f*1.03,.65,.065,'sine',i*.09));this.noise(.35,.03,1400);break;
        case 'fateAppear': this.noise(.13,.045,3800);this.tone(550,720,.15,.035,'sine');break;
        case 'fateHover': this.tone(660,740,.05,.025,'sine');break;
        case 'fateSelect': this.tone(220,440,.2,.08,'triangle');break;
        case 'fateFlip': this.noise(.17,.065,2200);this.tone(320,640,.18,.055,'sine');break;
        case 'fateBless': [440,554,660].forEach((f,i)=>this.tone(f,f,.24,.045,'sine',i*.045));break;
        case 'fateCurse': this.tone(174,130,.35,.06,'triangle');this.tone(247,196,.26,.035,'sine',.08);break;
        case 'fateSpecial': this.tone(330,990,.32,.065,'sine');this.noise(.12,.035,4200);break;
        case 'fateLegendary': [110,220,330,554].forEach((f,i)=>this.tone(f,f*1.01,.55,.07,'triangle',i*.055));break;
        case 'tick': this.tone(900,680,.045,.035); break;
        case 'deploy': [110, 165, 220, 330, 440].forEach((f, i) => this.tone(f, f * 1.1, .25, .17, 'triangle', i * .1)); this.noise(.5, .3, 1100); break;
        case 'victory': [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, f, .55, .2, 'triangle', i * .13)); this.tone(65, 65, 1.7, .3); break;
        case 'defeat': [220, 196, 164, 110].forEach((f, i) => this.tone(f, f, .65, .2, 'triangle', i * .18)); break;
      }
      this.offset = 0;
    }
  }
  window.SoundEngine = SoundEngine;
})();
