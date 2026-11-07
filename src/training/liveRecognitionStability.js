const KEY='deafapp-recognition-stability-v1';
const MAX_CLASSES=1024;
export function readRecognitionStability(storage){try{return JSON.parse((storage||window.localStorage).getItem(KEY));}catch{return null;}}
export function saveRecognitionStability(value,storage){try{(storage||window.localStorage).setItem(KEY,JSON.stringify(value));}catch{/* Recognition also works without storage. */}}

// Measures repeatability of the model output, not independently verified
// accuracy. One whole movement episode can count once, never once per frame.
export function createLiveRecognitionStability({modelId,classes,initial,onChange=()=>{}}){
  const allowed=new Set(classes.slice(0,MAX_CLASSES)),best=new Map(),seen=new Set(),recent=[];
  let previousClass=null,streak=0,episodeMatched=false,episodeActive=false,lastEnd=-Infinity;
  if(initial?.modelId===modelId&&Array.isArray(initial.rows))for(const row of initial.rows.slice(0,MAX_CLASSES)){
    if(allowed.has(row?.classId)&&Number.isInteger(row.bestStreak)&&row.bestStreak>=1&&row.bestStreak<=5)best.set(row.classId,Math.max(best.get(row.classId)||0,row.bestStreak));
  }
  const snapshot=()=>({modelId,rows:[...best].map(([classId,bestStreak])=>({classId,bestStreak}))});
  function resetChain(){previousClass=null;streak=0;episodeMatched=false;episodeActive=false;}
  return {modelId,snapshot,
    update(result){
      const phase=result?.phase;
      if(['off','paused','model','error'].includes(phase)){resetChain();return;}
      if(['position','ready'].includes(phase)){
        if(episodeActive&&!episodeMatched){previousClass=null;streak=0;}
        episodeActive=episodeMatched=false;return;
      }
      if(['tracking','recognizing','uncertain'].includes(phase)){episodeActive=true;return;}
      if(phase!=='matched'||result.prediction?.accepted!==true||!allowed.has(result.prediction.classId)||episodeMatched)return;
      const {segmentId,startTimeMs,endTimeMs}=result;
      if(typeof segmentId!=='string'||!segmentId||seen.has(segmentId)||!Number.isFinite(startTimeMs)||!Number.isFinite(endTimeMs)||endTimeMs<=startTimeMs||startTimeMs<lastEnd)return;
      seen.add(segmentId);recent.push(segmentId);if(recent.length>128)seen.delete(recent.shift());
      episodeActive=episodeMatched=true;lastEnd=endTimeMs;
      const classId=result.prediction.classId;streak=classId===previousClass?Math.min(5,streak+1):1;previousClass=classId;
      if(streak>(best.get(classId)||0)){best.set(classId,streak);onChange(snapshot());}
    },
  };
}
