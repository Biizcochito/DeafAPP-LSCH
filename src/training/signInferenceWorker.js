import {predictForest, predictForestVotes} from './visibleTraining.js';
import {handSequence, sequenceDistance, rankSequenceDistances, prepareSequenceSearch, searchSequenceDistances, SEQUENCE_CANDIDATE_FORMAT} from './sequenceCandidate.js';

// Only self-contained functions cross this boundary, including in minified builds.
function workerRuntime(distance, rank, forest, sequenceFormat,prepare,search) {
  let model,index;
  self.onmessage = ({data}) => {
    if (data.type === 'model') { model = data.model;index=model.format===sequenceFormat?prepare(model):null; return; }
    if (data.type !== 'predict') return;
    const started = performance.now();
    try {
      const predictions = data.windows.map(window => {
        if (model.format !== sequenceFormat) return forest(model, window.features);
        if (window.query.length < 3) return {accepted:false,classId:null,reason:'no-active-hands',candidates:[]};
        const distances=search(model,window.query,window.reflection,index,distance);
        return rank(model,distances);
      });
      self.postMessage({id:data.id,predictions,computeMs:performance.now()-started});
    } catch (error) { self.postMessage({id:data.id,error:error.message || 'No se pudo reconocer el movimiento.'}); }
  };
}

export function signInferenceWorkerSource() {
  return `(${workerRuntime.toString()})(${sequenceDistance.toString()},${rankSequenceDistances.toString()},${predictForestVotes.toString()},${JSON.stringify(SEQUENCE_CANDIDATE_FORMAT)},${prepareSequenceSearch.toString()},${searchSequenceDistances.toString()});`;
}

export function createSignInferenceClient(model, {WorkerClass=globalThis.Worker, timeoutMs=5000}={}) {
  let closed=false, nextId=0, pending=null, worker=null, url, failure;
  if (WorkerClass) {
    url=URL.createObjectURL(new Blob([signInferenceWorkerSource()],{type:'application/javascript'}));
    try { worker=new WorkerClass(url); }
    catch (error) { URL.revokeObjectURL(url); throw error; }
    worker.postMessage({type:'model',model});
    worker.onmessage=({data}) => {
      if (closed || !pending || data.id !== pending.id) return;
      const request=pending; pending=null; clearTimeout(request.timer);
      if (data.error) request.reject(Error(data.error));
      else request.resolve({predictions:data.predictions,computeMs:data.computeMs});
    };
    worker.onerror=event => {
      event.preventDefault?.();
      failure=Error('No se pudo ejecutar el reconocimiento en vivo. Vuelve a cargar el candidato.');
      worker.terminate();
      const request=pending; pending=null;
      if (request) { clearTimeout(request.timer); request.reject(failure); }
    };
  }
  return {
    predict(windows) {
      if (closed) return Promise.reject(Error('Reconocimiento cerrado.'));
      if (failure) return Promise.reject(failure);
      if (pending) return Promise.reject(Error('Ya hay una predicción en curso.'));
      if (!worker) {
        const started=performance.now();
        return Promise.resolve({predictions:windows.map(window=>predictForest(model,window.features)),computeMs:performance.now()-started});
      }
      const id=++nextId;
      return new Promise((resolve,reject) => {
        const timer=setTimeout(() => {
          if (pending?.id !== id) return;
          failure=Error('El reconocimiento tardó demasiado. Vuelve a cargar el candidato.');
          pending=null; worker.terminate(); reject(failure);
        },timeoutMs);
        pending={id,resolve,reject,timer};
        try {
          worker.postMessage({type:'predict',id,windows:windows.map(window => model.format===SEQUENCE_CANDIDATE_FORMAT
            ? {query:handSequence(window.features),reflection:handSequence(window.features,true)}
            : {features:window.features})});
        } catch (error) { clearTimeout(timer); pending=null; reject(error); }
      });
    },
    close() {
      if (closed) return;
      closed=true; worker?.terminate(); if (url) URL.revokeObjectURL(url);
      if (pending) { clearTimeout(pending.timer); pending.reject(Error('Reconocimiento cerrado.')); pending=null; }
    },
  };
}
