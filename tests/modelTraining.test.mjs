import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {FEATURE_LAYOUT} from '../training/datasetPreparation.js';
import {assertPreparedDataset,createTrainingPlan,selectTrainingGroup} from '../training/trainingPlan.js';
import {trainReviewedModel} from '../training/modelTraining.js';
// Synthetic points exercise the software. They are never LSCh training data
// and are not exported, published, or used as evidence of recognition quality.
function fixture(){
  let id=1;const dataset={featureLayout:FEATURE_LAYOUT,train:[],evaluation:[],quarantine:[],report:{acceptedRecordings:14}};
  for(const [label,sign] of [['hola',1],['gracias',-1]])for(const split of ['train','evaluation'])for(let i=0;i<(split==='train'?5:2);i++){
    const parentHash=(id++).toString(16).padStart(64,'0');
    const features=Array.from({length:32},(_,t)=>Array.from({length:171},(_,j)=>j>=168?([1,0,1][j-168]):sign*(0.6+0.15*Math.sin(t/8+j/20))+(i-2)*0.006));
    dataset[split==='train'?'train':'evaluation'].push({classId:`saludos/${label}`,parentHash,recordingId:parentHash,participantId:split==='train'?'synthetic-person-a':'synthetic-person-b',split,variant:'original',features});
  }return dataset;
}
test('priorities cover the whole vocabulary and require original samples',()=>{
  const dataset=fixture(),plan=createTrainingPlan(dataset);
  assert.equal(plan.totalClasses,531);assert.equal(plan.readyClasses.length,2);assert.equal(plan.trainingAvailable,true);
  const original=dataset.train[0];
  dataset.train=dataset.train.filter(s=>s.parentHash!==original.parentHash);
  const source=dataset.train[0];dataset.train.push({...source,variant:'time-warp-0.85'});
  assert.equal(createTrainingPlan(dataset).rows.find(s=>s.classId==='saludos/hola').state,'needs-samples');
  assert.throws(()=>selectTrainingGroup(dataset),/2 y 12/);
});
test('the same person or recording cannot leak into evaluation',()=>{
  const dataset=fixture();dataset.evaluation[0].participantId='synthetic-person-a';
  assert.throws(()=>assertPreparedDataset(dataset),/persona o grabación/);
  const other=fixture();other.evaluation[0].parentHash=other.train[0].parentHash;
  assert.throws(()=>assertPreparedDataset(other),/persona o grabación/);
});
test('malformed points, invented labels and unlinked augmentation are rejected',()=>{
  for(const modify of [d=>d.train[0].features[0][1]=NaN,d=>d.train[0].classId='asl/hola',d=>d.train[0].features[0][168]=0.4,d=>d.train[0].variant='time-warp-0.85']){
    const dataset=fixture();modify(dataset);assert.throws(()=>assertPreparedDataset(dataset));
  }
});
test('reviewed but unprepared recordings remain pending instead of ready',()=>{
  const dataset=fixture();dataset.train=[];dataset.evaluation=[];dataset.report.acceptedRecordings=0;
  dataset.quarantine=[{classId:'saludos/hola',reasons:['missing-or-invalid-training-metadata']}];
  const plan=createTrainingPlan(dataset,{approvedCounts:{'saludos/hola':7}});
  const hola=plan.rows.find(s=>s.classId==='saludos/hola');assert.equal(hola.state,'needs-preparation');assert.equal(plan.trainingAvailable,false);assert.equal(hola.approvedRecordings,7);assert.equal(hola.usableRecordings,0);
});
test('real TensorFlow fitting changes loss, evaluates held-out originals, disposes tensors and yields a candidate',async()=>{
  const require=createRequire(import.meta.url),tf=require('../public/hand-model/tf.min.js');await tf.setBackend('cpu');await tf.ready();
  const before=tf.memory().numTensors;const progress=[];
  const {model,report}=await trainReviewedModel(fixture(),{tf,epochs:12,onProgress:value=>progress.push(value)});
  assert.equal(report.classes.length,2);assert.equal(report.evaluationSamples,4);assert.ok(report.finalLoss<report.initialLoss);assert.equal(report.epochsCompleted,12);
  assert.equal(report.publicActivation,false);assert.equal(report.unknownGesturesEvaluated,false);
  assert.equal(report.confusionMatrix.flat().reduce((a,b)=>a+b),4);assert.equal(report.perClass.reduce((n,r)=>n+r.samples,0),4);
  assert.ok(progress.some(p=>p.stage==='evaluation'));
  model.setUserDefinedMetadata({report,featureLayout:FEATURE_LAYOUT});
  let saved;
  await model.save(tf.io.withSaveHandler(async artifacts=>{saved=artifacts;return {modelArtifactsInfo:tf.io.getModelArtifactsInfoForJSON(artifacts)};}),{includeOptimizer:false});
  assert.ok(saved.weightData.byteLength>0);
  assert.deepEqual(saved.userDefinedMetadata.report.classes,report.classes);
  assert.equal(saved.userDefinedMetadata.report.publicActivation,false);
  assert.equal(saved.trainingConfig,undefined);
  const restored=await tf.loadLayersModel(tf.io.fromMemory(saved));
  assert.deepEqual(restored.getUserDefinedMetadata().report.classes,report.classes);
  restored.dispose();model.dispose();
  assert.equal(tf.memory().numTensors,before);
});
test('cancellation does not produce a publishable or saved model',async()=>{
  const require=createRequire(import.meta.url),tf=require('../public/hand-model/tf.min.js');
  const before=tf.memory().numTensors,abort=new AbortController();
  await assert.rejects(()=>trainReviewedModel(fixture(),{tf,epochs:10,signal:abort.signal,onProgress:value=>{if(value.stage==='training')abort.abort();}}),/cancelado/);
  assert.equal(tf.memory().numTensors,before);
});
