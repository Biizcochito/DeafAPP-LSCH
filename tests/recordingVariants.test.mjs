import test from 'node:test';
import assert from 'node:assert/strict';
import {variantSpecification,rotateVariantSequence,recordingTimeline,frameAtTime} from '../src/training/recordingVariants.js';
import {prepareControlledModel,reflectHandSequence} from '../src/training/controlledModel.js';
import {prepareSequenceSearch,searchSequenceDistances,rankSequenceDistances} from '../src/training/sequenceCandidate.js';
import {catalogueSeed} from '../src/training/recognitionCatalog.js';
import {encodeRuntimePackage,decodeRuntimePackage} from '../src/training/runtimePackage.js';
import {createMockAdminBackend,MOCK_ADMIN_PASSWORD} from '../src/admin/adminMock.js';
import {createAdminClient} from '../src/admin/adminClient.js';
const seq=c=>Array.from({length:32},(_,t)=>Array.from({length:88},(_,k)=>k<42?c*.5+t*.004+k*.002:k===42?1:0));
test('una toma basta para 50 o 100 variantes deterministas, con hasta tres originales opcionales',()=>{
  for(const quantity of [50,100])for(const count of [1,2,3]){
    const variants=Array.from({length:quantity},(_,i)=>variantSpecification(i,quantity,count));
    assert.equal(new Set(variants.map(v=>`${v.parentIndex}:${v.angleDegrees}`)).size,quantity);
    assert.equal(new Set(variants.map(v=>v.parentIndex)).size,count);
    assert.ok(variants.every(v=>Math.abs(v.angleDegrees)<=3&&v.preservesTiming));
    assert.deepEqual(variants[0],variantSpecification(0,quantity,count));
  }
  for(const args of [[0,3,1],[0,50,0],[0,50,4],[50,50,1]])assert.throws(()=>variantSpecification(...args));
});
test('la rotación conserva el movimiento, las manos ausentes y las máscaras sin mutar el original',()=>{
  const source=seq(1),before=structuredClone(source),rotated=rotateVariantSequence(source,2);
  assert.deepEqual(source,before);assert.equal(rotated.length,source.length);
  for(let i=0;i<source.length;i++){
    assert.equal(rotated[i][42],1);assert.equal(rotated[i][43],source[i][43]);assert.deepEqual(Array.from(rotated[i].slice(44)),source[i].slice(44));
    for(let k=0;k<42;k+=2)assert.ok(Math.abs(Math.hypot(rotated[i][k],rotated[i][k+1])-Math.hypot(source[i][k],source[i][k+1]))<1e-6);
  }
});
test('la reproducción conserva los tiempos reales y respeta grabaciones antiguas sin metadatos',()=>{
  const payload={frames:['a','b','c','d'],intervalMs:113,training:{samples:[10,124,250,390].map(requestedAtMs=>({requestedAtMs}))}};
  const timeline=recordingTimeline(payload);assert.deepEqual(timeline.times,[0,114,240,380]);assert.equal(timeline.durationMs,493);
  assert.equal(frameAtTime(timeline.times,239),1);assert.equal(frameAtTime(timeline.times,240),2);
  assert.deepEqual(recordingTimeline({frames:payload.frames,intervalMs:100}).times,[0,100,200,300]);
});
test('variantes aprobadas amplían referencias sin inflar originales, personas o pruebas y sobreviven al paquete',async()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'enabled'}));
  const samples=catalogue.flatMap((entry,c)=>Array.from({length:5},(_,i)=>({id:`${c}-${i}`,classId:entry.classId,hash:`h-${c}-${i}`,sequence:seq(c),role:i===4?'evaluation':'train',person:i===4?'reserved':'train-person',personConfirmed:true})));
  const variants=samples.flatMap(row=>[1.5,-1.5].map(angleDegrees=>({parentId:row.id,parentHash:row.hash,classId:row.classId,angleDegrees})));
  const result=await prepareControlledModel(catalogue,samples,{variants});
  assert.ok(result.coverage.every(row=>row.originals===4&&row.confirmedPeople===1&&row.syntheticReferences===2&&row.evaluation.samples===1));
  assert.equal(result.model.references.filter(r=>r.synthetic).length,4);
  assert.ok(result.model.references.every(row=>!row.parentHash.endsWith('-4')));
  assert.deepEqual(await decodeRuntimePackage(await encodeRuntimePackage(result.model)),result.model);
  const without=await prepareControlledModel(catalogue,samples);assert.notEqual(result.model.id,without.model.id);
  samples[0].person='reserved';const next=await prepareControlledModel(catalogue,samples,{variants});assert.ok(next.model.references.every(row=>row.parentHash!=='h-0-0'));
});
test('una toma y variantes suficientes habilitan un prototipo, sin recuperar hashes incorrectos',async()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'enabled'})),samples=catalogue.map((row,c)=>({id:String(c),classId:row.classId,hash:`h${c}`,sequence:seq(c)}));
  const variants=Array.from({length:100},(_,i)=>({parentId:'0',parentHash:'h0',classId:catalogue[0].classId,angleDegrees:variantSpecification(i,100).angleDegrees}));
  variants.push({parentId:'1',parentHash:'wrong-hash',classId:catalogue[1].classId,angleDegrees:1});
  const result=await prepareControlledModel(catalogue,samples,{variants});assert.equal(result.model,null);assert.equal(result.coverage[0].active,true);assert.equal(result.coverage[0].originals,1);assert.equal(result.coverage[0].approvedVariants,100);assert.equal(result.coverage[1].active,false);assert.equal(result.coverage[1].syntheticReferences,0);
});

