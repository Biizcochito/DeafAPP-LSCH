import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { makeSource, makeBackup, makeDestination } from './migrate-recordings-r2.mjs';
import { selectedBatch, verifyRecordingBytes, sha256 } from './recording-migration/plan.mjs';
import { retireVerifiedSource } from './recording-migration/retire.mjs';
import { createTimedFetch } from '../src/recording/recordingSubmission.js';
import { readLimitedBytes } from '../src/storage/privateRecordingServer.js';
import { createIntegrityGuard } from './recording-migration/integrity.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'.admin-private/storage-migration');
const json=async name=>JSON.parse(await readFile(resolve(dir,name),'utf8'));
async function save(name,value){await mkdir(dir,{recursive:true});const path=resolve(dir,name),tmp=`${path}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(tmp,path);}
async function optional(name){try{return await json(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function need(result){if(result.error||result.data?.ok!==true)throw Error(`Falló una comprobación del servidor (${result.error?.code||'invalid-response'}); se detuvo la etapa.`);return result.data;}
export async function main(argv=process.argv.slice(2)){
 const {positionals,values}=parseArgs({args:argv,allowPositionals:true,options:{batch:{type:'string',default:'pilot'}}});
 const command=positionals[0];if(positionals.length!==1||!['baseline','register','verify','activate','rollback','retire','audit'].includes(command))throw Error('Uso: activate-recordings-r2.mjs baseline|register|verify|activate|rollback|retire|audit --batch pilot');
 const plan=await json('plan.json'),batch=selectedBatch(plan,values.batch),source=await makeSource(),backup=makeBackup(plan.project);
 if(source.project!==plan.project||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Falta la credencial privada del servidor.');
 const db=createClient(plan.project,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:createTimedFetch(fetch,30_000)},auth:{persistSession:false,autoRefreshToken:false}});
 const rpc=async(name,args={})=>need(await db.rpc(name,args));
 const snapshot=async()=>{
   let result=await db.rpc('deafapp_storage_integrity_snapshot');
   // A read-only timeout may be retried once after a busy Nano interval. Never
   // retry registration, activation or source deletion through this path.
   if(result.error?.code==='57014'){
     await new Promise(resolve=>setTimeout(resolve,2000));
     result=await db.rpc('deafapp_storage_integrity_snapshot');
   }
   return need(result);
 };
 if(command==='baseline'){
   if(await optional('integrity-baseline.json'))throw Error('Ya existe una referencia; no se sobrescribe.');
   const data=await snapshot();if(!data.manifest.ready||data.manifest.revision!==plan.catalogueRevision)throw Error('El modelo debe estar listo y sin cambios.');
   await save('integrity-baseline.json',{project:plan.project,checkedAt:new Date().toISOString(),data});
   console.log(JSON.stringify({command,recordings:data.recordings.count,variants:data.variants.count,features:data.features.count,revision:data.manifest.revision,modelReady:true}));return;
 }
 const baseline=await json('integrity-baseline.json');
 if(baseline.project!==plan.project)throw Error('La referencia pertenece a otro proyecto.');
 const integrity=createIntegrityGuard({baseline:baseline.data,snapshot,manifest:()=>source.manifest()});
 if(command==='audit'){await integrity();console.log(JSON.stringify({command,applicationDataUnchanged:true,revision:baseline.data.manifest.revision,recordings:baseline.data.recordings.count,variants:baseline.data.variants.count}));return;}
 await integrity();
 const destination=await makeDestination(),copied=await json(`r2-${destination.account}-${destination.bucket}-${batch.id}.json`);
 if(copied.project!==plan.project||copied.planDigest!==plan.digest||copied.files.length!==batch.count)throw Error('Primero copia y verifica el lote completo.');
 const receiptFor=item=>copied.files.find(file=>file.path===item.path&&file.sourceId===item.sourceId&&file.sourceVersion===item.sourceVersion&&file.bytes===item.bytes);
 async function readBackend(item,copy=false){
   const response=await fetch(`${plan.project}/functions/v1/recording-storage`,{method:'POST',headers:{'content-type':'application/json',apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`},body:JSON.stringify({action:copy?'read-copy':'read',path:item.path}),signal:AbortSignal.timeout(60_000)});
   if(!response.ok)throw Error(`El servidor privado rechazó la lectura (HTTP ${response.status}).`);
   const bytes=Buffer.from(await readLimitedBytes(response,item.bytes));if(bytes.length!==item.bytes||sha256(bytes)!==receiptFor(item)?.sha256)throw Error('Falló la integridad de la lectura privada.');
   const route=await rpc('deafapp_storage_route',{p_path:item.path});return {bytes,provider:route.provider};
 }
 const retiredName=`retired-${batch.id}.json`,retired=await optional(retiredName)||{project:plan.project,planDigest:plan.digest,files:[]};
 if(retired.project!==plan.project||retired.planDigest!==plan.digest)throw Error('Comprobante de retiro incompatible.');
 if(command==='retire'){
   const release=await json('production-readers-verified.json');
   if(release.project!==plan.project||!release.runtimeR2Verified||!release.adminR2Verified||!/^[a-f0-9]{40}$/.test(release.commit)||
      !/^https:\/\/deafapps\.com\/_expo\/static\/js\/web\/[a-zA-Z0-9._-]+\.js$/.test(release.bundleUrl)||!/^[a-f0-9]{64}$/.test(release.bundleSha256))throw Error('Primero publica y comprueba todos los lectores.');
   const bundle=await fetch(release.bundleUrl,{cache:'no-store',signal:AbortSignal.timeout(30_000)});
   if(!bundle.ok||sha256(Buffer.from(await bundle.arrayBuffer()))!==release.bundleSha256)throw Error('No coincide la versión publicada.');
 }
 for(const item of batch.items){
   console.log(JSON.stringify({command,batch:batch.id,checking:batch.items.indexOf(item)+1,total:batch.count}));
   const receipt=receiptFor(item);if(!receipt)throw Error('Falta el comprobante del archivo.');
   if(retired.files.some(file=>file.path===item.path)){
     if(command!=='retire')throw Error('El original ya fue retirado; restaura antes de retroceder.');
     await readBackend(item);continue;
   }
   await source.assertCurrent(item);
   if(command==='register'){
     const local=await backup.read(item.path);if(!local||verifyRecordingBytes(item,local)!==receipt.sha256)throw Error('Respaldo inválido.');
     if(sha256(await destination.download(item.path,item.bytes))!==receipt.sha256)throw Error('Copia inválida.');
     await rpc('deafapp_storage_register_copy',{p_copy:{...item,sha256:receipt.sha256}});
   }else if(command==='verify')await readBackend(item,true);
   else if(command==='activate'||command==='rollback'){
     if(command==='activate')await readBackend(item,true);
     await rpc('deafapp_storage_set_active',{p_path:item.path,p_sha256:receipt.sha256,p_active:command==='activate'});
     const data=await readBackend(item);if(data.provider!==(command==='activate'?'r2':'supabase'))throw Error('Ruta inesperada.');
   }else if(command==='retire'){
     await retireVerifiedSource({item,receipt,backup,source,destination,backend:readBackend,integrity,
       remove:async path=>{const result=await db.storage.from('contribuciones').remove([path]);if(result.error||!result.data?.some(file=>file.name===path))throw Error('El retiro no fue confirmado.');},
       onRemoved:async result=>{retired.files.push(result);await save(retiredName,retired);}});
   }
   await integrity();
   console.log(JSON.stringify({command,batch:batch.id,completed:batch.items.indexOf(item)+1,total:batch.count,retiredBytes:retired.files.reduce((sum,file)=>sum+file.bytes,0)}));
 }
 await integrity(true);
 await save(`stage-${command}-${batch.id}.json`,{project:plan.project,planDigest:plan.digest,command,batch:batch.id,count:batch.count,bytes:batch.bytes,checkedAt:new Date().toISOString(),applicationDataUnchanged:true});
}
main().catch(error=>{console.error(error?.constructor===Error?error.message:'La etapa se detuvo; revisa los comprobantes privados.');process.exitCode=1;});
