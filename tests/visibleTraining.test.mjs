import test from 'node:test';
import assert from 'node:assert/strict';
import {captureFeatures,validateForest,predictForest,PHRASES} from '../training/visibleTraining.js';
import {phraseCounts,trainPersonalPhrases} from '../training/personalPhrases.js';
import {createAdminClient} from '../adminClient.js';

const frames=()=>Array.from({length:40},(_,i)=>({timeMs:100*i,vector:[...Array.from({length:168},(_,j)=>j===0?i*.01:j===42?i*.02:0),1,i<20?1:0,1]}));
const model=()=>({format:'deafapp-lsch-python-forest',version:1,inputShape:[32,171],classes:['saludos/hola','saludos/gracias'],decision:{minimumScore:.75,minimumMargin:.15},trees:[{left:[1,-1,-1],right:[2,-1,-1],feature:[0,-2,-2],threshold:[.1,-2,-2],probabilities:[[.5,.5],[1,0],[0,1]]}]});

test('una mano puede salir después de mostrar ambas; se conserva el movimiento completo',()=>{
  const result=captureFeatures(frames(),{wholePhrase:true});
  assert.equal(result.length,32);assert.ok(result.every(row=>row.length===171));
  assert.equal(result[0][168],1);assert.equal(result.at(-1)[169],0);assert.ok(result.at(-1)[0]>result[0][0]);
});
test('rechaza seguimiento insuficiente, tiempos falsos, NaN y tomas estáticas',()=>{
  let data=frames();data.forEach(row=>row.vector=null);assert.throws(()=>captureFeatures(data),/Mantén/);
  data=frames();data[4].timeMs=data[3].timeMs;assert.throws(()=>captureFeatures(data),/tiempos/);
  data=frames();data[4].vector[0]=NaN;assert.throws(()=>captureFeatures(data),/puntos/);
  data=frames();data.forEach(row=>{row.vector[0]=0;row.vector[42]=0;});assert.throws(()=>captureFeatures(data),/movimiento/);
});
test('el clasificador respeta float32 de sklearn y puede abstenerse',()=>{
  const forest=validateForest(model()),features=Array.from({length:32},()=>Array(171).fill(0));
  features[0][0]=.1;assert.equal(predictForest(forest,features).classId,'saludos/gracias');
  features[0][0]=0;assert.equal(predictForest(forest,features).classId,'saludos/hola');
  forest.trees[0].probabilities[1]=[.6,.4];assert.equal(predictForest(forest,features).accepted,false);
});
test('rechaza árboles cíclicos antes de recorrerlos',()=>{
  const forest=model();forest.trees[0].left[0]=0;assert.throws(()=>validateForest(forest),/Nodo/);
});
test('solo las tres oraciones completas habilitan el entrenamiento personal',async()=>{
  assert.equal(PHRASES.length,3);const rows=PHRASES.flatMap(classId=>Array.from({length:2},()=>({classId,wholePhrase:true})));
  rows.push({classId:'saludos/hola',wholePhrase:true});assert.deepEqual(phraseCounts(rows).map(row=>row.count),[2,2,2]);
  await assert.rejects(()=>trainPersonalPhrases({},rows),/tres tomas/);
});
test('las consultas de avance y pesos requieren sesión y validan el identificador',async()=>{
  const calls=[],api=createAdminClient({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}};}}),session={token:'a'.repeat(64),expiresAt:Date.now()+60000};
  await api.trainingProgress(session);await api.trainingCandidate(session,'b'.repeat(32));
  assert.deepEqual(calls.map(row=>row.name),['deafapp_admin_training_progress','deafapp_admin_training_candidate']);
  assert.ok(calls.every(row=>row.args.p_token===session.token));
  assert.throws(()=>api.trainingCandidate(session,'../catalog'),/válido/);
  assert.throws(()=>api.trainingProgress({...session,expiresAt:0}),/sesión terminó/);assert.equal(calls.length,2);
});
