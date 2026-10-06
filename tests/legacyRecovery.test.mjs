import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectLegacyRecording,recoverFrameObservation,summarizeRecovery,validateRecoveredItem,preparePersonalPrototype,LEGACY_FEATURE_LAYOUT} from '../training/legacyRecovery.js';
import {createTrainingPlan,assertPreparedDataset} from '../training/trainingPlan.js';
import {trainReviewedModel} from '../training/modelTraining.js';
import {currentRecovery,recoverApprovedLegacy} from '../training/legacyRecoveryBrowser.js';

function result(position=0.2) {
  const face=Array.from({length:468},()=>({x:.5,y:.4,z:0}));face[234].x=.35;face[454].x=.65;
  const hand=Array.from({length:21},(_,index)=>({x:position+index*.001,y:.5+index*.005,z:0}));
  return {faceLandmarks:face,rightHandLandmarks:hand};
}
function recovered(id,label='hola',category='saludos') {
  const observations=Array.from({length:15},(_,index)=>recoverFrameObservation(result(label==='hola'?.15+index*.01:.8-index*.01),index,640,480));
  return {version:1,id:String(id),sourceVersion:2,sourcePath:`${id}.json`,sourceClassId:`${category}/${label}`,classId:`${category}/${label}`,labelReviewed:true,
    participantId:null,parentHash:id.toString(16).padStart(64,'0'),intervalMs:null,observations};
}
test('old JPEG/PNG sequences are decoded without inventing time or participant metadata',()=>{
  const row={id:1,version:2,label:'hola',category:'saludos'};
  for(const frame of ['/9j/AAAA==','data:image/png;base64,iVBORw0KGgoAAAA==']){
    const source=inspectLegacyRecording({label:'hola',frames:Array(15).fill(frame),timestamp:'2025-01-01'},row);
    assert.equal(source.frames.length,15);assert.equal(source.intervalMs,null);assert.equal(source.classId,'saludos/hola');
    assert.equal(source.participantId,undefined);
  }
  assert.equal(inspectLegacyRecording({label:'hola',intervalMs:200,frames:Array(15).fill('/9j/AAAA==')},row).intervalMs,200);
  assert.throws(()=>inspectLegacyRecording({label:'adios',frames:Array(15).fill('/9j/AAAA==')},row),/etiqueta/);
});
test('unrecognized labels remain pending and missing detections do not reuse earlier points',()=>{
  const source=inspectLegacyRecording({label:'respuestas saludos',frames:Array(15).fill('/9j/AAAA==')},{id:1,version:2,label:'respuestas saludos',category:'saludos'});
  assert.equal(source.classId,null);
  const missing=recoverFrameObservation({},1,640,480);assert.equal(missing.vector,null);assert.equal(missing.hands,0);
  const observations=Array.from({length:15},(_,index)=>recoverFrameObservation(index<5?result():{},index,640,480));
  assert.equal(summarizeRecovery(observations).usable,false);
  const item=recovered(1);item.classId=null;item.labelReviewed=false;
  const dataset=preparePersonalPrototype([item]);assert.equal(dataset.report.acceptedRecordings,0);assert.ok(dataset.quarantine[0].reasons.includes('needs-legacy-label-review'));
});
test('the prototype holds out original footage but never claims independent people or actual capture speed',()=>{
  const items=[recovered(1),recovered(2),recovered(3,'gracias'),recovered(4,'gracias')];
  const dataset=preparePersonalPrototype(items),plan=createTrainingPlan(dataset);
  assert.equal(plan.trainingAvailable,true);assert.equal(plan.mode,'personal-prototype');assert.equal(plan.minimums.maxClassesPerGroup,3);
  assert.equal(dataset.report.declaredParticipants,0);assert.equal(dataset.report.unknownParticipantRecordings,4);
  assert.equal(dataset.report.evaluationStatus,'different-recordings-not-independent-people');
  assert.equal(dataset.evaluation.length,2);assert.ok(dataset.evaluation.every(item=>item.variant==='original'&&item.timingBasis==='frame-order-only'));
  assert.ok(dataset.train.every(item=>!dataset.evaluation.some(other=>item.parentHash===other.parentHash)));
  assertPreparedDataset(dataset);
  const sameFootage=structuredClone(dataset);sameFootage.evaluation[0].parentHash=sameFootage.train[0].parentHash;
  assert.throws(()=>assertPreparedDataset(sameFootage),/grabación/);
  assert.throws(()=>assertPreparedDataset({...dataset,mode:undefined}),/formato/);
});
test('copies and conflicting labels never increase the amount of original footage',()=>{
  const a=recovered(1),copy={...recovered(2),parentHash:a.parentHash};
  const duplicates=preparePersonalPrototype([a,copy]);assert.equal(duplicates.report.acceptedRecordings,1);assert.equal(createTrainingPlan(duplicates).trainingAvailable,false);
  const conflict={...copy,classId:'saludos/gracias'};
  const inconsistent=preparePersonalPrototype([a,conflict]);assert.equal(inconsistent.report.acceptedRecordings,0);assert.equal(inconsistent.quarantine.length,2);
});
test('damaged geometry, invented people codes and changed approvals are rejected',()=>{
  const bad=recovered(1);bad.observations[0].vector[168]=0;
  assert.throws(()=>validateRecoveredItem(bad),/puntos/);
  const person=recovered(1);person.participantId='Name with spaces';assert.throws(()=>validateRecoveredItem(person),/código/);
  const item=recovered(1),row={id:1,version:2,path:'1.json',category:'saludos',label:'hola'};
  assert.equal(currentRecovery(item,row),true);assert.equal(currentRecovery(item,{...row,version:3}),false);
  assert.equal(currentRecovery(item,{...row,label:'adios'}),false);
});
test('a new browser visit reuses complete recoveries and requires live admin authorization',async()=>{
  const item=recovered(1),rows=[{id:1,version:2,path:'1.json',category:'saludos',label:'hola'}];let writes=0,seen=0;
  const api={list:async()=>({rows,total:1}),overview:async()=>({ok:true})};
  const outcome=await recoverApprovedLegacy({api,session:{},client:{},store:{all:async()=>[item],put:async()=>{writes++;}},onItem:()=>{seen++;}});
  assert.deepEqual(outcome,{total:1,processed:0,reused:1,failed:0});assert.equal(writes,0);assert.equal(seen,1);
  await assert.rejects(()=>recoverApprovedLegacy({api:{list:async()=>{throw new Error('Sesión vencida');}},store:{}}),/Sesión vencida/);
});
test('actual prototype fitting is saved with limited evaluation scope, including a same-person collection',async()=>{
  const require=createRequire(import.meta.url),tf=require('../public/hand-model/tf.min.js');await tf.setBackend('cpu');await tf.ready();
  const items=[recovered(1),recovered(2),recovered(3,'gracias'),recovered(4,'gracias')];items.forEach(item=>{item.participantId='same-test-person';});
  const dataset=preparePersonalPrototype(items),before=tf.memory().numTensors;
  const {model,report}=await trainReviewedModel(dataset,{tf,epochs:3});
  assert.equal(report.mode,'personal-prototype');assert.equal(report.participantIndependenceTested,false);assert.equal(report.publicActivation,false);
  assert.equal(report.evaluationScope,'different-recordings-not-independent-people');assert.equal(report.evaluationSamples,2);
  model.setUserDefinedMetadata({report,featureLayout:LEGACY_FEATURE_LAYOUT});
  let saved;await model.save(tf.io.withSaveHandler(async data=>{saved=data;return {modelArtifactsInfo:tf.io.getModelArtifactsInfoForJSON(data)};}),{includeOptimizer:false});
  assert.equal(saved.userDefinedMetadata.featureLayout.temporalBasis,'normalized-frame-order');assert.equal(saved.userDefinedMetadata.report.publicActivation,false);
  model.dispose();assert.equal(tf.memory().numTensors,before);
});
test('frame extraction preserves originals, isolates recordings, and stops on model startup failure',async()=>{
  const rows=[{id:1,version:2,path:'1.json',category:'saludos',label:'hola'}],recording={label:'hola',frames:Array(15).fill('/9j/AAAA==')};
  const before=JSON.stringify(recording),saved=[];let callback,resets=0,closed=0,starts=0;
  const api={list:async()=>({rows,total:1}),overview:async()=>({ok:true})},store={all:async()=>[],put:async item=>saved.push(item)};
  const client={storage:{from:()=>({download:async()=>({data:new Blob([JSON.stringify(recording)])})})}};
  const options={api,session:{},client,store,decodeImage:async()=>({naturalWidth:640,naturalHeight:480}),detectorFactory:async()=>({onResults:fn=>{callback=fn;},resetSequence:async()=>{resets++;},send:async()=>callback(result()),close:async()=>{closed++;}})};
  const summary=await recoverApprovedLegacy(options);
  assert.equal(summary.processed,1);assert.equal(saved.length,1);assert.equal(resets,1);assert.equal(closed,1);assert.equal(JSON.stringify(recording),before);
  assert.equal(saved[0].intervalMs,null);assert.equal(saved[0].participantId,null);assert.equal(saved[0].observations[14].frameIndex,14);
  await assert.rejects(()=>recoverApprovedLegacy({...options,detectorFactory:async()=>{starts++;throw new Error('Model unavailable');}}),/iniciar la recuperación/);
  assert.equal(starts,1);assert.equal(saved.length,1);
});
