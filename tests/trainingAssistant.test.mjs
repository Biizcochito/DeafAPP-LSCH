import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {PHRASES} from '../training/visibleTraining.js';
import {trainingPhraseRows,evaluationSummary} from '../training/assistantData.js';
import {buildTrainingPlan,compareCandidates,captureQuality,VISIBLE_TARGETS} from '../training/trainingAssistant.js';

// Synthetic points exercise data flow only; they are never uploaded or evidence of LSCh accuracy.
const features=(seed=0)=>Array.from({length:32},(_,t)=>Array.from({length:171},(_,i)=>i>=168?1:Math.sin(t/10+i/30)*.1+seed));
const row=(classId,seed,split='train')=>({id:String(seed),classId,wholePhrase:true,split,features:features(seed)});
const progress={targets:VISIBLE_TARGETS.map(target=>({...target,originals:0})),models:[]};
const full=()=>PHRASES.flatMap((classId,i)=>Array.from({length:3},(_,j)=>row(classId,i*3+j)));

test('prioriza solo las tres oraciones visibles y adapta el siguiente paso a las tomas',()=>{
  let plan=buildTrainingPlan({progress});assert.equal(plan.next.classId,PHRASES[0]);assert.equal(plan.targetCount,32);
  plan=buildTrainingPlan({progress,rows:[row(PHRASES[0],1)]});assert.equal(plan.next.classId,PHRASES[1]);
  plan=buildTrainingPlan({progress,rows:full()});assert.equal(plan.next.type,'train');assert.equal(plan.learningOriginals,9);
  plan=buildTrainingPlan({progress,rows:full(),personal:{modelId:'one'}});assert.equal(plan.next.type,'evaluate');
  assert.equal(buildTrainingPlan({progress:null}).next.type,'wait');
});
test('el catálogo sugiere apoyos de las oraciones y mantiene informe/local separados',()=>{
  const plan=buildTrainingPlan({progress,goal:'catalog'});assert.equal(plan.next.classId,'verbos/querer');
  const updated=buildTrainingPlan({progress,goal:'catalog',rows:[{...row('verbos/querer',4),wholePhrase:false}]});
  assert.equal(updated.next.classId,'verbos/necesitar');assert.equal(updated.snapshotCovered,0);assert.equal(updated.localSigns,1);
  assert.ok(updated.catalog.every(item=>VISIBLE_TARGETS.some(target=>target.classId===item.classId)));
});
test('una reserva y sus copias quedan fuera del entrenamiento aunque cambien ID o etiqueta',()=>{
  const learning=full(),heldout={...learning[0],id:'reserved',split:'evaluation'};
  assert.equal(trainingPhraseRows([...learning,heldout]).length,8);
  assert.equal(buildTrainingPlan({progress,rows:[...learning,heldout]}).readyToTrain,false);
  assert.equal(trainingPhraseRows([...learning,{...learning[0],id:'copy'}]).length,9);
  assert.equal(trainingPhraseRows([...learning,{...learning[0],id:'wrong-label',classId:PHRASES[1]}]).length,8);
});

