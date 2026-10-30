export const VARIANT_QUANTITIES=[50,100];
export function variantSpecification(index,quantity,parentCount=1){
  if(!VARIANT_QUANTITIES.includes(quantity)||!Number.isInteger(index)||index<0||index>=quantity||!Number.isInteger(parentCount)||parentCount<1||parentCount>3)throw Error('Cantidad de variantes no válida.');
  const parentIndex=index%parentCount,ordinal=Math.floor(index/parentCount),steps=Math.ceil(quantity/parentCount/2)+1;
  const angleDegrees=Number(((ordinal%2===0?1:-1)*(.15+(Math.floor(ordinal/2)+1)/steps*2.85)).toFixed(6));
  return {index:index+1,parentIndex,angleDegrees,transform:'camera-roll-v1',preservesTiming:true};
}
export function validVariantAngle(angle){return Number.isFinite(angle)&&Math.abs(angle)>=.01&&Math.abs(angle)<=3;}
// A constant camera rotation is applied to the whole sequence. Presence masks,
// frame order and every timestamp belong to the original and remain unchanged.
export function rotateVariantSequence(sequence,angleDegrees){
  if(!validVariantAngle(angleDegrees)||!Array.isArray(sequence)||sequence.length<3||sequence.length>32)throw Error('Variante de movimiento no válida.');
  const angle=angleDegrees*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  return sequence.map(frame=>{
    if((!Array.isArray(frame)&&!(frame instanceof Float32Array))||frame.length!==88||!frame.every(Number.isFinite))throw Error('Puntos de variante no válidos.');
    const result=Float32Array.from(frame);
    for(const offset of [0,44])if(frame[offset+42]===1)for(let i=offset;i<offset+42;i+=2){result[i]=frame[i]*cos-frame[i+1]*sin;result[i+1]=frame[i]*sin+frame[i+1]*cos;}
    return result;
  });
}
export function recordingTimeline(payload){
  if(!Array.isArray(payload?.frames)||!payload.frames.length||payload.frames.length>200)throw Error('La grabación no tiene imágenes para revisar.');
  const intervalMs=Number.isFinite(payload.intervalMs)&&payload.intervalMs>=30&&payload.intervalMs<=1000?payload.intervalMs:113;
  const samples=payload.training?.samples;
  const recorded=Array.isArray(samples)&&samples.length===payload.frames.length&&samples.every((row,i)=>Number.isFinite(row.requestedAtMs)&&row.requestedAtMs>=0&&(!i||row.requestedAtMs>=samples[i-1].requestedAtMs));
  const times=recorded?samples.map(row=>row.requestedAtMs-samples[0].requestedAtMs):payload.frames.map((_,i)=>i*intervalMs);
  return {times,intervalMs,durationMs:times.at(-1)+intervalMs,timingSource:recorded?'recorded-timestamps':'recorded-interval'};
}
export function frameAtTime(times,time){let low=0,high=times.length-1;while(low<high){const middle=Math.ceil((low+high)/2);if(times[middle]<=time)low=middle;else high=middle-1;}return low;}
