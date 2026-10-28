import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createLiveSignRecognizer} from '../src/training/liveSignRecognition.js';
import {signInferenceWorkerSource,createSignInferenceClient} from '../src/training/signInferenceWorker.js';
import {predictForest} from '../src/training/visibleTraining.js';
import {handSequence,sequenceReferences} from '../src/training/sequenceCandidate.js';

// Synthetic geometry checks software contracts, not LSCh recognition accuracy.
const vector=(time,seed=0)=>[...Array.from({length:84},(_,index)=>index%2?.3+Math.sin(time/180)*.12:(index%42)*.02+seed),...Array(84).fill(0),1,1,1];
const match=(classId='saludos/hola')=>({accepted:true,classId,reason:'matched'});
const rejected={accepted:false,classId:null,reason:'outside-reference'};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function harness(predict=async windows=>({predictions:windows.map(()=>match()),computeMs:2})) {
  let time=0;const updates=[],calls=[];
  const recognizer=createLiveSignRecognizer({predict:windows=>{calls.push(windows);return predict(windows);},now:()=>time,onUpdate:value=>updates.push({...value,time})});
  return {recognizer,updates,calls,get time(){return time;},set time(value){time=value;},async feed(until,{step=40,make=vector}={}){for(;time<=until;time+=step){recognizer.push({timeMs:time,vector:make(time)});await flush();}}};
}

test('continuous recognition confirms in about a second without a countdown or selected label',async()=>{
  const h=harness();await h.feed(1600);
  const first=h.updates.find(row=>row.phase==='matched');
  assert.equal(first.prediction.classId,'saludos/hola');assert.ok(first.time>=800&&first.time<=1100);
  assert.equal(h.updates.filter(row=>row.phase==='matched').length,1);
  assert.ok(h.calls.every(windows=>windows.length<=3&&windows.every(window=>window.features.length===32&&window.features.every(frame=>frame.length===171))));
  assert.ok(h.calls.length<8);h.recognizer.close();
});

test('missing hands, a missing face and static poses never become predictions',async()=>{
  for(const make of [()=>null,time=>vector(time).map((v,i)=>i>=168?0:v),()=>vector(0)]){
    const h=harness();await h.feed(3500,{make});assert.equal(h.calls.length,0);assert.equal(h.updates.some(row=>row.phase==='matched'),false);h.recognizer.close();
  }
});

test('lowering a still-visible hand at the end of a sign does not erase its confirmation window',async()=>{
  const h=harness();await h.feed(1300,{make:time=>{const row=vector(time);if(time>=850){row[1]=3;row[43]=3;}return row;}});
  assert.ok(h.updates.some(row=>row.phase==='matched'));h.recognizer.close();
});

test('an abstention and disagreement between live windows clear the word',async()=>{
  let uncertain=false;const h=harness(async windows=>({predictions:uncertain?windows.map((_,i)=>i?match('necesidades/agua'):match()):windows.map(()=>match())}));
  await h.feed(1400);assert.ok(h.updates.some(row=>row.phase==='matched'));
  uncertain=true;await h.feed(2400);assert.equal(h.updates.at(-1).phase,'uncertain');h.recognizer.close();
  const noMatch=harness(async windows=>({predictions:windows.map(()=>rejected)}));await noMatch.feed(1400);assert.equal(noMatch.updates.at(-1).phase,'uncertain');noMatch.recognizer.close();
});

test('one slow prediction cannot queue jobs or publish an old result over newer camera movement',async()=>{
  let resolve;const h=harness(()=>new Promise(done=>{resolve=done;}));await h.feed(4000);assert.equal(h.calls.length,1);
  resolve({predictions:[match()]});await flush();assert.equal(h.updates.some(row=>row.phase==='matched'),false);
  assert.equal(h.updates.at(-1).phase,'tracking');h.recognizer.close();
});

test('lost tracking, reset and disposal discard pending results and visible words',async()=>{
  const h=harness();await h.feed(1400);h.time+=500;h.recognizer.expire(h.time);assert.equal(h.updates.at(-1).phase,'position');
  h.recognizer.close();
  for(const action of ['reset','close']){
    let resolve;const pending=harness(()=>new Promise(done=>{resolve=done;}));await pending.feed(900);
    pending.recognizer[action]();const count=pending.updates.length;
    resolve({predictions:[match()]});await flush();assert.equal(pending.updates.length,count);
    assert.equal(pending.updates.some(row=>row.phase==='matched'),false);pending.recognizer.close();
  }
});

test('a failing inference stops retrying instead of flooding the worker',async()=>{
  const h=harness(async()=>{throw Error('worker unavailable');});await h.feed(3000);
  assert.equal(h.calls.length,1);assert.equal(h.updates.at(-1).phase,'error');h.recognizer.expire(9999);assert.equal(h.updates.at(-1).phase,'error');h.recognizer.close();
});

function runWorker(model,features) {
  const messages=[];const context=vm.createContext({self:{postMessage:value=>messages.push(value)},performance:{now:()=>1}});
  vm.runInContext(signInferenceWorkerSource(),context);
  context.self.onmessage({data:{type:'model',model}});
  context.self.onmessage({data:{type:'predict',id:5,windows:features.map(value=>({features:value,query:handSequence(value),reflection:handSequence(value,true)}))}});
  return JSON.parse(JSON.stringify(messages[0]));
}

test('the serialized worker preserves the existing sequence classifier and disabled-class abstention',()=>{
  const make=seed=>Array.from({length:32},(_,i)=>vector(i*50,seed));
  const rows=[['saludos/hola',0],['necesidades/agua',2],['saludos/bien',4]].map(([classId,seed],i)=>({parentHash:String(i),classId,variant:'original',split:'train',features:make(seed)}));
  const model={format:'deafapp-lsch-sequence-prototypes',version:1,inputShape:[32,171],classes:rows.map(row=>row.classId),enabledClasses:rows.slice(0,2).map(row=>row.classId),references:sequenceReferences(rows),decision:{maximumDistance:.35,minimumRelativeMargin:.25}};
  const features=[make(0),make(2),make(4),make(20)];const result=runWorker(model,features);
  assert.equal(result.id,5);assert.deepEqual(result.predictions,JSON.parse(JSON.stringify(features.map(value=>predictForest(model,value)))));
  assert.equal(result.predictions[2].accepted,false);assert.equal(result.predictions[2].reason,'unsupported-sign');
});

test('forest inference in the worker uses the same float32 decisions as manual inference',()=>{
  const model={format:'deafapp-lsch-python-forest',classes:['saludos/hola','saludos/gracias'],decision:{minimumScore:.75,minimumMargin:.15},trees:[{left:[1,-1,-1],right:[2,-1,-1],feature:[0,-2,-2],threshold:[.1,-2,-2],probabilities:[[.5,.5],[1,0],[0,1]]}]};
  const features=Array.from({length:32},(_,i)=>vector(i*40));features[0][0]=.1;
  assert.deepEqual(runWorker(model,[features]).predictions[0],JSON.parse(JSON.stringify(predictForest(model,features))));
});

test('closing an inference client cancels its pending job and terminates the worker',async()=>{
  let terminated=false;
  class Worker { postMessage(){} terminate(){terminated=true;} }
  const client=createSignInferenceClient({format:'deafapp-lsch-python-forest'},{WorkerClass:Worker});
  const pending=client.predict([{features:[]}]);client.close();await assert.rejects(pending,/cerrado/);assert.equal(terminated,true);
  await assert.rejects(client.predict([]),/cerrado/);
});
