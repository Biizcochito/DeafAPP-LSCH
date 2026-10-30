import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueSeed,catalogueKey,validateCatalogueEntry,resolveCatalogueClass,collectionCategories} from '../src/training/recognitionCatalog.js';
import {prepareControlledModel} from '../src/training/controlledModel.js';
import {encodeRuntimePackage,decodeRuntimePackage} from '../src/training/runtimePackage.js';
import {prepareSequenceSearch,searchSequenceDistances,sequenceDistance,rankSequenceDistances,validateSequenceCandidate} from '../src/training/sequenceCandidate.js';

const sequence=(classIndex,take=0)=>Array.from({length:32},(_,i)=>Array.from({length:88},(_,k)=>k<42?classIndex*.7+take*.0001+i*.002+k*.001:k===42?1:0));
const rows=(catalogue,count=3)=>catalogue.flatMap((entry,c)=>Array.from({length:count},(_,i)=>({id:`${c}-${i}`,classId:entry.classId,hash:`hash-${c}-${i}`,sequence:sequence(c,i),role:'train'})));
test('el catálogo antiguo se restaura sin repetir las entradas actuales ni confundir homónimos',()=>{
  const seed=catalogueSeed();assert.equal(seed.length,542);assert.equal(new Set(seed.map(row=>row.classId)).size,542);
  assert.equal(seed.filter(row=>row.state==='enabled').length,33);assert.equal(seed.filter(row=>row.state==='collecting').length,509);
  seed.forEach(validateCatalogueEntry);
  assert.notEqual(catalogueKey('familia','papa'),catalogueKey('frutas_verduras','papa'));
  assert.equal(catalogueKey('conversacion','Sí'),catalogueKey('conversacion','si'));
  assert.notEqual(catalogueKey('tiempo','año'),catalogueKey('tiempo','ano'));
  assert.equal(collectionCategories(seed).flatMap(row=>row.señas).length,33);
});
test('los alias requieren destinos existentes y los ciclos no producen clases',()=>{
  const catalogue=catalogueSeed().slice(0,2);catalogue[0].aliasOf=catalogue[1].classId;
  assert.equal(resolveCatalogueClass(catalogue[0].classId,catalogue),catalogue[1].classId);
  catalogue[1].aliasOf=catalogue[0].classId;assert.equal(resolveCatalogueClass(catalogue[0].classId,catalogue),null);
});
test('el modelo controlado supera 33 clases y conserva los estados de activación',async()=>{
  const catalogue=catalogueSeed().slice(0,60).map((row,i)=>({...row,state:i===59?'testing':'enabled'}));
  const result=await prepareControlledModel(catalogue,rows(catalogue));
  assert.equal(result.model.classes.length,60);assert.equal(result.model.enabledClasses.length,59);validateSequenceCandidate(result.model);
  assert.equal(result.coverage.at(-1).active,false);assert.equal(result.coverage[0].evaluation.recall,null);
  assert.equal(result.coverage[0].confirmedPeople,0);assert.equal(result.coverage[0].unknownPeople,3);
});
test('reservas, copias y participantes de prueba no pasan al aprendizaje',async()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'enabled'})),samples=rows(catalogue,5);
  samples[4].role='evaluation';samples[4].person='test-person';samples[4].personConfirmed=true;
  samples[0].hash=samples[4].hash;
  samples[1].person='test-person';samples[1].personConfirmed=true;
  const result=await prepareControlledModel(catalogue,samples);
  assert.equal(result.coverage[0].originals,2);assert.equal(result.model,null);
});
test('la evaluación con tomas separadas no se presenta como prueba con personas distintas',async()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'enabled'})),samples=rows(catalogue,5);
  for(const sample of samples)if(sample.id.endsWith('-4'))sample.role='evaluation';
  let result=await prepareControlledModel(catalogue,samples);
  assert.ok(result.coverage.every(row=>row.evaluation.samples===1&&row.evaluation.recall===1&&row.evaluation.scope==='different-recordings'));
  for(const sample of samples){sample.person=sample.role==='evaluation'?'P2':'P1';sample.personConfirmed=true;}
  result=await prepareControlledModel(catalogue,samples);
  assert.ok(result.coverage.every(row=>row.evaluation.scope==='different-confirmed-people'));
});
test('los hashes conflictivos y las grabaciones vencidas no habilitan una seña',async()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'enabled'})),samples=rows(catalogue,4);
  samples[0].hash=samples[4].hash;samples[1].expiresAt='2000-01-01';
  const result=await prepareControlledModel(catalogue,samples);assert.equal(result.coverage[0].originals,2);assert.equal(result.model,null);
});
test('el paquete comprimido conserva el modelo y rechaza descargas corruptas',async()=>{
  const catalogue=catalogueSeed().slice(0,2).map(row=>({...row,state:'enabled'})),result=await prepareControlledModel(catalogue,rows(catalogue));
  const packet=await encodeRuntimePackage(result.model);assert.ok(packet.compressedBytes<packet.expandedBytes/3);
  assert.deepEqual(await decodeRuntimePackage(packet),result.model);
  await assert.rejects(decodeRuntimePackage({...packet,sha256:'a'.repeat(64)}),/incompleta/);
  await assert.rejects(decodeRuntimePackage({...packet,data:'not base64!'}),/formato/);
});
test('la búsqueda con envolventes conserva exactamente los tres primeros y la decisión',async()=>{
  const catalogue=catalogueSeed().slice(0,80).map(row=>({...row,state:'enabled'})),{model}=await prepareControlledModel(catalogue,rows(catalogue));
  const index=prepareSequenceSearch(model);
  for(const expected of [0,1,25,79]){
    const query=sequence(expected,.5),reflection=query.map(frame=>frame.map((n,k)=>k%44<42&&k%2===0?-n:n));
    const exact=new Map(model.classes.map(id=>[id,Infinity]));
    for(const row of model.references)exact.set(row.classId,Math.min(exact.get(row.classId),sequenceDistance(query,row.sequence),sequenceDistance(reflection,row.sequence)));
    assert.deepEqual(rankSequenceDistances(model,searchSequenceDistances(model,query,reflection,index)),rankSequenceDistances(model,exact));
  }
});
