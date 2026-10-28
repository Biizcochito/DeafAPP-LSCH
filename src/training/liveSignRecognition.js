import {captureFeatures} from './visibleTraining.js';

const active = vector => Array.isArray(vector) && vector.length===171 && vector[170]===1 &&
  (vector[168]===1 || vector[169]===1);
function movement(frames) {
  let range=0;
  for (const offset of [0,42]) {
    const present=frames.filter(frame=>frame.vector?.[168+offset/42]===1);
    for (const axis of [offset,offset+1]) if (present.length) {
      const values=present.map(frame=>frame.vector[axis]);
      range=Math.max(range,Math.max(...values)-Math.min(...values));
    }
  }
  return range;
}

// A bounded rolling window replaces the manual 3-second countdown + 4-second take.
// The model still sees movement only; no selected recording label is an input.
export function createLiveSignRecognizer({predict,onUpdate,now=()=>performance.now(),intervalMs=150,wholePhrases=false}) {
  let frames=[], lastInput, lastMotion, lastAttempt=-Infinity, busy=false, closed=false, generation=0;
  let proposed=null, presentation='', failure=null;
  function emit(phase,prediction=null,details={}) {
    const key=`${phase}:${prediction?.classId || ''}:${prediction?.reason || ''}`;
    if (key===presentation) return;
    presentation=key; onUpdate({phase,prediction,...details});
  }
  function reset(phase='ready') {
    generation++; frames=[]; lastInput=undefined; lastMotion=undefined; lastAttempt=-Infinity; proposed=null;
    if (!closed) emit(failure?'error':phase,null,failure?{message:failure.message}:{});
  }
  function expire(time=now()) {
    if (!closed && !failure && lastInput!==undefined && time-lastInput>400) reset('position');
  }
  return {
    reset, expire,
    push(frame) {
      if (closed || failure) return;
      if (!active(frame?.vector)) { reset('position'); return; }
      if (!Number.isFinite(frame.timeMs) || lastInput!==undefined && frame.timeMs<=lastInput) return;
      if (lastInput!==undefined && frame.timeMs-lastInput>350) reset('position');
      lastInput=frame.timeMs; lastMotion ??= frame.timeMs;
      frames.push(frame);
      frames=frames.filter(row=>frame.timeMs-row.timeMs<=(wholePhrases?4900:2500)).slice(wholePhrases?-160:-120);
      if (movement(frames.filter(row=>frame.timeMs-row.timeMs<=450))>=.025) lastMotion=frame.timeMs;
      if (frame.timeMs-lastMotion>650) { reset(); return; }
      if (busy || frame.timeMs-lastAttempt<intervalMs) return;
      const windows=[];
      for (const duration of wholePhrases?[900,1500,2400,3600,4800]:[900,1500,2400]) {
        const recent=frames.filter(row=>frame.timeMs-row.timeMs<=duration);
        if (recent.length<12 || recent.at(-1).timeMs-recent[0].timeMs<800) continue;
        // Do not repeat the same short history for every not-yet-full window.
        if (windows.some(window=>window.start===recent[0].timeMs)) continue;
        try {
          windows.push({start:recent[0].timeMs,durationMs:frame.timeMs-recent[0].timeMs,
            features:captureFeatures(recent.map(row=>({...row,timeMs:row.timeMs-recent[0].timeMs})))});
        } catch { /* Partial, static or poorly tracked windows are not predictions. */ }
      }
      if (!windows.length) { if (!proposed) emit('tracking'); return; }
      busy=true; lastAttempt=frame.timeMs;
      const epoch=generation, started=now();
      Promise.resolve().then(()=>predict(windows)).then(({predictions,computeMs})=>{
        if (closed || epoch!==generation) return;
        if (now()-lastInput>400) { reset('position'); return; }
        if (now()-started>600) { proposed=null; emit('tracking'); return; }
        const accepted=predictions.filter((result,index)=>result?.accepted && result.classId &&
          (!result.classId.startsWith('oraciones/')||wholePhrases&&windows[index]?.durationMs>=1800));
        // A full phrase can overlap a short window containing its last word.
        // It still requires a whole-sequence match, never word assembly.
        const phrases=accepted.filter(result=>result.classId.startsWith('oraciones/'));
        const evidence=phrases.length?phrases:accepted;
        const classes=new Set(evidence.map(result=>result.classId));
        if (classes.size!==1) { proposed=null; emit('uncertain'); return; }
        const result=evidence[0], time=now();
        if (proposed?.classId!==result.classId) {
          proposed={classId:result.classId,since:time,count:1}; emit('recognizing'); return;
        }
        proposed.count++;
        if (proposed.count<2 || time-proposed.since<120) return;
        emit('matched',result,{computeMs,responseMs:time-started,evidenceMs:windows[predictions.indexOf(result)]?.durationMs});
      }).catch(error=>{
        if (!closed && epoch===generation) { proposed=null; failure=error; emit('error',null,{message:error.message}); }
      }).finally(()=>{busy=false;});
    },
    close() { if (closed) return; reset('off'); closed=true; },
  };
}