const augmentedFixture=()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'collecting'}));
  const samples=catalogue.map((row,c)=>({id:String(c),classId:row.classId,hash:`h${c}`,sequence:seq(c)}));
  const variants=samples.flatMap(row=>Array.from({length:50},(_,i)=>({parentId:row.id,parentHash:row.hash,classId:row.classId,angleDegrees:variantSpecification(i,50).angleDegrees})));
  return {catalogue,samples,variants};
};

test('50 variantes aprobadas de un original activan automáticamente y mantienen compacto el modelo público',async()=>{
  const {catalogue,samples,variants}=augmentedFixture(),before=structuredClone({catalogue,samples,variants});
  const result=await prepareControlledModel(catalogue,samples,{variants});
  assert.deepEqual(result.model.enabledClasses,catalogue.map(row=>row.classId));
  assert.ok(result.coverage.every(row=>row.originals===1&&row.approvedVariants===50&&row.autoEnable&&row.ready&&row.active));
  assert.ok(result.coverage.every(row=>row.syntheticReferences===2&&row.confirmedPeople===0&&row.evaluation.samples===0));
  assert.equal(result.model.references.length,6);
  const index=prepareSequenceSearch(result.model);
  for(const sample of samples){
    const prediction=rankSequenceDistances(result.model,searchSequenceDistances(result.model,sample.sequence,reflectHandSequence(sample.sequence),index));
    assert.equal(prediction.accepted,true);assert.equal(prediction.classId,sample.classId);
  }
  assert.deepEqual(await decodeRuntimePackage(await encodeRuntimePackage(result.model)),result.model);
  assert.deepEqual({catalogue,samples,variants},before);
});

test('49 variantes, duplicados y variantes sin aprobar no cumplen el mínimo de 50',async()=>{
  const {catalogue,samples,variants}=augmentedFixture();
  const incomplete=variants.filter((_,i)=>i!==49&&i!==99);
  for(const extra of [[],[...incomplete],variants.filter((_,i)=>i===49||i===99).map(row=>({...row,status:'pending'})),variants.filter((_,i)=>i===49||i===99).map(row=>({...row,status:'rejected'}))]){
    const result=await prepareControlledModel(catalogue,samples,{variants:[...incomplete,...extra]});
    assert.equal(result.model,null);assert.ok(result.coverage.every(row=>row.approvedVariants===49&&!row.active&&!row.autoEnable));
  }
});

