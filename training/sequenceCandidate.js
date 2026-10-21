import {validSequence,sequenceKey} from './sequenceData.js';

export const SEQUENCE_CANDIDATE_FORMAT='deafapp-lsch-sequence-prototypes';
// Palm-relative hand shape and face-relative wrist position, independent of facial identity.
// Sorting active hands and considering a reflected query tolerates the legacy camera's slot convention.
export function handSequence(features,reflected=false){
 if(!validSequence(features))throw Error('Secuencia incompatible.');
 const out=[];
 for(const frame of features){
  if(frame[170]!==1)continue;
  const order=[0,1].sort((a,b)=>(frame[168+a]?frame[a*42+1]:100)-(frame[168+b]?frame[b*42+1]:100));
  if(!frame[168+order[0]]||frame[order[0]*42+1]>2.5)continue;
  const vector=[];
  for(const hand of order){
   // A resting hand below the active signing area is not evidence of a different sign.
   if(!frame[168+hand]||frame[hand*42+1]>2.5){vector.push(...Array(44).fill(0));continue;}
   const offset=hand*42,x=frame[offset],y=frame[offset+1],scale=Math.max(.1,Math.hypot(frame[offset+18]-x,frame[offset+19]-y)),sign=reflected?-1:1;
   vector.push(x*.5*sign,y*.5);
   for(let point=1;point<21;point++)vector.push((frame[offset+point*2]-x)/scale/Math.sqrt(20)*sign,(frame[offset+point*2+1]-y)/scale/Math.sqrt(20));
   vector.push(1,0);
  }
  out.push(vector);
 }
 return out;
}
export function sequenceDistance(a,b){
 if(!a.length||!b.length)return Infinity;
 let previous=Array(b.length+1).fill(Infinity);previous[0]=0;
 for(const frame of a){const current=Array(b.length+1).fill(Infinity);
  for(let j=1;j<=b.length;j++){let cost=0;for(let k=0;k<88;k++)cost+=(frame[k]-b[j-1][k])**2;current[j]=cost+Math.min(previous[j],current[j-1],previous[j-1]);}previous=current;
 }
 return previous[b.length]/(a.length+b.length);
}
export function validateSequenceCandidate(model){
 if(model?.format!==SEQUENCE_CANDIDATE_FORMAT||model.version!==1||model.inputShape?.join()!=='32,171'||!Array.isArray(model.classes)||model.classes.length<2||model.classes.length>33||new Set(model.classes).size!==model.classes.length||model.classes.some(id=>typeof id!=='string')||!Array.isArray(model.references)||!model.references.length||model.references.length>200)throw Error('Candidato temporal incompatible.');
 if(!Number.isFinite(model.decision?.maximumDistance)||model.decision.maximumDistance<=0||model.decision.maximumDistance>2||!Number.isFinite(model.decision.minimumRelativeMargin)||model.decision.minimumRelativeMargin<0||model.decision.minimumRelativeMargin>=1)throw Error('Falta la regla de decisión temporal.');
 for(const row of model.references){if(!model.classes.includes(row.classId)||typeof row.parentHash!=='string'||!Array.isArray(row.sequence)||row.sequence.length<3||row.sequence.length>32||row.sequence.some(frame=>!Array.isArray(frame)||frame.length!==88||frame.some(v=>!Number.isFinite(v)||Math.abs(v)>100)))throw Error('Referencia temporal incompatible.');}
 if(model.enabledClasses&&(!Array.isArray(model.enabledClasses)||model.enabledClasses.length<2||model.enabledClasses.some(id=>!model.classes.includes(id))))throw Error('Clases habilitadas incompatibles.');
 if(model.classes.some(id=>!model.references.some(row=>row.classId===id)))throw Error('Faltan referencias de una clase.');
 return model;
}
export function predictSequenceCandidate(model,features){
 const query=handSequence(features),reflection=handSequence(features,true);
 if(query.length<3)return {accepted:false,classId:null,suggestedClassId:null,reason:'no-active-hands',candidates:[]};
 const distances=new Map(model.classes.map(id=>[id,Infinity]));
 for(const row of model.references){const distance=Math.min(sequenceDistance(query,row.sequence),sequenceDistance(reflection,row.sequence));distances.set(row.classId,Math.min(distances.get(row.classId),distance));}
 const ranked=[...distances].map(([classId,distance])=>({classId,distance,similarity:1/(1+distance)})).sort((a,b)=>a.distance-b.distance),first=ranked[0],second=ranked[1];
 const margin=(second.distance-first.distance)/Math.max(second.distance,1e-9),near=first.distance<=model.decision.maximumDistance,clear=margin>=model.decision.minimumRelativeMargin,enabled=!model.enabledClasses||model.enabledClasses.includes(first.classId),accepted=near&&clear&&enabled;
 return {accepted,classId:accepted?first.classId:null,suggestedClassId:first.classId,distance:first.distance,score:first.similarity,margin,reason:!enabled?'unsupported-sign':!near?'outside-reference':!clear?'ambiguous':'matched',candidates:ranked.slice(0,3),scoreKind:'similarity'};
}
// Export only genuine original training sequences. Every reserved hash/sequence is excluded globally.
export function sequenceReferences(rows,{reservedHashes=[]}={}){
 const reserved=new Set([...reservedHashes,...rows.filter(row=>row.split==='evaluation').map(row=>row.parentHash)]),parentLabels=new Map(),reservedFeatures=new Set(rows.filter(row=>row.split==='evaluation').map(row=>sequenceKey(row.features)).filter(Boolean));
 for(const row of rows){if(row.split!=='train')continue;if(!parentLabels.has(row.parentHash))parentLabels.set(row.parentHash,new Set());parentLabels.get(row.parentHash).add(row.classId);}
 const seen=new Map(),parents=new Set(),conflicts=new Set();
 for(const row of rows){
  if(row.split!=='train'||row.variant!=='original'||typeof row.parentHash!=='string'||reserved.has(row.parentHash)||parentLabels.get(row.parentHash)?.size>1||!validSequence(row.features)||reservedFeatures.has(sequenceKey(row.features)))continue;
  const key=sequenceKey(row.features),existing=seen.get(key);if(existing&&existing.classId!==row.classId)conflicts.add(key);else if(!existing)seen.set(key,row);
 }
 return [...seen].filter(([key,row])=>{if(conflicts.has(key)||parents.has(row.parentHash))return false;parents.add(row.parentHash);return true;}).map(([,row])=>({classId:row.classId,parentHash:row.parentHash,recordingId:row.recordingId,sequence:handSequence(row.features)})).filter(row=>row.sequence.length>=3);
}

export async function createPersonalSignCandidate(rows,allowedClasses){
 const allowed=new Set(allowedClasses),prepared=[];
 for(const row of rows){if(!validSequence(row.features)||row.split!=='evaluation'&&(row.wholePhrase!==false||!allowed.has(row.classId)))continue;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sequenceKey(row.features))),parentHash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  prepared.push({...row,parentHash,recordingId:row.id,variant:'original'});
 }
 const references=sequenceReferences(prepared),classes=[...new Set(references.map(row=>row.classId))].filter(id=>references.filter(row=>row.classId===id).length>=3);
 if(classes.length<2)throw Error('Guarda tres tomas distintas de al menos dos señas, por ejemplo hola y agua.');
 const selected=references.filter(row=>classes.includes(row.classId));
 return validateSequenceCandidate({format:SEQUENCE_CANDIDATE_FORMAT,version:1,id:crypto.randomUUID().replaceAll('-',''),inputShape:[32,171],classes,references:selected,decision:{maximumDistance:.35,minimumRelativeMargin:.25},report:{classes,originals:selected.length,accuracy:null,evaluationSamples:0,publicActivation:false,source:'personal-browser-captures'}});
}
