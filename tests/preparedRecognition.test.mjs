import test from 'node:test';
import assert from 'node:assert/strict';
import {startPreparedRecognition,readRecognitionRpc} from '../src/training/preparedRecognition.js';
import {catalogueSeed} from '../src/training/recognitionCatalog.js';

const flush=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
function harness(options={}){
  let time=0,id=0,offline=false,saved=options.saved,kicks=0,revision={ok:true,revision:'2:1:1',ready:true,preparing:false,modelId:'one'};
  const catalogue=catalogueSeed().filter(row=>row.state==='enabled'),classes=catalogue.slice(0,2).map(row=>row.classId),model={id:'one',classes,enabledClasses:classes};
  const timers=new Map(),calls=[],updates=[],errors=[],target=new EventTarget(),document=new EventTarget();document.hidden=false;
  const read=async(_client,name,args,signal)=>{calls.push({name,args,signal});if(offline)throw Error('Sin conexión');
    if(name==='deafapp_recognition_revision')return {...revision};
    if(name==='deafapp_recognition_manifest')return {...revision,catalogue,expiresAt:null};
    if(name==='deafapp_recognition_model')return {ok:true,packet:{model:{...model,id:revision.modelId},compressedBytes:100}};
    assert.fail('El navegador no debe descargar grabaciones originales.');};
  const cache=async(action,value)=>{if(action==='get')return saved;saved=value;};
  const sync=startPreparedRecognition({client:{functions:{invoke:async()=>{kicks++;}}},target,document,read,cache,decode:async packet=>packet.model,
    setTimer:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},clearTimer:key=>timers.delete(key),onUpdate:value=>updates.push(value),onError:error=>errors.push(error),...options});
  return {sync,calls,updates,errors,target,document,catalogue,model,get saved(){return saved;},get kicks(){return kicks;},get timers(){return timers.size;},setOffline:value=>offline=value,
    setRevision:value=>{revision={...revision,...value};},
    async advance(ms){const until=time+ms;while(true){const next=[...timers].filter(([,row])=>row.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}time=until;await flush();}};
}

test('la primera carga obtiene un paquete y las comprobaciones siguientes no descargan originales ni repiten el modelo',async()=>{
  const h=harness();await h.advance(0);assert.equal(h.updates.at(-1).model.id,'one');assert.ok(h.saved.packet);
  await h.advance(10000);assert.equal(h.calls.filter(row=>row.name==='deafapp_recognition_model').length,1);
  assert.equal(h.calls.filter(row=>row.name==='deafapp_recognition_manifest').length,1);h.sync.close();
});
test('una carga posterior reutiliza el paquete solo después de comprobar su revisión vigente',async()=>{
  const first=harness();await first.advance(0);first.sync.close();const h=harness({saved:first.saved});await h.advance(0);
  assert.equal(h.updates.at(-1).model.id,'one');assert.deepEqual(h.calls.map(row=>row.name),['deafapp_recognition_revision','deafapp_recognition_revision']);h.sync.close();
});
test('retirar una aprobación descarta el modelo, prepara en servidor y sustituye su versión automáticamente',async()=>{
  const h=harness();await h.advance(0);h.setRevision({revision:'2:2:1',ready:false,preparing:true});await h.advance(2000);
  assert.equal(h.updates.at(-1).model,null);assert.equal(h.kicks,1);
  h.setRevision({revision:'2:2:2',ready:true,preparing:false,modelId:'two'});await h.advance(2000);assert.equal(h.updates.at(-1).model.id,'two');h.sync.close();
});
test('una revisión que cambia durante la descompresión nunca publica referencias retiradas',async()=>{
  let release;const h=harness({decode:packet=>new Promise(resolve=>{release=()=>resolve(packet.model);})});await h.advance(0);
  h.setRevision({revision:'2:2:1',ready:false,preparing:true});release();await flush();assert.equal(h.updates.at(-1).model,null);h.sync.close();
});
test('una caché corrupta se sustituye por una descarga verificada del servidor',async()=>{
  const first=harness();await first.advance(0);first.sync.close();const h=harness({saved:{...first.saved,packet:{corrupt:true}},decode:async packet=>{if(packet.corrupt)throw Error('corrupt');return packet.model;}});
  await h.advance(0);assert.equal(h.updates.at(-1).model.id,'one');assert.equal(h.calls.filter(row=>row.name==='deafapp_recognition_model').length,1);assert.equal(h.errors.length,0);h.sync.close();
});
test('una caída de red suspende referencias y la reconexión recupera el modelo sin mostrar un éxito falso',async()=>{
  const h=harness();await h.advance(0);h.setOffline(true);await h.advance(2000);assert.equal(h.updates.at(-1).model,null);assert.ok(h.updates.at(-1).error);
  h.setOffline(false);h.target.dispatchEvent(new Event('online'));await h.advance(25);assert.equal(h.updates.at(-1).model.id,'one');assert.equal(h.updates.at(-1).error,undefined);h.sync.close();
});
test('las pestañas ocultas pausan consultas y cerrar aborta trabajo pendiente y retira listeners',async()=>{
  const h=harness();await h.advance(0);h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));const n=h.calls.length;await h.advance(20000);assert.equal(h.calls.length,n);
  h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));await h.advance(25);assert.ok(h.calls.length>n);
  h.sync.close();assert.equal(h.calls.at(-1).signal.aborted,true);const count=h.calls.length;h.target.dispatchEvent(new Event('focus'));await h.advance(5000);assert.equal(h.calls.length,count);assert.equal(h.timers,0);
});
test('el catálogo de aportes se actualiza sin descargar ni descomprimir ningún modelo',async()=>{
  const h=harness({metadataOnly:true,decode:()=>assert.fail('No debe descomprimir')});await h.advance(0);assert.equal(h.updates.at(-1).catalogue.length,33);
  h.setRevision({revision:'3:1:1'});await h.advance(15000);assert.equal(h.calls.filter(row=>row.name==='deafapp_recognition_manifest').length,2);assert.equal(h.calls.some(row=>row.name==='deafapp_recognition_model'),false);h.sync.close();
});
test('la RPC pública usa cancelación y rechaza respuestas de error',async()=>{
  const signal=new AbortController().signal;let seen;const client={rpc:()=>({abortSignal:async value=>{seen=value;return {data:{ok:true}};}})};
  assert.deepEqual(await readRecognitionRpc(client,'revision',{},signal),{ok:true});assert.equal(seen,signal);
  await assert.rejects(()=>readRecognitionRpc({rpc:()=>({abortSignal:async()=>({error:{code:'offline'}})})},'revision'),/conexión/);
});