test('retirar variantes o el original desactiva la seña aunque su estado siga habilitado',async()=>{
  const {catalogue,samples,variants}=augmentedFixture();catalogue.forEach(row=>row.state='enabled');
  assert.ok((await prepareControlledModel(catalogue,samples,{variants})).model);
  for(const changed of [samples.slice(1),samples.map(row=>({...row,expiresAt:'2000-01-01'})),samples.map(row=>({...row,sequence:[]})),samples.map(row=>({...row,role:'evaluation'})),samples.map(row=>({...row,hash:'conflicting'}))]){
    const result=await prepareControlledModel(catalogue,changed,{variants});assert.equal(result.model,null);assert.equal(result.coverage[0].active,false);
    if(changed.length===samples.length)assert.ok(result.coverage.every(row=>!row.active));
  }
  const withdrawn=await prepareControlledModel(catalogue,samples,{variants:variants.slice(1)});
  assert.equal(withdrawn.model,null);assert.equal(withdrawn.coverage[0].active,false);
});

test('las variantes de una persona reservada y las señas pausadas o en evaluación privada no se publican automáticamente',async()=>{
  const {catalogue,samples,variants}=augmentedFixture();
  for(const state of ['paused','testing']){
    const result=await prepareControlledModel(catalogue.map(row=>({...row,state})),samples,{variants});
    assert.equal(result.model,null);assert.ok(result.coverage.every(row=>row.ready&&!row.active&&!row.autoEnable));
  }
  const evaluated=await prepareControlledModel(catalogue.map(row=>({...row,state:'enabled',activationScope:'evaluated'})),samples,{variants});
  assert.equal(evaluated.model,null);assert.ok(evaluated.coverage.every(row=>!row.ready&&!row.augmentedReady));
  samples[0].person='P-reserved';samples[0].personConfirmed=true;
  samples.push({...samples[0],id:'reserved',hash:'test-only',role:'evaluation'});
  const reserved=await prepareControlledModel(catalogue,samples,{variants});
  assert.equal(reserved.coverage[0].originals,0);assert.equal(reserved.coverage[0].approvedVariants,0);assert.equal(reserved.coverage[0].active,false);
});
test('el flujo admin admite un original pendiente o aprobado y retira variantes al cambiarlo',async()=>{
  const client=createMockAdminBackend(),api=createAdminClient(client),session=await api.login(MOCK_ADMIN_PASSWORD);
  for(const status of ['pending','approved']){
    const source=(await api.list(session,{status})).rows[0],requestId=crypto.randomUUID();
    const result=await api.createVariants(session,{requestId,rows:[source],quantity:100});assert.equal(result.batch.parentCount,1);
    assert.equal((await api.variantDetail(session,result.batch.id)).variants.length,100);
    assert.equal((await api.createVariants(session,{requestId,rows:[source],quantity:100})).alreadyCreated,true);
    if(status==='pending')await assert.rejects(api.reviewVariants(session,result.batch,'approved'),e=>e.code==='conflict');
    await api.review(session,[source],'approved');let detail=await api.variantDetail(session,result.batch.id);
    await api.reviewVariants(session,detail.batch,'approved');detail=await api.variantDetail(session,result.batch.id);assert.equal(detail.batch.status,'approved');
    await api.review(session,[detail.batch.parents[0]],'rejected');assert.equal((await api.variantDetail(session,result.batch.id)).batch.status,'pending');
  }
  await assert.rejects(createAdminClient({rpc:async()=>({error:{code:'28000'}})}).variants(session),e=>e.code==='session_expired');
});
test('las variantes heredan la aprobación, aparecen en Aprobadas y respetan decisiones explícitas del lote',async()=>{
  const api=createAdminClient(createMockAdminBackend()),session=await api.login(MOCK_ADMIN_PASSWORD);
  const before=await api.list(session,{status:'approved'}),source=before.rows[0];
  let result=await api.createVariants(session,{requestId:crypto.randomUUID(),rows:[source],quantity:100});
  assert.equal(result.batch.status,'approved');assert.equal(result.batch.inheritApproval,true);
  const after=await api.list(session,{status:'approved'});assert.equal(after.counts.approved,before.counts.approved);assert.equal(after.variantCounts.approved,100);
  let list=await api.variants(session,{status:'approved',query:source.label,pageSize:5});assert.equal(list.total,1);assert.equal(list.totalVariants,100);
  assert.equal((await api.variants(session,{status:'approved',query:'no-existe'})).total,0);
  const pending=(await api.list(session,{status:'pending'})).rows[0];result=await api.createVariants(session,{requestId:crypto.randomUUID(),rows:[pending],quantity:50});
  assert.equal(result.batch.status,'pending');await api.review(session,[pending],'approved');
  let detail=await api.variantDetail(session,result.batch.id);assert.equal(detail.batch.status,'approved');assert.equal((await api.list(session,{status:'approved'})).variantCounts.approved,150);
  await api.reviewVariants(session,detail.batch,'rejected');detail=await api.variantDetail(session,result.batch.id);assert.equal(detail.batch.inheritApproval,false);
  await api.review(session,[detail.batch.parents[0]],'approved');assert.equal((await api.variantDetail(session,result.batch.id)).batch.status,'rejected');
});

