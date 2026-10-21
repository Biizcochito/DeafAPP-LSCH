import { prepareDataset, auditRecording, TARGET_SIGNS } from './datasetPreparation.js';
const targets=new Set(TARGET_SIGNS.map(s=>s.classId));
export async function listApprovedRows(api,session,signal) {
  const rows=[];
  for(let page=0;page<400;page++){
    if(signal?.aborted)throw new Error('Preparación cancelada.');
    const data=await api.list(session,{status:'approved',page});rows.push(...data.rows);
    if(rows.length>=data.total)return rows;
  }
  throw new Error('Hay demasiadas grabaciones para este análisis del navegador.');
}
export async function buildReviewedBrowserDataset({api,session,client,signal,onProgress=()=>{}}) {
  const rows=await listApprovedRows(api,session,signal), entries=[],excluded=[],approvedCounts={};let bytes=0;
  for(const [index,row] of rows.entries()){
    if(signal?.aborted)throw new Error('Preparación cancelada.');
    onProgress(`Revisando ${index+1} de ${rows.length} grabaciones aprobadas…`);
    const classId=`${row.category}/${row.label}`;approvedCounts[classId]=(approvedCounts[classId]||0)+1;
    try {
      if(!targets.has(classId)){excluded.push({file:row.id,classId,reasons:['unknown-label-or-category']});continue;}
      if(typeof row.path!=='string'||row.path.includes('..')||!row.path.endsWith('.json'))throw new Error('invalid-storage-path');
      const {data,error}=await client.storage.from('contribuciones').download(row.path);
      if(error||!data)throw new Error('download-failed');if(data.size>25_000_000)throw new Error('oversized-recording');
      const recording=JSON.parse(await data.text());
      if(recording.label!==row.label||recording.categoria!=null&&recording.categoria!==row.category)throw new Error('label-mismatch');
      recording.categoria=row.category;
      const entry={recording,serverReview:{approved:true,id:row.id},file:String(row.id)};
      const audit=auditRecording(entry);
      if(!audit.eligible){excluded.push({file:row.id,classId,reasons:audit.reasons});continue;}
      if(bytes+data.size>64_000_000)throw new Error('browser-memory-limit');bytes+=data.size;
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(recording.frames)));
      entry.contentHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');entries.push(entry);
    }catch(e){excluded.push({file:row.id,classId,reasons:[e.message||'unreadable-recording']});}
  }
  if(signal?.aborted)throw new Error('Preparación cancelada.');
  const dataset=prepareDataset(entries);dataset.quarantine.push(...excluded);dataset.report.inputRecordings=rows.length;
  dataset.approvedCounts=approvedCounts;dataset.reviewSnapshot=rows.map(row=>({id:row.id,version:row.version}));
  dataset.createdAt=new Date().toISOString();return dataset;
}
export async function assertReviewSnapshotCurrent(dataset,api,session,signal) {
  if(!dataset.reviewSnapshot)throw new Error('Vuelve a analizar las grabaciones antes de entrenar.');
  const current=new Map((await listApprovedRows(api,session,signal)).map(row=>[String(row.id),row.version]));
  if(dataset.reviewSnapshot.some(row=>!Number.isInteger(row.version)||current.get(String(row.id))!==row.version))throw new Error('Cambió una revisión. Actualiza las muestras antes de entrenar.');
}
