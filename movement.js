(function(root,factory){const api=factory(typeof module!=='undefined'&&module.exports?require('./engine.js'):root.Gridfall);if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GridfallMovement=api;})(typeof globalThis!=='undefined'?globalThis:this,function(G){
'use strict';
const same=(a,b)=>a.x===b.x&&a.y===b.y;
class Route {
  constructor(state,origin,budget){this.state=state;this.origin={...origin};this.budget=budget;this.path=[];this.cost=0;this.pointer={...origin};}
  get head(){return this.path.at(-1)||this.origin;}
  get remaining(){return this.path.length&&G.inField(this.state,this.head,'stasis')?0:this.budget-this.cost;}
  append(p){
    if(same(p,this.head))return false;
    const previous=this.path.length>1?this.path.at(-2):this.origin;
    if(this.path.length&&same(p,previous)){const removed=this.path.pop();this.cost-=G.tile(this.state,removed.x,removed.y).type==='water'?2:1;return true;}
    if(Math.abs(p.x-this.head.x)+Math.abs(p.y-this.head.y)!==1||!G.passable(this.state,p.x,p.y))return false;
    const cost=G.tile(this.state,p.x,p.y).type==='water'?2:1;if(cost>this.remaining)return false;
    this.path.push({x:p.x,y:p.y});this.cost+=cost;return true;
  }
  trace(point,onStep){
    // Sample the actual pointer segment: fast drags preserve each crossed cell.
    // Exact corner crossings become two cardinal steps, never a diagonal hop.
    const append=p=>{const before=this.path.length;if(this.append(p)&&this.path.length>before)onStep?.({...p},this.path.length);};
    const from=this.pointer,steps=Math.max(1,Math.ceil(Math.hypot(point.x-from.x,point.y-from.y)/.12));let last={x:Math.floor(from.x+.5),y:Math.floor(from.y+.5)};
    for(let i=1;i<=steps;i++){const next={x:Math.floor(from.x+(point.x-from.x)*i/steps+.5),y:Math.floor(from.y+(point.y-from.y)*i/steps+.5)};
      if(next.x!==last.x&&next.y!==last.y)append({x:next.x,y:last.y});append(next);last=next;
    }
    this.pointer={...point};return this.path;
  }
  action(type){const checked=G.validateRoute(this.state,this.origin,this.path,this.budget);return checked?{type,path:checked.path,target:{...this.head}}:null;}
}
return{Route};});
