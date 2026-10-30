/* Geometry only. Points are always supplied by the trained hand model. */
self.HandRegions = (() => {
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  function seeds(face, width, height, phase = 0) {
    const ratio = width / height;
    const span = face ? clamp(face.height / ratio * 1.45, .28, .68) : .55;
    const cx = face?.x ?? .45;
    const offset = face ? face.width * .8 : .25;
    const y = face ? clamp(face.y + face.height * .45, .3, .84) : .72;
    const mode = phase % 4;
    const size = mode === 1 ? span * .72 : mode === 3 && face ? span * .82 : span;
    // Closed hands held beside the face need a region between the high and
    // low probes; oversized regions can misread the raised finger.
    const cy = mode === 2 ? clamp(y - span * .55, .2, .75) : mode === 3 ? clamp(y - span * .275, .25, .8) : y;
    return [-1, 1].map(side => ({ xCenter: clamp(cx + side * offset, .1, .9), yCenter: cy, width: size, height: size * ratio, rotation: 0 }));
  }
  function valid(hand) {
    return hand?.handScore >= .8 && hand.landmarks?.length === 21 &&
      hand.landmarks.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }
  function duplicate(a, b) {
    if (!a || !b) return false;
    const distance = [0,5,9,13,17].reduce((sum,i) => sum + Math.hypot(a[i].x-b[i].x,a[i].y-b[i].y),0)/5;
    const span = Math.max(Math.hypot(a[5].x-a[17].x,a[5].y-a[17].y),Math.hypot(b[5].x-b[17].x,b[5].y-b[17].y));
    return distance < Math.max(.018, span * .3);
  }
  function trackedRegion(slot, now, width, height, recovery = false) {
    const roi=slot.roi;if(!roi||!Number.isFinite(slot.seenAt)||!Number.isFinite(now)||now<slot.seenAt||now-slot.seenAt>650||
      ![roi.xCenter,roi.yCenter,roi.width,roi.height,roi.rotation].every(Number.isFinite)||roi.width<=0||roi.height<=0)return null;
    const age=Math.max(0,now-slot.seenAt),previous=slot.previous;
    let dx=0,dy=0;
    if(previous&&slot.seenAt>previous.time&&slot.seenAt-previous.time<=350){
      const horizon=Math.min(age,160)/(slot.seenAt-previous.time);
      dx=clamp((roi.xCenter-previous.roi.xCenter)*horizon,-roi.width*.45,roi.width*.45);
      dy=clamp((roi.yCenter-previous.roi.yCenter)*horizon,-roi.height*.45,roi.height*.45);
    }
    if(recovery){dx=0;dy=0;}
    const growth=recovery?1.25:1+Math.min(.18,Math.hypot(dx/roi.width,dy/roi.height)*.25);
    const span=clamp(roi.width*growth,.08,1.35),ratio=width/height;
    return {...roi,xCenter:clamp(roi.xCenter+dx,-.05,1.05),yCenter:clamp(roi.yCenter+dy,-.05,1.05),width:span,height:span*ratio};
  }
  function consistent(hand,slot,now,width,height){
    if(!slot.points||now-slot.seenAt>350)return true;
    const ratio=width/height,distance=(a,b)=>Math.hypot((a.x-b.x)*ratio,a.y-b.y);
    const shape=points=>[5,9,13,17].reduce((sum,i)=>sum+distance(points[0],points[i]),0)/4/Math.max(.005,distance(points[5],points[17]));
    const previous=shape(slot.points),current=shape(hand.landmarks),change=current/previous;
    return Number.isFinite(change)&&change>=.45&&change<=2.2;
  }
  function remember(slot,roi,time,points){slot.previous=slot.roi&&Number.isFinite(slot.seenAt)?{roi:slot.roi,time:slot.seenAt}:null;slot.roi=roi;slot.seenAt=time;slot.points=points;slot.misses=0;}
  function forget(slot){slot.roi=null;slot.previous=null;slot.points=null;slot.seenAt=undefined;slot.misses=0;}
  return { seeds, valid, duplicate, trackedRegion, consistent, remember, forget };
})();
