(function(root){
  'use strict';
  // Touch gestures never commit on press. A second finger latches camera mode
  // until every finger is lifted, including the last remaining finger.
  function create({canvas,context,preview,commit,clear,transform,changed=()=>{}}){
    const fingers=new Map();let target=null,gesture=null,pan=false;
    const point=e=>({x:e.clientX,y:e.clientY});
    function geometry(){const p=[...fingers.values()];return {x:p.reduce((n,v)=>n+v.x,0)/p.length,y:p.reduce((n,v)=>n+v.y,0)/p.length,d:p.length>1?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0};}
    function inside(e){const r=canvas.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.left+r.width&&e.clientY>=r.top&&e.clientY<=r.top+r.height;}
    function discard(){if(target){target=null;clear();}changed();}
    function cancel(){discard();gesture=null;const ids=[...fingers.keys()];fingers.clear();for(const id of ids)if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);changed();}
    function valid(){const c=context();return c.allowed&&target&&target.stamp===c.stamp;}
    function down(e){
      if(e.pointerType!=='touch')return false;e.preventDefault();
      fingers.set(e.pointerId,point(e));canvas.setPointerCapture(e.pointerId);
      if(fingers.size>1){discard();gesture=geometry();}
      else if(pan||!context().allowed){gesture=geometry();}
      else {target={id:e.pointerId,stamp:context().stamp};preview(e,true);}
      changed();return true;
    }
    function move(e){
      if(e.pointerType!=='touch')return false;e.preventDefault();if(!fingers.has(e.pointerId))return true;
      fingers.set(e.pointerId,point(e));
      if(gesture){const next=geometry();transform(gesture,next);gesture=next;}
      else if(valid())preview(e,false);else discard();
      changed();return true;
    }
    function up(e){
      if(e.pointerType!=='touch')return false;e.preventDefault();if(!fingers.has(e.pointerId))return true;
      const accept=!gesture&&valid()&&target.id===e.pointerId&&inside(e);
      // Remove before releasing capture: lostpointercapture is also emitted on
      // normal release and must not discard a successfully added action.
      fingers.delete(e.pointerId);
      if(accept){preview(e,false);target=null;commit(e);}else discard();
      if(!fingers.size)gesture=null;else if(gesture)gesture=geometry();
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      changed();return true;
    }
    return {down,move,up,cancel,lost:e=>{if(fingers.has(e.pointerId))cancel();},setPan(value){cancel();pan=!!value;changed();},get pan(){return pan;},get active(){return fingers.size>0;},get aiming(){return !!target;},get gesturing(){return !!gesture;},validate(){if(target&&!valid())cancel();}};
  }
  root.GridfallTouch={create};
  if(typeof module!=='undefined')module.exports=root.GridfallTouch;
})(typeof window!=='undefined'?window:globalThis);
