import {isTrainingCapture} from '../recording/trainingCapture.js';
import {featureVector} from './datasetPreparation.js';
import {captureFeatures} from './visibleTraining.js';
import {canonicalPhraseClassId} from './phraseLabels.js';
import {validSequence} from './sequenceData.js';

const DATABASE='deafapp-approved-vocabulary-v1';
export function approvedVocabularyStore(action,value) {
  return new Promise((resolve,reject)=>{
    const opening=indexedDB.open(DATABASE,1);
    opening.onupgradeneeded=()=>opening.result.createObjectStore('features');
    opening.onerror=()=>reject(Error('No se pudo abrir la caché de grabaciones.'));
    opening.onsuccess=()=>{
      const db=opening.result,tx=db.transaction('features',action==='get'?'readonly':'readwrite'),store=tx.objectStore('features');
      const request=action==='get'?store.get('current'):store.put(value,'current');let result;
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>{db.close();resolve(result||[]);};
      tx.onerror=tx.onabort=()=>{db.close();reject(Error('No se pudo guardar la caché de grabaciones.'));};
    };
  });
}

export function approvedRecordingFeatures(row,recording,targets,now=Date.now()) {
  const classId=canonicalPhraseClassId(`${row.category}/${row.label}`);
  if(row.status!=='approved'||!Number.isInteger(row.version)||!targets.some(target=>target.classId===classId))throw Error('not-approved-or-outside-catalog');
  if(recording?.label!==row.label||recording.categoria!==row.category)throw Error('label-mismatch');
  if(recording.language!=null&&recording.language!=='csg')throw Error('not-lsch');
  const expiresAt=recording.retention?.expiresAt;
  if(expiresAt&&(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=now))throw Error('expired-recording');
  if(!isTrainingCapture(recording.training,recording.frames?.length))throw Error('missing-tracking');
  if(recording.training.source!=='deafapp-camera')throw Error('requires-source-review');
  const samples=recording.training.samples,first=samples[0].requestedAtMs,durationMs=samples.at(-1).requestedAtMs-first;
  if(new Set(samples.filter(sample=>(sample.left||sample.right)&&sample.handAgeMs<=350).map(sample=>sample.handResultAtMs)).size<Math.max(3,Math.ceil(samples.length*.2)))throw Error('repeated-tracking');
  // Normalize only the interpolation clock for long captures. Keep their actual
  // duration as metadata; no timing or independent-person accuracy is invented.
  const scale=Math.min(1,6000/durationMs);
  const frames=samples.map(sample=>({timeMs:(sample.requestedAtMs-first)*scale,
    vector:sample.face&&sample.faceAgeMs>=0&&sample.faceAgeMs<=600
      ?featureVector(sample,{maximumHandAgeMs:350}):null}));
  const wholePhrase=classId.startsWith('oraciones/');
  const features=captureFeatures(frames,{wholePhrase});
  return {id:`approved-${row.id}`,classId,wholePhrase,features,durationMs,split:'train',variant:'original',
    source:'approved-recording',sourceId:String(row.id),sourceVersion:row.version,sourcePath:row.path,
    sourceReview:'approved',participantVerified:false,createdAt:new Date(recording.timestamp||now).toISOString(),
    ...(expiresAt?{expiresAt}:{})};
}

export async function loadApprovedVocabulary({api,session,client,targets,cache=approvedVocabularyStore,signal,onProgress=()=>{}}) {
  const check=()=>{if(signal?.aborted)throw Object.assign(Error('Actualización cancelada.'),{name:'AbortError'});};
  const approved=[],pending=[];let counts={};
  async function list(status,output){
    for(let page=0;page<400;page++){
      check();const data=await api.list(session,{status,page});check();
      if(!Array.isArray(data.rows)||!Number.isInteger(data.total)||data.total<0)throw Error('La lista de grabaciones no es válida.');
      counts=data.counts||counts;output.push(...data.rows);
      if(output.length>=data.total)return;
      if(!data.rows.length)throw Error('No se pudo completar la lista de grabaciones.');
    }
    throw Error('Hay demasiadas grabaciones para actualizar este navegador.');
  }
  await list('approved',approved);
  if(counts.pending>0)await list('pending',pending);
  let previous=[];try{previous=await cache('get');}catch{/* A cache failure must not hide fresh approved recordings. */}
  const old=new Map((Array.isArray(previous)?previous:[]).map(row=>[row.sourceId,row]));
  const rows=[],excluded=[];
  for(const [index,row] of approved.entries()){
    check();const classId=canonicalPhraseClassId(`${row.category}/${row.label}`);
    if(!targets.some(target=>target.classId===classId))continue;
    onProgress(`Preparando grabación ${index+1} de ${approved.length}…`);
    try{
      if(row.status!=='approved'||!Number.isInteger(row.version)||typeof row.path!=='string'||row.path.includes('..')||!row.path.endsWith('.json'))throw Error('invalid-approved-recording');
      const saved=old.get(String(row.id));
      if(saved?.sourceVersion===row.version&&saved.sourcePath===row.path&&saved.classId===classId&&saved.sourceReview==='approved'&&
        (!saved.expiresAt||Date.parse(saved.expiresAt)>Date.now())&&validSequence(saved.features)) {rows.push(saved);continue;}
      const response=await client.storage.from('contribuciones').download(row.path);check();
      if(response.error||!response.data)throw Error('download-failed');
      if(response.data.size>25_000_000)throw Error('oversized-recording');
      const recording=JSON.parse(await response.data.text());check();
      rows.push(approvedRecordingFeatures(row,recording,targets));
    }catch(error){if(error.name==='AbortError')throw error;excluded.push({id:String(row.id),classId,reason:error.message});}
  }
  // Recheck after downloads as a review can change while the library loads.
  const current=[];await list('approved',current);check();
  const reviews=new Map(current.map(row=>[String(row.id),row]));
  const confirmed=rows.filter(row=>{const review=reviews.get(row.sourceId);
    const valid=review?.status==='approved'&&review.version===row.sourceVersion&&review.path===row.sourcePath&&canonicalPhraseClassId(`${review.category}/${review.label}`)===row.classId;
    if(!valid)excluded.push({id:row.sourceId,classId:row.classId,reason:'approval-changed'});return valid;});
  // Persist points only, after checking the current approval and version.
  check();let cacheSaved=true;try{await cache('put',confirmed);}catch{cacheSaved=false;}
  return {rows:confirmed,excluded,approved:current.length,pending:pending.map(row=>({classId:canonicalPhraseClassId(`${row.category}/${row.label}`),id:String(row.id)})),cacheSaved};
}
