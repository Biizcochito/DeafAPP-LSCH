import test from 'node:test';
import assert from 'node:assert/strict';
import {driveCleanupPlan,assertDriveCleanupPlan,assertDriveObject} from '../scripts/recording-migration/driveCleanup.mjs';
const now='2026-10-31T20:00:00Z';
function fixture(){return {project:'https://example.supabase.co',checkedAt:now,manifest:{revision:'1'},errors:[],
 rows:[{id:79,archivo_path:'drive/enviar/seq_0009.json',label:'enviar',categoria:'verbos',moderation_version:1,moderation_status:'approved',aprobada:true}],
 objects:['drive/enviar/seq_0009.json','drive/aceite/seq_0001.json','saludos/hola/web.json'].map((path,id)=>({path,id:'id-'+id,version:'v1',updated_at:now,metadata:{size:100,eTag:'etag'}}))};}
test('Drive cleanup selects only imported files and distinguishes linked rows',()=>{
 const plan=driveCleanupPlan(fixture(),now);assert.equal(plan.files.length,2);assert.equal(plan.linked,1);assert.equal(plan.bytes,200);
 assert.ok(plan.files.every(file=>file.path.startsWith('drive/')));assertDriveCleanupPlan(plan,Date.parse(now));
});
test('ambiguous links, unsafe objects and altered or stale plans fail closed',()=>{
 let inv=fixture();inv.rows.push({...inv.rows[0],id:80});assert.throws(()=>driveCleanupPlan(inv,now),/ambiguo/);
 inv=fixture();inv.objects[0].path='drive/../bad.json';assert.throws(()=>driveCleanupPlan(inv,now),/ambiguo/);
 const plan=driveCleanupPlan(fixture(),now);assert.throws(()=>assertDriveCleanupPlan(plan,Date.parse(now)+86400001),/vencido/);
 plan.files[0].path='saludos/hola/web.json';assert.throws(()=>assertDriveCleanupPlan(plan,Date.parse(now)),/alterado/);
});
test('changed Drive revisions and missing objects block deletion',()=>{
 const inv=fixture(),item=driveCleanupPlan(inv,now).files[0],object=inv.objects[0];assertDriveObject(item,object);
 for(const changed of [{...object,version:'v2'},{...object,metadata:{...object.metadata,size:101}},null])assert.throws(()=>assertDriveObject(item,changed),/Cambió/);
});
