const GROUPS=[['faceLandmarks','faceTime'],['leftHandLandmarks','handTime'],['rightHandLandmarks','handTime']];
// Visual continuity only. Callers must use the original fresh detector results
// for recording guards, training features and recognition, never this cache.
export function createLandmarkContinuity({holdMs=140,maximumAgeMs=600,smoothingMs=25}={}){
  const groups=new Map();let latest={};
  function update(result,now){
    latest=result;
    for(const [name,clock] of GROUPS){const time=result[clock];if(!Number.isFinite(time)||time>now)continue;
      const previous=groups.get(name);if(previous&&time<=previous.observedAt)continue;
      const points=result[name];
      if(!points?.length){if(previous)groups.set(name,{...previous,observedAt:time,missingAt:previous.missingAt??now});continue;}
      const valid=points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));if(!valid){if(previous)groups.set(name,{...previous,observedAt:time,missingAt:previous.missingAt??now});continue;}
      const dt=previous?time-previous.detectedAt:Infinity,jump=previous?Math.hypot(points[0].x-previous.points[0].x,points[0].y-previous.points[0].y):Infinity;
      const weight=previous&&dt>0&&dt<=200&&jump<.12?1-Math.exp(-dt/smoothingMs):1;
      const smoothed=points.map((point,i)=>{const old=previous?.points[i];return old?{x:old.x+(point.x-old.x)*weight,y:old.y+(point.y-old.y)*weight,z:old.z+(point.z-old.z)*weight}:{...point};});
      groups.set(name,{points:smoothed,detectedAt:time,observedAt:time,missingAt:null});
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
