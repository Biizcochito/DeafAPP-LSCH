import test from 'node:test';
import assert from 'node:assert/strict';
import {variantSpecification,rotateVariantSequence,recordingTimeline,frameAtTime} from '../src/training/recordingVariants.js';
import {prepareControlledModel} from '../src/training/controlledModel.js';
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
test('una toma multiplicada cien veces no habilita por sí sola una seña ni recupera hashes incorrectos',async()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'enabled'})),samples=catalogue.map((row,c)=>({id:String(c),classId:row.classId,hash:`h${c}`,sequence:seq(c)}));
  const variants=Array.from({length:100},(_,i)=>({parentId:'0',parentHash:'h0',classId:catalogue[0].classId,angleDegrees:variantSpecification(i,100).angleDegrees}));
  variants.push({parentId:'1',parentHash:'wrong-hash',classId:catalogue[1].classId,angleDegrees:1});
  const result=await prepareControlledModel(catalogue,samples,{variants});assert.equal(result.model,null);assert.ok(result.coverage.every(row=>row.originals===1&&!row.active));assert.equal(result.coverage[1].syntheticReferences,0);
});
test('el flujo admin admite un original pendiente o aprobado, exige revisión y retira variantes al cambiarlo',async()=>{
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
