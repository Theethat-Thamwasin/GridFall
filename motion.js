(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GridfallMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = t => Math.max(0, Math.min(1, t));
  const smooth = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
  function poseBetween(a, b, t) {
    t = smooth(t);
    return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, zoom: Math.exp(Math.log(a.zoom) + Math.log(b.zoom / a.zoom) * t) };
  }
  class UnitMotion {
    constructor(tickSeconds) { this.tickSeconds = tickSeconds; this.tracks = new Map(); this.blinks = new Set(); this.bumps=new Map(); }
    clear() { this.tracks.clear(); this.blinks.clear();this.bumps.clear(); }
    bump(id,from,time,contact=from,charge=false){this.bumps.set(id,{from:{...from},contact:{...contact},time,charge});}
    blink(id) { this.blinks.add(id); }
    sync(units, isVisible, time) {
      const present = new Set();
      for (const unit of units) {
        if (!unit.alive || unit.hidden || unit.x < 0 || unit.y < 0 || !isVisible(unit)) continue;
        present.add(unit.id);
        let track = this.tracks.get(unit.id);
        if (!track) {
          track = { from: { x: unit.x, y: unit.y }, to: { x: unit.x, y: unit.y }, start: time, duration: 0, blink: false };
          this.tracks.set(unit.id, track);
        } else if (track.to.x !== unit.x || track.to.y !== unit.y || this.bumps.has(unit.id)) {
          const bump=this.bumps.get(unit.id), from = bump?bump.from:this.sample(unit.id, time), blink = !bump&&( this.blinks.has(unit.id) || Math.hypot(unit.x - track.to.x, unit.y - track.to.y) > Math.SQRT2 + .01);
          this.tracks.set(unit.id, { from: { x: from.x, y: from.y }, to: { x: unit.x, y: unit.y }, start: time, duration: bump && !bump.charge ? .42 : this.tickSeconds * (bump?.charge?5:unit.class === 'volt'?4:5), blink, bump:!!bump&&!bump.charge, contact:bump?.contact });
        }
      }
      // Forget unseen opponents immediately; reappearance starts at a known tile.
      for (const id of this.tracks.keys()) if (!present.has(id)) this.tracks.delete(id);
      this.blinks.clear();this.bumps.clear();
    }
    sample(id, time) {
      const track = this.tracks.get(id);
      if (!track) return null;
      const t = track.duration ? clamp((time - track.start) / track.duration) : 1;
      if (track.blink) return { ...(t < .5 ? track.from : track.to), alpha: Math.abs(2 * t - 1), moving: t < 1 };
      if(track.bump){const via=track.contact||track.from,hit=.22;
        if(t<hit){const p=smooth(t/hit);return{x:track.from.x+(via.x-track.from.x)*p,y:track.from.y+(via.y-track.from.y)*p,alpha:1,moving:true};}
        const p=1-Math.pow(1-(t-hit)/(1-hit),3);return{x:via.x+(track.to.x-via.x)*p,y:via.y+(track.to.y-via.y)*p,alpha:1,moving:t<1};
      }
      const progress=track.bump?1-Math.pow(1-t,3):t;
      return { x: track.from.x + (track.to.x - track.from.x) * progress, y: track.from.y + (track.to.y - track.from.y) * progress, alpha: 1, moving: t < 1 };
    }
  }
  // Only interpolate objects present in the latest state. Never extrapolate
  // bullets past an impact or retain a flight after it becomes hidden.
  class EffectMotion {
    constructor(kind='projectile') { this.kind=kind;this.tracks=[]; }
    clear() { this.tracks=[]; }
    pose(track,time) {
      const t=track.duration?clamp((time-track.start)/track.duration):1,p={...track.point};
      for(const key of ['x','y','lift','progress'])if(Number.isFinite(track.from[key])&&Number.isFinite(p[key]))p[key]=track.from[key]+(p[key]-track.from[key])*t;
      return p;
    }
    sync(points,time,duration=.045,ticks=1) {
      const available=new Set(this.tracks),next=[];
      for(const point of points) {
        let best=null,score=Infinity;
        for(const track of available) {
          const old=track.point;
          if(old.owner!==point.owner)continue;
          let error;
          if(this.kind==='projectile') {
            if(Math.abs(old.dx-point.dx)>1e-7||Math.abs(old.dy-point.dy)>1e-7)continue;
            if(old.born!=null&&point.born!=null&&(old.born!==point.born||old.shotId!==point.shotId||old.weapon!==point.weapon))continue;
            const dx=point.x-old.x,dy=point.y-old.y,along=dx*point.dx+dy*point.dy,across=dx*point.dy-dy*point.dx;
            if(Math.abs(across)>.001||along<-.001)continue;
            // Public snapshots deliberately omit shooter IDs and speed.
            // Match only the existing one- or two-tile bullet speeds.
            const speeds=Number.isFinite(old.speed)?[old.speed]:[1,2];
            error=Math.min(...speeds.map(speed=>Math.abs(along-speed*ticks)));
            if(along<1e-7)error=0;
            if(error>.001)continue;
          } else {
            if(old.item!==point.item||point.progress<old.progress-1e-7)continue;
            if(old.born!=null&&point.born!=null&&old.born!==point.born)continue;
            error=Math.hypot(point.x-old.x,point.y-old.y);
            if(error>Math.max(1,ticks)*3)continue;
          }
          if(error<score){best=track;score=error;}
        }
        if(best)available.delete(best);
        const unchanged=best&&['x','y','lift','progress'].every(key=>point[key]===best.point[key]);
        next.push(unchanged?{...best,point:{...point}}:{point:{...point},from:best?this.pose(best,time):{...point},start:time,duration:best?duration:0});
      }
      this.tracks=next;
    }
    sample(time) { return this.tracks.map(track=>this.pose(track,time)); }
  }
  function turnAngle(from,to,dt,tau=.09){return from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*(1-Math.exp(-dt/tau));}
  return { smooth, poseBetween, UnitMotion, EffectMotion,turnAngle };
});
