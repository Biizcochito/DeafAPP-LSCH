import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {makeSource,makeBackup} from './migrate-recordings-r2.mjs';
import {createTimedFetch} from '../src/recording/recordingSubmission.js';
import {driveCleanupPlan,assertDriveCleanupPlan,assertDriveObject} from './recording-migration/driveCleanup.mjs';
import {sha256} from './recording-migration/plan.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),dir=resolve(root,'.admin-private/storage-migration');
const json=async name=>JSON.parse(await readFile(resolve(dir,name),'utf8'));
async function save(name,value){const file=resolve(dir,name),tmp=`${file}.${randomUUID()}.tmp`;await mkdir(dir,{recursive:true});await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(tmp,file);}
async function optional(name){try{return await json(name);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function result(value){if(value.error)throw Error(`Drive: falló la operación (${value.error.code||'connection'}).`);return value.data;}
const digestRows=rows=>sha256(JSON.stringify([...rows].sort((a,b)=>Number(a.id)-Number(b.id))));
async function main(){
 const command=process.argv[2];if(process.argv.length!==3||!['plan','backup','dry-run','remove','audit'].includes(command))throw Error('Uso: remove-drive-imports.mjs plan|backup|dry-run|remove|audit');
 if(command==='plan'){
   if(await optional('drive-cleanup-plan.json'))throw Error('Ya existe un plan de Drive; no se sobrescribe.');
   const plan=driveCleanupPlan(await json('inventory.json'));await save('drive-cleanup-plan.json',plan);
   console.log(JSON.stringify({command,files:plan.files.length,linkedRows:plan.linked,bytes:plan.bytes,remoteWrites:0}));return;
 }
 const plan=await json('drive-cleanup-plan.json');assertDriveCleanupPlan(plan);
 const source=await makeSource();if(source.project!==plan.project||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Configuración administrativa incompleta.');
 const db=createClient(plan.project,process.env.SUPABASE_SERVICE_ROLE_KEY,{global:{fetch:createTimedFetch(fetch,55_000)},auth:{persistSession:false,autoRefreshToken:false}}),backup=makeBackup(plan.project);
 async function rows(){const all=[];for(let offset=0;offset<10000;offset+=500){const page=result(await db.from('grabaciones').select('*').order('id').range(offset,offset+499));all.push(...page);if(page.length<500)return all;}throw Error('Demasiadas filas.');}
 const linked=plan.files.filter(item=>item.sourceId!==null),ids=new Set(linked.map(item=>item.sourceId));
 async function object(item){const parts=item.path.split('/'),name=parts.pop();return result(await db.storage.from('contribuciones').list(parts.join('/'),{search:name,limit:100})).find(value=>value.name===name);}
 async function untouched(before){const after=await rows(),byId=new Map(after.map(row=>[String(row.id),row]));
   if(before.unaffected.some(row=>!byId.has(String(row.id))||digestRows([row])!==digestRows([byId.get(String(row.id))])))throw Error('Cambió un registro ajeno a Drive.');
   return after;
 }
 const receiptName='drive-cleanup-backup.json',receipt=await optional(receiptName)||{project:plan.project,planDigest:plan.digest,files:[]};
 if(receipt.project!==plan.project||receipt.planDigest!==plan.digest)throw Error('Respaldo de otro plan.');
 if(command==='backup'){
   let before=await optional('drive-cleanup-rows-before.json');
   if(!before){const all=await rows();before={project:plan.project,planDigest:plan.digest,removed:all.filter(row=>ids.has(String(row.id))),unaffected:all.filter(row=>!ids.has(String(row.id)))};
     if(before.removed.length!==linked.length)throw Error('Los registros cambiaron.');await save('drive-cleanup-rows-before.json',before);}
   for(const item of plan.files){
     assertDriveObject(item,await object(item));const original=await source.download(item);JSON.parse(original.toString('utf8'));
     const hash=sha256(original),local=await backup.read(item.path),old=receipt.files.find(file=>file.path===item.path);
     if(local&&sha256(local)!==hash||old&&old.sha256!==hash)throw Error('Respaldo de Drive incompatible.');
     if(!local)await backup.write(item.path,original);assertDriveObject(item,await object(item));
     receipt.files=[...receipt.files.filter(file=>file.path!==item.path),{path:item.path,bytes:item.bytes,sha256:hash}];
     await save(receiptName,receipt);
     if(receipt.files.length%20===0)console.log(JSON.stringify({command,backedUp:receipt.files.length,total:plan.files.length}));
   }
   console.log(JSON.stringify({command,backedUp:receipt.files.length,bytes:plan.bytes,remoteWrites:0}));return;
 }
 if(receipt.files.length!==plan.files.length)throw Error('Primero completa el respaldo privado de Drive.');
 const before=await json('drive-cleanup-rows-before.json');if(before.project!==plan.project||before.planDigest!==plan.digest)throw Error('Referencia incompatible.');
 await untouched(before);
 const stateName='drive-cleanup-removed.json',state=await optional(stateName)||{project:plan.project,planDigest:plan.digest,rowsRemoved:false,files:[]};
 if(state.project!==plan.project||state.planDigest!==plan.digest)throw Error('Comprobante incompatible.');
 if(command==='dry-run'){
   const data=result(await db.rpc('deafapp_remove_drive_imports',{p_items:linked,p_dry_run:true}));
   if(data?.ok!==true||data.sources!==linked.length)throw Error('No se pudo validar el alcance.');
   console.log(JSON.stringify({command,validatedRows:data.sources,files:plan.files.length,noDeletion:true}));return;
 }
 if(command==='remove'){
   for(const batch of ['pilot','inactive-1','inactive-2','inactive-3','inactive-4','inactive-5']){
     const done=await json(`stage-retire-${batch}.json`);if(done.applicationDataUnchanged!==true)throw Error('Primero completa la migración en curso.');
   }
   for(const item of plan.files){const file=receipt.files.find(file=>file.path===item.path),local=await backup.read(item.path);
     if(!file||!local||local.length!==item.bytes||sha256(local)!==file.sha256)throw Error('Respaldo inválido.');}
   if(!state.rowsRemoved){
     const current=await rows(),present=current.filter(row=>ids.has(String(row.id)));
     if(present.length===0){state.rowsRemoved=true;state.reconciled=true;}
     else{
       if(present.length!==linked.length)throw Error('La importación cambió parcialmente; revisar.');
       if(digestRows(present)!==digestRows(before.removed))throw Error('Cambió un registro de Drive.');
       const data=result(await db.rpc('deafapp_remove_drive_imports',{p_items:linked,p_dry_run:false}));
       if(data?.ok!==true||data.removed!==linked.length)throw Error('No se confirmó la eliminación de registros.');
       state.rowsRemoved=true;state.rowsRemovedAt=new Date().toISOString();
     }
     await save(stateName,state);
   }
   for(const item of plan.files){
     if(state.files.some(file=>file.path===item.path))continue;
     const current=await object(item);
     if(!current)throw Error('Falta un objeto sin comprobante; revisar antes de continuar.');
     assertDriveObject(item,current);
     if(result(await db.from('grabaciones').select('id').eq('archivo_path',item.path).limit(1)).length)throw Error('El archivo sigue vinculado a un registro.');
     if(sha256(await source.download(item))!==receipt.files.find(file=>file.path===item.path)?.sha256)throw Error('El archivo de Drive cambió.');
     assertDriveObject(item,await object(item));
     const deleted=result(await db.storage.from('contribuciones').remove([item.path]));
     if(!deleted?.some(file=>file.name===item.path))throw Error('No se confirmó el retiro del archivo.');
     state.files.push({path:item.path,bytes:item.bytes,removedAt:new Date().toISOString()});await save(stateName,state);
     if(state.files.length%10===0)console.log(JSON.stringify({command,removedFiles:state.files.length,total:plan.files.length,freedBytes:state.files.reduce((sum,file)=>sum+file.bytes,0)}));
   }
 }
 const after=await untouched(before);
 if(after.some(row=>ids.has(String(row.id))))throw Error('Quedan registros importados.');
 if(state.files.length!==plan.files.length)throw Error('Quedan archivos de Drive por retirar.');
 for(const item of plan.files)if(await object(item))throw Error('Un archivo de Drive sigue en el origen.');
 const manifest=result(await db.rpc('deafapp_recognition_manifest'));
 await save('drive-cleanup-audit.json',{project:plan.project,checkedAt:new Date().toISOString(),removedRows:linked.length,removedFiles:state.files.length,freedBytes:plan.bytes,unaffectedRows:before.unaffected.length,unaffectedRowsUnchanged:true,manifest});
 console.log(JSON.stringify({command,removedRows:linked.length,removedFiles:state.files.length,freedBytes:plan.bytes,unaffectedRowsUnchanged:true,modelReady:manifest.ready,revision:manifest.revision}));
}
main().catch(error=>{console.error(error?.constructor===Error?error.message:'La limpieza se detuvo; se conserva el respaldo privado.');process.exitCode=1;});
