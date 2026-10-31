import {createClient} from 'npm:@supabase/supabase-js@2.110.7';
import {approvedRecordingFeatures} from '../../../src/training/approvedVocabulary.js';
import {handSequence,prepareSequenceSearch,searchSequenceDistances,rankSequenceDistances} from '../../../src/training/sequenceCandidate.js';
import {createCatalogueResolver} from '../../../src/training/recognitionCatalog.js';
import {prepareControlledModel,reflectHandSequence,validHandSequence} from '../../../src/training/controlledModel.js';
import {digestText,encodeRuntimePackage,decodeRuntimePackage} from '../../../src/training/runtimePackage.js';
import {loadRecordingObject} from '../_shared/recordingObjects.ts';

declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void};
const origins=new Set(['https://deafapps.com','https://www.deafapps.com','https://deafapp-lsch.deafapp-lsch.workers.dev']);
const localOrigin=(origin:string)=>/^http:\/\/(localhost|127\.0\.0\.1):\d{4,5}$/.test(origin);
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
async function rpc(name:string,args:Record<string,unknown>={}){
  const {data,error}=await db.rpc(name,args);if(error)throw Object.assign(Error('No se pudo completar la preparación.'),{code:error.code});
  if(data?.ok!==true)throw Error('La preparación devolvió un resultado no válido.');return data;
}
async function loadSequences(job:string,ids:string[]){
  const result=new Map();for(let i=0;i<ids.length;i+=100){
    const data=await rpc('deafapp_runtime_features',{p_job:job,p_ids:ids.slice(i,i+100)});
    for(const row of data.rows){if(!validHandSequence(row.sequence))throw Error('La referencia preparada no es válida.');result.set(row.id,row.sequence.map((frame:number[])=>Float32Array.from(frame)));}
  }
  if(result.size!==new Set(ids).size)throw Object.assign(Error('Las aprobaciones cambiaron.'),{code:'40001'});return result;
}
async function prepareFeature(row:any,targets:any[]){
  const classId=`${row.category}/${row.label}`;
  try{
    if(typeof row.path!=='string'||row.path.startsWith('/')||row.path.includes('..')||!row.path.endsWith('.json'))throw Error('invalid-storage-path');
    const location=await rpc('deafapp_storage_server_location',{p_path:row.path});
    const bytes=await loadRecordingObject(db,location);
    if(bytes.length>25_000_000)throw Error('oversized-recording');
    const recording=JSON.parse(new TextDecoder().decode(bytes));
    const features=approvedRecordingFeatures({...row,status:'approved'},recording,targets);
    const sequence=handSequence(features.features).map(frame=>Array.from(Float32Array.from(frame)));
    if(!validHandSequence(sequence))throw Error('missing-tracking');
    const feature={id:row.id,classId:features.classId,hash:await digestText(JSON.stringify(sequence)),sequence,sequenceValid:true,
      durationMs:features.durationMs,expiresAt:features.expiresAt||null,
      origin:recording.training?.participantId?(await digestText(String(recording.training.participantId))).slice(0,24):null};
    return {id:row.id,version:row.version,path:row.path,classId,feature,error:null,expiresAt:features.expiresAt||null};
  }catch(error){
    const reason=error instanceof Error?error.message:'missing-tracking';
    const known=['invalid-storage-path','download-failed','oversized-recording','not-approved-or-outside-catalog','label-mismatch','not-lsch','expired-recording','missing-tracking','requires-source-review','repeated-tracking'];
    return {id:row.id,version:row.version,path:row.path,classId,feature:null,error:known.includes(reason)?reason:'insufficient-tracking-or-motion',expiresAt:null};
  }
}
async function build(job:any){
  const samples:any[]=[],uncached:any[]=[],approved=new Map(),exclusions=new Map();let catalogue:any[]=[],resolve:(id:string)=>string|null=()=>null;
  for(let offset=0;offset<100000;offset+=50){
    const data=await rpc('deafapp_runtime_inputs',{p_job:job.job,p_offset:offset});
    if(data.catalogRevision!==job.catalogRevision||data.sourceRevision!==job.sourceRevision)throw Object.assign(Error('Las aprobaciones cambiaron.'),{code:'40001'});
    if(offset===0){catalogue=data.catalogue||[];resolve=createCatalogueResolver(catalogue);}
    for(const row of data.rows){
      const classId=resolve(`${row.category}/${row.label}`);if(!classId)continue;
      approved.set(classId,(approved.get(classId)||0)+1);
      if(!row.cached){if(uncached.length<16)uncached.push(row);continue;}
      if(row.feature)samples.push({...row.feature,id:row.id,role:row.role,person:row.person,personConfirmed:row.personConfirmed});
      else{const key=`${classId}:${row.error||'missing-tracking'}`;exclusions.set(key,(exclusions.get(key)||0)+1);}
    }
    if(uncached.length===16)break;
    if(offset+data.rows.length>=data.total)break;if(!data.rows.length)throw Error('La biblioteca no pudo leerse por completo.');
    if(offset===99950)throw Error('La biblioteca supera el límite de esta preparación.');
  }
  if(uncached.length){
    const targets=catalogue.map(row=>({classId:row.classId,category:row.category,label:row.label})),results=[];
    for(let i=0;i<uncached.length;i+=4)results.push(...await Promise.all(uncached.slice(i,i+4).map(row=>prepareFeature(row,targets))));
    await rpc('deafapp_runtime_cache',{p_job:job.job,p_rows:results});
    await rpc('deafapp_runtime_complete',{p_job:job.job,p_catalog_revision:job.catalogRevision,p_source_revision:job.sourceRevision});return;
  }
  const variants=[];
  for(let offset=0;offset<200000;offset+=500){const data=await rpc('deafapp_runtime_variants',{p_job:job.job,p_offset:offset});variants.push(...data.rows);if(data.rows.length<500)break;if(offset===199500)throw Error('Demasiadas variantes para esta preparación.');}
  const result=await prepareControlledModel(catalogue,samples,{sourceRevision:`${job.catalogRevision}:${job.sourceRevision}`,evaluate:false,allowMetadataOnly:true,variants,
    loadSequences:(ids:string[])=>loadSequences(job.job,ids)});
  const usableCounts=new Map();for(const sample of samples){const id=resolve(sample.classId);usableCounts.set(id,(usableCounts.get(id)||0)+1);}
  const coverage=result.coverage.map(row=>({...row,approved:approved.get(row.classId)||0,excluded:(approved.get(row.classId)||0)-(usableCounts.get(row.classId)||0),
    exclusions:[...exclusions].filter(([key])=>key.startsWith(row.classId+':')).map(([key,count])=>({reason:key.slice(row.classId.length+1),count}))}));
  const model=result.model?{...result.model,references:result.model.references.map(({recordingId,...row}:any)=>row)}:null;
  const packet=await encodeRuntimePackage(model),previewEnabled=result.coverage.filter((row:any)=>row.ready&&['enabled','testing'].includes(row.state)).map((row:any)=>row.classId);
  await rpc('deafapp_runtime_complete',{p_job:job.job,p_catalog_revision:job.catalogRevision,p_source_revision:job.sourceRevision,p_result:{
    packet,previewPacket:model?{id:model.id+'-preview',enabledClasses:previewEnabled.length>=2?previewEnabled:model.enabledClasses,evaluationEnabledClasses:result.evaluationEnabledClasses}:null,
    modelId:model?.id||null,coverage,expiresAt:result.expiresAt||null,evaluationPlan:result.evaluationPlan||[]}});
}
async function evaluate(job:any){
  const data=await rpc('deafapp_runtime_evaluation',{p_job:job.job}),model=await decodeRuntimePackage(data.packet);
  if(!model||!data.rows.length)throw Error('No hay un candidato disponible para evaluar.');
  model.enabledClasses=data.enabledClasses;const index=prepareSequenceSearch(model),sequences=await loadSequences(job.job,data.rows.map((row:any)=>row.id));
  const results=data.rows.map((row:any)=>{const query=sequences.get(row.id),prediction=rankSequenceDistances(model,searchSequenceDistances(model,query,reflectHandSequence(query),index));
    return {id:row.id,prediction:prediction.accepted?prediction.classId:null};});
  await rpc('deafapp_runtime_evaluation_complete',{p_job:job.job,p_model_id:data.modelId,p_rows:results});
}
async function run(job:any){
  try{if(job.kind==='evaluation')await evaluate(job);else await build(job);}
  catch(error){
    console.error('recognition-runtime job failed',error instanceof Error?error.name:'Error');
    try{await rpc('deafapp_runtime_complete',{p_job:job.job,p_catalog_revision:job.catalogRevision,p_source_revision:job.sourceRevision,
      ...((error as any)?.code==='40001'?{}:{p_error:error instanceof Error?error.message.slice(0,300):'No se pudo preparar el modelo.'})});}catch{/* The next lease recovers a worker that was replaced. */}
  }
}
Deno.serve(async(request:Request)=>{
  const origin=request.headers.get('origin'),headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'};
  if(origin&&(origins.has(origin)||localOrigin(origin)))headers['Access-Control-Allow-Origin']=origin;
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!origins.has(origin)&&!localOrigin(origin))return reply({error:'Origen no permitido.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Método no permitido.'},405);
  if(Number(request.headers.get('content-length')||0)>1024)return reply({error:'Solicitud demasiado grande.'},413);
  try{
    const text=await request.text();if(text.length>1024)return reply({error:'Solicitud demasiado grande.'},413);
    const body=JSON.parse(text);if(body.action!=='refresh'||Object.keys(body).some(key=>key!=='action'))return reply({error:'Acción no permitida.'},400);
    // A public caller can only wake a dirty job. The database grants the lease,
    // owns all inputs and accepts cache/model writes only from the service role.
    const job=await rpc('deafapp_runtime_claim');if(job.job)EdgeRuntime.waitUntil(run(job));
    return reply({ok:true,preparing:!!job.job},202);
  }catch{return reply({error:'La preparación no está disponible. Inténtalo de nuevo.'},503);}
});
