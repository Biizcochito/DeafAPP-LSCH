import {validPath,sha256} from './plan.mjs';

export function driveCleanupPlan(inventory,now=new Date().toISOString()){
 if(inventory.errors?.length||!Array.isArray(inventory.objects)||!Array.isArray(inventory.rows)||!inventory.manifest?.revision)throw Error('Inventario incompleto.');
 const objects=inventory.objects.filter(item=>item.path.startsWith('drive/'));
 if(!objects.length||objects.length>500)throw Error('Revisa el alcance de Drive.');
 const files=objects.map(object=>{
   const rows=inventory.rows.filter(row=>row.archivo_path===object.path);
   if(!validPath(object.path)||rows.length>1||!object.id||!object.version||!object.updated_at||!object.metadata?.eTag||
      !Number.isSafeInteger(object.metadata.size)||object.metadata.size<=0||object.metadata.size>40_000_000)throw Error('Archivo de Drive ambiguo o incompleto.');
   const row=rows[0];
   if(row&&(!/^\d+$/.test(String(row.id))||!Number.isInteger(row.moderation_version)))throw Error('Registro de Drive incompleto.');
   return {path:object.path,objectId:object.id,objectVersion:object.version,updatedAt:object.updated_at,etag:object.metadata.eTag,bytes:object.metadata.size,
     ...(row?{sourceId:String(row.id),sourceVersion:row.moderation_version,label:row.label,category:row.categoria,status:row.moderation_status,approved:row.aprobada}:{sourceId:null})};
 });
 if(new Set(files.map(item=>item.path)).size!==files.length)throw Error('Rutas repetidas.');
 const plan={version:1,scope:'delete-imported-drive-signs-from-project',project:inventory.project,createdAt:now,inventoryAt:inventory.checkedAt,
   files,bytes:files.reduce((sum,item)=>sum+item.bytes,0),linked:files.filter(item=>item.sourceId!==null).length};
 return {...plan,digest:sha256(JSON.stringify(plan))};
}
export function assertDriveCleanupPlan(plan,now=Date.now()){
 if(plan.version!==1||plan.scope!=='delete-imported-drive-signs-from-project'||plan.digest!==sha256(JSON.stringify({...plan,digest:undefined}))||
    !Number.isFinite(Date.parse(plan.createdAt))||now-Date.parse(plan.createdAt)>86_400_000||Date.parse(plan.createdAt)>now+60_000||
    !Array.isArray(plan.files)||!plan.files.length||plan.files.some(item=>!validPath(item.path)||!item.path.startsWith('drive/'))||
    plan.linked!==plan.files.filter(item=>item.sourceId!==null).length||plan.bytes!==plan.files.reduce((sum,item)=>sum+item.bytes,0))throw Error('Plan de Drive alterado o vencido.');
}
export function assertDriveObject(item,object){
 if(!object||object.id!==item.objectId||object.version!==item.objectVersion||object.updated_at!==item.updatedAt||
    object.metadata?.eTag!==item.etag||object.metadata?.size!==item.bytes)throw Error('Cambió el archivo de Drive; se conserva para revisión.');
}
