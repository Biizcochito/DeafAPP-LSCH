import test from 'node:test';
import assert from 'node:assert/strict';
import {publicApprovedLibrary} from '../src/training/publicApprovedLibrary.js';
import {createLiveInterpretationCamera} from '../src/training/liveInterpretationCamera.js';

test('la biblioteca pública consulta solo aprobadas, pagina y conserva la versión revisada',async()=>{
  const calls=[],signal=new AbortController().signal;
  const query={select(...args){calls.push(['select',...args]);return this;},eq(...args){calls.push(['eq',...args]);return this;},
    order(...args){calls.push(['order',...args]);return this;},range(...args){calls.push(['range',...args]);return this;},
    abortSignal(value){assert.equal(value,signal);return {data:[{id:7,label:'agua',categoria:'necesidades',archivo_path:'agua/7.json',moderation_version:3}],count:201};}};
  const api=publicApprovedLibrary({from:name=>{assert.equal(name,'grabaciones');return query;}},signal);
  const result=await api.list(null,{status:'approved',page:2});
  assert.deepEqual(result.rows,[{id:'7',label:'agua',category:'necesidades',path:'agua/7.json',version:3,status:'approved'}]);
  assert.equal(result.total,201);assert.equal(result.counts.pending,0);
  assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(['eq','aprobada',true])));
  assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(['range',200,299])));
  await assert.rejects(api.list(null,{status:'pending'}),/no válida/);
  await assert.rejects(api.list(null,{page:-1}),/no válida/);
});

test('un error de acceso público se muestra y nunca intenta entrar al administrador',async()=>{
  const query={select(){return this;},eq(){return this;},order(){return this;},range(){return this;},abortSignal(){return {data:null,error:{message:'denied'},count:null};}};
  await assert.rejects(publicApprovedLibrary({from:()=>query}).list(null),/No se pudo cargar/);
});

function harness(overrides={}){
  let stopped=0,trackerClosed=0,recognizerClosed=0,inferenceClosed=0,callbacks;
  const states=[],results=[],errors=[],timers=new Set();
  const stream={getTracks:()=>[{stop:()=>stopped++}]},video={srcObject:null,play:async()=>{},readyState:0},canvas={width:640,height:480,getContext:()=>({clearRect(){}})};
  const tracker={close:async()=>{trackerClosed++;},onResults:fn=>{callbacks=fn;},sendHands:async()=>{},sendFace:async()=>{}};
  const runtime=createLiveInterpretationCamera({video,canvas,getMedia:async()=>stream,createTracker:async()=>tracker,
    createInference:()=>({predict(){},close(){inferenceClosed++;}}),createRecognizer:({onUpdate})=>({reset:phase=>onUpdate({phase}),push(){},expire(){},close(){recognizerClosed++;}}),
    freshLandmarks:()=>({}),trackingVector:()=>[],draw(){},withTimeout:promise=>promise,
    onResult:value=>results.push(value),onState:value=>states.push(value),onError:value=>errors.push(value),
    setTimer:fn=>{timers.add(fn);return fn;},clearTimer:fn=>timers.delete(fn),setRepeater:fn=>{timers.add(fn);return fn;},clearRepeater:fn=>timers.delete(fn),...overrides});
  return {runtime,stream,tracker,video,states,results,errors,timers,callbacks:()=>callbacks,counts:()=>({stopped,trackerClosed,recognizerClosed,inferenceClosed})};
}
const model={id:'approved-library',classes:['saludos/hola','necesidades/agua']};
test('detener cierra la cámara, los detectores y el reconocedor y elimina sus temporizadores',async()=>{
  const h=harness();h.runtime.setModel(model);await h.runtime.start();
  assert.equal(h.states.at(-1),'on');assert.equal(h.video.srcObject,h.stream);assert.equal(h.timers.size,3);
  h.runtime.stop();assert.equal(h.video.srcObject,null);assert.equal(h.timers.size,0);
  assert.deepEqual(h.counts(),{stopped:1,trackerClosed:1,recognizerClosed:1,inferenceClosed:1});
  const resultCount=h.results.length;h.callbacks()({handTime:0});assert.equal(h.results.length,resultCount);
  h.runtime.close();await h.runtime.start();assert.equal(h.counts().stopped,1);
});
test('salir mientras el permiso está pendiente cierra el stream que llega después',async()=>{
  let resolve;const h=harness({getMedia:()=>new Promise(done=>resolve=done)});
  const pending=h.runtime.start();h.runtime.close();resolve(h.stream);await pending;
  assert.equal(h.video.srcObject,null);assert.equal(h.counts().stopped,1);assert.ok(!h.states.includes('on'));
});
test('salir mientras se carga el detector no deja una cámara ni un detector abiertos',async()=>{
  let resolve;const h=harness({createTracker:()=>new Promise(done=>resolve=done)});
  const pending=h.runtime.start();await Promise.resolve();await Promise.resolve();
  h.runtime.stop();resolve(h.tracker);await pending;
  assert.equal(h.video.srcObject,null);assert.equal(h.counts().stopped,1);assert.equal(h.counts().trackerClosed,1);
});
test('retirar el modelo impide seguir prediciendo con aprobaciones antiguas',async()=>{
  const h=harness();h.runtime.setModel(model);await h.runtime.start();
  h.runtime.setModel(null);assert.equal(h.results.at(-1).phase,'model');assert.equal(h.counts().recognizerClosed,1);
  h.runtime.setModel({...model,id:'refreshed'});assert.equal(h.results.at(-1).phase,'position');h.runtime.close();
});
test('limpiar una conversación reinicia la evidencia sin cerrar la cámara',async()=>{
  const h=harness();h.runtime.setModel(model);await h.runtime.start();const counts=h.counts();h.runtime.reset();
  assert.equal(h.results.at(-1).phase,'position');assert.deepEqual(h.counts(),counts);assert.equal(h.video.srcObject,h.stream);h.runtime.close();
});
test('el permiso denegado permite volver a intentar sin retener una sesión fallida',async()=>{
  let attempts=0;const h=harness({getMedia:async()=>{if(!attempts++)throw Object.assign(Error('Permiso denegado'),{name:'NotAllowedError'});return h.stream;}});
  h.runtime.setModel(model);await h.runtime.start();assert.equal(h.states.at(-1),'off');assert.equal(h.errors.length,1);
  await h.runtime.start();assert.equal(h.states.at(-1),'on');h.runtime.close();
});
test('los puntos retenidos para dibujar nunca llegan al reconocimiento como detección nueva',async()=>{
  let time=100;const drawn=[],vectors=[];const hand=Array.from({length:21},()=>({x:.3,y:.4,z:0}));
  const h=harness({now:()=>time,draw:(_,result)=>drawn.push(result),freshLandmarks:result=>result,trackingVector:result=>result.leftHandLandmarks?['actual']:null,
    createRecognizer:()=>({reset(){},push:frame=>vectors.push(frame.vector),expire(){},close(){}})});
  h.runtime.setModel(model);await h.runtime.start();h.callbacks()({handTime:100,leftHandLandmarks:hand});
  time=150;h.callbacks()({handTime:150});assert.equal(drawn.at(-1).leftHandLandmarks.length,21);assert.equal(vectors.at(-1),null);
  h.runtime.stop();const count=drawn.length;h.callbacks()({handTime:200,leftHandLandmarks:hand});assert.equal(drawn.length,count);
});
