import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminClient, validAdminSession, recordingPreview, frameDataUri } from '../src/admin/adminClient.js';
import {catalogueSeed} from '../src/training/recognitionCatalog.js';
const session = () => ({ token:'a'.repeat(64), expiresAt:Date.now()+60000 });
test('el cliente autentica en el servidor y no permite operar con sesión vencida', async () => {
  const calls=[];
  const api=createAdminClient({ rpc:async(name,args)=>{ calls.push({name,args});return {data:{ok:true,token:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString()}}; }});
  const active=await api.login('clave-de-prueba');
  assert.equal(validAdminSession(active),true);
  assert.deepEqual(calls[0],{name:'deafapp_admin_login',args:{p_password:'clave-de-prueba'}});
  assert.throws(()=>api.list({...active,expiresAt:0}),/sesión terminó/);
  assert.equal(calls.length,1);
});
test('cada decisión transmite las versiones y falla ante selección duplicada', async () => {
  const calls=[];const api=createAdminClient({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,changed:2}};}});
  await api.review(session(),[{id:'12',version:3},{id:'15',version:0}],'rejected');
  assert.deepEqual(calls[0].args.p_items,[{id:'12',version:3},{id:'15',version:0}]);
  assert.equal(calls[0].args.p_status,'rejected');
  assert.throws(()=>api.review(session(),[{id:'12',version:3},{id:'12',version:3}],'approved'));
  assert.throws(()=>api.review(session(),[{id:'12',version:3}],'delete'));
  assert.equal(calls.length,1);
});
test('errores de autenticación, configuración y conflicto no se presentan como éxito', async () => {
  await assert.rejects(()=>createAdminClient({rpc:async()=>({data:{ok:false,code:'invalid_password'}})}).login('incorrecta'),e=>e.code==='invalid_password');
  await assert.rejects(()=>createAdminClient({rpc:async()=>({error:{code:'PGRST202'}})}).login('cualquiera'),e=>e.code==='not_configured');
  await assert.rejects(()=>createAdminClient({rpc:async()=>({error:{code:'40001'}})}).review(session(),[{id:1,version:0}],'approved'),e=>e.code==='conflict');
  await assert.rejects(()=>createAdminClient({rpc:async()=>({error:{code:'28000'}})}).overview(session()),e=>e.code==='session_expired');
});
test('la paginación incluye todas las categorías y escapa mediante parámetros', async () => {
  let args;const api=createAdminClient({rpc:async(_name,value)=>{args=value;return {data:{ok:true,rows:[]}};}});
  await api.list(session(),{status:'all',page:2,query:"papa%'"});
  assert.equal(args.p_offset,50); assert.equal(args.p_status,'all');assert.equal(args.p_query,"papa%'");
  assert.throws(()=>api.list(session(),{status:'all',page:-1}));
});
test('la vista previa acepta JPEG/PNG antiguos, respeta tiempos y rechaza archivos inseguros', () => {
  assert.equal(frameDataUri('/9j/AA=='),'data:image/jpeg;base64,/9j/AA==');
  assert.equal(frameDataUri('data:image/png;base64,iVBORw0KGgo='),'data:image/png;base64,iVBORw0KGgo=');
  const preview=recordingPreview({frames:['/9j/AA=='],intervalMs:120,frameAspectRatio:9/16});
  assert.equal(preview.intervalMs,120);assert.equal(preview.aspectRatio,9/16);
  assert.equal(frameDataUri('data:image/svg+xml;base64,AAAA'),null);
  assert.throws(()=>recordingPreview({frames:['javascript:alert(1)']}));
});
test('el catálogo y las asignaciones conservan sesión, versiones y aprobación explícita del prototipo',async()=>{
  const calls=[],api=createAdminClient({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}};}}),entry=catalogueSeed()[0];
  await api.saveVocabulary(session(),entry,{isNew:true,acknowledgePrototype:true});assert.equal(calls[0].args.p_version,-1);assert.equal(calls[0].args.p_ack_prototype,true);assert.match(calls[0].args.p_token,/^[a-f0-9]{64}$/);
  await api.vocabularySamples(session(),entry.classId,2);assert.equal(calls[1].args.p_offset,50);
  await api.assignVocabularySample(session(),{id:'13',sourceVersion:4,assignmentVersion:2,role:'evaluation',person:' P01 ',personConfirmed:true});assert.equal(calls[2].args.p_person,'P01');assert.equal(calls[2].args.p_source_version,4);assert.equal(calls[2].args.p_version,2);
  assert.throws(()=>api.assignVocabularySample(session(),{id:'13',sourceVersion:4,assignmentVersion:2,role:'train',person:'',personConfirmed:true}));
  assert.throws(()=>api.saveVocabulary(session(),{...entry,minimum:0}));assert.throws(()=>api.vocabulary({...session(),expiresAt:0}));assert.equal(calls.length,3);
});
test('preparar exige sesión vigente y los conflictos del catálogo nunca se presentan como un guardado',async()=>{
  let invoked=0;const api=createAdminClient({rpc:async()=>({data:{ok:true}}),functions:{invoke:async()=>{invoked++;return {data:{ok:true}};}}});
  await assert.rejects(()=>api.prepareVocabulary({...session(),expiresAt:0}),/sesión terminó/);assert.equal(invoked,0);await api.prepareVocabulary(session());assert.equal(invoked,1);
  const duplicate=createAdminClient({rpc:async()=>({error:{code:'23505'}})});await assert.rejects(()=>duplicate.saveVocabulary(session(),catalogueSeed()[0]),e=>e.code==='duplicate');
});
