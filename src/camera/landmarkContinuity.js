const GROUPS=[['faceLandmarks','faceTime'],['leftHandLandmarks','handTime'],['rightHandLandmarks','handTime']];
const HANDS=['leftHandLandmarks','rightHandLandmarks'];
const valid=points=>points?.length&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
const centre=points=>{
  const palm=[0,5,9,13,17].map(i=>points[i]||points[0]);
  return {x:palm.reduce((sum,p)=>sum+p.x,0)/5,y:palm.reduce((sum,p)=>sum+p.y,0)/5};
};
const alpha=(cutoff,seconds)=>1/(1+1/(2*Math.PI*cutoff*seconds));

// Assign colors using the motion of both palms together, not the model's
// frame-by-frame Left/Right guess. Prediction is used ONLY to associate real
// observations: neither extrapolated nor retained points reach recognition.
function associateHands(result,groups,time,maximumAgeMs){
  const incoming=HANDS.filter(name=>valid(result[name])).map(name=>({name,points:result[name],position:centre(result[name])}));
  const tracks=HANDS.filter(name=>{const row=groups.get(name);return row&&time>=row.detectedAt&&time-row.detectedAt<=maximumAgeMs;});
  if(!incoming.length||!tracks.length)return new Map(incoming.map(row=>[row.name,row.points]));
  const cost=(name,row)=>{
    const track=groups.get(name),horizon=Math.min(120,Math.max(0,time-track.detectedAt))/1000;
    const dx=Math.max(-.15,Math.min(.15,(track.velocity?.x||0)*horizon));
    const dy=Math.max(-.15,Math.min(.15,(track.velocity?.y||0)*horizon));
    return Math.hypot(row.position.x-track.position.x-dx,row.position.y-track.position.y-dy);
  };
  if(tracks.length===2&&incoming.length===2){
    const direct=cost(HANDS[0],incoming[0])+cost(HANDS[1],incoming[1]);
    const swapped=cost(HANDS[0],incoming[1])+cost(HANDS[1],incoming[0]);
    const ordered=swapped<direct?[incoming[1],incoming[0]]:incoming;
    return new Map(HANDS.map((name,i)=>[name,ordered[i].points]));
  }
  if(incoming.length===1){
    const row=incoming[0],name=tracks.reduce((best,next)=>cost(next,row)<cost(best,row)?next:best,tracks[0]);
    // After a discontinuity, a newly entering hand may belong to the other side.
    return new Map([[cost(name,row)<.25?name:row.name,row.points]]);
  }
  const name=tracks[0],i=cost(name,incoming[0])<=cost(name,incoming[1])?0:1;
  return new Map([[name,incoming[i].points],[HANDS.find(side=>side!==name),incoming[1-i].points]]);
}
// Visual continuity only. Callers must use the original fresh detector results
// for recording guards, training features and recognition, never this cache.
export function createLandmarkContinuity({holdMs=140,maximumAgeMs=600,minCutoff=2,beta=35,derivativeCutoff=2}={}){
  const groups=new Map();let latest={};
  function update(result,now){
    latest=result;
    const hands=associateHands(result,groups,result.handTime,maximumAgeMs);
    for(const [name,clock] of GROUPS){const time=result[clock];if(!Number.isFinite(time)||time>now)continue;
      const previous=groups.get(name);if(previous&&time<=previous.observedAt)continue;
      const points=clock==='handTime'?hands.get(name):result[name];
      if(!points?.length){if(previous)groups.set(name,{...previous,observedAt:time,missingAt:previous.missingAt??now});continue;}
      if(!valid(points)){if(previous)groups.set(name,{...previous,observedAt:time,missingAt:previous.missingAt??now});continue;}
      const dt=previous?time-previous.detectedAt:Infinity,seconds=dt/1000;
      const jump=previous?Math.hypot(points[0].x-previous.rawPoints[0].x,points[0].y-previous.rawPoints[0].y):Infinity;
      const continuous=previous&&dt>0&&dt<=200&&jump<.12&&points.length===previous.points.length;
      const derivatives=[];
      // Speed-adaptive (One Euro) filtering per landmark: stationary fingers
      // get stronger filtering; each moving fingertip responds independently.
      const smoothed=points.map((point,i)=>{
        if(!continuous){derivatives.push({x:0,y:0,z:0});return {...point};}
        const old=previous.points[i],raw=previous.rawPoints[i],prior=previous.derivatives[i],d=alpha(derivativeCutoff,seconds);
        const velocity={};for(const axis of ['x','y','z'])velocity[axis]=prior[axis]+d*((point[axis]-raw[axis])/seconds-prior[axis]);
        derivatives.push(velocity);
        const weight=alpha(minCutoff+beta*Math.hypot(velocity.x,velocity.y),seconds);
        return {x:old.x+(point.x-old.x)*weight,y:old.y+(point.y-old.y)*weight,z:old.z+(point.z-old.z)*weight};
      });
      const position=centre(points),velocity={x:0,y:0};
      if(continuous)for(const axis of ['x','y'])velocity[axis]=.5*(previous.velocity?.[axis]||0)+.5*(position[axis]-previous.position[axis])/seconds;
      groups.set(name,{points:smoothed,rawPoints:points.map(p=>({...p})),derivatives,position,velocity,detectedAt:time,observedAt:time,missingAt:null});
    }
  }
  function frame(now){const result={...latest,overlayAlpha:{}};
    for(const [name] of GROUPS){const group=groups.get(name),age=group?now-group.detectedAt:Infinity;
      const missingFor=group?.missingAt!==null&&group?.missingAt!==undefined?Math.max(0,now-group.missingAt):0;
      const alpha=age>=0&&age<=maximumAgeMs&&missingFor<holdMs?1-missingFor/holdMs:0;
      result[name]=alpha>0?group.points:undefined;result.overlayAlpha[name]=alpha;
    }return result;
  }
  return {update,frame,clear(){groups.clear();latest={};}};
}
