import {decodeRuntimePackage} from './runtimePackage.js';
import {validateCatalogueEntry} from './recognitionCatalog.js';
import {listenForRecordingReviews} from './recordingLibrarySync.js';

const CACHE='deafapp-prepared-recognition-v1';
export function preparedRecognitionCache(action,value){
  return new Promise((resolve,reject)=>{
    const opening=indexedDB.open(CACHE,1);opening.onupgradeneeded=()=>opening.result.createObjectStore('models');
    opening.onerror=()=>reject(Error('No se pudo abrir el modelo guardado.'));
    opening.onsuccess=()=>{const db=opening.result,tx=db.transaction('models',action==='get'?'readonly':'readwrite'),store=tx.objectStore('models');let result;
      const request=action==='get'?store.get('current'):store.put(value,'current');request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>{db.close();resolve(result||null);};tx.onerror=tx.onabort=()=>{db.close();reject(Error('No se pudo guardar el modelo preparado.'));};};
  });
}
export async function readRecognitionRpc(client,name,args={},signal){
  const response=await client.rpc(name,args).abortSignal(signal);
  if(response.error||response.data?.ok!==true)throw Error('No se pudo consultar el modelo preparado. Comprueba tu conexión.');
  return response.data;
}
export function startPreparedRecognition({client,onUpdate,onError=()=>{},metadataOnly=false,cache=preparedRecognitionCache,
  target=globalThis.window,document=globalThis.document,intervalMs=metadataOnly?15000:2000,setTimer=setTimeout,clearTimer=clearTimeout,
  read=readRecognitionRpc,decode=decodeRuntimePackage}={}){
  let closed=false,running=false,queued=false,timer,failures=0,lastKey=null,lastValue=null,lastKick=-Infinity;
  const controller=new AbortController(),visible=()=>!document?.hidden;
  const validRevision=data=>data&&typeof data.revision==='string'&&/^\d+:\d+:\d+$/.test(data.revision);
  function emit(value){if(!closed){lastValue=value;onUpdate(value);}}
  function schedule(ms){clearTimer(timer);if(!closed&&visible())timer=setTimer(tick,ms);}
  function request(){if(closed)return;queued=true;if(!running)schedule(25);}
  function kick(){
    if(Date.now()-lastKick<5000)return;lastKick=Date.now();
    try{void Promise.resolve(client.functions.invoke('recognition-runtime',{body:{action:'refresh'}})).catch(()=>{});}catch{/* Revision polling can retry later. */}
  }
  async function tick(){
    if(closed||!visible())return;if(running){queued=true;return;}running=true;queued=false;
    try{
      const revision=await read(client,'deafapp_recognition_revision',{},controller.signal);if(closed)return;
      if(!validRevision(revision))throw Error('La versión del modelo no es válida.');
      const key=metadataOnly?revision.revision.split(':')[0]:`${revision.revision}:${!!revision.ready}:${!!revision.preparing}`;
      if(key===lastKey&&lastValue){if(failures)emit({...lastValue,error:undefined});failures=0;if(!metadataOnly&&revision.preparing)kick();return;}
      let saved=null;
      if(!metadataOnly){try{saved=await cache('get');}catch{/* The live server remains authoritative. */}}
      if(closed)return;
      const reusable=!metadataOnly&&revision.ready&&saved?.revision===revision.revision&&(!saved.expiresAt||Date.parse(saved.expiresAt)>Date.now());
      const manifest=reusable?saved:await read(client,'deafapp_recognition_manifest',{},controller.signal);if(closed)return;
      if(!validRevision(manifest)||manifest.revision!==revision.revision||!Array.isArray(manifest.catalogue)||manifest.catalogue.length>2048)throw Error('La biblioteca cambió mientras se preparaba. Se volverá a comprobar.');
      manifest.catalogue.forEach(validateCatalogueEntry);
      if(metadataOnly){emit({catalogue:manifest.catalogue,revision:manifest.revision,loading:false});lastKey=key;failures=0;return;}
      if(!revision.ready){emit({model:null,catalogue:manifest.catalogue,revision:manifest.revision,loading:!!revision.preparing,preparing:!!revision.preparing});
        lastKey=key;failures=0;if(revision.preparing)kick();return;}
      let response=reusable?{packet:saved.packet}:await read(client,'deafapp_recognition_model',{p_revision:manifest.revision},controller.signal);
      if(closed)return;
      let model;try{model=response.packet?await decode(response.packet):null;}catch(error){
        if(!reusable)throw error;response=await read(client,'deafapp_recognition_model',{p_revision:manifest.revision},controller.signal);
        model=response.packet?await decode(response.packet):null;
      }if(closed)return;
      if(model&&(model.id!==manifest.modelId||(model.enabledClasses||model.classes).some(id=>!manifest.catalogue.some(entry=>entry.classId===id&&entry.state==='enabled'&&!entry.aliasOf))))throw Error('El modelo no coincide con el vocabulario habilitado.');
      const checked=await read(client,'deafapp_recognition_revision',{},controller.signal);if(closed)return;
      if(checked.revision!==manifest.revision||!checked.ready){emit({model:null,catalogue:manifest.catalogue,revision:checked.revision,loading:true,preparing:true});queued=true;return;}
      emit({model,catalogue:manifest.catalogue,revision:manifest.revision,loading:false,preparing:false,bytes:response.packet?.compressedBytes||0});
      lastKey=key;failures=0;
      try{await cache('put',{revision:manifest.revision,catalogue:manifest.catalogue,modelId:manifest.modelId,expiresAt:manifest.expiresAt,packet:response.packet});}catch{/* A private-window storage failure must not block the live model. */}
    }catch(error){if(!closed){failures++;lastKey=null;if(!metadataOnly)emit({model:null,catalogue:lastValue?.catalogue||[],loading:false,error:error.message});onError(error);}}
    finally{running=false;schedule(queued?25:Math.min(30000,intervalMs*2**Math.min(failures,4)));}
  }
  const unlisten=listenForRecordingReviews(request,target),hidden=()=>{if(visible())request();else clearTimer(timer);};
  target?.addEventListener('focus',request);target?.addEventListener('online',request);document?.addEventListener('visibilitychange',hidden);
  schedule(0);
  return {request,close(){if(closed)return;closed=true;clearTimer(timer);controller.abort();unlisten();target?.removeEventListener('focus',request);target?.removeEventListener('online',request);document?.removeEventListener('visibilitychange',hidden);}};
}
