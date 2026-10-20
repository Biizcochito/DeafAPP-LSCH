// Shared input contract for the private candidates: 32 frames, 171 face-relative coordinates.
import {CATEGORIAS_VISIBLES} from '../signCatalog.js';
export const PHRASES = CATEGORIAS_VISIBLES.find(category=>category.id==='oraciones').señas.map(label=>`oraciones/${label}`);
export const FACE_INDICES = [70,63,105,66,107,336,296,334,293,300,33,160,158,133,153,144,362,385,387,263,373,380,1,2,98,327,61,291,0,17,39,269,78,308,14,317,234,454,10,338,152,175];

export function trackingVector(result, width, height) {
  const face = result?.faceLandmarks, aspect = width / height;
  if (!face?.[454] || !Number.isFinite(aspect) || aspect <= 0) return null;
  const nose = face[1], distance = Math.hypot((face[234].x-face[454].x)*aspect, face[234].y-face[454].y);
  if (distance < .02) return null;
  const groups = [result.leftHandLandmarks, result.rightHandLandmarks, FACE_INDICES.map(i=>face[i])];
  const vector = groups.flatMap((group,g)=>Array.from({length:g<2?21:42},(_,i)=>group?.[i] ? [(group[i].x-nose.x)*aspect/distance,(group[i].y-nose.y)/distance] : [0,0]).flat());
  vector.push(...groups.map(group=>Number(!!group?.length)));
  return vector.every(v=>Number.isFinite(v)&&Math.abs(v)<=50) ? vector : null;
}

export function captureFeatures(frames, {wholePhrase=false}={}) {
  if (!Array.isArray(frames) || frames.length<12 || frames.length>200) throw Error('Faltan imágenes con seguimiento. Repite la toma.');
  let previous=-1;
  for (const frame of frames) {
    if (!Number.isFinite(frame.timeMs)||frame.timeMs<=previous||frame.timeMs<0||frame.timeMs>6500) throw Error('Los tiempos de la captura no son válidos.');
    previous=frame.timeMs;
    if (frame.vector!==null && (!Array.isArray(frame.vector)||frame.vector.length!==171||frame.vector.some(v=>!Number.isFinite(v)||Math.abs(v)>50)||frame.vector.slice(168).some(v=>v!==0&&v!==1))) throw Error('Los puntos de la captura no son válidos.');
  }
  if (frames.at(-1).timeMs-frames[0].timeMs<(wholePhrase?1800:800)) throw Error('Haz el movimiento completo durante la captura.');
  const usable=frames.filter(f=>f.vector?.[170]===1&&(f.vector[168]||f.vector[169]));
  if (usable.length<12||usable.length/frames.length<.8) throw Error('Mantén la cara y al menos una mano visibles durante la toma.');
  let movement=0;
  for(const offset of [0,42]) {
    const present=usable.filter(f=>f.vector[168+offset/42]);
    for(const axis of [offset,offset+1]) if(present.length) movement=Math.max(movement,Math.max(...present.map(f=>f.vector[axis]))-Math.min(...present.map(f=>f.vector[axis])));
  }
  if(movement<.08) throw Error('Falta movimiento de las manos. Repite la seña u oración completa.');
  const start=usable[0].timeMs, duration=usable.at(-1).timeMs-start;
  return Array.from({length:32},(_,step)=>{
    const target=start+duration*step/31;
    let right=usable.findIndex(f=>f.timeMs>=target); if(right<0)right=usable.length-1;
    const a=usable[Math.max(0,right-1)],b=usable[right],ratio=b.timeMs===a.timeMs?0:(target-a.timeMs)/(b.timeMs-a.timeMs);
    // Interpolate coordinates only while a group is present on both sides.
    return Array.from({length:171},(_,i)=>{
      if(i>=168)return (ratio<.5?a:b).vector[i];
      const mask=i<42?168:i<84?169:170;
      const nearest=(ratio<.5?a:b).vector;
      const value=!nearest[mask]?0:!a.vector[mask]||!b.vector[mask]?nearest[i]:a.vector[i]+(b.vector[i]-a.vector[i])*ratio;
      return Math.floor(value*100000+.5)/100000;
    });
  });
}

export function validateForest(model) {
  if(model?.format!=='deafapp-lsch-python-forest'||model.version!==1||model.inputShape?.join()!=='32,171'||!Array.isArray(model.classes)||model.classes.length<2||!Array.isArray(model.trees)||!model.trees.length||model.trees.length>512) throw Error('Formato de candidato incompatible.');
  if(!Number.isFinite(model.decision?.minimumScore)||!Number.isFinite(model.decision?.minimumMargin))throw Error('Falta la regla de decisión del candidato.');
  for(const tree of model.trees){
    const n=tree.left?.length;
    if(!n||n>10000||['right','feature','threshold','probabilities'].some(key=>tree[key]?.length!==n))throw Error('Árbol incompleto.');
    for(let i=0;i<n;i++){
      if(tree.left[i]===-1){if(tree.probabilities[i]?.length!==model.classes.length||tree.probabilities[i].some(p=>!Number.isFinite(p)||p<0))throw Error('Probabilidades inválidas.');}
      else if(![tree.left[i],tree.right[i]].every(child=>Number.isInteger(child)&&child>i&&child<n)||!Number.isInteger(tree.feature[i])||tree.feature[i]<0||tree.feature[i]>=5472||!Number.isFinite(tree.threshold[i]))throw Error('Nodo inválido.');
    }
  }
  return model;
}

export function predictForest(model, features) {
  if(features?.length!==32||features.some(frame=>frame.length!==171||frame.some(v=>!Number.isFinite(v))))throw Error('Secuencia incompatible.');
  const vector=features.flat().map(Math.fround),probabilities=model.classes.map(()=>0);
  for(const tree of model.trees){let node=0;while(tree.left[node]!==-1)node=vector[tree.feature[node]]<=tree.threshold[node]?tree.left[node]:tree.right[node];tree.probabilities[node].forEach((p,i)=>{probabilities[i]+=p/model.trees.length;});}
  const order=probabilities.map((score,i)=>({score,i})).sort((a,b)=>b.score-a.score),score=order[0].score,margin=score-order[1].score;
  const accepted=score>=model.decision.minimumScore&&margin>=model.decision.minimumMargin;
  return {accepted,classId:accepted?model.classes[order[0].i]:null,score,margin};
}

export async function decodeCandidate(payload) {
  if(payload?.encoding!=='gzip-base64'||typeof payload.data!=='string'||payload.data.length>2_000_000)throw Error('El candidato no está disponible.');
  const bytes=Uint8Array.from(atob(payload.data),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return validateForest(JSON.parse(await new Response(stream).text()));
}