test('prioriza clases con menos material disponible aunque otras no tengan nuevas tomas locales',()=>{
  const snapshot={...progress,targets:progress.targets.map(target=>({...target,originals:target.classId==='verbos/querer'?0:3}))};
  const plan=buildTrainingPlan({progress:snapshot,goal:'catalog',rows:[{...row('verbos/querer',2),wholePhrase:false}]});
  assert.equal(plan.next.classId,'verbos/querer');assert.match(plan.next.reason,/Informe: 0/);
});
test('ignora puntos incompletos, datos aumentados y señas ajenas al entrenamiento de oraciones',()=>{
  const valid=full();valid[0].features[1][1]=NaN;
  const augmented={...row(PHRASES[0],20),variant:'time-warp'};
  assert.equal(trainingPhraseRows([...valid,augmented,row('alimentos/pan',12),null]).length,8);
});
test('la retirada de una mano se acepta y un fallo de seguimiento da evidencia concreta',()=>{
  const frames=Array.from({length:40},(_,i)=>({timeMs:i*100,vector:[...Array(168).fill(0),1,Number(i<20),1]}));
  const quality=captureQuality(frames);assert.equal(quality.trackingPercent,100);assert.equal(quality.singleHandFrames,20);
  const plan=buildTrainingPlan({progress,goal:'review',quality:[{accepted:false,reason:'Mantén la cara visible.',classId:PHRASES[1]}]});
  assert.match(plan.next.reason,/cara/);assert.equal(plan.next.classId,PHRASES[1]);
});
test('evalúa solo el candidato correspondiente y distingue errores ante movimientos desconocidos',()=>{
  const tests=[{split:'evaluation',modelId:'a',confirmed:true,classId:PHRASES[0],prediction:{accepted:true,classId:PHRASES[0]}},
    {split:'evaluation',modelId:'a',confirmed:true,classId:PHRASES[1],prediction:{accepted:false}},
    {split:'evaluation',modelId:'a',confirmed:true,classId:'unknown',prediction:{accepted:true,classId:PHRASES[0]}},
    {split:'evaluation',modelId:'b',confirmed:true,classId:PHRASES[0],prediction:{accepted:true,classId:PHRASES[0]}}];
  assert.deepEqual(evaluationSummary(tests,'a'),{samples:2,correct:1,unknownSamples:1,falseAccepts:1});
});

test('prioriza revisar discrepancias y pide material nuevo ante una oración fallida',()=>{
  const rows=[{...row('saludos/hola',10),wholePhrase:false,committee:[{disagreement:false,abstentions:0}]},
    {...row('saludos/gracias',11),wholePhrase:false,committee:[{disagreement:true,abstentions:2}]}];
  let plan=buildTrainingPlan({progress,rows,goal:'review'});assert.equal(plan.next.type,'review');assert.equal(plan.next.recordingId,'11');
  plan=buildTrainingPlan({progress,rows:[...full(),{...row(PHRASES[2],12,'evaluation'),modelId:'personal',confirmed:true,prediction:{accepted:false}}],personal:{modelId:'personal'}});
  assert.equal(plan.next.type,'capture');assert.equal(plan.next.classId,PHRASES[2]);assert.match(plan.next.reason,/permanecerá reservada/);
});
test('compara modelos reales mediante la API autenticada; no mezcla vocabularios ni relabela la toma',async()=>{
  const classes=['saludos/hola','saludos/gracias'],models=[['a',classes,[1,0]],['b',classes,[0,1]],['c',PHRASES,[1,0,0]]].map(([id,labels,probabilities])=>({id:id.repeat(32),format:'deafapp-lsch-python-forest',version:1,inputShape:[32,171],classes:labels,decision:{minimumScore:.75,minimumMargin:.15},trees:[{left:[-1],right:[-1],feature:[-2],threshold:[-2],probabilities:[probabilities]}]}));
  const calls=[],session={token:'x'},cache=new Map(),sample=features();
  const api={trainingCandidate:async(received,id)=>{assert.equal(received,session);calls.push(id);return {candidate:{encoding:'gzip-base64',data:gzipSync(JSON.stringify(models.find(model=>model.id===id))).toString('base64')}};}};
  const current={models:models.map(model=>({modelId:model.id,classes:model.classes,name:model.id[0]}))};
  const groups=await compareCandidates({api,session,progress:current,features:sample,cache});
  assert.equal(calls.length,3);assert.equal(groups.length,2);assert.equal(groups[0].disagreement,true);assert.equal(groups[1].disagreement,false);
  assert.deepEqual(sample,features());
  await compareCandidates({api,session,progress:current,features:sample,cache});assert.equal(calls.length,3);
  await assert.rejects(()=>compareCandidates({api,session,progress:current,features:sample,cancelled:()=>true}),/interrumpida/);
});
