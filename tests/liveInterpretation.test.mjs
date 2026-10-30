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
test('detener libera la cámara y temporizadores; cerrar libera también los detectores preparados',async()=>{
  const h=harness();h.runtime.setModel(model);await h.runtime.start();
  assert.equal(h.states.at(-1),'on');assert.equal(h.video.srcObject,h.stream);assert.equal(h.timers.size,3);
  h.runtime.stop();assert.equal(h.video.srcObject,null);assert.equal(h.timers.size,0);
  assert.deepEqual(h.counts(),{stopped:1,trackerClosed:0,recognizerClosed:1,inferenceClosed:1});
  const resultCount=h.results.length;h.callbacks()({handTime:0});assert.equal(h.results.length,resultCount);
  h.runtime.close();await h.runtime.start();assert.equal(h.counts().stopped,1);assert.equal(h.counts().trackerClosed,1);
});
test('salir mientras el permiso está pendiente cierra el stream que llega después',async()=>{
  let resolve;const h=harness({getMedia:()=>new Promise(done=>resolve=done)});
  const pending=h.runtime.start();h.runtime.close();resolve(h.stream);await pending;
  assert.equal(h.video.srcObject,null);assert.equal(h.counts().stopped,1);assert.ok(!h.states.includes('on'));
});
test('detener mientras se prepara conserva el detector y cerrar lo libera',async()=>{
  let resolve;const h=harness({createTracker:()=>new Promise(done=>resolve=done)});
  const pending=h.runtime.start();await Promise.resolve();await Promise.resolve();
  h.runtime.stop();resolve(h.tracker);await pending;
  assert.equal(h.video.srcObject,null);assert.equal(h.counts().stopped,1);assert.equal(h.counts().trackerClosed,0);
  h.runtime.close();assert.equal(h.counts().trackerClosed,1);
});

test('preparar no pide cámara y arranca a la vez que un permiso pendiente, reutilizando los detectores',async()=>{
  let trackerCalls=0,mediaCalls=0,resolveMedia;const h=harness({
    createTracker:async()=>{trackerCalls++;return h.tracker;},
    getMedia:()=>{mediaCalls++;return new Promise(done=>resolveMedia=done);}
  });
  const warmed=h.runtime.prepare();await warmed;assert.equal(mediaCalls,0);
  assert.equal(h.runtime.prepare(),warmed);assert.equal(trackerCalls,1);
  const starting=h.runtime.start();assert.equal(mediaCalls,1);resolveMedia(h.stream);await starting;
  h.runtime.stop();const again=h.runtime.start();resolveMedia(h.stream);await again;
  assert.equal(trackerCalls,1);h.runtime.close();assert.equal(h.counts().trackerClosed,1);
});

test('cámara y detectores se inician en paralelo sin esperar a resolver el permiso',async()=>{
  let resolveMedia,trackerCalls=0;const h=harness({getMedia:()=>new Promise(done=>resolveMedia=done),createTracker:async()=>{trackerCalls++;return h.tracker;}});
  const starting=h.runtime.start();await Promise.resolve();assert.equal(trackerCalls,1);
  resolveMedia(h.stream);await starting;h.runtime.close();
});

test('salir y volver pausa las predicciones y conserva stream, modelos y trabajadores',async()=>{
  let time=100;const vectors=[];const h=harness({now:()=>time,
    freshLandmarks:result=>result,trackingVector:result=>result.leftHandLandmarks?['new']:null,
    createRecognizer:()=>({reset(){},push:frame=>vectors.push(frame.vector),expire(){},close(){}})});
  h.runtime.setModel(model);await h.runtime.start();const counts=h.counts();
  h.runtime.setSuspended(true);assert.equal(h.timers.size,0);assert.equal(h.video.srcObject,h.stream);
  h.callbacks()({handTime:100,leftHandLandmarks:[{}]});assert.equal(vectors.length,0);
  assert.deepEqual(h.counts(),counts);
  time=200;h.runtime.setSuspended(false);assert.equal(h.timers.size,3);assert.deepEqual(h.counts(),counts);
  h.callbacks()({handTime:150,leftHandLandmarks:[{}]});assert.equal(vectors.at(-1),null);
  h.callbacks()({handTime:200,leftHandLandmarks:[{}]});assert.deepEqual(vectors.at(-1),['new']);
  h.runtime.close();assert.equal(h.counts().stopped,1);assert.equal(h.counts().trackerClosed,1);
});

test('grabar libera el dispositivo y volver al intérprete lo recupera sin reiniciar detectores',async()=>{
  let acquisitions=0,creations=0;const h=harness({getMedia:async()=>{acquisitions++;return h.stream;},createTracker:async()=>{creations++;return h.tracker;}});
  h.runtime.setModel(model);await h.runtime.start();h.runtime.setSuspended(true);h.runtime.setBlocked(true);
  assert.equal(h.counts().stopped,1);assert.equal(h.video.srcObject,null);
  h.runtime.setBlocked(false);await Promise.resolve();assert.equal(acquisitions,1);
  h.runtime.setSuspended(false);await h.runtime.start();await Promise.resolve();await Promise.resolve();
  assert.equal(acquisitions,2);assert.equal(creations,1);
  h.runtime.stop();h.runtime.setSuspended(true);h.runtime.setSuspended(false);assert.equal(acquisitions,2);
  h.runtime.close();
});

test('cerrar durante la precarga libera el detector que termine más tarde',async()=>{
  let resolve;const h=harness({createTracker:()=>new Promise(done=>resolve=done)});
  const ready=h.runtime.prepare();await Promise.resolve();h.runtime.close();resolve(h.tracker);await ready;
  assert.equal(h.counts().trackerClosed,1);assert.equal(h.video.srcObject,null);
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