test('aprobar crea 50 variantes cuando la seña no tiene lotes; recibir o rechazar una toma no las crea',async()=>{
  const api=createAdminClient(createMockAdminBackend()),session=await api.login(MOCK_ADMIN_PASSWORD);
  const source=(await api.list(session,{status:'pending'})).rows[0];
  assert.equal((await api.variants(session,{status:'all'})).total,0);
  let result=await api.review(session,[source],'pending');assert.equal(result.automaticVariants,0);
  result=await api.review(session,[source],'rejected');assert.equal(result.automaticVariants,0);
  assert.equal((await api.variants(session,{status:'all'})).total,0);
  result=await api.review(session,[source],'approved');assert.equal(result.automaticBatches,1);assert.equal(result.automaticVariants,50);
  const list=await api.variants(session,{status:'approved'});assert.equal(list.total,1);assert.equal(list.totalVariants,50);
  const detail=await api.variantDetail(session,list.rows[0].id);assert.equal(detail.variants.length,50);
  assert.equal(detail.batch.parents[0].id,source.id);assert.equal(detail.batch.parents[0].version,source.version);assert.equal(detail.batch.inheritApproval,true);
  result=await api.review(session,[source],'approved');assert.equal(result.automaticVariants,0);
  assert.equal((await api.variants(session,{status:'all'})).totalVariants,50);
});

test('aprobar varias tomas de la misma seña o en paralelo conserva un solo lote automático',async()=>{
  for(const parallel of [false,true]){
    const api=createAdminClient(createMockAdminBackend()),session=await api.login(MOCK_ADMIN_PASSWORD);
    const rows=(await api.list(session,{status:'pending'})).rows,same=rows.filter(row=>row.category===rows[0].category&&row.label===rows[0].label);
    assert.ok(same.length>=2);
    const results=parallel?await Promise.all(same.slice(0,2).map(row=>api.review(session,[row],'approved'))):[await api.review(session,same.slice(0,2),'approved')];
    assert.equal(results.reduce((sum,row)=>sum+row.automaticVariants,0),50);
    const list=await api.variants(session,{status:'approved'});assert.equal(list.total,1);assert.equal(list.totalVariants,50);
  }
});

test('la aprobación conserva los lotes pendientes y rechazados y rechaza revisiones obsoletas sin generar variantes',async()=>{
  const api=createAdminClient(createMockAdminBackend()),session=await api.login(MOCK_ADMIN_PASSWORD);
  const rows=(await api.list(session,{status:'pending'})).rows,source=rows[0];
  const created=await api.createVariants(session,{requestId:crypto.randomUUID(),rows:[source],quantity:100});
  await api.reviewVariants(session,created.batch,'rejected');
  const stale={...source};const result=await api.review(session,[source],'approved');assert.equal(result.automaticVariants,0);
  assert.equal((await api.variantDetail(session,created.batch.id)).batch.status,'rejected');
  await assert.rejects(api.review(session,[stale],'approved'),e=>e.code==='conflict');
  const list=await api.variants(session,{status:'all'});assert.equal(list.total,1);assert.equal(list.totalVariants,100);
});
